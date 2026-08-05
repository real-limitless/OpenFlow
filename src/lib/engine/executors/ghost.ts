import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import * as crypto from "crypto";

const GHOST_API_VERSION = "v5";
const GHOST_API_MAJOR = "5";
const GHOST_API_MINOR = "0";

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function buildAdminJwt(apiKey: string): Promise<string> {
  const colonIdx = apiKey.indexOf(":");
  if (colonIdx === -1) throw new Error("Ghost Admin API key must be in format {id}:{hex_secret}");
  const id = apiKey.slice(0, colonIdx);
  const hexSecret = apiKey.slice(colonIdx + 1);
  const secretBytes = Buffer.from(hexSecret, "hex");

  const header = { alg: "HS256", kid: id, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + 300, aud: "/admin/" };

  const headerB64 = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto.createHmac("sha256", secretBytes).update(signingInput).digest();
  const sigB64 = base64urlEncode(signature);

  return `${signingInput}.${sigB64}`;
}

function resolveParam(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", "return " + raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1"));
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function resolveString(raw: unknown, itemJson: Record<string, unknown>): string {
  const v = resolveParam(raw, itemJson);
  if (v === null || v === undefined) return "";
  return String(v);
}

function resolveNumber(raw: unknown, itemJson: Record<string, unknown>): number {
  const v = resolveParam(raw, itemJson);
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resolveJson(raw: unknown, itemJson: Record<string, unknown>): Record<string, unknown> {
  const v = resolveParam(raw, itemJson);
  if (v && typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return {};
}

async function getBaseUrl(ctx: ExecutionContext, source: string): Promise<string> {
  const credName = source === "adminApi" ? "ghostAdminApi" : "ghostContentApi";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`Credential "${credName}" is not configured on this node`);
  }
  const c = cred as Record<string, unknown>;
  let url = String(c.url ?? "");
  if (!url) {
    throw new Error(`Credential "${credName}" is missing the "url" field`);
  }
  url = url.replace(/\/+$/, "");
  return url;
}

async function apiRequest(
  method: string,
  baseUrl: string,
  source: string,
  path: string,
  ctx: ExecutionContext,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const credName = source === "adminApi" ? "ghostAdminApi" : "ghostContentApi";
  const cred = await ctx.getCredential(credName);
  const c = cred as Record<string, unknown>;
  const apiKey = String(c.apiKey ?? "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let qsString = "";
  if (source === "adminApi") {
    const jwt = await buildAdminJwt(apiKey);
    headers["Authorization"] = `Ghost ${jwt}`;
    headers["Accept-Version"] = `v${GHOST_API_MAJOR}.${GHOST_API_MINOR}`;
  } else {
    qsString = `key=${encodeURIComponent(apiKey)}`;
  }

  const qs = new URLSearchParams(params ?? {});
  const qsPrefix = qsString ? (qs.toString() ? `&${qsString}` : qsString) : "";
  const fullUrl = `${baseUrl}/ghost/api/${GHOST_API_VERSION}/${path}?${qs.toString()}${qsPrefix}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(fullUrl, init);
    const text = await res.text();
    if (!res.ok) {
      let msg: string;
      try {
        const errBody = JSON.parse(text);
        msg = errBody.errors?.[0]?.message ?? errBody.message ?? `HTTP ${res.status}`;
      } catch {
        msg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      }
      throw new Error(msg);
    }
    if (res.status === 204 || !text) return {};
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export const ghostExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const source = String(ctx.getParam("source", "contentApi"));
  const resource = String(ctx.getParam("resource", "post"));
  const operation = String(ctx.getParam("operation", "get"));
  const continueOnFail = ctx.continueOnFail();
  const baseUrl = await getBaseUrl(ctx, source);

  const isGetAll = operation === "getAll";

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      if (isGetAll) {
        if (idx > 0) continue;
        const result = await runGetAll(ctx, source, resource, baseUrl, itemJson);
        for (const r of result) {
          out.push({ json: r, pairedItem });
        }
      } else {
        const result = await runSingle(ctx, operation, source, resource, baseUrl, itemJson);
        const list = Array.isArray(result) ? result : [result];
        for (const r of list) {
          out.push({ json: r, pairedItem });
        }
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};

async function runSingle(
  ctx: ExecutionContext,
  operation: string,
  source: string,
  _resource: string,
  baseUrl: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (operation) {
    case "get":
      return runGet(ctx, source, baseUrl, itemJson);
    case "create":
      return runCreate(ctx, baseUrl, itemJson);
    case "update":
      return runUpdate(ctx, baseUrl, itemJson);
    case "delete":
      return runDelete(ctx, source, baseUrl, itemJson);
    default:
      throw new Error(`Ghost: unsupported operation "${operation}"`);
  }
}

async function runGet(
  ctx: ExecutionContext,
  source: string,
  baseUrl: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const postId = resolveString(ctx.getParam("postId", ""), itemJson);
  if (!postId) throw new Error("Ghost: postId is required for get operation");

  const optionsParam = ctx.getParam("options", {}) as Record<string, unknown>;
  const queryParams = resolveString(optionsParam?.queryParams ?? "", itemJson);
  const extra = queryParams ? Object.fromEntries(new URLSearchParams(queryParams)) : undefined;

  const prefix = source === "adminApi" ? "admin" : "content";
  const result = await apiRequest("GET", baseUrl, source, `${prefix}/posts/${postId}/`, ctx, undefined, extra);
  return result as Record<string, unknown>;
}

async function runCreate(
  ctx: ExecutionContext,
  baseUrl: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const title = resolveString(ctx.getParam("title", ""), itemJson);
  if (!title) throw new Error("Ghost: title is required for create operation");

  const contentFormat = String(ctx.getParam("contentFormat", "html"));
  let content: unknown;
  switch (contentFormat) {
    case "mobiledoc":
      content = resolveJson(ctx.getParam("mobiledoc", "{}"), itemJson);
      break;
    case "lexical":
      content = resolveJson(ctx.getParam("lexical", "{}"), itemJson);
      break;
    case "html":
      content = resolveString(ctx.getParam("html", ""), itemJson);
      break;
    case "source":
      content = resolveString(ctx.getParam("sourceContent", ""), itemJson);
      break;
    default:
      content = resolveString(ctx.getParam("html", ""), itemJson);
  }

  const postBody: Record<string, unknown> = { title };

  if (contentFormat === "mobiledoc" && typeof content === "object") {
    postBody.mobiledoc = JSON.stringify(content);
  } else if (contentFormat === "lexical" && typeof content === "object") {
    postBody.lexical = JSON.stringify(content);
  } else if (contentFormat === "html") {
    postBody.html = content;
  } else if (contentFormat === "source") {
    postBody.source = content;
  } else if (typeof content === "string") {
    postBody.html = content;
  }

  const additionalFields = ctx.getParam("additionalFields", {}) as Record<string, unknown>;
  if (additionalFields.slug) postBody.slug = additionalFields.slug;
  if (additionalFields.customExcerpt) postBody.custom_excerpt = additionalFields.customExcerpt;
  if (additionalFields.featureImage) postBody.feature_image = additionalFields.featureImage;

  const topLevelStatus = ctx.getParam("status", "");
  if (topLevelStatus) {
    postBody.status = topLevelStatus;
  } else if (additionalFields.status) {
    postBody.status = additionalFields.status;
  }

  const result = await apiRequest("POST", baseUrl, "adminApi", "admin/posts/", ctx, { posts: [postBody] });
  return result as Record<string, unknown>;
}

async function runUpdate(
  ctx: ExecutionContext,
  baseUrl: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const postId = resolveString(ctx.getParam("postId", ""), itemJson);
  if (!postId) throw new Error("Ghost: postId is required for update operation");

  const postBody: Record<string, unknown> = {};
  const title = ctx.getParam("title", "");
  if (title) postBody.title = resolveString(title, itemJson);

  const contentFormat = String(ctx.getParam("contentFormat", "html"));
  let content: unknown;
  switch (contentFormat) {
    case "mobiledoc":
      content = resolveJson(ctx.getParam("mobiledoc", "{}"), itemJson);
      break;
    case "lexical":
      content = resolveJson(ctx.getParam("lexical", "{}"), itemJson);
      break;
    case "html":
      content = resolveString(ctx.getParam("html", ""), itemJson);
      break;
    case "source":
      content = resolveString(ctx.getParam("sourceContent", ""), itemJson);
      break;
    default:
      content = resolveString(ctx.getParam("html", ""), itemJson);
  }
  if (content) {
    if (contentFormat === "mobiledoc" && typeof content === "object") {
      postBody.mobiledoc = JSON.stringify(content);
    } else if (contentFormat === "lexical" && typeof content === "object") {
      postBody.lexical = JSON.stringify(content);
    } else if (contentFormat === "html") {
      postBody.html = content;
    } else if (contentFormat === "source") {
      postBody.source = content;
    } else if (typeof content === "string") {
      postBody.html = content;
    }
  }

  const additionalFields = ctx.getParam("additionalFields", {}) as Record<string, unknown>;
  if (additionalFields.slug) postBody.slug = additionalFields.slug;
  if (additionalFields.customExcerpt) postBody.custom_excerpt = additionalFields.customExcerpt;
  if (additionalFields.featureImage) postBody.feature_image = additionalFields.featureImage;

  const topLevelStatus = ctx.getParam("status", "");
  if (topLevelStatus) {
    postBody.status = topLevelStatus;
  } else if (additionalFields.status) {
    postBody.status = additionalFields.status;
  }

  const result = await apiRequest("PUT", baseUrl, "adminApi", `admin/posts/${postId}/`, ctx, { posts: [postBody] });
  return result as Record<string, unknown>;
}

async function runDelete(
  ctx: ExecutionContext,
  source: string,
  baseUrl: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const postId = resolveString(ctx.getParam("postId", ""), itemJson);
  if (!postId) throw new Error("Ghost: postId is required for delete operation");
  await apiRequest("DELETE", baseUrl, source, `admin/posts/${postId}/`, ctx);
  return {};
}

async function runGetAll(
  ctx: ExecutionContext,
  source: string,
  _resource: string,
  baseUrl: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const limit = resolveNumber(ctx.getParam("limit", 15), itemJson);
  const rawOptions = ctx.getParam("options", {}) as Record<string, unknown>;
  const queryParams = resolveString(rawOptions?.queryParams ?? "", itemJson);
  const extra = queryParams ? Object.fromEntries(new URLSearchParams(queryParams)) : undefined;

  const prefix = source === "adminApi" ? "admin" : "content";
  const params: Record<string, string> = { limit: String(Math.min(Math.max(1, limit), 100)) };
  if (extra) Object.assign(params, extra);

  const result = await apiRequest("GET", baseUrl, source, `${prefix}/posts/`, ctx, undefined, params);
  const data = result as Record<string, unknown>;
  const posts = data.posts as Record<string, unknown>[] | undefined;
  if (!Array.isArray(posts)) return [];
  return posts;
}

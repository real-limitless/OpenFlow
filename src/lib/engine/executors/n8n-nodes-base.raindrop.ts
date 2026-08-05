import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.raindrop.io/rest/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asStr(raw: unknown, def = ""): string {
  if (!raw) return def;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>).value ?? def);
  }
  return String(raw);
}

function toBool(raw: unknown, def = false): boolean {
  if (raw === undefined || raw === null) return def;
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "1") return true;
  return false;
}

function toNum(raw: unknown, def: number): number {
  if (raw === undefined || raw === null) return def;
  if (typeof raw === "number") return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("raindropOAuth2Api");
  const token = cred ? String(cred.accessToken ?? "") : "";
  if (!token) {
    const envToken = process.env.RAINDROP_ACCESS_TOKEN;
    if (envToken) return envToken;
    throw new Error("Raindrop: no credentials resolved and RAINDROP_ACCESS_TOKEN is not set");
  }
  return token;
}

async function apiCall(
  method: string,
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = { method, headers };
  if (body && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    const errMsg = text
      ? (() => { try { const p = JSON.parse(text); return String(p.message ?? p.error ?? text); } catch { return text; } })()
      : `Raindrop API error: ${res.status}`;
    throw new Error(errMsg);
  }
  if (res.status === 204) return { success: true };
  const text = await res.text();
  return text ? JSON.parse(text) : { success: true };
}

interface OperationHandler {
  (ctx: ExecutionContext, node: INode, itemJson: Record<string, unknown>): Promise<Record<string, unknown> | Record<string, unknown>[]>;
}

const HANDLERS: Record<string, Record<string, OperationHandler>> = {
  bookmark: {
    create: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const url = asStr(resolveValue(node.parameters.url, itemJson));
      const body: Record<string, unknown> = { link: url };
      const collectionId = node.parameters.collectionId;
      if (collectionId) body.collectionId = toNum(resolveValue(collectionId, itemJson), 0);
      const tags = node.parameters.tags;
      if (tags) {
        const resolved = resolveValue(tags, itemJson);
        body.tags = typeof resolved === "string" ? resolved.split(",").map((t: string) => t.trim()).filter(Boolean) : resolved;
      }
      const title = node.parameters.title;
      if (title) body.title = asStr(resolveValue(title, itemJson));
      const pleaseParse = node.parameters.pleaseParse;
      if (pleaseParse !== undefined) body.pleaseParse = toBool(resolveValue(pleaseParse, itemJson));
      const created = node.parameters.created;
      if (created) body.created = asStr(resolveValue(created, itemJson));
      return apiCall("POST", "/raindrop", token, body);
    },
    delete: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const bookmarkId = asStr(resolveValue(node.parameters.bookmarkId, itemJson));
      if (!bookmarkId) throw new Error("Raindrop: bookmarkId is required");
      return apiCall("DELETE", `/raindrop/${bookmarkId}`, token);
    },
    get: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const bookmarkId = asStr(resolveValue(node.parameters.bookmarkId, itemJson));
      if (!bookmarkId) throw new Error("Raindrop: bookmarkId is required");
      return apiCall("GET", `/raindrop/${bookmarkId}`, token);
    },
    getAll: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const collectionId = node.parameters.collectionId ? asStr(resolveValue(node.parameters.collectionId, itemJson)) : "0";
      let path = `/raindrops/${collectionId}`;
      const qs: string[] = [];
      const search = node.parameters.search;
      if (search) qs.push(`search=${encodeURIComponent(asStr(resolveValue(search, itemJson)))}`);
      const sort = node.parameters.sort;
      if (sort) qs.push(`sort=${encodeURIComponent(asStr(resolveValue(sort, itemJson)))}`);
      const page = node.parameters.page;
      if (page !== undefined) qs.push(`page=${toNum(resolveValue(page, itemJson), 0)}`);
      if (qs.length) path += `?${qs.join("&")}`;
      return apiCall("GET", path, token);
    },
    update: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const bookmarkId = asStr(resolveValue(node.parameters.bookmarkId, itemJson));
      if (!bookmarkId) throw new Error("Raindrop: bookmarkId is required");
      const body: Record<string, unknown> = {};
      const url = node.parameters.url;
      if (url !== undefined) body.link = asStr(resolveValue(url, itemJson));
      const collectionId = node.parameters.collectionId;
      if (collectionId !== undefined) body.collectionId = toNum(resolveValue(collectionId, itemJson), 0);
      const tags = node.parameters.tags;
      if (tags !== undefined) {
        const resolved = resolveValue(tags, itemJson);
        body.tags = typeof resolved === "string" ? resolved.split(",").map((t: string) => t.trim()).filter(Boolean) : resolved;
      }
      const title = node.parameters.title;
      if (title !== undefined) body.title = asStr(resolveValue(title, itemJson));
      const pleaseParse = node.parameters.pleaseParse;
      if (pleaseParse !== undefined) body.pleaseParse = toBool(resolveValue(pleaseParse, itemJson));
      const cover = node.parameters.cover;
      if (cover !== undefined) body.cover = asStr(resolveValue(cover, itemJson));
      return apiCall("PUT", `/raindrop/${bookmarkId}`, token, body);
    },
  },
  collection: {
    create: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const title = asStr(resolveValue(node.parameters.title, itemJson));
      if (!title) throw new Error("Raindrop: title is required for collection create");
      const body: Record<string, unknown> = { title };
      const pub = node.parameters.public;
      if (pub !== undefined) body.public = toBool(resolveValue(pub, itemJson));
      const sort = node.parameters.sort;
      if (sort) body.sort = toNum(resolveValue(sort, itemJson), 0);
      const description = node.parameters.description;
      if (description) body.description = asStr(resolveValue(description, itemJson));
      const cover = node.parameters.cover;
      if (cover) body.cover = asStr(resolveValue(cover, itemJson));
      return apiCall("POST", "/collection", token, body);
    },
    delete: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const collectionId = asStr(resolveValue(node.parameters.collectionId, itemJson));
      if (!collectionId) throw new Error("Raindrop: collectionId is required");
      return apiCall("DELETE", `/collection/${collectionId}`, token);
    },
    get: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const collectionId = asStr(resolveValue(node.parameters.collectionId, itemJson));
      if (!collectionId) throw new Error("Raindrop: collectionId is required");
      return apiCall("GET", `/collection/${collectionId}`, token);
    },
    getAll: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      let path = "/collections";
      const page = node.parameters.page;
      if (page !== undefined) path += `?page=${toNum(resolveValue(page, itemJson), 0)}`;
      return apiCall("GET", path, token);
    },
    update: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const collectionId = asStr(resolveValue(node.parameters.collectionId, itemJson));
      if (!collectionId) throw new Error("Raindrop: collectionId is required");
      const body: Record<string, unknown> = {};
      const title = node.parameters.title;
      if (title !== undefined) body.title = asStr(resolveValue(title, itemJson));
      const pub = node.parameters.public;
      if (pub !== undefined) body.public = toBool(resolveValue(pub, itemJson));
      const sort = node.parameters.sort;
      if (sort !== undefined) body.sort = toNum(resolveValue(sort, itemJson), 0);
      const description = node.parameters.description;
      if (description !== undefined) body.description = asStr(resolveValue(description, itemJson));
      const cover = node.parameters.cover;
      if (cover !== undefined) body.cover = asStr(resolveValue(cover, itemJson));
      return apiCall("PUT", `/collection/${collectionId}`, token, body);
    },
  },
  tag: {
    delete: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      const tag = asStr(resolveValue(node.parameters.tag, itemJson));
      if (!tag) throw new Error("Raindrop: tag is required");
      return apiCall("DELETE", `/tag/${encodeURIComponent(tag)}`, token);
    },
    getAll: async (_ctx, node, itemJson) => {
      const token = await getAccessToken(_ctx);
      return apiCall("GET", "/tags", token);
    },
  },
  user: {
    get: async (_ctx, _node, _itemJson) => {
      const token = await getAccessToken(_ctx);
      return apiCall("GET", "/user", token);
    },
  },
};

export const raindropExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "bookmark");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  const handler = HANDLERS[resource]?.[operation];
  if (!handler) {
    const msg = `Raindrop: unsupported resource/operation "${resource}/${operation}"`;
    if (continueOnFail) return [[{ json: { error: msg } }]];
    throw new Error(msg);
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await handler(ctx, node, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

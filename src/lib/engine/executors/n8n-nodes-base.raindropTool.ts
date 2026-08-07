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

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function raindropRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Raindrop request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processRaindropError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message = typeof obj.message === "string" ? obj.message : `HTTP ${status}`;
  return new Error(`Raindrop: ${message}`);
}

async function requestOk(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const res = await raindropRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processRaindropError(res.body, res.status);
  const obj = asObj(res.body);
  return obj;
}

function buildQueryString(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("raindropOAuth2Api");
  const token = cred ? String(cred.accessToken ?? cred.token ?? "") : "";
  if (!token) throw new Error("Raindrop: raindropOAuth2Api credential is not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export const raindropToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "bookmark");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();
  const headers = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(node, resource, operation, itemJson, headers);
      for (const json of results) {
        out.push({ json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  switch (resource) {
    case "bookmark": return runBookmark(node, operation, itemJson, headers);
    case "collection": return runCollection(node, operation, itemJson, headers);
    case "tag": return runTag(node, operation, itemJson, headers);
    case "user": return runUser(node, operation, itemJson, headers);
    default: throw new Error(`Raindrop: unsupported resource "${resource}"`);
  }
}

async function runBookmark(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const collectionId = String(resolveValue(node.parameters.collectionId, itemJson) ?? "");
  const bookmarkId = String(resolveValue(node.parameters.bookmarkId, itemJson) ?? "");

  if (operation === "create") {
    const url = String(resolveValue(node.parameters.url, itemJson) ?? "");
    if (!url) throw new Error("Raindrop: url is required for bookmark create");
    const body: Record<string, unknown> = { link: url };
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    if (title) body.title = title;
    if (collectionId) body.collection = { $id: Number(collectionId) };
    const tags = String(resolveValue(node.parameters.tags, itemJson) ?? "");
    if (tags) body.tags = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    const pleaseParse = node.parameters.pleaseParse;
    if (pleaseParse !== undefined) body.pleaseParse = Boolean(pleaseParse);
    const obj = await requestOk("POST", `${API_BASE}/raindrop`, headers, body);
    return [asObj(obj.item ?? obj)];
  }

  if (operation === "delete") {
    if (!bookmarkId) throw new Error("Raindrop: bookmarkId is required");
    await requestOk("DELETE", `${API_BASE}/raindrop/${bookmarkId}`, headers);
    return [{ success: true, bookmarkId }];
  }

  if (operation === "get") {
    if (!bookmarkId) throw new Error("Raindrop: bookmarkId is required");
    const obj = await requestOk("GET", `${API_BASE}/raindrop/${bookmarkId}`, headers);
    return [asObj(obj.item ?? obj)];
  }

  if (operation === "getAll") {
    const search = String(resolveValue(node.parameters.search, itemJson) ?? "");
    const sort = String(resolveValue(node.parameters.sort, itemJson) ?? "");
    const page = String(resolveValue(node.parameters.page, itemJson) ?? "");
    const params: Record<string, unknown> = {};
    if (search) params.search = search;
    if (sort) params.sort = sort;
    if (page) params.page = page;
    let url = `${API_BASE}/raindrops`;
    if (collectionId) url = `${API_BASE}/raindrops/${collectionId}`;
    url += buildQueryString(params);
    const obj = await requestOk("GET", url, headers);
    const items = Array.isArray(obj.items) ? obj.items as Record<string, unknown>[] : [];
    return items;
  }

  if (operation === "update") {
    if (!bookmarkId) throw new Error("Raindrop: bookmarkId is required");
    const body: Record<string, unknown> = {};
    const url = String(resolveValue(node.parameters.url, itemJson) ?? "");
    if (url) body.link = url;
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    if (title) body.title = title;
    if (collectionId) body.collection = { $id: Number(collectionId) };
    const tags = String(resolveValue(node.parameters.tags, itemJson) ?? "");
    if (tags) body.tags = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    const pleaseParse = node.parameters.pleaseParse;
    if (pleaseParse !== undefined) body.pleaseParse = Boolean(pleaseParse);
    const obj = await requestOk("PUT", `${API_BASE}/raindrop/${bookmarkId}`, headers, body);
    return [asObj(obj.item ?? obj)];
  }

  throw new Error(`Raindrop: unsupported bookmark operation "${operation}"`);
}

async function runCollection(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const collectionId = String(resolveValue(node.parameters.collectionId, itemJson) ?? "");

  if (operation === "create") {
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    if (!title) throw new Error("Raindrop: title is required for collection create");
    const body: Record<string, unknown> = { title };
    const isPublic = node.parameters.public;
    if (isPublic !== undefined) body.public = Boolean(isPublic);
    const sort = String(resolveValue(node.parameters.sort, itemJson) ?? "");
    if (sort) body.sort = Number(sort);
    const description = String(resolveValue(node.parameters.description, itemJson) ?? "");
    if (description) body.description = description;
    const obj = await requestOk("POST", `${API_BASE}/collection`, headers, body);
    return [asObj(obj.item ?? obj)];
  }

  if (operation === "delete") {
    if (!collectionId) throw new Error("Raindrop: collectionId is required");
    await requestOk("DELETE", `${API_BASE}/collection/${collectionId}`, headers);
    return [{ success: true, collectionId }];
  }

  if (operation === "get") {
    if (!collectionId) throw new Error("Raindrop: collectionId is required");
    const obj = await requestOk("GET", `${API_BASE}/collection/${collectionId}`, headers);
    return [asObj(obj.item ?? obj)];
  }

  if (operation === "getAll") {
    const page = String(resolveValue(node.parameters.page, itemJson) ?? "");
    let url = `${API_BASE}/collections`;
    if (page) url += `?page=${page}`;
    const obj = await requestOk("GET", url, headers);
    const items = Array.isArray(obj.items) ? obj.items as Record<string, unknown>[] : [];
    return items;
  }

  if (operation === "update") {
    if (!collectionId) throw new Error("Raindrop: collectionId is required");
    const body: Record<string, unknown> = {};
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    if (title) body.title = title;
    const isPublic = node.parameters.public;
    if (isPublic !== undefined) body.public = Boolean(isPublic);
    const sort = String(resolveValue(node.parameters.sort, itemJson) ?? "");
    if (sort) body.sort = Number(sort);
    const description = String(resolveValue(node.parameters.description, itemJson) ?? "");
    if (description) body.description = description;
    const obj = await requestOk("PUT", `${API_BASE}/collection/${collectionId}`, headers, body);
    return [asObj(obj.item ?? obj)];
  }

  throw new Error(`Raindrop: unsupported collection operation "${operation}"`);
}

async function runTag(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (operation === "delete") {
    const tag = String(resolveValue(node.parameters.tag, itemJson) ?? "");
    if (!tag) throw new Error("Raindrop: tag is required for tag delete");
    await requestOk("DELETE", `${API_BASE}/tag/${encodeURIComponent(tag)}`, headers);
    return [{ success: true, tag }];
  }

  if (operation === "getAll") {
    const obj = await requestOk("GET", `${API_BASE}/tags`, headers);
    const items = Array.isArray(obj.items) ? obj.items as Record<string, unknown>[] : [];
    return items;
  }

  throw new Error(`Raindrop: unsupported tag operation "${operation}"`);
}

async function runUser(
  node: INode,
  operation: string,
  _itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (operation === "get") {
    const obj = await requestOk("GET", `${API_BASE}/user`, headers);
    return [asObj(obj.user ?? obj)];
  }

  throw new Error(`Raindrop: unsupported user operation "${operation}"`);
}

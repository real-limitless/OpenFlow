import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function formatNotionId(value: string): string {
  if (!value) return "";
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value)) return value;
  const hex = value.match(/[0-9a-fA-F]{32}/)?.[0] ?? value.replace(/-/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(hex)) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return value;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function notionRequest(
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
    throw new Error(`Notion request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processNotionError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message = typeof obj.message === "string" ? obj.message : `HTTP ${status}`;
  return new Error(`Notion: ${message}`);
}

async function requestOk(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const res = await notionRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processNotionError(res.body, res.status);
  return asObj(res.body);
}

function richText(content: string): Array<Record<string, unknown>> {
  return [{ type: "text", text: { content: content || "" } }];
}

function buildPropertiesFromTool(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const propsUi = node.parameters.properties as { values?: Record<string, unknown>[] } | undefined;
  const list = propsUi?.values ?? [];
  const properties: Record<string, unknown> = {};
  for (const entry of list) {
    const name = String(resolveValue(entry.name, itemJson) ?? "");
    if (!name) continue;
    const rawValue = resolveValue(entry.value, itemJson);
    properties[name] = rawValue !== undefined ? rawValue : "";
  }
  return properties;
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("notionApi") ?? await ctx.getCredential("notionOAuth2Api");
  const token = cred ? String(cred.apiKey ?? cred.accessToken ?? cred.token ?? cred.secret ?? "") : "";
  if (!token) throw new Error("Notion: notionApi credential is not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

export const notionToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "databasePage");
  const operation = String(node.parameters.operation ?? "getMany");
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
    case "databasePage": return runDatabasePage(node, operation, itemJson, headers);
    case "page": return runPage(node, operation, itemJson, headers);
    case "block": return runBlock(node, operation, itemJson, headers);
    case "user": return runUser(node, operation, itemJson, headers);
    case "database": return runDatabase(node, operation, itemJson, headers);
    case "dataSource": return runDataSource(node, operation, itemJson, headers);
    default: throw new Error(`Notion: unsupported resource "${resource}"`);
  }
}

async function runDatabasePage(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const databaseId = String(resolveValue(node.parameters.databaseId, itemJson) ?? "");

  if (operation === "create") {
    if (!databaseId) throw new Error("Notion: databaseId is required");
    const title = String(resolveValue(node.parameters.title ?? "", itemJson) ?? "");
    const properties = buildPropertiesFromTool(node, itemJson);
    if (title) {
      const hasTitle = Object.values(properties).some(
        (p) => p && typeof p === "object" && "title" in (p as object),
      );
      if (!hasTitle) properties.Name = { title: richText(title) };
    }
    const body: Record<string, unknown> = { parent: { database_id: formatNotionId(databaseId) }, properties };
    const obj = await requestOk("POST", `${API_BASE}/pages`, headers, body);
    return [obj];
  }

  if (operation === "get") {
    const pageId = String(resolveValue(node.parameters.pageId, itemJson) ?? "");
    if (!pageId) throw new Error("Notion: pageId is required");
    const obj = await requestOk("GET", `${API_BASE}/pages/${formatNotionId(pageId)}`, headers);
    return [obj];
  }

  if (operation === "update") {
    const pageId = String(resolveValue(node.parameters.pageId, itemJson) ?? "");
    if (!pageId) throw new Error("Notion: pageId is required");
    const properties = buildPropertiesFromTool(node, itemJson);
    const body: Record<string, unknown> = {};
    if (Object.keys(properties).length) body.properties = properties;
    const obj = await requestOk("PATCH", `${API_BASE}/pages/${formatNotionId(pageId)}`, headers, body);
    return [obj];
  }

  if (operation === "getMany") {
    if (!databaseId) throw new Error("Notion: databaseId is required");
    const limit = Number(node.parameters.limit ?? 100);
    const body: Record<string, unknown> = {};
    const filter = node.parameters.filter;
    if (filter && typeof filter === "object") body.filter = filter;
    const sorts = node.parameters.sorts as { values?: Record<string, unknown>[] } | undefined;
    if (sorts?.values?.length) body.sorts = sorts.values;
    const cursor = String(resolveValue(node.parameters.cursor, itemJson) ?? "");
    if (cursor) body.start_cursor = formatNotionId(cursor);
    body.page_size = Math.min(Math.max(limit, 1), 100);
    const obj = await requestOk("POST", `${API_BASE}/databases/${formatNotionId(databaseId)}/query`, headers, body);
    const results = Array.isArray(obj.results) ? obj.results as Record<string, unknown>[] : [];
    return results.slice(0, limit);
  }

  throw new Error(`Notion: unsupported databasePage operation "${operation}"`);
}

async function runPage(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const pageId = String(resolveValue(node.parameters.pageId, itemJson) ?? "");

  if (operation === "create") {
    if (!pageId) throw new Error("Notion: pageId (parent) is required");
    const title = String(resolveValue(node.parameters.title ?? "", itemJson) ?? "");
    const body: Record<string, unknown> = {
      parent: { page_id: formatNotionId(pageId) },
      properties: { title: { title: richText(title) } },
    };
    const props = buildPropertiesFromTool(node, itemJson);
    if (Object.keys(props).length) body.properties = { ...(body.properties as object), ...props };
    const obj = await requestOk("POST", `${API_BASE}/pages`, headers, body);
    return [obj];
  }

  if (operation === "get") {
    if (!pageId) throw new Error("Notion: pageId is required");
    const obj = await requestOk("GET", `${API_BASE}/pages/${formatNotionId(pageId)}`, headers);
    return [obj];
  }

  if (operation === "search") {
    const query = String(resolveValue(node.parameters.query ?? node.parameters.title ?? "", itemJson) ?? "");
    const limit = Number(node.parameters.limit ?? 100);
    const body: Record<string, unknown> = {};
    if (query) body.query = query;
    const filter = node.parameters.filter;
    if (filter && typeof filter === "object") body.filter = filter;
    const sorts = node.parameters.sorts as { values?: Record<string, unknown>[] } | undefined;
    if (sorts?.values?.length) body.sorts = sorts.values;
    body.page_size = Math.min(Math.max(limit, 1), 100);
    const obj = await requestOk("POST", `${API_BASE}/search`, headers, body);
    const results = Array.isArray(obj.results) ? obj.results as Record<string, unknown>[] : [];
    return results.slice(0, limit);
  }

  if (operation === "archive" || operation === "delete") {
    if (!pageId) throw new Error("Notion: pageId is required");
    const obj = await requestOk("PATCH", `${API_BASE}/pages/${formatNotionId(pageId)}`, headers, { archived: true });
    return [obj];
  }

  throw new Error(`Notion: unsupported page operation "${operation}"`);
}

async function runBlock(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const blockId = String(resolveValue(node.parameters.blockId ?? node.parameters.pageId, itemJson) ?? "");

  if (operation === "appendAfter") {
    if (!blockId) throw new Error("Notion: blockId is required");
    const props = buildPropertiesFromTool(node, itemJson);
    const children: Record<string, unknown>[] = [];
    const blockType = String(props.type ?? "paragraph");
    const blockData: Record<string, unknown> = {
      object: "block",
      type: blockType,
      [blockType]: { rich_text: richText(String(props.value ?? props.text ?? "")) },
    };
    children.push(blockData);
    const obj = await requestOk("PATCH", `${API_BASE}/blocks/${formatNotionId(blockId)}/children`, headers, { children });
    return [asObj(obj)];
  }

  if (operation === "getAll" || operation === "get") {
    if (!blockId) throw new Error("Notion: blockId is required");
    const limit = Number(node.parameters.limit ?? 100);
    const params = `?page_size=${Math.min(Math.max(limit, 1), 100)}`;
    const obj = await requestOk("GET", `${API_BASE}/blocks/${formatNotionId(blockId)}/children${params}`, headers);
    const results = Array.isArray(obj.results) ? obj.results as Record<string, unknown>[] : [];
    return results.slice(0, limit);
  }

  throw new Error(`Notion: unsupported block operation "${operation}"`);
}

async function runUser(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (operation === "getMany" || operation === "getAll") {
    const limit = Number(node.parameters.limit ?? 100);
    const params = `?page_size=${Math.min(Math.max(limit, 1), 100)}`;
    const obj = await requestOk("GET", `${API_BASE}/users${params}`, headers);
    const results = Array.isArray(obj.results) ? obj.results as Record<string, unknown>[] : [];
    return results.slice(0, limit);
  }

  if (operation === "get") {
    const userId = String(resolveValue(node.parameters.userId ?? "", itemJson) ?? "");
    if (!userId) throw new Error("Notion: userId is required");
    const obj = await requestOk("GET", `${API_BASE}/users/${formatNotionId(userId)}`, headers);
    return [obj];
  }

  throw new Error(`Notion: unsupported user operation "${operation}"`);
}

async function runDatabase(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (operation === "get") {
    const databaseId = String(resolveValue(node.parameters.databaseId, itemJson) ?? "");
    if (!databaseId) throw new Error("Notion: databaseId is required");
    const obj = await requestOk("GET", `${API_BASE}/databases/${formatNotionId(databaseId)}`, headers);
    return [obj];
  }

  if (operation === "getMany" || operation === "search") {
    const limit = Number(node.parameters.limit ?? 100);
    const body: Record<string, unknown> = { filter: { property: "object", value: "database" } };
    const query = String(resolveValue(node.parameters.query ?? "", itemJson) ?? "");
    if (query) body.query = query;
    body.page_size = Math.min(Math.max(limit, 1), 100);
    const obj = await requestOk("POST", `${API_BASE}/search`, headers, body);
    const results = Array.isArray(obj.results) ? obj.results as Record<string, unknown>[] : [];
    return results.slice(0, limit);
  }

  throw new Error(`Notion: unsupported database operation "${operation}"`);
}

async function runDataSource(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (operation === "search") {
    const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
    const limit = Number(node.parameters.limit ?? 100);
    const body: Record<string, unknown> = {};
    if (query) body.query = query;
    body.page_size = Math.min(Math.max(limit, 1), 100);
    const obj = await requestOk("POST", `${API_BASE}/search`, headers, body);
    const results = Array.isArray(obj.results) ? obj.results as Record<string, unknown>[] : [];
    return results.slice(0, limit);
  }

  throw new Error(`Notion: unsupported dataSource operation "${operation}"`);
}

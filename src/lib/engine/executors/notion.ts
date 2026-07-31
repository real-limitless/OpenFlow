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

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") return formatNotionId(resolved);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return formatNotionId(String((resolved as Record<string, unknown>).value ?? ""));
  }
  return formatNotionId(String(resolved ?? ""));
}

function formatNotionId(value: string): string {
  if (!value) return "";
  const hex = value.match(/[0-9a-fA-F]{32}/)?.[0] ?? value.replace(/-/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(hex)) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value)) {
    return value;
  }
  return value;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function getOptions(node: INode): Record<string, unknown> {
  const opts = node.parameters.options;
  if (opts && typeof opts === "object" && !Array.isArray(opts)) {
    return opts as Record<string, unknown>;
  }
  return {};
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = (await ctx.getCredential("notionApi")) ?? (await ctx.getCredential("notionOAuth2Api"));
  const token = cred
    ? String(cred.apiKey ?? cred.accessToken ?? cred.token ?? cred.secret ?? "")
    : "";
  if (!token) {
    throw new Error("Notion: notionApi credential is not configured");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Notion-Version": NOTION_VERSION,
  };
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
    } catch {
      /* keep text */
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Notion request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processNotionError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message =
    typeof obj.message === "string"
      ? obj.message
      : typeof obj.code === "string"
        ? String(obj.code)
        : `HTTP ${status}`;
  return new Error(`Notion: ${message}`);
}

async function requestOk(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await notionRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw processNotionError(res.body, res.status);
  }
  return asObj(res.body);
}

function richText(content: string): Array<Record<string, unknown>> {
  return [{ type: "text", text: { content: content || "" } }];
}

function extractPlainText(rt: unknown): string {
  if (!Array.isArray(rt)) return "";
  return rt
    .map((t) => {
      if (!t || typeof t !== "object") return "";
      const o = t as Record<string, unknown>;
      if (typeof o.plain_text === "string") return o.plain_text;
      const text = o.text as Record<string, unknown> | undefined;
      if (text && typeof text.content === "string") return text.content;
      return "";
    })
    .join("");
}

function pageTitle(obj: Record<string, unknown>): string {
  if (typeof obj.name === "string") return obj.name;
  const props = obj.properties as Record<string, unknown> | undefined;
  if (props) {
    for (const val of Object.values(props)) {
      if (!val || typeof val !== "object") continue;
      const p = val as Record<string, unknown>;
      if (p.type === "title" || Array.isArray(p.title)) {
        return extractPlainText(p.title);
      }
    }
  }
  if (Array.isArray(obj.title)) return extractPlainText(obj.title);
  return "";
}

function simplifyPage(obj: Record<string, unknown>): Record<string, unknown> {
  return {
    id: obj.id,
    name: pageTitle(obj),
    url: obj.url,
  };
}

function simplifyDatabase(obj: Record<string, unknown>): Record<string, unknown> {
  return {
    id: obj.id,
    name: pageTitle(obj),
    url: obj.url,
  };
}

function simplifyUser(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: obj.id,
    name: obj.name,
    object: obj.object ?? "user",
    type: obj.type,
  };
  if (obj.person && typeof obj.person === "object") {
    out.person = obj.person;
  }
  return out;
}

function simplifyBlock(obj: Record<string, unknown>): Record<string, unknown> {
  const type = String(obj.type ?? "");
  const blockData = (obj[type] as Record<string, unknown> | undefined) ?? {};
  const text = extractPlainText(blockData.rich_text ?? blockData.text);
  return { id: obj.id, type, text };
}

function buildPropertyValue(
  pv: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): { name: string; value: unknown } | null {
  const keyRaw = String(resolveValue(pv.key, itemJson) ?? "");
  if (!keyRaw) return null;
  const name = keyRaw.includes("|") ? keyRaw.split("|")[0]! : keyRaw;
  const type = String(resolveValue(pv.type, itemJson) ?? (keyRaw.includes("|") ? keyRaw.split("|")[1] : "rich_text"));

  switch (type) {
    case "title":
      return {
        name,
        value: { title: richText(String(resolveValue(pv.title ?? pv.textContent ?? "", itemJson) ?? "")) },
      };
    case "rich_text":
    case "text":
      return {
        name,
        value: {
          rich_text: richText(
            String(resolveValue(pv.textContent ?? pv.richTextValue ?? pv.value ?? "", itemJson) ?? ""),
          ),
        },
      };
    case "select":
      return {
        name,
        value: {
          select: {
            name: String(resolveValue(pv.selectValue ?? pv.value ?? "", itemJson) ?? ""),
          },
        },
      };
    case "multi_select": {
      const raw = resolveValue(pv.multiSelectValue ?? pv.value ?? [], itemJson);
      const names = Array.isArray(raw)
        ? raw.map(String)
        : String(raw ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      return { name, value: { multi_select: names.map((n) => ({ name: n })) } };
    }
    case "date": {
      const dateVal = String(resolveValue(pv.date ?? pv.value ?? "", itemJson) ?? "");
      return { name, value: { date: dateVal ? { start: dateVal } : null } };
    }
    case "number":
      return {
        name,
        value: { number: Number(resolveValue(pv.numberValue ?? pv.value ?? 0, itemJson) ?? 0) },
      };
    case "checkbox":
      return {
        name,
        value: { checkbox: Boolean(resolveValue(pv.checkboxValue ?? pv.value ?? false, itemJson)) },
      };
    case "url":
      return {
        name,
        value: { url: String(resolveValue(pv.urlValue ?? pv.value ?? "", itemJson) ?? "") || null },
      };
    case "email":
      return {
        name,
        value: { email: String(resolveValue(pv.emailValue ?? pv.value ?? "", itemJson) ?? "") || null },
      };
    case "phone_number":
      return {
        name,
        value: {
          phone_number: String(resolveValue(pv.phoneValue ?? pv.value ?? "", itemJson) ?? "") || null,
        },
      };
    case "status":
      return {
        name,
        value: {
          status: {
            name: String(resolveValue(pv.statusValue ?? pv.selectValue ?? pv.value ?? "", itemJson) ?? ""),
          },
        },
      };
    default:
      return {
        name,
        value: {
          rich_text: richText(String(resolveValue(pv.value ?? pv.textContent ?? "", itemJson) ?? "")),
        },
      };
  }
}

function buildProperties(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const ui = node.parameters.propertiesUi as { propertyValues?: Record<string, unknown>[] } | undefined;
  const list = ui?.propertyValues ?? [];
  const properties: Record<string, unknown> = {};
  for (const pv of list) {
    if (!pv || typeof pv !== "object") continue;
    const built = buildPropertyValue(pv, itemJson);
    if (built) properties[built.name] = built.value;
  }
  return properties;
}

function blockTextContent(entry: Record<string, unknown>, type: string, itemJson: Record<string, unknown>): string {
  const nested = entry[type];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    return String(resolveValue(n.textContent ?? n.text ?? "", itemJson) ?? "");
  }
  return String(resolveValue(entry.textContent ?? entry.text ?? "", itemJson) ?? "");
}

function buildBlock(entry: Record<string, unknown>, itemJson: Record<string, unknown>): Record<string, unknown> | null {
  const type = String(resolveValue(entry.type ?? entry.blockType, itemJson) ?? "paragraph");
  const nested = (entry[type] as Record<string, unknown> | undefined) ?? entry;

  if (type === "divider" || type === "table_of_contents" || type === "breadcrumb") {
    return { object: "block", type, [type]: {} };
  }

  if (type === "equation") {
    const expression = String(
      resolveValue(nested.expression ?? entry.expression ?? "", itemJson) ?? "",
    );
    return { object: "block", type, equation: { expression } };
  }

  if (type === "image" || type === "video" || type === "file" || type === "embed" || type === "bookmark" || type === "link_preview") {
    const url = String(
      resolveValue(nested.externalUrl ?? entry.externalUrl ?? "", itemJson) ?? "",
    );
    const caption = String(
      resolveValue(nested.captionText ?? entry.captionText ?? "", itemJson) ?? "",
    );
    const payload: Record<string, unknown> = {
      external: { url },
    };
    if (caption) payload.caption = richText(caption);
    return { object: "block", type, [type]: payload };
  }

  if (type === "link_to_page") {
    const pageId = resolveLocator(nested.pageId ?? entry.pageId, itemJson);
    return { object: "block", type, link_to_page: { type: "page_id", page_id: pageId } };
  }

  if (type === "synced_block") {
    const from = String(resolveValue(nested.syncedFromBlockId ?? entry.syncedFromBlockId ?? "", itemJson) ?? "");
    return {
      object: "block",
      type,
      synced_block: from
        ? { synced_from: { type: "block_id", block_id: formatNotionId(from) } }
        : { synced_from: null },
    };
  }

  const text = blockTextContent(entry, type, itemJson);
  const payload: Record<string, unknown> = { rich_text: richText(text) };

  if (type === "to_do") {
    payload.checked = Boolean(resolveValue(nested.checked ?? entry.checked ?? false, itemJson));
  }
  if (type === "code") {
    payload.language = String(resolveValue(nested.language ?? entry.language ?? "plain text", itemJson) ?? "plain text");
  }
  if (type === "callout") {
    const iconType = String(resolveValue(nested.iconType ?? entry.iconType ?? "emoji", itemJson) ?? "emoji");
    const icon = String(resolveValue(nested.icon ?? entry.icon ?? "💡", itemJson) ?? "💡");
    payload.icon =
      iconType === "file"
        ? { type: "external", external: { url: icon } }
        : { type: "emoji", emoji: icon };
  }

  const childrenRaw = nested.nestedChildren ?? entry.nestedChildren;
  if (childrenRaw && typeof childrenRaw === "object") {
    const childEntries =
      (childrenRaw as { entryValues?: Record<string, unknown>[] }).entryValues ?? [];
    const children = childEntries
      .map((c) => buildBlock(c, itemJson))
      .filter((b): b is Record<string, unknown> => b !== null);
    if (children.length) payload.children = children;
  }

  return { object: "block", type, [type]: payload };
}

function buildChildren(node: INode, itemJson: Record<string, unknown>): Record<string, unknown>[] {
  const children = node.parameters.children as { entryValues?: Record<string, unknown>[] } | undefined;
  const entries = children?.entryValues ?? [];
  return entries
    .map((e) => buildBlock(e, itemJson))
    .filter((b): b is Record<string, unknown> => b !== null);
}

function buildIcon(options: Record<string, unknown>, itemJson: Record<string, unknown>): Record<string, unknown> | undefined {
  const icon = String(resolveValue(options.icon ?? "", itemJson) ?? "");
  if (!icon) return undefined;
  const iconType = String(resolveValue(options.iconType ?? "emoji", itemJson) ?? "emoji");
  if (iconType === "file") {
    return { type: "external", external: { url: icon } };
  }
  return { type: "emoji", emoji: icon };
}

async function paginate(
  method: string,
  url: string,
  headers: Record<string, string>,
  bodyBase: Record<string, unknown> | undefined,
  returnAll: boolean,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  const pageSize = returnAll ? 100 : Math.min(Math.max(limit, 1), 100);

  for (;;) {
    const body = bodyBase ? { ...bodyBase, page_size: pageSize } : undefined;
    let reqUrl = url;
    if (method === "GET") {
      const sep = url.includes("?") ? "&" : "?";
      reqUrl = `${url}${sep}page_size=${pageSize}${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`;
    } else if (body) {
      if (cursor) body.start_cursor = cursor;
    }

    const res = await notionRequest(method, reqUrl, headers, method === "GET" ? undefined : body);
    if (res.status < 200 || res.status >= 300) throw processNotionError(res.body, res.status);
    const obj = asObj(res.body);
    const results = Array.isArray(obj.results) ? (obj.results as Record<string, unknown>[]) : [];
    all.push(...results);

    if (!returnAll) {
      return all.slice(0, limit);
    }
    if (obj.has_more !== true || typeof obj.next_cursor !== "string") break;
    cursor = obj.next_cursor;
  }
  return all;
}

export const notionExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "page");
  const operation = String(node.parameters.operation ?? "create");
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
    case "block":
      return runBlock(node, operation, itemJson, headers);
    case "database":
      return runDatabase(node, operation, itemJson, headers);
    case "databasePage":
      return runDatabasePage(node, operation, itemJson, headers);
    case "page":
      return runPage(node, operation, itemJson, headers);
    case "user":
      return runUser(node, operation, itemJson, headers);
    default:
      throw new Error(`Notion: unsupported resource "${resource}"`);
  }
}

async function runBlock(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const blockId = resolveLocator(node.parameters.blockId, itemJson);
  if (!blockId) throw new Error("Notion: blockId is required");

  if (operation === "append") {
    const children = buildChildren(node, itemJson);
    const obj = await requestOk("PATCH", `${API_BASE}/blocks/${blockId}/children`, headers, {
      children,
    });
    const results = Array.isArray(obj.results) ? (obj.results as Record<string, unknown>[]) : [obj];
    return results;
  }

  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 50);
    const simplify =
      node.parameters.simplifyOutput !== false && node.parameters.simple !== false;
    const results = await paginate(
      "GET",
      `${API_BASE}/blocks/${blockId}/children`,
      headers,
      undefined,
      returnAll,
      limit,
    );

    // TODO: fetchNestedBlocks recursion (partial)
    if (node.parameters.fetchNestedBlocks === true) {
      /* nested fetch not fully implemented */
    }

    return simplify ? results.map(simplifyBlock) : results;
  }

  throw new Error(`Notion: unsupported block operation "${operation}"`);
}

async function runDatabase(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const simple = node.parameters.simple !== false;

  if (operation === "get") {
    const databaseId = resolveLocator(node.parameters.databaseId, itemJson);
    if (!databaseId) throw new Error("Notion: databaseId is required");
    const obj = await requestOk("GET", `${API_BASE}/databases/${databaseId}`, headers);
    return [simple ? simplifyDatabase(obj) : obj];
  }

  if (operation === "getAll" || operation === "search") {
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 50);
    const text = String(resolveValue(node.parameters.text ?? "", itemJson) ?? "");
    const body: Record<string, unknown> = {
      filter: { property: "object", value: "database" },
    };
    if (text) body.query = text;

    const options = getOptions(node);
    const sort = options.sort as Record<string, unknown> | undefined;
    const sortValue = (sort?.sortValue ?? sort) as Record<string, unknown> | undefined;
    if (sortValue && typeof sortValue === "object") {
      const direction = String(sortValue.direction ?? "descending");
      const timestamp = String(sortValue.timestamp ?? "last_edited_time");
      body.sort = { direction, timestamp };
    }

    const results = await paginate("POST", `${API_BASE}/search`, headers, body, returnAll, limit);
    return simple ? results.map(simplifyDatabase) : results;
  }

  throw new Error(`Notion: unsupported database operation "${operation}"`);
}

async function runDatabasePage(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const simple = node.parameters.simple !== false;
  const options = getOptions(node);

  if (operation === "create") {
    const databaseId = resolveLocator(node.parameters.databaseId, itemJson);
    if (!databaseId) throw new Error("Notion: databaseId is required");
    const title = String(resolveValue(node.parameters.title ?? "", itemJson) ?? "");
    const properties = buildProperties(node, itemJson);

    // Ensure a title property exists when title param provided
    if (title) {
      const hasTitle = Object.values(properties).some(
        (p) => p && typeof p === "object" && "title" in (p as object),
      );
      if (!hasTitle) {
        properties.Name = { title: richText(title) };
      } else {
        for (const [k, v] of Object.entries(properties)) {
          if (v && typeof v === "object" && "title" in (v as object)) {
            properties[k] = { title: richText(title) };
            break;
          }
        }
      }
    }

    const body: Record<string, unknown> = {
      parent: { database_id: databaseId },
      properties,
    };
    const icon = buildIcon(options, itemJson);
    if (icon) body.icon = icon;
    const children = buildChildren(node, itemJson);
    if (children.length) body.children = children;

    const obj = await requestOk("POST", `${API_BASE}/pages`, headers, body);
    if (simple) {
      const simplified = simplifyPage(obj);
      if (title && !simplified.name) simplified.name = title;
      return [simplified];
    }
    return [obj];
  }

  if (operation === "get") {
    const pageId = resolveLocator(node.parameters.pageId, itemJson);
    if (!pageId) throw new Error("Notion: pageId is required");
    const obj = await requestOk("GET", `${API_BASE}/pages/${pageId}`, headers);
    return [simple ? simplifyPage(obj) : obj];
  }

  if (operation === "update") {
    const pageId = resolveLocator(node.parameters.pageId, itemJson);
    if (!pageId) throw new Error("Notion: pageId is required");
    const properties = buildProperties(node, itemJson);
    const body: Record<string, unknown> = {};
    if (Object.keys(properties).length) body.properties = properties;
    const icon = buildIcon(options, itemJson);
    if (icon) body.icon = icon;
    const obj = await requestOk("PATCH", `${API_BASE}/pages/${pageId}`, headers, body);
    return [simple ? simplifyPage(obj) : obj];
  }

  if (operation === "getAll") {
    const databaseId = resolveLocator(node.parameters.databaseId, itemJson);
    if (!databaseId) throw new Error("Notion: databaseId is required");
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 50);
    const body: Record<string, unknown> = {};

    // TODO: options.filter / searchFilters / sort full mapping (partial)
    const filter = options.filter ?? node.parameters.searchFilters;
    if (filter && typeof filter === "object" && Object.keys(filter as object).length) {
      body.filter = filter;
    }
    const sort = options.sort;
    if (Array.isArray(sort) && sort.length) {
      body.sorts = sort;
    }

    const results = await paginate(
      "POST",
      `${API_BASE}/databases/${databaseId}/query`,
      headers,
      body,
      returnAll,
      limit,
    );
    // TODO: options.downloadFiles (partial)
    return simple ? results.map(simplifyPage) : results;
  }

  throw new Error(`Notion: unsupported databasePage operation "${operation}"`);
}

async function runPage(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const simple = node.parameters.simple !== false;
  const options = getOptions(node);

  if (operation === "create") {
    const parentId = resolveLocator(node.parameters.pageId, itemJson);
    if (!parentId) throw new Error("Notion: pageId (parent) is required");
    const title = String(resolveValue(node.parameters.title ?? "", itemJson) ?? "");
    if (!title) throw new Error("Notion: title is required for page create");

    const body: Record<string, unknown> = {
      parent: { page_id: parentId },
      properties: {
        title: { title: richText(title) },
      },
    };
    const icon = buildIcon(options, itemJson);
    if (icon) body.icon = icon;
    const children = buildChildren(node, itemJson);
    if (children.length) body.children = children;

    const obj = await requestOk("POST", `${API_BASE}/pages`, headers, body);
    if (simple) {
      const simplified = simplifyPage(obj);
      if (!simplified.name) simplified.name = title;
      return [simplified];
    }
    return [obj];
  }

  if (operation === "archive") {
    const pageId = resolveLocator(node.parameters.pageId, itemJson);
    if (!pageId) throw new Error("Notion: pageId is required");
    const obj = await requestOk("PATCH", `${API_BASE}/pages/${pageId}`, headers, {
      archived: true,
    });
    return [simple ? simplifyPage(obj) : obj];
  }

  if (operation === "get") {
    const pageId = resolveLocator(node.parameters.pageId, itemJson);
    if (!pageId) throw new Error("Notion: pageId is required");
    const obj = await requestOk("GET", `${API_BASE}/pages/${pageId}`, headers);
    return [simple ? simplifyPage(obj) : obj];
  }

  if (operation === "search") {
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 50);
    const text = String(resolveValue(node.parameters.text ?? "", itemJson) ?? "");
    const body: Record<string, unknown> = {};
    if (text) body.query = text;

    const filter = options.filter as Record<string, unknown> | undefined;
    if (filter && typeof filter === "object") {
      const objectType = filter.value ?? filter.object ?? filter.type;
      if (objectType) {
        body.filter = { property: "object", value: objectType };
      } else if (Object.keys(filter).length) {
        body.filter = filter;
      }
    }

    const sort = options.sort as Record<string, unknown> | undefined;
    const sortValue = (sort?.sortValue ?? sort) as Record<string, unknown> | undefined;
    if (sortValue && typeof sortValue === "object" && (sortValue.direction || sortValue.timestamp)) {
      body.sort = {
        direction: String(sortValue.direction ?? "descending"),
        timestamp: String(sortValue.timestamp ?? "last_edited_time"),
      };
    }

    const results = await paginate("POST", `${API_BASE}/search`, headers, body, returnAll, limit);
    return simple ? results.map(simplifyPage) : results;
  }

  throw new Error(`Notion: unsupported page operation "${operation}"`);
}

async function runUser(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (operation === "get") {
    const userId = String(resolveValue(node.parameters.userId ?? "", itemJson) ?? "");
    if (!userId) throw new Error("Notion: userId is required");
    const obj = await requestOk("GET", `${API_BASE}/users/${userId}`, headers);
    return [simplifyUser(obj)];
  }

  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 50);
    const results = await paginate("GET", `${API_BASE}/users`, headers, undefined, returnAll, limit);
    return results.map(simplifyUser);
  }

  throw new Error(`Notion: unsupported user operation "${operation}"`);
}

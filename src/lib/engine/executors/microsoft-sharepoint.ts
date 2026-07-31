import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://graph.microsoft.com/v1.0";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveResourceLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") return resolved;
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "");
  }
  return String(resolved ?? "");
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

/**
 * Resolve the item columns from the resourceMapper wire shape. Accepts:
 * - `columns.value` as a plain map (defineBelow mode)
 * - `columns.fields.fieldsJson` as a JSON string (mapped mode)
 * - `columns.fields` as a plain field map
 */
function resolveColumns(raw: unknown): Record<string, unknown> {
  const cols = (raw ?? {}) as Record<string, unknown>;
  const value = cols.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  const fields = cols.fields;
  if (fields && typeof fields === "object") {
    const map = fields as Record<string, unknown>;
    if (typeof map.fieldsJson === "string") {
      try {
        const parsed = JSON.parse(map.fieldsJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* invalid JSON falls through to empty fields */
      }
    }
    if (!("fieldsJson" in map)) {
      return map;
    }
  }
  return {};
}

function parseJsonOrRaw(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
}

type OpResultList = OpResult | OpResult[];

export const microsoftSharePointExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "list");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, binary: r.binary, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getCredential(ctx: ExecutionContext): Promise<{ accessToken: string; subdomain: string }> {
  const cred = await ctx.getCredential("microsoftSharePointOAuth2Api");
  if (!cred) {
    throw new Error("Microsoft SharePoint credential is required");
  }
  const accessToken = String(cred.accessToken ?? "");
  const subdomain = String(cred.subdomain ?? "");
  if (!accessToken) {
    throw new Error("Microsoft SharePoint credential is not configured");
  }
  return { accessToken, subdomain };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const { accessToken } = await getCredential(ctx);

  if (resource === "file") {
    return runFileOperation(accessToken, node, operation, itemJson, item);
  }
  if (resource === "item") {
    return runItemOperation(accessToken, node, operation, itemJson);
  }
  if (resource === "list") {
    return runListOperation(accessToken, node, operation, itemJson);
  }
  throw new Error(`Microsoft SharePoint: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

async function runFileOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const site = resolveResourceLocator(node.parameters.site, itemJson);
  if (!site) throw new Error("Microsoft SharePoint: site is required");

  if (operation === "download") {
    const fileId = resolveResourceLocator(node.parameters.file, itemJson);
    if (!fileId) throw new Error("Microsoft SharePoint: file is required");
    const dataPropertyName = String(node.parameters.dataPropertyName ?? "data");

    const metaRes = await sharepointRequest(token, "GET", `/sites/${site}/drive/items/${fileId}`);
    const contentRes = await sharepointRequestRaw(token, "GET", `/sites/${site}/drive/items/${fileId}/content`);
    const binaryData = typeof contentRes === "string" ? contentRes : JSON.stringify(contentRes);

    const meta = metaRes as Record<string, unknown>;
    const fileMeta = meta.file as Record<string, unknown> | undefined;
    const mimeType = String(fileMeta?.mimeType ?? "application/octet-stream");
    const fileName = String(meta.name ?? "file");

    return {
      json: { ...itemJson },
      binary: {
        [dataPropertyName]: {
          mimeType,
          fileName,
          data: Buffer.from(binaryData).toString("base64"),
        },
      },
    };
  }

  if (operation === "upload") {
    const fileId = resolveResourceLocator(node.parameters.file, itemJson);
    if (!fileId) throw new Error("Microsoft SharePoint: file is required");
    const binaryPropertyName = String(node.parameters.binaryPropertyName ?? "data");

    if (!item.binary?.[binaryPropertyName]) {
      throw new Error(`Microsoft SharePoint: binary property "${binaryPropertyName}" not found on input item`);
    }
    const binary = item.binary[binaryPropertyName];
    const body = binary.data;
    const ct = binary.mimeType ?? "application/octet-stream";

    const res = await sharepointRequest(token, "PUT", `/sites/${site}/drive/items/${fileId}/content`, {
      body,
      contentType: ct,
      rawBody: true,
    });
    return { json: asObj(res) };
  }

  if (operation === "update") {
    const fileId = resolveResourceLocator(node.parameters.file, itemJson);
    if (!fileId) throw new Error("Microsoft SharePoint: file is required");
    const changeFileContent = node.parameters.changeFileContent !== false;
    const binaryPropertyName = String(node.parameters.fileContents ?? node.parameters.binaryPropertyName ?? "data");

    if (changeFileContent) {
      if (!item.binary?.[binaryPropertyName]) {
        throw new Error(`Microsoft SharePoint: binary property "${binaryPropertyName}" not found on input item`);
      }
      const binary = item.binary[binaryPropertyName];
      await sharepointRequest(token, "PUT", `/sites/${site}/drive/items/${fileId}/content`, {
        body: binary.data,
        contentType: binary.mimeType ?? "application/octet-stream",
        rawBody: true,
      });
    }

    const patchBody: Record<string, unknown> = {};
    const newName = String(node.parameters.fileName ?? "");
    if (newName) patchBody.name = newName;
    const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    const metadata = additionalFields.metadata;
    if (metadata) {
      patchBody.file = {
        ...(patchBody.file as Record<string, unknown> | undefined),
        metadata: typeof metadata === "string" ? parseJsonOrRaw(metadata) : metadata,
      };
    }
    if (Object.keys(patchBody).length > 0) {
      const res = await sharepointRequest(token, "PATCH", `/sites/${site}/drive/items/${fileId}`, {
        body: JSON.stringify(patchBody),
      });
      return { json: asObj(res) };
    }
    return { json: { ...itemJson } };
  }

  throw new Error(`Microsoft SharePoint: unsupported file operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

async function runItemOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const site = resolveResourceLocator(node.parameters.site, itemJson);
  if (!site) throw new Error("Microsoft SharePoint: site is required");
  const list = resolveResourceLocator(node.parameters.list, itemJson);
  if (!list) throw new Error("Microsoft SharePoint: list is required");

  if (operation === "create" || operation === "upsert") {
    const fields = resolveColumns(node.parameters.columns);
    const body = { fields };
    const itemId = resolveResourceLocator(node.parameters.item, itemJson);
    if (operation === "upsert" && itemId) {
      const res = await sharepointRequest(token, "PATCH", `/sites/${site}/lists/${list}/items/${itemId}`, {
        body: JSON.stringify(body),
      });
      return { json: asObj(res) };
    }
    const res = await sharepointRequest(token, "POST", `/sites/${site}/lists/${list}/items`, {
      body: JSON.stringify(body),
    });
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const itemId = resolveResourceLocator(node.parameters.item, itemJson);
    if (!itemId) throw new Error("Microsoft SharePoint: item is required");
    await sharepointRequest(token, "DELETE", `/sites/${site}/lists/${list}/items/${itemId}`);
    return { json: { ...itemJson } };
  }

  if (operation === "get") {
    const itemId = resolveResourceLocator(node.parameters.item, itemJson);
    if (!itemId) throw new Error("Microsoft SharePoint: item is required");
    const res = await sharepointRequest(token, "GET", `/sites/${site}/lists/${list}/items/${itemId}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    let endpoint = `/sites/${site}/lists/${list}/items`;
    const qsParts: string[] = [];
    const odataFilter = String(resolveValue(node.parameters.filter, itemJson) ?? resolveValue(filters.odataFilter, itemJson) ?? "");
    if (odataFilter) qsParts.push(`$filter=${encodeURIComponent(odataFilter)}`);
    if (!returnAll) qsParts.push(`$top=${limit}`);

    if (qsParts.length > 0) endpoint += `?${qsParts.join("&")}`;
    const res = await sharepointRequest(token, "GET", endpoint);
    const obj = asObj(res);
    const items = (obj.value ?? []) as Record<string, unknown>[];
    const sliced = returnAll ? items : items.slice(0, limit);
    return sliced.map((i) => ({ json: i }));
  }

  if (operation === "update") {
    const itemId = resolveResourceLocator(node.parameters.item, itemJson);
    if (!itemId) throw new Error("Microsoft SharePoint: item is required");
    const fields = resolveColumns(node.parameters.columns);
    const body = { fields };
    const res = await sharepointRequest(token, "PATCH", `/sites/${site}/lists/${list}/items/${itemId}`, {
      body: JSON.stringify(body),
    });
    return { json: asObj(res) };
  }

  throw new Error(`Microsoft SharePoint: unsupported item operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

async function runListOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const site = resolveResourceLocator(node.parameters.site, itemJson);
  if (!site) throw new Error("Microsoft SharePoint: site is required");

  if (operation === "get") {
    const list = resolveResourceLocator(node.parameters.list, itemJson);
    if (!list) throw new Error("Microsoft SharePoint: list is required");
    const res = await sharepointRequest(token, "GET", `/sites/${site}/lists/${list}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    let endpoint = `/sites/${site}/lists`;
    const qsParts: string[] = [];
    const odataFilter = String(resolveValue(node.parameters.filter, itemJson) ?? resolveValue(filters.odataFilter, itemJson) ?? "");
    if (odataFilter) qsParts.push(`$filter=${encodeURIComponent(odataFilter)}`);
    if (!returnAll) qsParts.push(`$top=${limit}`);

    if (qsParts.length > 0) endpoint += `?${qsParts.join("&")}`;
    const res = await sharepointRequest(token, "GET", endpoint);
    const obj = asObj(res);
    const items = (obj.value ?? []) as Record<string, unknown>[];
    const sliced = returnAll ? items : items.slice(0, limit);
    return sliced.map((i) => ({ json: i }));
  }

  throw new Error(`Microsoft SharePoint: unsupported list operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

interface RequestOptions {
  body?: string;
  contentType?: string;
  rawBody?: boolean;
}

async function sharepointRequest(
  token: string,
  method: string,
  endpoint: string,
  opts?: RequestOptions,
): Promise<unknown> {
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (opts?.contentType) {
      headers["Content-Type"] = opts.contentType;
    } else if (opts?.body && !opts?.rawBody) {
      headers["Content-Type"] = "application/json; charset=utf-8";
    }
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };
    if (opts?.body) {
      init.body = opts.body;
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errObj = obj.error;
      const errMsg = errObj && typeof errObj === "object" ? String((errObj as Record<string, unknown>).message ?? errObj) : String(errObj ?? `Request failed with status code ${response.status}`);
      throw new Error(`Microsoft SharePoint: ${errMsg}`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Microsoft SharePoint:")) {
      throw err;
    }
    throw new Error(`Microsoft SharePoint request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function sharepointRequestRaw(
  token: string,
  method: string,
  endpoint: string,
): Promise<unknown> {
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (response.status < 200 || response.status >= 300) {
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
      const obj = asObj(parsed);
      const errObj = obj.error;
      const errMsg = errObj && typeof errObj === "object" ? String((errObj as Record<string, unknown>).message ?? errObj) : String(errObj ?? `Request failed with status code ${response.status}`);
      throw new Error(`Microsoft SharePoint: ${errMsg}`);
    }
    return text;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Microsoft SharePoint:")) {
      throw err;
    }
    throw new Error(`Microsoft SharePoint request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}
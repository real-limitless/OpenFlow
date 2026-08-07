import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

type NodeParams = Record<string, unknown>;
interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, { mimeType: string; fileName: string; data: string }>;
}
type OpResultList = OpResult | OpResult[];

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return raw;
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
      } catch {}
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

const API_BASE = "https://graph.microsoft.com/v1.0";

async function sharepointRequest(
  token: string,
  method: string,
  endpoint: string,
  opts?: { body?: string; contentType?: string; rawBody?: boolean },
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
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (opts?.body) init.body = opts.body;
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {}
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errObj = obj.error;
      const errMsg = errObj && typeof errObj === "object"
        ? String((errObj as Record<string, unknown>).message ?? errObj)
        : String(errObj ?? `Request failed with status code ${response.status}`);
      throw new Error(`Microsoft SharePoint: ${errMsg}`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Microsoft SharePoint:")) throw err;
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
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const text = await response.text();
    if (response.status < 200 || response.status >= 300) {
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch {}
      const obj = asObj(parsed);
      const errObj = obj.error;
      const errMsg = errObj && typeof errObj === "object"
        ? String((errObj as Record<string, unknown>).message ?? errObj)
        : String(errObj ?? `Request failed with status code ${response.status}`);
      throw new Error(`Microsoft SharePoint: ${errMsg}`);
    }
    return text;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Microsoft SharePoint:")) throw err;
    throw new Error(`Microsoft SharePoint request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function runFileOperation(
  token: string,
  params: NodeParams,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const site = resolveResourceLocator(params.site, itemJson);
  if (!site) throw new Error("Microsoft SharePoint: site is required");

  if (operation === "download") {
    const fileId = resolveResourceLocator(params.file, itemJson);
    if (!fileId) throw new Error("Microsoft SharePoint: file is required");
    const dataPropertyName = String(params.dataPropertyName ?? "data");

    const metaRes = await sharepointRequest(token, "GET", `/sites/${site}/drive/items/${fileId}`);
    const contentRes = await sharepointRequestRaw(token, "GET", `/sites/${site}/drive/items/${fileId}/content`);
    const binaryData = typeof contentRes === "string" ? contentRes : JSON.stringify(contentRes);

    const meta = metaRes as Record<string, unknown>;
    const fileMeta = meta.file as Record<string, unknown> | undefined;
    const mimeType = String(fileMeta?.mimeType ?? "application/octet-stream");
    const fileName = String(meta.name ?? "file");

    return {
      json: { name: meta.name, size: meta.size, lastModifiedDateTime: meta.lastModifiedDateTime, id: meta.id },
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
    const folder = resolveResourceLocator(params.folder, itemJson);
    const fileName = String(params.fileName ?? "");
    if (!fileName) throw new Error("Microsoft SharePoint: fileName is required for upload");
    const binaryPropertyName = String(params.fileContents ?? params.binaryPropertyName ?? "data");

    if (!item.binary?.[binaryPropertyName]) {
      throw new Error(`Microsoft SharePoint: binary property "${binaryPropertyName}" not found on input item`);
    }
    const binary = item.binary[binaryPropertyName];
    const endpoint = folder
      ? `/sites/${site}/drive/items/${folder}:/${fileName}:/content`
      : `/sites/${site}/drive/root:/${fileName}:/content`;

    const res = await sharepointRequest(token, "PUT", endpoint, {
      body: binary.data,
      contentType: binary.mimeType ?? "application/octet-stream",
      rawBody: true,
    });
    return { json: asObj(res) };
  }

  if (operation === "update") {
    const fileId = resolveResourceLocator(params.file, itemJson);
    if (!fileId) throw new Error("Microsoft SharePoint: file is required");
    const changeFileContent = Boolean(params.changeFileContent);
    const binaryPropertyName = String(params.fileContents ?? params.binaryPropertyName ?? "data");

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
    const newName = String(params.fileName ?? "");
    if (newName) patchBody.name = newName;
    const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;
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

async function runItemOperation(
  token: string,
  params: NodeParams,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const site = resolveResourceLocator(params.site, itemJson);
  if (!site) throw new Error("Microsoft SharePoint: site is required");
  const list = resolveResourceLocator(params.list, itemJson);
  if (!list) throw new Error("Microsoft SharePoint: list is required");

  if (operation === "create" || operation === "upsert") {
    const fields = resolveColumns(params.columns);
    const body = { fields };
    const itemId = resolveResourceLocator(params.item, itemJson);
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
    const itemId = resolveResourceLocator(params.item, itemJson);
    if (!itemId) throw new Error("Microsoft SharePoint: item is required");
    await sharepointRequest(token, "DELETE", `/sites/${site}/lists/${list}/items/${itemId}`);
    return { json: { ...itemJson } };
  }

  if (operation === "get") {
    const itemId = resolveResourceLocator(params.item, itemJson);
    if (!itemId) throw new Error("Microsoft SharePoint: item is required");
    const res = await sharepointRequest(token, "GET", `/sites/${site}/lists/${list}/items/${itemId}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(params.returnAll);
    const limit = Number(params.limit ?? 50);
    const simplify = Boolean(params.simplify ?? true);
    const fields = String(params.options?.fields ?? params.fields ?? "");
    let endpoint = `/sites/${site}/lists/${list}/items`;
    const qsParts: string[] = [];
    const odataFilter = String(resolveValue(params.filter, itemJson) ?? "");
    if (odataFilter) qsParts.push(`$filter=${encodeURIComponent(odataFilter)}`);
    if (!returnAll) qsParts.push(`$top=${limit}`);
    if (fields) qsParts.push(`$select=${encodeURIComponent(fields)}`);
    if (simplify) qsParts.push("$expand=fields");
    if (qsParts.length > 0) endpoint += `?${qsParts.join("&")}`;
    const res = await sharepointRequest(token, "GET", endpoint);
    const obj = asObj(res);
    const items = (obj.value ?? []) as Record<string, unknown>[];
    const sliced = returnAll ? items : items.slice(0, limit);
    return sliced.map((i) => ({
      json: simplify ? ({
        ...i,
        ...((i.fields as Record<string, unknown>) ?? {}),
      }) : i,
    }));
  }

  if (operation === "update") {
    const itemId = resolveResourceLocator(params.item, itemJson);
    if (!itemId) throw new Error("Microsoft SharePoint: item is required");
    const fields = resolveColumns(params.columns);
    const body = { fields };
    const res = await sharepointRequest(token, "PATCH", `/sites/${site}/lists/${list}/items/${itemId}`, {
      body: JSON.stringify(body),
    });
    return { json: asObj(res) };
  }

  throw new Error(`Microsoft SharePoint: unsupported item operation "${operation}"`);
}

async function runListOperation(
  token: string,
  params: NodeParams,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const site = resolveResourceLocator(params.site, itemJson);
  if (!site) throw new Error("Microsoft SharePoint: site is required");

  if (operation === "get") {
    const list = resolveResourceLocator(params.list, itemJson);
    if (!list) throw new Error("Microsoft SharePoint: list is required");
    const res = await sharepointRequest(token, "GET", `/sites/${site}/lists/${list}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(params.returnAll);
    const limit = Number(params.limit ?? 50);
    const simplify = Boolean(params.simplify ?? true);
    let endpoint = `/sites/${site}/lists`;
    const qsParts: string[] = [];
    const odataFilter = String(resolveValue(params.filter, itemJson) ?? "");
    if (odataFilter) qsParts.push(`$filter=${encodeURIComponent(odataFilter)}`);
    if (!returnAll) qsParts.push(`$top=${limit}`);
    if (qsParts.length > 0) endpoint += `?${qsParts.join("&")}`;
    const res = await sharepointRequest(token, "GET", endpoint);
    const obj = asObj(res);
    const items = (obj.value ?? []) as Record<string, unknown>[];
    const sliced = returnAll ? items : items.slice(0, limit);
    return sliced.map((i) => ({
      json: simplify ? {
        id: i.id,
        displayName: i.displayName,
        webUrl: i.webUrl,
        ...i,
      } : i,
    }));
  }

  throw new Error(`Microsoft SharePoint: unsupported list operation "${operation}"`);
}

export const microsoftSharePointToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "file");
  const operation = String(node.parameters.operation ?? (resource === "file" ? "download" : "getAll"));
  const continueOnFail = ctx.continueOnFail();

  const credential = await ctx.getCredential("microsoftSharePointOAuth2Api");
  if (!credential?.accessToken) {
    throw new Error("Microsoft SharePoint: microsoftSharePointOAuth2Api credential with access token required");
  }
  const token = String(credential.accessToken);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: OpResultList;
      if (resource === "file") {
        result = await runFileOperation(token, node.parameters, operation, itemJson, item);
      } else if (resource === "item") {
        result = await runItemOperation(token, node.parameters, operation, itemJson);
      } else if (resource === "list") {
        result = await runListOperation(token, node.parameters, operation, itemJson);
      } else {
        throw new Error(`Microsoft SharePoint: unsupported resource "${resource}"`);
      }
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

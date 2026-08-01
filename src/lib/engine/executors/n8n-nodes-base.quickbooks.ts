import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
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

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function parseJsonArray(raw: unknown): Record<string, unknown>[] {
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

async function apiRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `https://quickbooks.api.intuit.com${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const reqHeaders: Record<string, string> = {
      ...headers,
      Accept: "application/json",
    };
    if (body !== undefined) {
      reqHeaders["Content-Type"] = "application/json";
    }
    const init: RequestInit = { method, headers: reqHeaders, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const fault = parsed as Record<string, unknown> | undefined;
      const faultDetail = fault?.Fault as Record<string, unknown> | undefined;
      const errArr = faultDetail?.Error as Array<Record<string, unknown>> | undefined;
      const errMsg = errArr?.[0]?.Message ?? fault?.error ?? response.statusText;
      const apiErr = new Error(`QuickBooks API error: ${errMsg}`);
      (apiErr as unknown as Record<string, unknown>).status = response.status;
      throw apiErr;
    }
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

function buildQboPath(companyId: string, resource: string, id?: string, queryFilter?: string): { path: string; params?: Record<string, string> } {
  const resourcePlural = resource + "s";
  if (id) {
    return { path: `/v3/company/${companyId}/${resourcePlural}/${id}` };
  }
  if (queryFilter) {
    const query = `select * from ${resourcePlural} ${queryFilter}`;
    return { path: `/v3/company/${companyId}/query`, params: { query } };
  }
  return { path: `/v3/company/${companyId}/query`, params: { query: `select * from ${resourcePlural}` } };
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<{ headers: Record<string, string>; companyId: string }> {
  const cred = await ctx.getCredential("quickBooksOAuth2Api");
  if (!cred) {
    throw new Error("QuickBooks: credential 'quickBooksOAuth2Api' is not configured");
  }
  const data = cred as Record<string, unknown>;
  const accessToken = String(data.accessToken ?? data.access_token ?? "");
  const companyId = String(data.companyId ?? "");
  if (!accessToken) {
    throw new Error("QuickBooks: access token missing from credential");
  }
  if (!companyId) {
    throw new Error("QuickBooks: companyId missing from credential");
  }
  return {
    headers: { Authorization: `Bearer ${accessToken}` },
    companyId,
  };
}

export const quickbooksExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "invoice");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const { headers, companyId } = await getAuthHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runQboOperation(node, resource, operation, itemJson, headers, companyId);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};

async function runQboOperation(
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  companyId: string,
): Promise<Array<{ json: Record<string, unknown> }>> {
  const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
  const queryFilter = String(resolveValue(node.parameters.queryFilter, itemJson) ?? "");

  switch (operation) {
    case "create":
      return [await doCreate(resource, id, node, itemJson, headers, companyId)];
    case "get":
      return [await doGet(resource, id, headers, companyId)];
    case "getAll":
      return [await doGetAll(resource, queryFilter, headers, companyId)];
    case "update":
      return [await doUpdate(resource, id, node, itemJson, headers, companyId)];
    case "delete":
      return [await doDelete(resource, id, headers, companyId)];
    case "send":
      return [await doSend(resource, id, headers, companyId)];
    case "void":
      return [await doVoid(resource, id, headers, companyId)];
    default:
      throw new Error(`QuickBooks: unsupported operation "${operation}"`);
  }
}

async function doCreate(
  resource: string,
  _id: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  const rawAdditional = node.parameters.additionalFields;
  const additional = rawAdditional && typeof rawAdditional === "object"
    ? parseJson((rawAdditional as Record<string, unknown>).fields)
    : {};
  const merged: Record<string, unknown> = { ...additional };

  const resourceSingular = resource.charAt(0).toUpperCase() + resource.slice(1);
  const body: Record<string, unknown> = {};
  body[resourceSingular] = merged;

  const { path } = buildQboPath(companyId, resource);
  const res = await apiRequest("POST", path, headers, body);
  return { json: res[resourceSingular] as Record<string, unknown> ?? res };
}

async function doGet(
  resource: string,
  id: string,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks: id is required for get operation");
  const { path } = buildQboPath(companyId, resource, id);
  const res = await apiRequest("GET", path, headers);
  const resourceSingular = resource.charAt(0).toUpperCase() + resource.slice(1);
  return { json: res[resourceSingular] as Record<string, unknown> ?? res };
}

async function doGetAll(
  resource: string,
  queryFilter: string,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  const { path, params } = buildQboPath(companyId, resource, undefined, queryFilter || undefined);
  const res = await apiRequest("GET", path, headers, undefined, params);
  const resourceSingular = resource.charAt(0).toUpperCase() + resource.slice(1);
  const queryResponse = res.QueryResponse as Record<string, unknown> ?? {};
  const entities = queryResponse[resourceSingular] as Array<Record<string, unknown>> ?? [];
  return { json: { results: entities } };
}

async function doUpdate(
  resource: string,
  id: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks: id is required for update operation");
  const rawUpdate = node.parameters.updateFields;
  const updateFields = rawUpdate && typeof rawUpdate === "object"
    ? parseJson((rawUpdate as Record<string, unknown>).fields)
    : {};
  if (!updateFields.SyncToken) {
    throw new Error("QuickBooks: SyncToken is required in updateFields");
  }
  updateFields.Id = id;

  const resourceSingular = resource.charAt(0).toUpperCase() + resource.slice(1);
  const body: Record<string, unknown> = {};
  body[resourceSingular] = updateFields;

  const { path } = buildQboPath(companyId, resource, id);
  const res = await apiRequest("POST", path, headers, body);
  return { json: res[resourceSingular] as Record<string, unknown> ?? res };
}

async function doDelete(
  resource: string,
  id: string,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks: id is required for delete operation");
  const resourceSingular = resource.charAt(0).toUpperCase() + resource.slice(1);
  const inner: Record<string, unknown> = { Id: id, SyncToken: "0" };
  const body: Record<string, unknown> = { [resourceSingular]: inner };
  const { path } = buildQboPath(companyId, resource, id);
  await apiRequest("POST", path + "?operation=delete", headers, body);
  return { json: { status: "Deleted", id } };
}

async function doSend(
  resource: string,
  id: string,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks: id is required for send operation");
  const { path } = buildQboPath(companyId, resource, id);
  const res = await apiRequest("POST", path + `/${id}/send`, headers);
  const resourceSingular = resource.charAt(0).toUpperCase() + resource.slice(1);
  return { json: res[resourceSingular] as Record<string, unknown> ?? res };
}

async function doVoid(
  resource: string,
  id: string,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks: id is required for void operation");
  const { path } = buildQboPath(companyId, resource, id);
  const res = await apiRequest("POST", path + `/${id}/void`, headers);
  const resourceSingular = resource.charAt(0).toUpperCase() + resource.slice(1);
  return { json: res[resourceSingular] as Record<string, unknown> ?? res };
}

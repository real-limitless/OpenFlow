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

function deepResolve(v: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof v === "string") return resolveValue(v, itemJson);
  if (v && typeof v === "object") {
    if (Array.isArray(v)) return v.map((e) => deepResolve(e, itemJson));
    const obj: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      obj[k] = deepResolve(val, itemJson);
    }
    return obj;
  }
  return v;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function pascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

function buildQboPath(companyId: string, entitySingular: string, id?: string): { path: string; params?: Record<string, string> } {
  if (id) {
    return { path: `/v3/company/${companyId}/${entitySingular}/${id}` };
  }
  return { path: `/v3/company/${companyId}/${entitySingular}` };
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<{ headers: Record<string, string>; companyId: string }> {
  const cred = await ctx.getCredential("quickBooksOAuth2Api");
  if (!cred) {
    throw new Error("QuickBooks Tool: credential 'quickBooksOAuth2Api' is not configured");
  }
  const data = cred as Record<string, unknown>;
  const accessToken = String(data.accessToken ?? data.access_token ?? "");
  const companyId = String(data.companyId ?? "");
  if (!accessToken) {
    throw new Error("QuickBooks Tool: access token missing from credential");
  }
  if (!companyId) {
    throw new Error("QuickBooks Tool: companyId missing from credential");
  }
  return {
    headers: { Authorization: `Bearer ${accessToken}` },
    companyId,
  };
}

export const quickbooksToolExecutor: NodeExecutor = async (ctx, node) => {
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
  const params = node.parameters as Record<string, unknown>;
  const id = String(resolveValue(params.id, itemJson) ?? "");

  switch (operation) {
    case "create":
      return [await doCreate(resource, id, params, itemJson, headers, companyId)];
    case "get":
      return [await doGet(resource, id, headers, companyId)];
    case "getAll":
      return doGetAll(resource, params, itemJson, headers, companyId);
    case "update":
      return [await doUpdate(resource, id, params, itemJson, headers, companyId)];
    case "delete":
      return [await doDelete(resource, id, headers, companyId)];
    case "send":
      return [await doSend(resource, id, headers, companyId)];
    case "void":
      return [await doVoid(resource, id, headers, companyId)];
    case "getReport":
      return doGetReport(resource, params, itemJson, headers, companyId);
    default:
      throw new Error(`QuickBooks Tool: unsupported operation "${operation}"`);
  }
}

function extractFields(
  params: Record<string, unknown>,
  key: string,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const raw = params[key];
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      resolved[k] = deepResolve(v, itemJson);
    }
    return resolved;
  }
  if (typeof raw === "string") {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw); } catch { return {}; }
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      resolved[k] = deepResolve(v, itemJson);
    }
    return resolved;
  }
  return {};
}

async function doCreate(
  resource: string,
  _id: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  const fields = extractFields(params, "additionalFields", itemJson);
  const entityName = pascalCase(resource);
  const body: Record<string, unknown> = {};
  body[entityName] = fields;
  const { path } = buildQboPath(companyId, resource);
  const res = await apiRequest("POST", path, headers, body);
  return { json: res[entityName] as Record<string, unknown> ?? res };
}

async function doGet(
  resource: string,
  id: string,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks Tool: id is required for get operation");
  const { path } = buildQboPath(companyId, resource, id);
  const res = await apiRequest("GET", path, headers);
  const entityName = pascalCase(resource);
  return { json: res[entityName] as Record<string, unknown> ?? res };
}

async function doGetAll(
  resource: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  companyId: string,
): Promise<Array<{ json: Record<string, unknown> }>> {
  const entityName = pascalCase(resource);
  const filters = params.filters as Record<string, unknown> | undefined;
  const filtersQuery = filters ? String(resolveValue(filters.query, itemJson) ?? "") : "";
  const query = filtersQuery
    ? `select * from ${entityName} ${filtersQuery}`
    : `select * from ${entityName}`;
  const path = `/v3/company/${companyId}/query`;
  const res = await apiRequest("GET", path, headers, undefined, { query });
  const queryResponse = res.QueryResponse as Record<string, unknown> ?? {};
  const entities = queryResponse[entityName] as Array<Record<string, unknown>> ?? [];
  return entities.map((entity) => ({ json: entity }));
}

async function doUpdate(
  resource: string,
  id: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks Tool: id is required for update operation");
  const fields = extractFields(params, "updateFields", itemJson);
  if (!fields.SyncToken) {
    throw new Error("QuickBooks Tool: SyncToken is required in updateFields");
  }
  fields.Id = id;
  const entityName = pascalCase(resource);
  const body: Record<string, unknown> = {};
  body[entityName] = { ...fields, sparse: true };
  const { path } = buildQboPath(companyId, resource, id);
  const res = await apiRequest("POST", path + "?operation=update", headers, body);
  return { json: res[entityName] as Record<string, unknown> ?? res };
}

async function doDelete(
  resource: string,
  id: string,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks Tool: id is required for delete operation");
  const entityName = pascalCase(resource);
  const inner: Record<string, unknown> = { Id: id, SyncToken: "0" };
  const body: Record<string, unknown> = { [entityName]: inner };
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
  if (!id) throw new Error("QuickBooks Tool: id is required for send operation");
  const path = `/v3/company/${companyId}/${resource}/${id}/send`;
  const res = await apiRequest("POST", path, headers);
  const entityName = pascalCase(resource);
  return { json: res[entityName] as Record<string, unknown> ?? res };
}

async function doVoid(
  resource: string,
  id: string,
  headers: Record<string, string>,
  companyId: string,
): Promise<{ json: Record<string, unknown> }> {
  if (!id) throw new Error("QuickBooks Tool: id is required for void operation");
  const path = `/v3/company/${companyId}/${resource}/${id}/void`;
  const res = await apiRequest("POST", path, headers);
  const entityName = pascalCase(resource);
  return { json: res[entityName] as Record<string, unknown> ?? res };
}

async function doGetReport(
  resource: string,
  params: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  companyId: string,
): Promise<Array<{ json: Record<string, unknown> }>> {
  const filters = params.filters as Record<string, unknown> | undefined;
  const qsParams: Record<string, string> = {};

  if (filters) {
    if (filters.date_macro) {
      qsParams.date_macro = String(filters.date_macro);
    }
    const dateRange = filters.dateRangeCustom as Record<string, unknown> | undefined;
    if (dateRange) {
      if (dateRange.start_date) qsParams.start_date = String(dateRange.start_date);
      if (dateRange.end_date) qsParams.end_date = String(dateRange.end_date);
    }
    for (const key of ["columns", "group_by", "sort_by", "sort_order", "source_account_type",
      "transaction_type", "vendor", "customer", "department", "memo", "docnum",
      "payment_Method", "printed", "qzurl", "bothamount", "cleared", "arpaid",
      "appaid", "term"]) {
      const val = filters[key];
      if (val !== undefined && val !== null) {
        qsParams[key] = Array.isArray(val) ? val.join(",") : String(val);
      }
    }
  }

  const reportName = pascalCase(resource) === "Transaction" ? "TransactionList" : pascalCase(resource);
  const path = `/v3/company/${companyId}/reports/${reportName}`;
  const res = await apiRequest("GET", path, headers, undefined, qsParams);
  const rows = (res.Rows as Record<string, unknown> | undefined)?.Row as Array<Record<string, unknown>> ?? [];
  return rows.map((row) => ({ json: flattenRow(row) }));
}

function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sub = flattenRow(v as Record<string, unknown>);
      for (const [sk, sv] of Object.entries(sub)) {
        result[`${k}.${sk}`] = sv;
      }
    } else {
      result[k] = v;
    }
  }
  return result;
}

import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, withPairedItem } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const MODULE_API_NAMES: Record<string, string> = {
  Account: "Accounts",
  Contact: "Contacts",
  Deal: "Deals",
  Invoice: "Invoices",
  Lead: "Leads",
  Product: "Products",
  "Purchase Order": "Purchase_Orders",
  Quote: "Quotes",
  "Sales Order": "Sales_Orders",
  Vendor: "Vendors",
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function processError(body: unknown, status: number, module: string, operation: string): Error {
  const obj = asObj(body);
  const err = Array.isArray(obj) ? obj[0] : obj;
  const e = err as Record<string, unknown> | undefined;
  let message = `Zoho CRM: HTTP ${status}`;
  if (e) {
    const code = e.code ? String(e.code) : "";
    const msg = e.message ? String(e.message) : "";
    message = code && msg ? `Zoho CRM: ${code} — ${msg}` : `Zoho CRM: ${msg || code || status}`;
  }
  message += ` (${module}/${operation})`;
  return new Error(message);
}

async function zohoRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
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
    throw new Error(`Zoho CRM request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<{ headers: Record<string, string>; apiDomain: string }> {
  const cred = await ctx.getCredential("zohoOAuth2Api");
  const token = cred ? String(cred.accessToken ?? cred.token ?? "") : "";
  if (!token) {
    throw new Error("Zoho CRM: credential is not configured (no access token)");
  }
  const apiDomain = cred ? String(cred.apiDomain ?? "https://www.zohoapis.com").replace(/\/$/, "") : "https://www.zohoapis.com";
  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  return { headers, apiDomain };
}

export const zohoCrmExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const module = String(node.parameters.module ?? "Lead");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();
  const { headers, apiDomain } = await getAuthHeaders(ctx);

  const moduleApiName = MODULE_API_NAMES[module];
  if (!moduleApiName) {
    throw new Error(`Zoho CRM: unsupported module "${module}"`);
  }

  const baseUrl = `${apiDomain}/crm/v8`;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    try {
      const results = await runOperation(baseUrl, moduleApiName, operation, node, itemJson, headers, module);
      for (const json of results) {
        out.push({ json, pairedItem: { item: idx, input: 0 } });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem: { item: idx, input: 0 } });
    }
  }

  return [out];
};

async function runOperation(
  baseUrl: string,
  moduleApiName: string,
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  _module: string,
): Promise<Record<string, unknown>[]> {
  switch (operation) {
    case "create":
      return [await zohoCreate(baseUrl, moduleApiName, node, itemJson, headers)];
    case "upsert":
      return [await zohoUpsert(baseUrl, moduleApiName, node, itemJson, headers)];
    case "get":
      return [await zohoGet(baseUrl, moduleApiName, node, itemJson, headers)];
    case "getAll":
      return zohoGetAll(baseUrl, moduleApiName, node, itemJson, headers);
    case "update":
      return [await zohoUpdate(baseUrl, moduleApiName, node, itemJson, headers)];
    case "delete":
      return [await zohoDelete(baseUrl, moduleApiName, node, itemJson, headers)];
    case "getLeadFields":
      return [await zohoGetLeadFields(baseUrl, headers)];
    default:
      throw new Error(`Zoho CRM: unsupported operation "${operation}" for module "${_module}"`);
  }
}

function getRecordData(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const raw = node.parameters.recordData;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      resolved[key] = resolveValue(value, itemJson);
    }
    return resolved;
  }
  return {};
}

function getRecordId(node: INode, itemJson: Record<string, unknown>): string {
  return String(resolveValue(node.parameters.recordId, itemJson) ?? "");
}

async function zohoCreate(
  baseUrl: string,
  moduleApiName: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const data = getRecordData(node, itemJson);
  const url = `${baseUrl}/${encodeURIComponent(moduleApiName)}`;
  const body: Record<string, unknown> = { data: [data] };
  const res = await zohoRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, moduleApiName, "create");
  const result = asObj(res.body);
  const records = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  return records[0] ?? { ...data, status: "created" };
}

async function zohoUpsert(
  baseUrl: string,
  moduleApiName: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const data = getRecordData(node, itemJson);
  const url = `${baseUrl}/${encodeURIComponent(moduleApiName)}/upsert`;
  const body: Record<string, unknown> = { data: [data] };
  const res = await zohoRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, moduleApiName, "upsert");
  const result = asObj(res.body);
  const records = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  return records[0] ?? { ...data, status: "upserted" };
}

async function zohoGet(
  baseUrl: string,
  moduleApiName: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const recordId = getRecordId(node, itemJson);
  if (!recordId) throw new Error(`Zoho CRM: recordId is required for ${moduleApiName} get`);
  const url = `${baseUrl}/${encodeURIComponent(moduleApiName)}/${encodeURIComponent(recordId)}`;
  const res = await zohoRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, moduleApiName, "get");
  const result = asObj(res.body);
  const records = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  return records[0] ?? { id: recordId };
}

async function zohoGetAll(
  baseUrl: string,
  moduleApiName: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const retrievalOptions = node.parameters.retrievalOptions as Record<string, unknown> | undefined;
  const params = new URLSearchParams();
  if (retrievalOptions) {
    const resolvedOptions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(retrievalOptions)) {
      resolvedOptions[key] = resolveValue(value, itemJson);
    }
    if (resolvedOptions.fields) params.set("fields", String(resolvedOptions.fields));
    if (resolvedOptions.page) params.set("page", String(resolvedOptions.page));
    if (resolvedOptions.perPage) params.set("per_page", String(resolvedOptions.perPage));
    if (resolvedOptions.sortBy) params.set("sort_by", String(resolvedOptions.sortBy));
    if (resolvedOptions.sortOrder) params.set("sort_order", String(resolvedOptions.sortOrder));
    if (resolvedOptions.customView) params.set("cv_id", String(resolvedOptions.customView));
  }
  const queryString = params.toString();
  const url = `${baseUrl}/${encodeURIComponent(moduleApiName)}${queryString ? `?${queryString}` : ""}`;
  const res = await zohoRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, moduleApiName, "getAll");
  const result = asObj(res.body);
  const records = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  const pagination = result.info as Record<string, unknown> | undefined;
  if (pagination) {
    records.push({ _pagination: pagination });
  }
  return records;
}

async function zohoUpdate(
  baseUrl: string,
  moduleApiName: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const recordId = getRecordId(node, itemJson);
  if (!recordId) throw new Error(`Zoho CRM: recordId is required for ${moduleApiName} update`);
  const data = getRecordData(node, itemJson);
  const url = `${baseUrl}/${encodeURIComponent(moduleApiName)}/${encodeURIComponent(recordId)}`;
  const body: Record<string, unknown> = { data: [data] };
  const res = await zohoRequest("PUT", url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, moduleApiName, "update");
  return { id: recordId, status: "updated", ...data };
}

async function zohoDelete(
  baseUrl: string,
  moduleApiName: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const recordId = getRecordId(node, itemJson);
  if (!recordId) throw new Error(`Zoho CRM: recordId is required for ${moduleApiName} delete`);
  const url = `${baseUrl}/${encodeURIComponent(moduleApiName)}?ids=${encodeURIComponent(recordId)}`;
  const res = await zohoRequest("DELETE", url, headers);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, moduleApiName, "delete");
  return { id: recordId, status: "deleted" };
}

async function zohoGetLeadFields(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = `${baseUrl}/settings/fields?module=Leads`;
  const res = await zohoRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, "Leads", "getLeadFields");
  const result = asObj(res.body);
  return { fields: result.fields ?? result.data ?? [] };
}
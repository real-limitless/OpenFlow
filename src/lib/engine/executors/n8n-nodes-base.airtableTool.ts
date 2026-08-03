import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.airtable.com/v0";
const META_BASE = "https://api.airtable.com/v0/meta";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return itemJson[raw.replace(/^={{?\s*/, "").replace(/\s*}}?$/, "").trim()];
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

function processAirtableError(body: unknown, status: number, recordId?: string): Error {
  const obj = asObj(body);
  const err = obj.error;
  let message = `Airtable: HTTP ${status}`;
  if (typeof err === "string") {
    message = `Airtable: ${err}`;
  } else if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const type = e.type ? String(e.type) : "";
    const msg = e.message ? String(e.message) : "";
    message = type && msg ? `Airtable: ${type} — ${msg}` : `Airtable: ${msg || type || status}`;
  } else if (typeof obj.message === "string") {
    message = `Airtable: ${obj.message}`;
  }
  if (recordId) message += ` (record ${recordId})`;
  return new Error(message);
}

async function airtableRequest(
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
    throw new Error(`Airtable request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function authHeaders(ctx: ExecutionContext, authentication: string): Promise<Record<string, string>> {
  const credName = authentication === "airtableOAuth2Api" ? "airtableOAuth2Api" : "airtableTokenApi";
  const cred = await ctx.getCredential(credName);
  const token = cred ? String(cred.accessToken ?? cred.apiKey ?? cred.token ?? "") : "";
  if (!token) {
    throw new Error(`Airtable: ${credName} credential is not configured`);
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function getOptions(node: INode): Record<string, unknown> {
  const opts = node.parameters.options;
  if (opts && typeof opts === "object" && !Array.isArray(opts)) {
    return opts as Record<string, unknown>;
  }
  return {};
}

function buildFields(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const columns = node.parameters.columns as
    | { mappingMode?: string; value?: Record<string, unknown> | null; matchingColumns?: string[] }
    | undefined;
  const mode = columns?.mappingMode ?? "defineBelow";
  const options = getOptions(node);
  let fields: Record<string, unknown> = {};

  if (mode === "autoMapInputData") {
    fields = { ...itemJson };
    const ignoreRaw = options.ignoreFields;
    if (typeof ignoreRaw === "string" && ignoreRaw.trim()) {
      for (const f of ignoreRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
        delete fields[f];
      }
    }
  } else if (columns?.value && typeof columns.value === "object") {
    const valArr = Array.isArray(columns.value) ? columns.value : [];
    for (const entry of valArr) {
      const e = entry as Record<string, unknown>;
      const name = String(e.fieldName ?? "");
      const rawValue = e.fieldValue;
      if (name) {
        fields[name] = resolveValue(rawValue, itemJson);
      }
    }
  }

  delete fields.id;
  return fields;
}

function encodeQuery(params: Record<string, string | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === "") continue;
    if (Array.isArray(val)) {
      for (const v of val) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function recordCreate(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = resolveResourceLocator(node.parameters.base, itemJson);
  const table = resolveResourceLocator(node.parameters.table, itemJson);
  if (!base || !table) throw new Error("Airtable: base and table are required");

  const fields = buildFields(node, itemJson);
  const options = getOptions(node);
  const typecast = options.typecast === true;
  const body: Record<string, unknown> = { records: [{ fields }] };
  if (typecast) body.typecast = true;

  const url = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;
  const res = await airtableRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);

  const obj = asObj(res.body);
  const records = Array.isArray(obj.records) ? (obj.records as Record<string, unknown>[]) : [];
  if (records[0]) return records[0];
  return obj;
}

async function recordGet(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = resolveResourceLocator(node.parameters.base, itemJson);
  const table = resolveResourceLocator(node.parameters.table, itemJson);
  const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
  if (!base || !table) throw new Error("Airtable: base and table are required");
  if (!id) throw new Error("Airtable: id is required");

  const url = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
  const res = await airtableRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status, id);
  return asObj(res.body);
}

async function recordSearch(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const base = resolveResourceLocator(node.parameters.base, itemJson);
  const table = resolveResourceLocator(node.parameters.table, itemJson);
  if (!base || !table) throw new Error("Airtable: base and table are required");

  const returnAll = node.parameters.returnAll !== false;
  const limit = Math.min(Number(node.parameters.limit ?? 100), 100);
  const filterByFormula = String(resolveValue(node.parameters.filterByFormula, itemJson) ?? "");
  const options = getOptions(node);

  const basePath = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;
  const all: Record<string, unknown>[] = [];
  let offset: string | undefined;

  for (;;) {
    const params: Record<string, string | string[] | undefined> = {};
    if (filterByFormula) params.filterByFormula = filterByFormula;
    if (!returnAll) {
      params.maxRecords = String(limit);
      params.pageSize = String(Math.min(limit, 100));
    } else {
      params.pageSize = "100";
    }
    if (offset) params.offset = offset;

    const qs = encodeQuery(params);
    const res = await airtableRequest("GET", `${basePath}${qs}`, headers);
    if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);

    const obj = asObj(res.body);
    const records = Array.isArray(obj.records) ? (obj.records as Record<string, unknown>[]) : [];
    all.push(...records);

    if (!returnAll) break;
    offset = typeof obj.offset === "string" ? obj.offset : undefined;
    if (!offset) break;
  }

  return all;
}

async function recordUpsert(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = resolveResourceLocator(node.parameters.base, itemJson);
  const table = resolveResourceLocator(node.parameters.table, itemJson);
  if (!base || !table) throw new Error("Airtable: base and table are required");

  const columns = node.parameters.columns as
    | { matchingColumns?: string[]; mappingMode?: string; value?: Record<string, unknown> | null }
    | undefined;
  const matchingColumns = columns?.matchingColumns ?? [];
  const options = getOptions(node);
  const typecast = options.typecast === true;

  const fieldsWithId = buildFields(node, itemJson);
  const recordId = typeof itemJson.id === "string" ? itemJson.id : "";
  const fields = { ...fieldsWithId };
  const url = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;

  if (recordId) {
    const body: Record<string, unknown> = { records: [{ id: recordId, fields }] };
    if (typecast) body.typecast = true;
    let res = await airtableRequest("PATCH", url, headers, body);
    if (res.status === 422) {
      const createBody: Record<string, unknown> = { records: [{ fields }] };
      if (typecast) createBody.typecast = true;
      res = await airtableRequest("POST", url, headers, createBody);
    }
    if (res.status < 200 || res.status >= 300) {
      throw processAirtableError(res.body, res.status, recordId);
    }
    return asObj(res.body);
  }

  const mergeOn = matchingColumns.filter((c) => c !== "id");
  const body: Record<string, unknown> = {
    records: [{ fields }],
    performUpsert: { fieldsToMergeOn: mergeOn.length ? mergeOn : matchingColumns },
  };
  if (typecast) body.typecast = true;

  const res = await airtableRequest("PATCH", url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);
  return asObj(res.body);
}

async function recordDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = resolveResourceLocator(node.parameters.base, itemJson);
  const table = resolveResourceLocator(node.parameters.table, itemJson);
  const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
  if (!base || !table) throw new Error("Airtable: base and table are required");
  if (!id) throw new Error("Airtable: id is required");

  const url = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
  const res = await airtableRequest("DELETE", url, headers);
  if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status, id);
  return asObj(res.body);
}

async function recordUpdate(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = resolveResourceLocator(node.parameters.base, itemJson);
  const table = resolveResourceLocator(node.parameters.table, itemJson);
  if (!base || !table) throw new Error("Airtable: base and table are required");

  const fieldsWithId = buildFields(node, itemJson);
  const recordId = typeof itemJson.id === "string" ? itemJson.id : String(resolveValue(node.parameters.id, itemJson) ?? "");
  const fields = { ...fieldsWithId };
  const url = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;

  if (!recordId) throw new Error("Airtable: record id is required for update");

  const options = getOptions(node);
  const typecast = options.typecast === true;
  const body: Record<string, unknown> = { records: [{ id: recordId, fields }] };
  if (typecast) body.typecast = true;
  const res = await airtableRequest("PATCH", url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw processAirtableError(res.body, res.status, recordId);
  }
  return asObj(res.body);
}

async function baseGetMany(
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const res = await airtableRequest("GET", `${META_BASE}/bases`, headers);
  if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);
  const obj = asObj(res.body);
  return Array.isArray(obj.bases) ? (obj.bases as Record<string, unknown>[]) : [];
}

async function baseGetSchema(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const base = resolveResourceLocator(node.parameters.base, itemJson);
  if (!base) throw new Error("Airtable: base is required");

  const url = `${META_BASE}/bases/${encodeURIComponent(base)}/tables`;
  const res = await airtableRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);
  const obj = asObj(res.body);
  const tables = Array.isArray(obj.tables) ? (obj.tables as Record<string, unknown>[]) : [];
  return tables;
}

async function runOperation(
  _ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (resource === "base") {
    if (operation === "getMany") return baseGetMany(headers);
    if (operation === "getSchema") return baseGetSchema(node, itemJson, headers);
    throw new Error(`Airtable: unsupported base operation "${operation}"`);
  }

  if (resource !== "record") {
    throw new Error(`Airtable: unsupported resource "${resource}"`);
  }

  switch (operation) {
    case "create":
      return [await recordCreate(node, itemJson, headers)];
    case "upsert":
      return [await recordUpsert(node, itemJson, headers)];
    case "delete":
    case "deleteRecord":
      return [await recordDelete(node, itemJson, headers)];
    case "get":
      return [await recordGet(node, itemJson, headers)];
    case "search":
      return recordSearch(node, itemJson, headers);
    case "update":
      return [await recordUpdate(node, itemJson, headers)];
    default:
      throw new Error(`Airtable: unsupported record operation "${operation}"`);
  }
}

export const airtableToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "record");
  const operation = String(node.parameters.operation ?? (resource === "base" ? "getMany" : "get"));
  const authentication = String(node.parameters.authentication ?? "airtableTokenApi");
  const continueOnFail = ctx.continueOnFail();
  const headers = await authHeaders(ctx, authentication);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(ctx, node, resource, operation, itemJson, headers);
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

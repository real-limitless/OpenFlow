import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.airtable.com/v0";
const META_BASE = "https://api.airtable.com/v0/meta";

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
  const credName =
    authentication === "airtableOAuth2Api" ? "airtableOAuth2Api" : "airtableTokenApi";
  const cred = await ctx.getCredential(credName);
  const token = cred
    ? String(cred.accessToken ?? cred.apiKey ?? cred.token ?? "")
    : "";
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

function buildFields(
  node: INode,
  itemJson: Record<string, unknown>,
  opts?: { stripId?: boolean },
): Record<string, unknown> {
  const columns = node.parameters.columns as
    | {
        mappingMode?: string;
        value?: Record<string, unknown> | null;
        matchingColumns?: string[];
      }
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
    for (const [k, v] of Object.entries(columns.value)) {
      fields[k] = resolveValue(v, itemJson);
    }
  }

  if (opts?.stripId !== false) {
    delete fields.id;
  }
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

export const airtableExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "record");
  const operation = String(
    node.parameters.operation ?? (resource === "base" ? "getMany" : "get"),
  );
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
      if (operation === "delete" || operation === "get") {
        out.push({ json: { error: message }, pairedItem });
      } else {
        out.push({ json: { message, error: message }, pairedItem });
      }
    }
  }

  return [out];
};

async function runOperation(
  _ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (resource === "base") {
    if (operation === "getMany") return baseGetMany(node, itemJson, headers);
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
  const body: Record<string, unknown> = {
    records: [{ fields }],
  };
  if (typecast) body.typecast = true;

  const url = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;
  const res = await airtableRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);

  const obj = asObj(res.body);
  const records = Array.isArray(obj.records) ? (obj.records as Record<string, unknown>[]) : [];
  if (records[0]) return records[0];
  return obj;
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

  const fieldsWithId = buildFields(node, itemJson, { stripId: false });
  const recordId =
    typeof fieldsWithId.id === "string"
      ? fieldsWithId.id
      : matchingColumns.includes("id") && typeof itemJson.id === "string"
        ? itemJson.id
        : "";
  const fields = { ...fieldsWithId };
  delete fields.id;

  const url = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;

  if (recordId) {
    const body: Record<string, unknown> = {
      records: [{ id: recordId, fields }],
    };
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
  // TODO: downloadFields attachment binary fetch (partial)
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

  const sort = node.parameters.sort as
    | { property?: Array<{ field?: string; direction?: string }> }
    | undefined;
  const sortProps = sort?.property ?? [];

  const view =
    resolveResourceLocator(options.view ?? node.parameters.view, itemJson) || undefined;

  let fieldsParam: string[] | undefined;
  const fieldsOpt = options.fields;
  if (Array.isArray(fieldsOpt)) {
    fieldsParam = fieldsOpt.map(String);
  }

  const basePath = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;
  const all: Record<string, unknown>[] = [];
  let offset: string | undefined;

  for (;;) {
    const params: Record<string, string | string[] | undefined> = {};
    if (filterByFormula) params.filterByFormula = filterByFormula;
    if (view) params.view = view;
    if (fieldsParam?.length) {
      for (let i = 0; i < fieldsParam.length; i++) {
        params[`fields[${i}]`] = fieldsParam[i];
      }
    }
    for (let i = 0; i < sortProps.length; i++) {
      const s = sortProps[i];
      if (!s?.field) continue;
      params[`sort[${i}][field]`] = String(resolveValue(s.field, itemJson) ?? "");
      params[`sort[${i}][direction]`] = s.direction === "desc" ? "desc" : "asc";
    }
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
    const records = Array.isArray(obj.records)
      ? (obj.records as Record<string, unknown>[])
      : [];
    all.push(...records);

    if (!returnAll) break;
    offset = typeof obj.offset === "string" ? obj.offset : undefined;
    if (!offset) break;
  }

  // TODO: downloadFields attachment binary fetch (partial)
  return all;
}

async function recordUpdate(
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
  const updateAllMatches = options.updateAllMatches === true;

  const fieldsWithId = buildFields(node, itemJson, { stripId: false });
  let recordId =
    typeof fieldsWithId.id === "string"
      ? fieldsWithId.id
      : typeof itemJson.id === "string"
        ? itemJson.id
        : String(resolveValue(node.parameters.id, itemJson) ?? "");

  const fields = { ...fieldsWithId };
  delete fields.id;

  const url = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;

  if (!recordId && matchingColumns.length && !matchingColumns.includes("id")) {
    const matches = await findMatches(base, table, headers, matchingColumns, itemJson, fieldsWithId);
    if (matches.length === 0) {
      throw new Error("Airtable: no matching records found for update");
    }
    const toUpdate = updateAllMatches ? matches : [matches[0]];
    const body: Record<string, unknown> = {
      records: toUpdate.map((m) => ({ id: m.id, fields })),
    };
    if (typecast) body.typecast = true;
    const res = await airtableRequest("PATCH", url, headers, body);
    if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);
    return asObj(res.body);
  }

  if (!recordId) throw new Error("Airtable: record id is required for update");

  const body: Record<string, unknown> = {
    records: [{ id: recordId, fields }],
  };
  if (typecast) body.typecast = true;
  const res = await airtableRequest("PATCH", url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw processAirtableError(res.body, res.status, recordId);
  }
  return asObj(res.body);
}

async function findMatches(
  base: string,
  table: string,
  headers: Record<string, string>,
  matchingColumns: string[],
  itemJson: Record<string, unknown>,
  fieldsWithId: Record<string, unknown>,
): Promise<Array<{ id: string }>> {
  const all: Array<{ id: string; fields?: Record<string, unknown> }> = [];
  let offset: string | undefined;
  const basePath = `${API_BASE}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;

  for (;;) {
    const qs = encodeQuery({ pageSize: "100", offset });
    const res = await airtableRequest("GET", `${basePath}${qs}`, headers);
    if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);
    const obj = asObj(res.body);
    const records = Array.isArray(obj.records)
      ? (obj.records as Array<{ id: string; fields?: Record<string, unknown> }>)
      : [];
    all.push(...records);
    offset = typeof obj.offset === "string" ? obj.offset : undefined;
    if (!offset) break;
  }

  return all.filter((rec) => {
    const rf = rec.fields ?? {};
    return matchingColumns.every((col) => {
      const expected =
        fieldsWithId[col] !== undefined ? fieldsWithId[col] : itemJson[col];
      return rf[col] === expected;
    });
  });
}

async function baseGetMany(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const returnAll = node.parameters.returnAll !== false;
  const limit = Math.min(Number(node.parameters.limit ?? 100), 100);
  const options = getOptions(node);
  const permissionLevels = Array.isArray(options.permissionLevel)
    ? (options.permissionLevel as string[])
    : undefined;

  const all: Record<string, unknown>[] = [];
  let offset: string | undefined;

  for (;;) {
    const qs = encodeQuery({ offset });
    const res = await airtableRequest("GET", `${META_BASE}/bases${qs}`, headers);
    if (res.status < 200 || res.status >= 300) throw processAirtableError(res.body, res.status);
    const obj = asObj(res.body);
    const bases = Array.isArray(obj.bases) ? (obj.bases as Record<string, unknown>[]) : [];
    all.push(...bases);
    offset = typeof obj.offset === "string" ? obj.offset : undefined;
    if (!returnAll || !offset) break;
  }

  let filtered = all;
  if (permissionLevels?.length) {
    filtered = all.filter((b) => permissionLevels.includes(String(b.permissionLevel ?? "")));
  }
  if (!returnAll) return filtered.slice(0, limit);
  return filtered;
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

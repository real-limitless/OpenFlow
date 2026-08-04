import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, sdkHttpRequest } from "@/sdk";

const FM_API_BASE = "/fmi/data/v1/databases";

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

function getStringParam(node: INode, name: string, def = ""): string {
  return String(node.parameters[name] ?? def);
}

function getNumberParam(node: INode, name: string, def: number): number {
  const v = node.parameters[name];
  if (v === undefined || v === null) return def;
  return Number(v);
}

function getObjectParam(node: INode, name: string, def: Record<string, unknown> = {}): Record<string, unknown> {
  const v = node.parameters[name];
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return def; } }
  return def;
}

function getArrayParam(node: INode, name: string, def: Record<string, unknown>[] = []): Record<string, unknown>[] {
  const v = node.parameters[name];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : def; } catch { return def; } }
  return def;
}

interface FmApiResponse {
  response?: Record<string, unknown>;
  messages?: Array<{ code: string; message: string }>;
}

async function authSession(ctx: ExecutionContext, host: string, database: string): Promise<{ token: string }> {
  const cred = await ctx.getCredential("filemakerApi");
  const data = cred as Record<string, unknown> | null;
  if (!data) throw new Error("FileMaker credential 'filemakerApi' is missing");
  const login = String(data.login ?? "");
  const password = String(data.password ?? "");
  const url = `${host}${FM_API_BASE}/${encodeURIComponent(database)}/sessions`;
  const res = await sdkHttpRequest({
    method: "POST",
    url,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ "fmDataSource": [{ "database": database }] }),
  });
  const body = res.body as FmApiResponse;
  if (res.status >= 400 || !body?.response) {
    throw new Error(`FileMaker auth failed: ${JSON.stringify(body?.messages ?? res.body)}`);
  }
  const token = String((body.response as Record<string, unknown>)?.token ?? "");
  if (!token) throw new Error("FileMaker auth returned no token");
  return { token };
}

async function releaseSession(host: string, database: string, token: string): Promise<void> {
  try {
    await sdkHttpRequest({
      method: "DELETE",
      url: `${host}${FM_API_BASE}/${encodeURIComponent(database)}/sessions/${token}`,
    });
  } catch {
    // best-effort logout
  }
}

async function fmRequest(
  method: string,
  host: string,
  database: string,
  token: string,
  path: string,
  body?: unknown,
): Promise<FmApiResponse> {
  const url = `${host}${FM_API_BASE}/${encodeURIComponent(database)}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const opts: { method: string; url: string; headers: Record<string, string>; body?: unknown } = {
    method,
    url,
    headers,
  };
  if (body !== undefined) opts.body = body;
  const res = await sdkHttpRequest(opts);
  if (res.status === 204) return { response: {} };
  const result = res.body as FmApiResponse;
  if (res.status >= 400) {
    const msg = JSON.stringify(result?.messages ?? res.body);
    const notFound = res.status === 404;
    if (notFound) throw Object.assign(new Error(`FileMaker record not found: ${msg}`), { status: 404 });
    throw new Error(`FileMaker API error (${res.status}): ${msg}`);
  }
  return result;
}

function buildFieldData(
  fieldsParam: unknown,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (fieldsParam && typeof fieldsParam === "object") {
    const obj = fieldsParam as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      fields[k] = resolveValue(v, itemJson);
    }
  }
  return { fieldData: fields };
}

function buildQuery(queryParam: Record<string, unknown>[], itemJson: Record<string, unknown>): Record<string, unknown>[] {
  return queryParam.map((entry) => {
    const q: Record<string, unknown> = {};
    const field = String(entry.field ?? "");
    const value = resolveValue(entry.value, itemJson);
    if (field) q[field] = value;
    if (entry.omit) q["omit"] = entry.omit;
    return q;
  });
}

async function handleRecord(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cred = await ctx.getCredential("filemakerApi");
  const credData = cred as Record<string, unknown> | null;
  if (!credData) throw new Error("FileMaker credential 'filemakerApi' is missing");
  const host = String(credData.host ?? "");
  const database = String(credData.database ?? "");
  if (!host || !database) throw new Error("FileMaker credential requires 'host' and 'database'");

  const layout = getStringParam(node, "layout");
  if (!layout) throw new Error("FileMaker 'layout' parameter is required");

  const { token } = await authSession(ctx, host, database);
  try {
    let result: FmApiResponse;
    const encodedLayout = encodeURIComponent(layout);

    switch (operation) {
      case "create": {
        const fields = getObjectParam(node, "fields");
        const body = buildFieldData(fields, itemJson);
        result = await fmRequest("POST", host, database, token, `/layouts/${encodedLayout}/records`, body);
        break;
      }

      case "get": {
        const recordId = getStringParam(node, "recordId");
        if (!recordId) throw new Error("FileMaker 'recordId' is required for get operation");
        result = await fmRequest("GET", host, database, token, `/layouts/${encodedLayout}/records/${encodeURIComponent(recordId)}`);
        break;
      }

      case "getAll": {
        const limit = getNumberParam(node, "limit", 25);
        const offset = getNumberParam(node, "offset", 1);
        const sort = getArrayParam(node, "sort");
        const portal = getArrayParam(node, "portal");
        const params = new URLSearchParams();
        params.set("_limit", String(limit));
        params.set("_offset", String(offset));
        if (sort.length > 0) params.set("_sort", JSON.stringify(sort));
        if (portal.length > 0) params.set("_portal", JSON.stringify(portal));
        const qs = params.toString();
        result = await fmRequest("GET", host, database, token, `/layouts/${encodedLayout}/records${qs ? "?" + qs : ""}`);
        break;
      }

      case "find": {
        const query = getArrayParam(node, "query");
        const offset = getNumberParam(node, "offset", 1);
        const sort = getArrayParam(node, "sort");
        const portal = getArrayParam(node, "portal");
        const body: Record<string, unknown> = {
          query: buildQuery(query, itemJson),
          offset,
        };
        if (sort.length > 0) body.sort = sort;
        if (portal.length > 0) body.portal = portal;
        result = await fmRequest("POST", host, database, token, `/layouts/${encodedLayout}/_find`, body);
        break;
      }

      case "edit": {
        const recordId = getStringParam(node, "recordId");
        if (!recordId) throw new Error("FileMaker 'recordId' is required for edit operation");
        const fields = getObjectParam(node, "fields");
        const body = buildFieldData(fields, itemJson);
        result = await fmRequest("PATCH", host, database, token, `/layouts/${encodedLayout}/records/${encodeURIComponent(recordId)}`, body);
        break;
      }

      case "duplicate": {
        const recordId = getStringParam(node, "recordId");
        if (!recordId) throw new Error("FileMaker 'recordId' is required for duplicate operation");
        result = await fmRequest("POST", host, database, token, `/layouts/${encodedLayout}/records/${encodeURIComponent(recordId)}`);
        break;
      }

      case "delete": {
        const recordId = getStringParam(node, "recordId");
        if (!recordId) throw new Error("FileMaker 'recordId' is required for delete operation");
        result = await fmRequest("DELETE", host, database, token, `/layouts/${encodedLayout}/records/${encodeURIComponent(recordId)}`);
        break;
      }

      case "performScript": {
        const script = getStringParam(node, "script");
        if (!script) throw new Error("FileMaker 'script' parameter is required for performScript operation");
        const scriptParam = getStringParam(node, "scriptParameter");
        let path = `/layouts/${encodedLayout}/script/${encodeURIComponent(script)}`;
        if (scriptParam) path += `?script.param=${encodeURIComponent(scriptParam)}`;
        result = await fmRequest("GET", host, database, token, path);
        break;
      }

      default:
        throw new Error(`FileMaker unknown operation: ${operation}`);
    }

    return result?.response ?? {};
  } finally {
    await releaseSession(host, database, token);
  }
}

export const filemakerExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "record");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await handleRecord(ctx, node, operation, itemJson);
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};

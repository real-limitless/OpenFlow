import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.baserow.io/api";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function baserowRequest(
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
    } catch { }
    return { status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function processError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message = typeof obj.detail === "string" ? obj.detail : typeof obj.error === "string" ? obj.error : `HTTP ${status}`;
  return new Error(`Baserow: ${message}`);
}

async function requestOk(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const res = await baserowRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status);
  return asObj(res.body);
}

function buildQs(query: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? "?" + parts.join("&") : "";
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("baserowApi") ?? await ctx.getCredential("baserowTokenApi");
  const host = cred ? String(cred.host ?? cred.baseUrl ?? "https://api.baserow.io").replace(/\/+$/, "") : "https://api.baserow.io";
  const token = cred ? String(cred.token ?? "") : "";
  const username = cred ? String(cred.username ?? "") : "";
  const password = cred ? String(cred.password ?? "") : "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Token ${token}`;
  } else if (username && password) {
    headers["Authorization"] = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }
  return { host, ...headers };
}

export const baserowToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const operation = String(node.parameters.operation ?? "create");
  const tableId = Number(node.parameters.tableId ?? 0);
  const continueOnFail = ctx.continueOnFail();
  const { host, ...headers } = await authHeaders(ctx);
  const baseUrl = `${host}/api`;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(node, operation, tableId, itemJson, baseUrl, headers);
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
  operation: string,
  tableId: number,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const tablePath = `/database/rows/table/${tableId}/`;

  if (operation === "create") {
    const data = resolveValue(node.parameters.data, itemJson) ?? {};
    const payload = typeof data === "object" && data !== null && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
    const obj = await requestOk("POST", `${baseUrl}${tablePath}`, headers, payload);
    return [obj];
  }

  if (operation === "get") {
    const rowId = Number(resolveValue(node.parameters.rowId, itemJson) ?? 0);
    if (!rowId) throw new Error("Baserow: rowId is required for get");
    const obj = await requestOk("GET", `${baseUrl}${tablePath}${rowId}/`, headers);
    return [obj];
  }

  if (operation === "getAll") {
    const filters = (resolveValue(node.parameters.filters, itemJson) ?? {}) as Record<string, unknown>;
    const options = (resolveValue(node.parameters.options, itemJson) ?? {}) as Record<string, unknown>;
    const qsParts: Record<string, unknown> = { ...options };
    if (filters && typeof filters === "object") {
      for (const [k, v] of Object.entries(filters)) {
        qsParts[k] = v;
      }
    }
    const qs = buildQs(qsParts);
    const obj = await requestOk("GET", `${baseUrl}${tablePath}${qs}`, headers);
    const results = Array.isArray(obj.results) ? obj.results as Record<string, unknown>[] : [];
    if (results.length === 0 && obj.id) return [obj];
    return results;
  }

  if (operation === "update") {
    const rowId = Number(resolveValue(node.parameters.rowId, itemJson) ?? 0);
    if (!rowId) throw new Error("Baserow: rowId is required for update");
    const data = resolveValue(node.parameters.data, itemJson) ?? {};
    const payload = typeof data === "object" && data !== null && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
    const obj = await requestOk("PATCH", `${baseUrl}${tablePath}${rowId}/`, headers, payload);
    return [obj];
  }

  if (operation === "delete") {
    const rowId = Number(resolveValue(node.parameters.rowId, itemJson) ?? 0);
    if (!rowId) throw new Error("Baserow: rowId is required for delete");
    await requestOk("DELETE", `${baseUrl}${tablePath}${rowId}/`, headers);
    return [{ success: true, id: rowId }];
  }

  if (operation === "createMultiple") {
    const data = resolveValue(node.parameters.data, itemJson) ?? [];
    const items = Array.isArray(data) ? data : [];
    const obj = await requestOk("POST", `${baseUrl}${tablePath}batch/`, headers, items);
    const raw = Array.isArray(obj.data) ? obj.data : (Array.isArray(obj) ? obj : []);
    return raw.length > 0 ? raw : [obj];
  }

  if (operation === "updateMultiple") {
    const data = resolveValue(node.parameters.data, itemJson) ?? [];
    const items = Array.isArray(data) ? data : [];
    const obj = await requestOk("PATCH", `${baseUrl}${tablePath}batch/`, headers, items);
    const raw = Array.isArray(obj.data) ? obj.data : (Array.isArray(obj) ? obj : []);
    return raw.length > 0 ? raw : [obj];
  }

  if (operation === "deleteMultiple") {
    const data = resolveValue(node.parameters.data, itemJson) ?? [];
    const rowIds = Array.isArray(data) ? data : [];
    await requestOk("DELETE", `${baseUrl}${tablePath}batch/`, headers, rowIds);
    return [{ success: true }];
  }

  throw new Error(`Baserow: unsupported operation "${operation}"`);
}

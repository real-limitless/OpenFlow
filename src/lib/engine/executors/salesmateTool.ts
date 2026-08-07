import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

async function smRequest(
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
    } catch {}
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Salesmate request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<{ headers: Record<string, string>; baseUrl: string }> {
  const cred = await ctx.getCredential("salesmateApi");
  const sessionToken = cred ? String(cred.sessionToken ?? cred.token ?? "") : "";
  if (!sessionToken) {
    throw new Error("Salesmate: credential is not configured (no session token)");
  }
  const url = cred ? String(cred.url ?? "").replace(/\/$/, "") : "";
  if (!url) {
    throw new Error("Salesmate: URL is not configured in credentials");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-session-token": sessionToken,
  };
  return { headers, baseUrl: url };
}

function endpoint(resource: string, operation: string, id?: string): string {
  const plural = `${resource}`;
  switch (operation) {
    case "create": return `/v1/${plural}/add`;
    case "get": return `/v1/${plural}/${id ?? ""}`;
    case "getAll": return `/v1/${plural}/search`;
    case "update": return `/v1/${plural}/${id ?? ""}`;
    case "delete": return `/v1/${plural}/${id ?? ""}`;
    default: throw new Error(`Salesmate: unsupported operation "${operation}"`);
  }
}

function mergeBody(
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const title = resolveValue(node.parameters.title, itemJson);
  const name = resolveValue(node.parameters.name, itemJson);
  if (resource === "company") {
    const companyName = name || title;
    if (companyName && operation === "create") body.name = companyName;
  } else {
    if (title && operation === "create") body.title = title;
  }
  const owner = resolveValue(node.parameters.owner, itemJson);
  if (owner) body.owner = owner;
  const typeVal = resolveValue(node.parameters.type, itemJson);
  if (typeVal && resource === "activity") body.type = typeVal;
  const additional = node.parameters.additionalFields as Record<string, unknown> ?? {};
  for (const [k, v] of Object.entries(additional)) {
    body[k] = resolveValue(v, itemJson);
  }
  if (operation === "update") {
    const update = node.parameters.updateFields as Record<string, unknown> ?? {};
    for (const [k, v] of Object.entries(update)) {
      const key = resource === "company" && k === "title" ? "name" : k;
      body[key] = resolveValue(v, itemJson);
    }
  }
  return body;
}

function processError(body: unknown, status: number, resource: string, operation: string): Error {
  const obj = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const msg = obj.Message ? String(obj.Message) : obj.message ? String(obj.message) : `HTTP ${status}`;
  return new Error(`Salesmate: ${msg} (${resource}/${operation})`);
}

export const salesmateToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "deal");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();
  const { headers, baseUrl } = await getAuthHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: Record<string, unknown>;

      if (operation === "getAll") {
        const returnAll = node.parameters.returnAll === true;
        const limit = Math.min(Number(node.parameters.limit ?? 10), 25);
        const options = (node.parameters.options as Record<string, unknown>) ?? {};
        const url = `${baseUrl}${endpoint(resource, "getAll")}`;
        const searchBody: Record<string, unknown> = {};
        if (options.fields) searchBody.fields = String(options.fields);
        if (options.sortBy) searchBody.sortBy = { field: options.sortBy, order: options.sortOrder ?? "asc" };
        if (!returnAll) searchBody.limit = limit;
        const jsonParams = node.parameters.jsonParameters === true;
        if (jsonParams) {
          const rawFilters = String(node.parameters.filters ?? "{}");
          try { const parsed = JSON.parse(rawFilters); Object.assign(searchBody, parsed); } catch {}
        } else {
          const rawFilters = node.parameters.filters as Record<string, unknown> | undefined;
          if (rawFilters) Object.assign(searchBody, rawFilters);
        }

        const res = await smRequest("POST", url, headers, searchBody);
        if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, resource, "getAll");
        const r = res.body && typeof res.body === "object" ? res.body as Record<string, unknown> : {};
        const data = Array.isArray(r.Data) ? r.Data as Record<string, unknown>[] : [];
        out.push({ json: data, pairedItem });
      } else if (operation === "create") {
        const body = mergeBody(node, resource, operation, itemJson);
        const url = `${baseUrl}${endpoint(resource, "create")}`;
        const res = await smRequest("POST", url, headers, body);
        if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, resource, "create");
        const r = res.body && typeof res.body === "object" ? res.body as Record<string, unknown> : {};
        const data = r.Data as Record<string, unknown> ?? r;
        out.push({ json: { ...body, ...data }, pairedItem });
      } else if (operation === "get") {
        const idField = `${resource}Id`;
        const recordId = String(resolveValue(node.parameters[idField], itemJson) ?? "");
        if (!recordId) throw new Error(`Salesmate: ${idField} is required for ${resource} get`);
        const url = `${baseUrl}${endpoint(resource, "get", recordId)}`;
        const res = await smRequest("GET", url, headers);
        if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, resource, "get");
        const r = res.body && typeof res.body === "object" ? res.body as Record<string, unknown> : {};
        const data = r.Data as Record<string, unknown> ?? r;
        out.push({ json: data, pairedItem });
      } else if (operation === "update") {
        const idField = `${resource}Id`;
        const recordId = String(resolveValue(node.parameters[idField], itemJson) ?? "");
        if (!recordId) throw new Error(`Salesmate: ${idField} is required for ${resource} update`);
        const body = mergeBody(node, resource, operation, itemJson);
        const url = `${baseUrl}${endpoint(resource, "update", recordId)}`;
        const res = await smRequest("PUT", url, headers, body);
        if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, resource, "update");
        out.push({ json: { id: recordId, success: true, ...body }, pairedItem });
      } else if (operation === "delete") {
        const idField = `${resource}Id`;
        const recordId = String(resolveValue(node.parameters[idField], itemJson) ?? "");
        if (!recordId) throw new Error(`Salesmate: ${idField} is required for ${resource} delete`);
        const url = `${baseUrl}${endpoint(resource, "delete", recordId)}`;
        const res = await smRequest("DELETE", url, headers);
        if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status, resource, "delete");
        out.push({ json: { id: recordId, success: true }, pairedItem });
      } else {
        throw new Error(`Salesmate: unsupported operation "${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

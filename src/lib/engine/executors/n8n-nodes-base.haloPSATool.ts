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

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function haloPSARequest(
  url: string,
  method: string,
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
    try { parsed = text ? JSON.parse(text) : null; } catch { }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`HaloPSA request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message = typeof obj.message === "string" ? obj.message : typeof obj.error === "string" ? obj.error : `HTTP ${status}`;
  return new Error(`HaloPSA: ${message}`);
}

async function requestOk(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const res = await haloPSARequest(url, method, headers, body);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status);
  return asObj(res.body);
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("haloPSAApi");
  const token = cred ? String(cred.accessToken ?? cred.token ?? cred.apiKey ?? "") : "";
  if (!token) throw new Error("HaloPSA: haloPSAApi credential is not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function buildResourceUrl(baseUrl: string, resource: string, resourceId?: string): string {
  const resources: Record<string, string> = {
    client: "Client",
    site: "Site",
    ticket: "Tickets",
    user: "Users",
  };
  const segment = resources[resource.toLowerCase()] ?? resource;
  if (resourceId) return `${baseUrl.replace(/\/$/, "")}/api/${segment}/${resourceId}`;
  return `${baseUrl.replace(/\/$/, "")}/api/${segment}`;
}

export const haloPSAToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "client");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();
  const baseUrl = String(node.parameters.baseUrl ?? "");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const headers = await authHeaders(ctx);
      const results = await runOperation(node, resource, operation, itemJson, headers, baseUrl);
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
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  baseUrl: string,
): Promise<Record<string, unknown>[]> {
  const url = buildResourceUrl(baseUrl || "https://example.halopsa.com", resource);

  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 50);
    const params = new URLSearchParams();
    if (!returnAll && limit > 0) params.set("page_size", String(limit));
    // TODO: support additional query/pagination filters
    const obj = await requestOk(`${url}?${params.toString()}`, "GET", headers);
    const results = Array.isArray(obj.tickets) ? obj.tickets as Record<string, unknown>[]
      : Array.isArray(obj.clients) ? obj.clients as Record<string, unknown>[]
        : Array.isArray(obj.sites) ? obj.sites as Record<string, unknown>[]
          : Array.isArray(obj.users) ? obj.users as Record<string, unknown>[]
            : Array.isArray(obj) ? obj as Record<string, unknown>[]
              : [obj];
    if (!returnAll && limit > 0) return results.slice(0, limit);
    return results;
  }

  const resourceId = String(resolveValue(node.parameters.resourceId ?? node.parameters[`${resource.toLowerCase()}Id`] ?? "", itemJson) ?? "");

  if (operation === "get") {
    if (!resourceId) throw new Error("HaloPSA: resource identifier is required for get operation");
    const obj = await requestOk(`${url}/${resourceId}`, "GET", headers);
    return [obj];
  }

  if (operation === "create") {
    const body: Record<string, unknown> = {};
    const fieldsParam = node.parameters.requestFields;
    if (fieldsParam && typeof fieldsParam === "object") {
      Object.assign(body, fieldsParam);
    }
    // Evaluate expression-based fields per item
    const rawName = resolveValue(node.parameters.name, itemJson);
    if (rawName) body.name = rawName;
    const rawSummary = resolveValue(node.parameters.summary, itemJson);
    if (rawSummary) body.summary = rawSummary;
    const rawDetails = resolveValue(node.parameters.details, itemJson);
    if (rawDetails) body.details = rawDetails;

    const obj = await requestOk(url, "POST", headers, body);
    return [obj];
  }

  if (operation === "update") {
    if (!resourceId) throw new Error("HaloPSA: resource identifier is required for update operation");
    const body: Record<string, unknown> = {};
    const fieldsParam = node.parameters.requestFields;
    if (fieldsParam && typeof fieldsParam === "object") {
      Object.assign(body, fieldsParam);
    }
    const rawName = resolveValue(node.parameters.name, itemJson);
    if (rawName) body.name = rawName;

    const obj = await requestOk(`${url}/${resourceId}`, "PUT", headers, body);
    return [obj];
  }

  if (operation === "delete") {
    if (!resourceId) throw new Error("HaloPSA: resource identifier is required for delete operation");
    await requestOk(`${url}/${resourceId}`, "DELETE", headers);
    // For delete, pass input item through unchanged
    return [itemJson];
  }

  throw new Error(`HaloPSA: unsupported operation "${operation}" for resource "${resource}"`);
}

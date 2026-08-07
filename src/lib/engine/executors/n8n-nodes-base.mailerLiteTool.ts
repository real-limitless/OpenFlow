import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://connect.mailerlite.com/api";
const SUBSCRIBERS_PATH = "/subscribers";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const code = raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1");
      const fn = new Function("$json", "return " + code);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

async function apiRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw */
  }
  return { status: res.status, data };
}

function extractSubscriber(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object") return obj.data as Record<string, unknown>;
  }
  return raw as Record<string, unknown>;
}

async function opCreate(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData> {
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!email) throw new Error("MailerLite Tool: email is required for create");
  const body: Record<string, unknown> = { email };
  const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
  if (additionalFields) {
    const resolvedFields: Record<string, unknown> = {};
    const status = resolveValue(additionalFields.status, itemJson);
    if (status) resolvedFields.status = String(status);
    const subscribedAt = resolveValue(additionalFields.subscribedAt, itemJson);
    if (subscribedAt) resolvedFields.subscribed_at = String(subscribedAt);
    const ipAddress = resolveValue(additionalFields.ipAddress, itemJson);
    if (ipAddress) resolvedFields.ip_address = String(ipAddress);
    const optedInAt = resolveValue(additionalFields.optedInAt, itemJson);
    if (optedInAt) resolvedFields.opted_in_at = String(optedInAt);
    const optInIp = resolveValue(additionalFields.optInIp, itemJson);
    if (optInIp) resolvedFields.optin_ip = String(optInIp);
    const unsubscribedAt = resolveValue(additionalFields.unsubscribedAt, itemJson);
    if (unsubscribedAt) resolvedFields.unsubscribed_at = String(unsubscribedAt);
    const customFields = resolveValue(additionalFields.customFields, itemJson);
    if (customFields && typeof customFields === "object") resolvedFields.fields = customFields;
    Object.assign(body, resolvedFields);
  }
  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  if (!apiKey) throw new Error("MailerLite Tool: credential mailerLiteApi not configured");
  const { status: httpStatus, data } = await apiRequest("POST", SUBSCRIBERS_PATH, apiKey, body);
  if (httpStatus >= 400) {
    const errMsg = typeof data === "object" && data !== null ? JSON.stringify(data) : String(data);
    throw new Error(`MailerLite Tool API error (${httpStatus}): ${errMsg}`);
  }
  return { json: extractSubscriber(data) };
}

async function opGet(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData | INodeExecutionData[]> {
  const subscriberId = String(resolveValue(node.parameters.subscriberId, itemJson) ?? "");
  if (!subscriberId) throw new Error("MailerLite Tool: subscriberId is required for get");
  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  if (!apiKey) throw new Error("MailerLite Tool: credential mailerLiteApi not configured");
  const { status: httpStatus, data } = await apiRequest("GET", `${SUBSCRIBERS_PATH}/${encodeURIComponent(subscriberId)}`, apiKey);
  if (httpStatus === 404) return [];
  if (httpStatus >= 400) {
    const errMsg = typeof data === "object" && data !== null ? JSON.stringify(data) : String(data);
    throw new Error(`MailerLite Tool API error (${httpStatus}): ${errMsg}`);
  }
  return { json: extractSubscriber(data) };
}

async function opGetAll(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  if (!apiKey) throw new Error("MailerLite Tool: credential mailerLiteApi not configured");
  const returnAll = resolveValue(node.parameters.returnAll, itemJson) === true || resolveValue(node.parameters.returnAll, itemJson) === "true";
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
  const filters = resolveValue(node.parameters.filters, itemJson) as Record<string, unknown> | undefined;
  const allSubscribers: Array<Record<string, unknown>> = [];
  let nextUrl: string | null = null;
  const params = new URLSearchParams();
  params.set("limit", "100");
  if (filters?.status) params.set("status", String(filters.status));
  const query = params.toString();
  let path = query ? `${SUBSCRIBERS_PATH}?${query}` : SUBSCRIBERS_PATH;
  do {
    if (nextUrl) path = nextUrl.replace(API_BASE, "");
    const { status: httpStatus, data } = await apiRequest("GET", path, apiKey);
    if (httpStatus >= 400) {
      const errMsg = typeof data === "object" && data !== null ? JSON.stringify(data) : String(data);
      throw new Error(`MailerLite Tool API error (${httpStatus}): ${errMsg}`);
    }
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.data)) allSubscribers.push(...(obj.data as Array<Record<string, unknown>>));
      const meta = obj.meta as Record<string, unknown> | undefined;
      const links = meta?.links as Record<string, unknown> | undefined;
      nextUrl = links?.next ? String(links.next) : null;
    } else {
      nextUrl = null;
    }
    if (!returnAll && allSubscribers.length >= limit) break;
  } while (nextUrl);
  if (!returnAll) return allSubscribers.slice(0, limit).map((s) => ({ json: s }));
  return allSubscribers.map((s) => ({ json: s }));
}

async function opUpdate(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData | INodeExecutionData[]> {
  const subscriberId = String(resolveValue(node.parameters.subscriberId, itemJson) ?? "");
  if (!subscriberId) throw new Error("MailerLite Tool: subscriberId is required for update");
  const body: Record<string, unknown> = {};
  const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
  if (additionalFields) {
    const status = resolveValue(additionalFields.status, itemJson);
    if (status) body.status = String(status);
    const subscribedAt = resolveValue(additionalFields.subscribedAt, itemJson);
    if (subscribedAt) body.subscribed_at = String(subscribedAt);
    const ipAddress = resolveValue(additionalFields.ipAddress, itemJson);
    if (ipAddress) body.ip_address = String(ipAddress);
    const optedInAt = resolveValue(additionalFields.optedInAt, itemJson);
    if (optedInAt) body.opted_in_at = String(optedInAt);
    const optInIp = resolveValue(additionalFields.optInIp, itemJson);
    if (optInIp) body.optin_ip = String(optInIp);
    const unsubscribedAt = resolveValue(additionalFields.unsubscribedAt, itemJson);
    if (unsubscribedAt) body.unsubscribed_at = String(unsubscribedAt);
    const customFields = resolveValue(additionalFields.customFields, itemJson);
    if (customFields && typeof customFields === "object") body.fields = customFields;
  }
  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  if (!apiKey) throw new Error("MailerLite Tool: credential mailerLiteApi not configured");
  const { status: httpStatus, data } = await apiRequest("PUT", `${SUBSCRIBERS_PATH}/${encodeURIComponent(subscriberId)}`, apiKey, body);
  if (httpStatus === 404) return [];
  if (httpStatus >= 400) {
    const errMsg = typeof data === "object" && data !== null ? JSON.stringify(data) : String(data);
    throw new Error(`MailerLite Tool API error (${httpStatus}): ${errMsg}`);
  }
  return { json: extractSubscriber(data) };
}

export const mailerLiteToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "subscriber");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: INodeExecutionData | INodeExecutionData[];
      if (resource === "subscriber" && operation === "create") {
        result = await opCreate(ctx, node, itemJson);
      } else if (resource === "subscriber" && operation === "get") {
        result = await opGet(ctx, node, itemJson);
      } else if (resource === "subscriber" && operation === "getAll") {
        result = await opGetAll(ctx, node, itemJson);
      } else if (resource === "subscriber" && operation === "update") {
        result = await opUpdate(ctx, node, itemJson);
      } else {
        throw new Error(`MailerLite Tool: unsupported resource/operation "${resource}/${operation}"`);
      }
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }
  return [out];
};

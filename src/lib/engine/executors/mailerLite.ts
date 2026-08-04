import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE_MODERN = "https://connect.mailerlite.com/api";
const API_BASE_CLASSIC = "https://api.mailerlite.com/api/v2";
const SUBSCRIBERS_PATH = "/subscribers";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      out[k] = obj[k];
    }
  }
  return out;
}

async function apiRequest(
  method: string,
  path: string,
  apiKey: string,
  isClassic: boolean,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const base = isClassic ? API_BASE_CLASSIC : API_BASE_MODERN;
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }
  return { status: res.status, data };
}

function extractSubscriberData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object") {
      return obj.data as Record<string, unknown>;
    }
  }
  return raw as Record<string, unknown>;
}

async function operationCreate(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData> {
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!email) throw new Error("MailerLite: email is required for create operation");

  const body: Record<string, unknown> = { email };

  const status = resolveValue(node.parameters.status, itemJson);
  if (status) body.status = String(status);

  const fields = resolveValue(node.parameters.fields, itemJson);
  if (fields && typeof fields === "object") body.fields = fields;

  const subscribedAt = resolveValue(node.parameters.subscribedAt, itemJson);
  if (subscribedAt) body.subscribed_at = String(subscribedAt);

  const ipAddress = resolveValue(node.parameters.ipAddress, itemJson);
  if (ipAddress) body.ip_address = String(ipAddress);

  const optedInAt = resolveValue(node.parameters.optedInAt, itemJson);
  if (optedInAt) body.opted_in_at = String(optedInAt);

  const optInIp = resolveValue(node.parameters.optInIp, itemJson);
  if (optInIp) body.optin_ip = String(optInIp);

  const unsubscribedAt = resolveValue(node.parameters.unsubscribedAt, itemJson);
  if (unsubscribedAt) body.unsubscribed_at = String(unsubscribedAt);

  const resubscribe = resolveValue(node.parameters.resubscribe, itemJson);
  if (resubscribe === true || resubscribe === "true") body.resubscribe = true;

  const groups = resolveValue(node.parameters.groups, itemJson);
  if (groups && Array.isArray(groups)) body.groups = groups;

  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const isClassic = cred ? Boolean(cred.classic) : false;
  if (!apiKey) throw new Error("MailerLite: credential mailerLiteApi is not configured");

  const { status: httpStatus, data } = await apiRequest("POST", SUBSCRIBERS_PATH, apiKey, isClassic, body);

  if (httpStatus >= 400) {
    throw new Error(`MailerLite API error (${httpStatus}): ${JSON.stringify(data)}`);
  }

  const subscriber = extractSubscriberData(data);
  return { json: subscriber };
}

async function operationUpdate(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData | INodeExecutionData[]> {
  const subscriberId = String(resolveValue(node.parameters.subscriberId, itemJson) ?? "");
  if (!subscriberId) throw new Error("MailerLite: subscriberId is required for update operation");

  const body: Record<string, unknown> = {};

  const status = resolveValue(node.parameters.status, itemJson);
  if (status) body.status = String(status);

  const fields = resolveValue(node.parameters.fields, itemJson);
  if (fields && typeof fields === "object") body.fields = fields;

  const subscribedAt = resolveValue(node.parameters.subscribedAt, itemJson);
  if (subscribedAt) body.subscribed_at = String(subscribedAt);

  const ipAddress = resolveValue(node.parameters.ipAddress, itemJson);
  if (ipAddress) body.ip_address = String(ipAddress);

  const optedInAt = resolveValue(node.parameters.optedInAt, itemJson);
  if (optedInAt) body.opted_in_at = String(optedInAt);

  const optInIp = resolveValue(node.parameters.optInIp, itemJson);
  if (optInIp) body.optin_ip = String(optInIp);

  const unsubscribedAt = resolveValue(node.parameters.unsubscribedAt, itemJson);
  if (unsubscribedAt) body.unsubscribed_at = String(unsubscribedAt);

  const groups = resolveValue(node.parameters.groups, itemJson);
  if (groups && Array.isArray(groups)) body.groups = groups;

  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const isClassic = cred ? Boolean(cred.classic) : false;
  if (!apiKey) throw new Error("MailerLite: credential mailerLiteApi is not configured");

  const { status: httpStatus, data } = await apiRequest("PUT", `${SUBSCRIBERS_PATH}/${subscriberId}`, apiKey, isClassic, body);

  if (httpStatus === 404) {
    return [];
  }

  if (httpStatus >= 400) {
    throw new Error(`MailerLite API error (${httpStatus}): ${JSON.stringify(data)}`);
  }

  const subscriber = extractSubscriberData(data);
  return { json: subscriber };
}

async function operationGet(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData | INodeExecutionData[]> {
  const subscriberId = String(resolveValue(node.parameters.subscriberId, itemJson) ?? "");
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");

  if (!subscriberId && !email) {
    throw new Error("MailerLite: subscriberId or email is required for get operation");
  }

  let path: string;
  if (subscriberId) {
    path = `${SUBSCRIBERS_PATH}/${subscriberId}`;
  } else {
    path = `${SUBSCRIBERS_PATH}/${encodeURIComponent(email)}`;
  }

  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const isClassic = cred ? Boolean(cred.classic) : false;
  if (!apiKey) throw new Error("MailerLite: credential mailerLiteApi is not configured");

  const { status: httpStatus, data } = await apiRequest("GET", path, apiKey, isClassic);

  if (httpStatus === 404) {
    return [];
  }

  if (httpStatus >= 400) {
    throw new Error(`MailerLite API error (${httpStatus}): ${JSON.stringify(data)}`);
  }

  const subscriber = extractSubscriberData(data);
  return { json: subscriber };
}

async function operationGetAll(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData[]> {
  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const isClassic = cred ? Boolean(cred.classic) : false;
  if (!apiKey) throw new Error("MailerLite: credential mailerLiteApi is not configured");

  const returnAll = resolveValue(node.parameters.returnAll, itemJson) === true || resolveValue(node.parameters.returnAll, itemJson) === "true";
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 25);
  const filters = resolveValue(node.parameters.filters, itemJson) as Record<string, unknown> | undefined;

  const allSubscribers: Array<Record<string, unknown>> = [];
  let nextUrl: string | null = null;

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (filters?.status) params.set("status", String(filters.status));

  const query = params.toString();
  let path = query ? `${SUBSCRIBERS_PATH}?${query}` : SUBSCRIBERS_PATH;

  do {
    if (nextUrl) {
      path = nextUrl.replace(API_BASE_MODERN, "");
    }

    const { status: httpStatus, data } = await apiRequest("GET", path, apiKey, isClassic);

    if (httpStatus >= 400) {
      throw new Error(`MailerLite API error (${httpStatus}): ${JSON.stringify(data)}`);
    }

    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        allSubscribers.push(...(obj.data as Array<Record<string, unknown>>));
      }
      const meta = obj.meta as Record<string, unknown> | undefined;
      const links = meta?.links as Record<string, unknown> | undefined;
      nextUrl = links?.next ? String(links.next) : null;
    } else {
      nextUrl = null;
    }

    if (!returnAll && allSubscribers.length >= limit) break;
  } while (nextUrl);

  if (!returnAll) {
    return allSubscribers.slice(0, limit).map((s) => ({ json: s }));
  }

  return allSubscribers.map((s) => ({ json: s }));
}

async function operationDelete(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<INodeExecutionData> {
  const subscriberId = String(resolveValue(node.parameters.subscriberId, itemJson) ?? "");
  if (!subscriberId) throw new Error("MailerLite: subscriberId is required for delete operation");

  const cred = await ctx.getCredential("mailerLiteApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const isClassic = cred ? Boolean(cred.classic) : false;
  if (!apiKey) throw new Error("MailerLite: credential mailerLiteApi is not configured");

  const { status: httpStatus } = await apiRequest("DELETE", `${SUBSCRIBERS_PATH}/${subscriberId}`, apiKey, isClassic);

  if (httpStatus === 404) {
    return { json: {} };
  }

  if (httpStatus >= 400) {
    throw new Error(`MailerLite API error (${httpStatus})`);
  }

  return { json: { ...itemJson } };
}

export const mailerLiteExecutor: NodeExecutor = async (ctx, node) => {
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
        result = await operationCreate(ctx, node, itemJson);
      } else if (resource === "subscriber" && operation === "update") {
        result = await operationUpdate(ctx, node, itemJson);
      } else if (resource === "subscriber" && operation === "get") {
        result = await operationGet(ctx, node, itemJson);
      } else if (resource === "subscriber" && operation === "getAll") {
        result = await operationGetAll(ctx, node, itemJson);
      } else if (resource === "subscriber" && operation === "delete") {
        result = await operationDelete(ctx, node, itemJson);
      } else {
        throw new Error(`MailerLite: unsupported resource/operation "${resource}/${operation}"`);
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

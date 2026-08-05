import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const TRACK_API_GLOBAL = "https://track.customer.io/api/v1";
const TRACK_API_EU = "https://track-eu.customer.io/api/v1";
const APP_API_GLOBAL = "https://api.customer.io/v1/api";
const APP_API_EU = "https://api-eu.customer.io/v1/api";

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

function buildBasicAuth(apiKey: string, siteId: string): string {
  return btoa(`${siteId}:${apiKey}`);
}

function buildTrackAuth(trackingKey: string, trackingSiteId: string): string {
  return buildBasicAuth(trackingKey, trackingSiteId);
}

interface OperationResult {
  json: Record<string, unknown>;
}

export const customerIoToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "customer");
  const operation = String(node.parameters.operation ?? "upsert");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("customerIoApi");
  const trackingKey = cred ? String(cred.trackingApiKey ?? "") : "";
  const trackingSiteId = cred ? String(cred.trackingSiteId ?? "") : "";
  const appApiKey = cred ? String(cred.appApiKey ?? "") : "";
  const region = cred ? String(cred.region ?? "global") : "global";
  const trackBase = region === "eu" ? TRACK_API_EU : TRACK_API_GLOBAL;
  const appBase = region === "eu" ? APP_API_EU : APP_API_GLOBAL;

  if (!trackingKey || !trackingSiteId) {
    throw new Error("Customer.io: Tracking API Key and Tracking Site ID are required");
  }
  if (!appApiKey) {
    throw new Error("Customer.io: App API Key is required");
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(
        resource,
        operation,
        node,
        itemJson,
        trackBase,
        appBase,
        trackingKey,
        trackingSiteId,
        appApiKey,
      );
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

async function runOperation(
  resource: string,
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
  trackBase: string,
  appBase: string,
  trackingKey: string,
  trackingSiteId: string,
  appApiKey: string,
): Promise<OperationResult | OperationResult[]> {
  if (resource === "customer") {
    return runCustomerOperation(operation, node, itemJson, trackBase, trackingKey, trackingSiteId);
  }
  if (resource === "event") {
    return runEventOperation(operation, node, itemJson, trackBase, trackingKey, trackingSiteId);
  }
  if (resource === "campaign") {
    return runCampaignOperation(operation, node, itemJson, appBase, appApiKey);
  }
  if (resource === "segment") {
    return runSegmentOperation(operation, node, itemJson, trackBase, trackingKey, trackingSiteId);
  }
  throw new Error(`Customer.io: unsupported resource "${resource}"`);
}

// ---------- Customer ----------

async function runCustomerOperation(
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
  base: string,
  apiKey: string,
  siteId: string,
): Promise<OperationResult> {
  const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
  if (!id) throw new Error("Customer.io: customer id is required");

  if (operation === "upsert") {
    const body: Record<string, unknown> = {};
    const email = resolveValue(node.parameters.email, itemJson);
    if (email) body.email = String(email);
    const attributes = resolveValue(node.parameters.customerAttributes, itemJson);
    if (attributes && typeof attributes === "object") {
      (body as Record<string, unknown>).attributes = attributes;
    }
    const res = await cioRequest("PUT", `${base}/customers/${encodeURIComponent(id)}`, body, apiKey, siteId, true);
    return { json: res };
  }

  if (operation === "delete") {
    const res = await cioRequest("DELETE", `${base}/customers/${encodeURIComponent(id)}`, undefined, apiKey, siteId, true);
    return { json: res };
  }

  throw new Error(`Customer.io: unsupported customer operation "${operation}"`);
}

// ---------- Event ----------

async function runEventOperation(
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
  base: string,
  apiKey: string,
  siteId: string,
): Promise<OperationResult> {
  if (operation === "track" || operation === "trackAnonymous") {
    const eventName = String(resolveValue(node.parameters.eventName, itemJson) ?? "");
    if (!eventName) throw new Error("Customer.io: event name is required");

    const body: Record<string, unknown> = { name: eventName };
    const eventAttrs = resolveValue(node.parameters.eventAttributes, itemJson);
    if (eventAttrs && typeof eventAttrs === "object") {
      body.data = eventAttrs;
    }

    if (operation === "trackAnonymous") {
      const anonymousId = String(resolveValue(node.parameters.anonymousId, itemJson) ?? "");
      if (!anonymousId) throw new Error("Customer.io: anonymousId is required for trackAnonymous");
      body.anonymous_id = anonymousId;
    } else {
      const customerId = resolveValue(node.parameters.customerId, itemJson);
      if (customerId && String(customerId)) {
        body.customer_id = String(customerId);
      } else {
        const anonymousId = String(resolveValue(node.parameters.anonymousId, itemJson) ?? "");
        if (!anonymousId) throw new Error("Customer.io: anonymousId is required when customerId is not provided");
        body.anonymous_id = anonymousId;
      }
    }

    const res = await cioRequest("POST", `${base}/events`, body, apiKey, siteId, true);
    return { json: res };
  }

  throw new Error(`Customer.io: unsupported event operation "${operation}"`);
}

// ---------- Campaign ----------

async function runCampaignOperation(
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
  base: string,
  apiKey: string,
): Promise<OperationResult | OperationResult[]> {
  if (operation === "get") {
    const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
    if (!campaignId) throw new Error("Customer.io: campaignId is required");
    const res = await cioRequest("GET", `${base}/campaigns/${encodeURIComponent(campaignId)}`, undefined, apiKey, undefined, false);
    return { json: asObj(res.campaign ?? res) };
  }

  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const campaignId = resolveValue(node.parameters.campaignId, itemJson);
    if (campaignId) params.campaignId = String(campaignId);
    const qs = Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
    const res = await cioRequest("GET", `${base}/campaigns${qs}`, undefined, apiKey, undefined, false);
    const campaigns = (res.campaigns ?? []) as Record<string, unknown>[];
    return campaigns.map((c) => ({ json: c }));
  }

  if (operation === "getMetrics") {
    const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
    if (!campaignId) throw new Error("Customer.io: campaignId is required");
    const metricField = resolveValue(node.parameters.metricField, itemJson);
    const path = metricField ? `/campaigns/${encodeURIComponent(campaignId)}/metrics/${String(metricField)}` : `/campaigns/${encodeURIComponent(campaignId)}/metrics`;
    const res = await cioRequest("GET", `${base}${path}`, undefined, apiKey, undefined, false);
    return { json: asObj(res) };
  }

  throw new Error(`Customer.io: unsupported campaign operation "${operation}"`);
}

// ---------- Segment ----------

async function runSegmentOperation(
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
  base: string,
  apiKey: string,
  siteId: string,
): Promise<OperationResult> {
  const segmentId = String(resolveValue(node.parameters.segmentId, itemJson) ?? "");
  const customerId = String(resolveValue(node.parameters.customerId, itemJson) ?? "");
  if (!segmentId) throw new Error("Customer.io: segmentId is required");
  if (!customerId) throw new Error("Customer.io: customerId is required");

  if (operation === "add") {
    const res = await cioRequest("POST", `${base}/segments/${encodeURIComponent(segmentId)}/memberships`, { customer_id: customerId }, apiKey, siteId, true);
    return { json: res };
  }

  if (operation === "remove") {
    const res = await cioRequest("DELETE", `${base}/customers/${encodeURIComponent(customerId)}/segment_memberships/${encodeURIComponent(segmentId)}`, undefined, apiKey, siteId, true);
    return { json: res };
  }

  throw new Error(`Customer.io: unsupported segment operation "${operation}"`);
}

// ---------- HTTP helper ----------

async function cioRequest(
  method: string,
  url: string,
  body: Record<string, unknown> | undefined,
  apiKey: string,
  siteId: string | undefined,
  useBasicAuth: boolean,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (useBasicAuth && siteId) {
    headers.Authorization = `Basic ${buildBasicAuth(apiKey, siteId)}`;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };
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
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(obj.error ?? obj.meta ?? `Request failed with status code ${response.status}`);
      throw new Error(`Customer.io API error: ${errMsg}`);
    }
    return asObj(parsed);
  } finally {
    clearTimeout(timer);
  }
}

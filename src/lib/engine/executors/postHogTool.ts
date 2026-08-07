import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { requireCredential, sdkHttpRequest } from "@/sdk";

const POSTHOG_US = "https://app.posthog.com";
const POSTHOG_EU = "https://eu.posthog.com";

export const postHogToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "Event");
  const operation = ctx.getParam<string>("operation", "Create an event");
  const continueOnFail = ctx.continueOnFail();

  const credential = await requireCredential(ctx, "posthogApi");
  const apiKey = credential.apiKey as string;
  const host = (credential.url as string) || POSTHOG_US;

  const baseUrl = host.endsWith("/") ? host.slice(0, -1) : host;
  const captureUrl = `${baseUrl}/capture/`;

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let payload: Record<string, unknown>;

      if (resource === "Event" || resource === "Track") {
        if (resource === "Event") {
          payload = buildEventPayload(ctx, item, i);
        } else {
          payload = buildTrackPayload(ctx, operation, item, i);
        }
      } else if (resource === "Alias") {
        payload = buildAliasPayload(ctx, item, i);
      } else if (resource === "Identity") {
        payload = buildIdentityPayload(ctx, item, i);
      } else {
        throw new Error(
          `PostHog Tool: unsupported resource "${resource}"`,
        );
      }

      payload.api_key = apiKey;

      const response = await sdkHttpRequest({
        method: "POST",
        url: captureUrl,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: payload,
      });

      out.push({
        json: (response.body as Record<string, unknown>) ?? { status: "ok" },
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

function resolveParam(
  ctx: Parameters<NodeExecutor>[0],
  name: string,
  item: INodeExecutionData,
  idx: number,
): unknown {
  const raw = ctx.getParam(name);
  if (typeof raw === "string" && raw.startsWith("={{") && raw.endsWith("}}")) {
    return ctx.evaluate(raw, item.json);
  }
  return raw;
}

function buildEventPayload(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  idx: number,
): Record<string, unknown> {
  const distinctId = resolveParam(ctx, "distinctId", item, idx);
  const eventName = resolveParam(ctx, "eventName", item, idx);

  if (!distinctId || String(distinctId).trim() === "") {
    throw new Error("PostHog Tool: Distinct ID is required");
  }
  if (!eventName || String(eventName).trim() === "") {
    throw new Error("PostHog Tool: Event Name is required");
  }

  const properties = resolveParam(ctx, "properties", item, idx) as Record<string, unknown> | undefined;
  const timestamp = resolveParam(ctx, "timestamp", item, idx) as string | undefined;

  const payload: Record<string, unknown> = {
    event: String(eventName),
    distinct_id: String(distinctId),
    properties: { ...(properties ?? {}) },
  };

  if (timestamp) {
    payload.timestamp = timestamp;
  }

  return payload;
}

function buildTrackPayload(
  ctx: Parameters<NodeExecutor>[0],
  operation: string,
  item: INodeExecutionData,
  idx: number,
): Record<string, unknown> {
  const distinctId = resolveParam(ctx, "distinctId", item, idx);

  if (!distinctId || String(distinctId).trim() === "") {
    throw new Error("PostHog Tool: Distinct ID is required");
  }

  const properties = resolveParam(ctx, "properties", item, idx) as Record<string, unknown> | undefined;
  const timestamp = resolveParam(ctx, "timestamp", item, idx) as string | undefined;
  const pageName = resolveParam(ctx, "pageName", item, idx) as string | undefined;
  const screenName = resolveParam(ctx, "screenName", item, idx) as string | undefined;

  let eventName: string;
  const extra: Record<string, unknown> = { ...(properties ?? {}) };

  if (operation === "Track a page") {
    eventName = "$pageview";
    if (pageName) {
      extra.$current_url = pageName;
    }
  } else if (operation === "Track a screen") {
    eventName = "$screen";
    if (screenName) {
      extra.$screen_name = screenName;
    }
  } else {
    throw new Error(`PostHog Tool: unsupported track operation "${operation}"`);
  }

  const payload: Record<string, unknown> = {
    event: eventName,
    distinct_id: String(distinctId),
    properties: extra,
  };

  if (timestamp) {
    payload.timestamp = timestamp;
  }

  return payload;
}

function buildAliasPayload(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  idx: number,
): Record<string, unknown> {
  const distinctId = resolveParam(ctx, "distinctId", item, idx);
  const alias = resolveParam(ctx, "alias", item, idx);

  if (!distinctId || String(distinctId).trim() === "") {
    throw new Error("PostHog Tool: Distinct ID is required");
  }
  if (!alias || String(alias).trim() === "") {
    throw new Error("PostHog Tool: Alias is required");
  }

  return {
    event: "$create_alias",
    distinct_id: String(distinctId),
    properties: { alias: String(alias) },
  };
}

function buildIdentityPayload(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  idx: number,
): Record<string, unknown> {
  const distinctId = resolveParam(ctx, "distinctId", item, idx);
  const propertiesToSet = resolveParam(ctx, "propertiesToSet", item, idx) as Record<string, unknown> | undefined;

  if (!distinctId || String(distinctId).trim() === "") {
    throw new Error("PostHog Tool: Distinct ID is required");
  }
  if (!propertiesToSet || typeof propertiesToSet !== "object") {
    throw new Error("PostHog Tool: Properties to Set is required and must be an object");
  }

  const timestamp = resolveParam(ctx, "timestamp", item, idx) as string | undefined;

  return {
    event: "$set",
    distinct_id: String(distinctId),
    properties: { $set: propertiesToSet, ...(timestamp ? { $timestamp: timestamp } : {}) },
  };
}

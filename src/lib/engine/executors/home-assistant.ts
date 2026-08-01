import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";

interface HaCredential {
  apiKey?: string;
  baseUrl?: string;
  port?: number;
  ssl?: boolean;
}

function buildBaseUrl(creds: HaCredential): string {
  const protocol = creds.ssl !== false ? "https" : "http";
  const host = creds.baseUrl ?? "localhost";
  const port = creds.port ?? 8123;
  return `${protocol}://${host}:${port}`;
}

async function haRequest(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Home Assistant API error (${res.status}): ${text}`);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getCreds(ctx: ExecutionContext): Promise<{ baseUrl: string; apiKey: string }> {
  const cred = await ctx.getCredential("homeAssistantApi");
  if (!cred) throw new Error("homeAssistantApi credential is not configured");
  const baseUrl = buildBaseUrl(cred as HaCredential);
  const apiKey = (cred as HaCredential).apiKey ?? "";
  if (!apiKey) throw new Error("Home Assistant API key is missing from credential");
  return { baseUrl, apiKey };
}

export const homeAssistantExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const resource = (node.parameters.resource as string) ?? "state";
  const operation = (node.parameters.operation as string) ?? "getAll";
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const { baseUrl, apiKey } = await getCreds(ctx);
      const result = await executeOperation(ctx, baseUrl, apiKey, resource, operation, itemJson);

      if (result && typeof result === "object" && "binary" in result && "json" in result) {
        const r = result as { json: Record<string, unknown>; binary?: Record<string, IBinaryData> };
        out.push({ json: r.json, binary: r.binary, pairedItem });
      } else if (Array.isArray(result)) {
        for (const element of result) {
          out.push({ json: element as Record<string, unknown>, pairedItem });
        }
      } else {
        out.push({ json: result as Record<string, unknown>, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out];
};

async function executeOperation(
  ctx: ExecutionContext,
  baseUrl: string,
  apiKey: string,
  resource: string,
  operation: string,
  _itemJson: Record<string, unknown>,
): Promise<unknown> {
  switch (resource) {
    case "cameraProxy":
      return executeCameraProxy(baseUrl, apiKey, operation, ctx);
    case "config":
      return executeConfig(baseUrl, apiKey, operation);
    case "event":
      return executeEvent(baseUrl, apiKey, operation, ctx);
    case "log":
      return executeLog(baseUrl, apiKey, operation, ctx);
    case "service":
      return executeService(baseUrl, apiKey, operation, ctx);
    case "state":
      return executeState(baseUrl, apiKey, operation, ctx);
    case "template":
      return executeTemplate(baseUrl, apiKey, operation, ctx);
    default:
      throw new Error(`Home Assistant: unsupported resource "${resource}"`);
  }
}

async function executeCameraProxy(
  baseUrl: string,
  apiKey: string,
  operation: string,
  ctx: ExecutionContext,
): Promise<{ json: Record<string, unknown>; binary: Record<string, IBinaryData> }> {
  if (operation !== "get") throw new Error(`Home Assistant: unsupported cameraProxy operation "${operation}"`);
  const entityId = ctx.getParam<string>("entityId", "");
  if (!entityId) throw new Error("Home Assistant: entityId is required for cameraProxy get");
  const url = `${baseUrl}/api/camera_proxy/${encodeURIComponent(entityId)}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Home Assistant API error (${res.status}): ${text}`);
  }
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const base64 = Buffer.from(buf).toString("base64");
  const fileName = `${entityId.replace(/\./g, "_")}.jpg`;
  return {
    json: {},
    binary: {
      data: { data: base64, mimeType: contentType, fileName },
    },
  };
}

async function executeConfig(baseUrl: string, apiKey: string, operation: string): Promise<unknown> {
  if (operation === "get") {
    return haRequest(baseUrl, apiKey, "GET", "/api/config");
  }
  if (operation === "check") {
    return haRequest(baseUrl, apiKey, "POST", "/api/config/core/check_config");
  }
  throw new Error(`Home Assistant: unsupported config operation "${operation}"`);
}

async function executeEvent(baseUrl: string, apiKey: string, operation: string, ctx: ExecutionContext): Promise<unknown> {
  if (operation === "getAll") {
    return haRequest(baseUrl, apiKey, "GET", "/api/events");
  }
  if (operation === "create") {
    const eventType = ctx.getParam<string>("eventType", "");
    if (!eventType) throw new Error("Home Assistant: eventType is required for event create");
    const eventData = ctx.getParam<Record<string, unknown>>("eventData", {});
    return haRequest(baseUrl, apiKey, "POST", `/api/events/${encodeURIComponent(eventType)}`, eventData);
  }
  throw new Error(`Home Assistant: unsupported event operation "${operation}"`);
}

async function executeLog(baseUrl: string, apiKey: string, operation: string, ctx: ExecutionContext): Promise<unknown> {
  const startTimestamp = ctx.getParam<string>("startTimestamp", "");
  const endTimestamp = ctx.getParam<string>("endTimestamp", "");
  const params = new URLSearchParams();
  if (startTimestamp) params.set("start_time", startTimestamp);
  if (endTimestamp) params.set("end_time", endTimestamp);

  if (operation === "getAll") {
    const qs = params.toString();
    const path = qs ? `/api/logbook?${qs}` : "/api/logbook";
    return haRequest(baseUrl, apiKey, "GET", path);
  }
  if (operation === "get") {
    const entityId = ctx.getParam<string>("entityId", "");
    if (!entityId) throw new Error("Home Assistant: entityId is required for log get");
    params.set("entity", entityId);
    return haRequest(baseUrl, apiKey, "GET", `/api/logbook?${params.toString()}`);
  }
  throw new Error(`Home Assistant: unsupported log operation "${operation}"`);
}

async function executeService(baseUrl: string, apiKey: string, operation: string, ctx: ExecutionContext): Promise<unknown> {
  if (operation === "getAll") {
    return haRequest(baseUrl, apiKey, "GET", "/api/services");
  }
  if (operation === "call") {
    const domain = ctx.getParam<string>("domain", "");
    const service = ctx.getParam<string>("service", "");
    if (!domain || !service) throw new Error("Home Assistant: domain and service are required for service call");
    const serviceData = ctx.getParam<Record<string, unknown>>("serviceData", {});
    const returnResponse = ctx.getParam<boolean>("returnResponse", false);
    const qs = returnResponse ? "?return_response" : "";
    return haRequest(baseUrl, apiKey, "POST", `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}${qs}`, serviceData);
  }
  throw new Error(`Home Assistant: unsupported service operation "${operation}"`);
}

async function executeState(baseUrl: string, apiKey: string, operation: string, ctx: ExecutionContext): Promise<unknown> {
  if (operation === "getAll") {
    return haRequest(baseUrl, apiKey, "GET", "/api/states");
  }
  if (operation === "get") {
    const entityId = ctx.getParam<string>("entityId", "");
    if (!entityId) throw new Error("Home Assistant: entityId is required for state get");
    return haRequest(baseUrl, apiKey, "GET", `/api/states/${encodeURIComponent(entityId)}`);
  }
  if (operation === "upsert") {
    const entityId = ctx.getParam<string>("entityId", "");
    const state = ctx.getParam<string>("state", "");
    const attributes = ctx.getParam<Record<string, unknown>>("attributes", {});
    if (!entityId) throw new Error("Home Assistant: entityId is required for state upsert");
    return haRequest(baseUrl, apiKey, "POST", `/api/states/${encodeURIComponent(entityId)}`, { state, attributes });
  }
  throw new Error(`Home Assistant: unsupported state operation "${operation}"`);
}

async function executeTemplate(baseUrl: string, apiKey: string, operation: string, ctx: ExecutionContext): Promise<unknown> {
  if (operation !== "create") throw new Error(`Home Assistant: unsupported template operation "${operation}"`);
  const template = ctx.getParam<string>("template", "");
  if (!template) throw new Error("Home Assistant: template is required for template create");
  const result = await haRequest(baseUrl, apiKey, "POST", "/api/template", { template });
  return { rendered: result as string };
}

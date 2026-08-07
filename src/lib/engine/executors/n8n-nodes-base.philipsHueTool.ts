import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.meethue.com/route/clip/v2";

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("philipsHueOAuth2Api");
  const token = cred ? String(cred.accessToken ?? cred.apiKey ?? "") : "";
  if (!token) throw new Error("Philips Hue: philipsHueOAuth2Api credential is not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function hueRequest(
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
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Philips Hue request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

function processHueError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const errors = Array.isArray(obj.errors) ? obj.errors : [];
  const message = errors.length > 0
    ? String(errors[0] && typeof errors[0] === "object" ? (errors[0] as Record<string, unknown>).description ?? errors[0] : errors[0])
    : typeof obj.message === "string"
      ? obj.message
      : `HTTP ${status}`;
  return new Error(`Philips Hue: ${message}`);
}

async function requestOk(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await hueRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processHueError(res.body, res.status);
  return asObj(res.body);
}

export const philipsHueToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();
  const headers = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(node, operation, itemJson, headers);
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
  _itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const lightId = String(node.parameters.lightId ?? "");

  if (operation === "getAll") {
    const obj = await requestOk("GET", `${API_BASE}/resource/light`, headers);
    const data = obj.data;
    const lights = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    return lights;
  }

  if (operation === "get") {
    if (!lightId) throw new Error("Philips Hue: lightId is required for get operation");
    const obj = await requestOk("GET", `${API_BASE}/resource/light/${encodeURIComponent(lightId)}`, headers);
    const data = obj.data;
    if (Array.isArray(data) && data.length > 0) return [data[0] as Record<string, unknown>];
    return [obj];
  }

  if (operation === "delete") {
    if (!lightId) throw new Error("Philips Hue: lightId is required for delete operation");
    const obj = await requestOk("DELETE", `${API_BASE}/resource/light/${encodeURIComponent(lightId)}`, headers);
    return [obj];
  }

  if (operation === "update") {
    if (!lightId) throw new Error("Philips Hue: lightId is required for update operation");
    const body: Record<string, unknown> = {};
    const on = node.parameters.on;
    if (on !== undefined && on !== null && on !== "") {
      body.on = { on: Boolean(on) };
    }
    const brightness = node.parameters.brightness;
    if (brightness !== undefined && brightness !== null && brightness !== "") {
      body.dimming = { brightness: Number(brightness) };
    }
    const hue = node.parameters.hue;
    if (hue !== undefined && hue !== null && hue !== "") {
      body.color = { hue: Number(hue) };
    }
    const saturation = node.parameters.saturation;
    if (saturation !== undefined && saturation !== null && saturation !== "") {
      if (!body.color) body.color = {};
      (body.color as Record<string, unknown>).saturation = Number(saturation);
    }
    const colorTemperature = node.parameters.colorTemperature;
    if (colorTemperature !== undefined && colorTemperature !== null && colorTemperature !== "") {
      body.color_temperature = { mirek: Number(colorTemperature) };
    }
    const transitionTime = node.parameters.transitionTime;
    if (transitionTime !== undefined && transitionTime !== null && transitionTime !== "") {
      body.dynamics = { duration: Number(transitionTime) };
    }
    const obj = await requestOk("PUT", `${API_BASE}/resource/light/${encodeURIComponent(lightId)}`, headers, body);
    return [obj];
  }

  throw new Error(`Philips Hue: unsupported operation "${operation}"`);
}

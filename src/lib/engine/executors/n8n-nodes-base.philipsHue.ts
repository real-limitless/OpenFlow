import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

interface PhilipsHueOAuth2Credential {
  accessToken?: string;
  baseUrl?: string;
}

const API_TIMEOUT_MS = 15000;

async function hueApiRequest(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Philips Hue API error (${res.status}): ${text}`);
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timer);
  }
}

async function getCreds(ctx: ExecutionContext): Promise<{ baseUrl: string; token: string }> {
  const cred = await ctx.getCredential("philipsHueOAuth2Api");
  if (!cred) throw new Error("philipsHueOAuth2Api credential is not configured");
  const { accessToken, baseUrl } = cred as PhilipsHueOAuth2Credential;
  if (!baseUrl) throw new Error("Philips Hue bridge URL is missing from credential");
  if (!accessToken) throw new Error("Philips Hue OAuth2 access token is missing from credential");
  return { baseUrl, token: accessToken };
}

function requireLightId(lightId: unknown): string {
  if (!lightId || String(lightId).trim() === "") {
    throw new Error("lightId is required for this operation");
  }
  return String(lightId).trim();
}

export const philipsHueExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();
  const out: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const { baseUrl, token } = await getCreds(ctx);

      let result: unknown;

      if (operation === "getAll") {
        result = await hueApiRequest(baseUrl, token, "GET", "/resource/light");
        const data = result as { data?: unknown[] } | undefined;
        if (data?.data && Array.isArray(data.data)) {
          for (const element of data.data) {
            out.push({ json: element as Record<string, unknown>, pairedItem });
          }
          continue;
        }
        out.push({ json: result as Record<string, unknown>, pairedItem });
      } else if (operation === "get") {
        const lightId = requireLightId(node.parameters.lightId);
        result = await hueApiRequest(baseUrl, token, "GET", `/resource/light/${lightId}`);
        out.push({ json: result as Record<string, unknown>, pairedItem });
      } else if (operation === "delete") {
        const lightId = requireLightId(node.parameters.lightId);
        result = await hueApiRequest(baseUrl, token, "DELETE", `/resource/light/${lightId}`);
        out.push({ json: result as Record<string, unknown>, pairedItem });
      } else if (operation === "update") {
        const lightId = requireLightId(node.parameters.lightId);
        const body: Record<string, unknown> = {};
        if (node.parameters.on !== undefined) body.on = { on: Boolean(node.parameters.on) };
        if (node.parameters.brightness !== undefined) {
          body.dimming = { brightness: Number(node.parameters.brightness) };
        }
        if (node.parameters.hue !== undefined) body.color = { ...(body.color as object ?? {}), hue: Number(node.parameters.hue) };
        if (node.parameters.saturation !== undefined) {
          body.color = { ...(body.color as object ?? {}), saturation: Number(node.parameters.saturation) };
        }
        if (node.parameters.colorTemperature !== undefined) {
          body.colorTemperature = { mirek: Number(node.parameters.colorTemperature) };
        }
        if (node.parameters.transitionTime !== undefined) {
          body.dynamics = { duration: Number(node.parameters.transitionTime) };
        }
        const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
        if (additionalFields) {
          for (const [k, v] of Object.entries(additionalFields)) {
            if (v !== undefined && v !== "") body[k] = v;
          }
        }
        result = await hueApiRequest(baseUrl, token, "PUT", `/resource/light/${lightId}`, body);
        out.push({ json: result as Record<string, unknown>, pairedItem });
      } else {
        throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out];
};

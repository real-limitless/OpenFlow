import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const EVENTBRITE_API_BASE = "https://www.eventbriteapi.com/v3";

async function resolveWebhookResource(
  apiUrl: string,
  ctx: { getCredential(name: string): Promise<unknown> },
): Promise<Record<string, unknown> | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const cred = await ctx.getCredential("eventbriteApi");
  if (cred) {
    const data = cred as Record<string, unknown>;
    const token = String(data.apiKey ?? data.api_key ?? data.privateKey ?? data.accessToken ?? "");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  if (!headers["Authorization"]) {
    const oauthCred = await ctx.getCredential("eventbriteOAuth2Api");
    if (oauthCred) {
      const data = oauthCred as Record<string, unknown>;
      const token = String(data.accessToken ?? data.access_token ?? "");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
  }
  try {
    const response = await fetch(apiUrl, { method: "GET", headers });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const eventbriteTriggerExecutor: NodeExecutor = async function (ctx) {
  const items = ctx.getInputItems(0);
  const resolveData = ctx.getParam("resolveData", true) !== false;

  if (!resolveData) {
    return [items.map((item) => ({ json: item.json }))];
  }

  const result: INodeExecutionData[] = [];
  for (const item of items) {
    const payload = item.json as Record<string, unknown>;
    const apiUrl = String(payload.api_url ?? "");
    if (apiUrl) {
      const resolved = await resolveWebhookResource(apiUrl, ctx);
      if (resolved) {
        result.push({ json: resolved });
        continue;
      }
    }
    result.push({ json: payload });
  }
  return [result];
};

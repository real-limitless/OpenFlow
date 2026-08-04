import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const API_BASE = "https://api.pipedrive.com/v1";

const RESOURCE_MAP: Record<string, string> = {
  Activity: "activities",
  Deal: "deals",
  DealActivity: "dealActivities",
  DealProduct: "dealProducts",
  Lead: "leads",
  Note: "notes",
  Organization: "organizations",
  Person: "persons",
  Product: "products",
};

async function getAuthHeaders(ctx: {
  getCredential(name: string): Promise<unknown>;
}): Promise<Record<string, string>> {
  const apiTokenCred = await ctx.getCredential("pipedriveApi");
  if (apiTokenCred) {
    const data = apiTokenCred as Record<string, unknown>;
    const apiToken = String(data.apiToken ?? data.api_key ?? "");
    if (apiToken) return { "X-API-Token": apiToken };
  }
  const oauthCred = await ctx.getCredential("pipedriveOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? data.access_token ?? "");
    if (token) return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function resolveResource(
  objectType: string,
  objectId: number | string,
  auth: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const resource = RESOURCE_MAP[objectType];
  if (!resource) return null;
  const url = `${API_BASE}/${resource}/${objectId}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...auth,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const body = await response.json() as Record<string, unknown>;
    return (body.data as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

export const pipedriveTriggerExecutor: NodeExecutor = async function (ctx) {
  const items = ctx.getInputItems(0);
  const resolveData = ctx.getParam("resolveData", false) === true;

  if (!resolveData) {
    return [items.map((item) => ({ json: item.json }))];
  }

  const auth = await getAuthHeaders(ctx);
  const result: INodeExecutionData[] = [];

  for (const item of items) {
    const payload = item.json as Record<string, unknown>;
    const meta = payload.meta as Record<string, unknown> | undefined;
    const objectType = String(meta?.object ?? "");
    const objectId = meta?.id;

    if (objectType && objectId != null) {
      const resolved = await resolveResource(
        objectType.charAt(0).toUpperCase() + objectType.slice(1),
        Number(objectId),
        auth,
      );
      if (resolved) {
        result.push({ json: resolved });
        continue;
      }
    }

    result.push({ json: payload });
  }

  return [result];
};

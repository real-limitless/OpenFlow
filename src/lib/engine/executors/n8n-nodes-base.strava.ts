import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, sdkHttpRequest } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://www.strava.com/api/v3";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function getAdditionalFields(node: INode): Record<string, unknown> {
  const af = node.parameters.additionalFields;
  if (af && typeof af === "object" && !Array.isArray(af)) {
    return af as Record<string, unknown>;
  }
  return {};
}

function getUpdateFields(node: INode): Record<string, unknown> {
  const uf = node.parameters.updateFields;
  if (uf && typeof uf === "object" && !Array.isArray(uf)) {
    return uf as Record<string, unknown>;
  }
  return {};
}

function shouldReturnAll(node: INode): boolean {
  return node.parameters.returnAll === true;
}

function getLimit(node: INode): number {
  const limit = Number(node.parameters.limit ?? 50);
  return Math.min(Math.max(1, limit), 50);
}

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("stravaOAuth2Api");
  const token = cred ? String((cred as Record<string, unknown>).accessToken ?? "") : "";
  if (!token) {
    throw new Error("Strava: stravaOAuth2Api credential is not configured");
  }
  return token;
}

type StravaErrorBody = { message?: string; errors?: unknown };

function extractError(body: unknown): string {
  if (body && typeof body === "object") {
    const err = (body as Record<string, unknown>).message as string | undefined;
    if (err) return err;
    return JSON.stringify(body);
  }
  return String(body);
}

async function stravaApiRequest(
  method: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  reqBody?: unknown,
): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (reqBody !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await sdkHttpRequest({ method, url: url.toString(), headers, body: reqBody, timeoutMs: 30000 });
  if (res.status === 204) return {};
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Strava: HTTP ${res.status} - ${extractError(res.body)}`);
  }
  return (res.body as Record<string, unknown>) ?? {};
}

async function stravaApiRequestRaw(
  method: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  reqBody?: unknown,
): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (reqBody !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await sdkHttpRequest({ method, url: url.toString(), headers, body: reqBody, timeoutMs: 30000 });
  if (res.status === 204) return {};
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Strava: HTTP ${res.status} - ${extractError(res.body)}`);
  }
  return res.body;
}

async function collectPaginated(
  path: string,
  token: string,
  returnAll: boolean,
  limit: number,
): Promise<unknown> {
  const items: unknown[] = [];
  let page = 1;
  const perPage = Math.min(returnAll ? 200 : limit, 200);
  let fetchMore = true;
  while (fetchMore) {
    const url = new URL(`${API_BASE}${path}`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    const res = await sdkHttpRequest({
      method: "GET",
      url: url.toString(),
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 30000,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Strava: HTTP ${res.status} - ${extractError(res.body)}`);
    }
    const body = res.body;
    if (Array.isArray(body)) {
      for (const item of body) {
        items.push(item);
      }
      if (!returnAll || body.length < perPage) {
        fetchMore = false;
      } else {
        page++;
      }
    } else {
      fetchMore = false;
    }
  }
  return returnAll ? items : items.slice(0, limit);
}

export const stravaExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "activity");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r as Record<string, unknown>, pairedItem: { item: idx, input: 0 } });
        }
      } else {
        out.push({ json: (result ?? {}) as Record<string, unknown>, pairedItem });
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
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  if (resource !== "activity") {
    throw new Error(`Strava: unknown resource "${resource}"`);
  }
  const token = await getToken(ctx);

  switch (operation) {
    case "create":
      return runCreate(ctx, node, token, itemJson);
    case "get":
      return runGet(node, token, itemJson);
    case "getAll":
      return runGetAll(node, token);
    case "getComments":
      return runGetSubResource(node, token, itemJson, "comments");
    case "getKudos":
      return runGetSubResource(node, token, itemJson, "kudos");
    case "getLaps":
      return runGetSubResource(node, token, itemJson, "laps");
    case "getZones":
      return runGetSubResource(node, token, itemJson, "zones");
    case "getStreams":
      return runGetStreams(node, token, itemJson);
    case "update":
      return runUpdate(node, token, itemJson);
    default:
      throw new Error(`Strava: unknown operation "${operation}"`);
  }
}

async function runCreate(
  ctx: ExecutionContext,
  node: INode,
  token: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
  const rawSportType = resolveValue(node.parameters.sport_type, itemJson) ?? resolveValue(node.parameters.sportType, itemJson);
  const sportType = String(rawSportType ?? "");
  const rawStartDate = resolveValue(node.parameters.startDate, itemJson) ?? resolveValue(node.parameters.startDateLocal, itemJson);
  const startDate = String(rawStartDate ?? "");
  const elapsedTime = Number(resolveValue(node.parameters.elapsedTime, itemJson) ?? 0);
  const additionalFields = getAdditionalFields(node);

  const body: Record<string, unknown> = {};
  if (name) body.name = name;
  if (sportType) body.sport_type = sportType;
  if (startDate) body.start_date_local = startDate;
  if (elapsedTime) body.elapsed_time = elapsedTime;
  if (additionalFields.commute !== undefined) body.commute = additionalFields.commute;
  if (additionalFields.description) body.description = additionalFields.description;
  if (additionalFields.distance !== undefined) body.distance = additionalFields.distance;
  if (additionalFields.trainer !== undefined) body.trainer = additionalFields.trainer;

  return stravaApiRequest("POST", "/activities", token, undefined, body);
}

async function runGet(
  node: INode,
  token: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const activityId = String(resolveValue(node.parameters.activityId, itemJson) ?? "");
  if (!activityId) throw new Error("Strava: activityId is required");
  return stravaApiRequest("GET", `/activities/${activityId}`, token);
}

async function runGetAll(
  node: INode,
  token: string,
): Promise<unknown> {
  const returnAll = shouldReturnAll(node);
  const limit = getLimit(node);
  return collectPaginated("/athlete/activities", token, returnAll, limit);
}

async function runGetSubResource(
  node: INode,
  token: string,
  itemJson: Record<string, unknown>,
  subResource: string,
): Promise<unknown> {
  const activityId = String(resolveValue(node.parameters.activityId, itemJson) ?? "");
  if (!activityId) throw new Error("Strava: activityId is required");
  const returnAll = shouldReturnAll(node);
  const limit = getLimit(node);
  return collectPaginated(`/activities/${activityId}/${subResource}`, token, returnAll, limit);
}

async function runGetStreams(
  node: INode,
  token: string,
  itemJson: Record<string, unknown>,
): Promise<unknown> {
  const activityId = String(resolveValue(node.parameters.activityId, itemJson) ?? "");
  if (!activityId) throw new Error("Strava: activityId is required");
  const keys = node.parameters.keys;
  const keysArr: string[] = Array.isArray(keys) ? keys as string[] : [];
  return stravaApiRequestRaw("GET", `/activities/${activityId}/streams`, token, undefined, undefined);
}

async function runUpdate(
  node: INode,
  token: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const activityId = String(resolveValue(node.parameters.activityId, itemJson) ?? "");
  if (!activityId) throw new Error("Strava: activityId is required");
  const updateFields = getUpdateFields(node);
  return stravaApiRequest("PUT", `/activities/${activityId}`, token, undefined, updateFields);
}

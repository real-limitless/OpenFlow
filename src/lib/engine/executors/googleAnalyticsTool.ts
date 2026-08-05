import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const GA_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GA_UA_API = "https://analyticsadmin.googleapis.com/v1beta";

async function getAccessToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("googleAnalyticsOAuth2Api");
  if (!cred) {
    throw new Error("GoogleAnalyticsTool: googleAnalyticsOAuth2Api credential is not configured");
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error("GoogleAnalyticsTool: credential has no accessToken");
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errBody = parsed as Record<string, unknown>;
    const errObj = (errBody.error as { message?: string } | undefined);
    const msg = errObj?.message ?? String(errBody.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleAnalyticsTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function runReport(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const propertyId = String(params.propertyId ?? "").trim();
  if (!propertyId) {
    throw new Error("GoogleAnalyticsTool: propertyId is required for Report");
  }
  const body: Record<string, unknown> = {};
  const dateRanges = asArray<Record<string, string>>(params.dateRanges);
  if (dateRanges.length) {
    body.dateRanges = dateRanges;
  }
  const metrics = asArray<Record<string, string>>(params.metrics);
  if (metrics.length) {
    body.metrics = metrics.map((m) => ({ name: m.name }));
  }
  const dimensions = asArray<Record<string, string>>(params.dimensions);
  if (dimensions.length) {
    body.dimensions = dimensions.map((d) => ({ name: d.name }));
  }
  if (params.dimensionFilter) {
    body.dimensionFilter = params.dimensionFilter;
  }
  if (params.metricFilter) {
    body.metricFilter = params.metricFilter;
  }
  const orderBys = asArray<Record<string, unknown>>(params.orderBys);
  if (orderBys.length) {
    body.orderBys = orderBys;
  }
  if (params.limit && Number(params.limit) > 0) {
    body.limit = Number(params.limit);
  }
  if (params.offset && Number(params.offset) > 0) {
    body.offset = Number(params.offset);
  }
  if (params.keepEmptyRows === true) {
    body.keepEmptyRows = true;
  }
  if (params.returnPropertyQuota === true) {
    body.returnPropertyQuota = true;
  }
  const url = `${GA_DATA_API}/properties/${encodeURIComponent(propertyId)}:runReport`;
  const res = await apiRequest("POST", url, token, body);
  const raw = asRecord(res.body);
  const rows = asArray<Record<string, unknown>>(raw.rows);
  const dimHeaders = asArray<Record<string, unknown>>(raw.dimensionHeaders);
  const metHeaders = asArray<Record<string, unknown>>(raw.metricHeaders);
  return {
    report: {
      rows,
      rowCount: raw.rowCount ?? rows.length,
      metadata: raw.metadata ?? {},
      dimensionHeaders: dimHeaders,
      metricHeaders: metHeaders,
      ...(raw.totals ? { totals: raw.totals } : {}),
      ...(raw.maximums ? { maximums: raw.maximums } : {}),
      ...(raw.minimums ? { minimums: raw.minimums } : {}),
    },
  };
}

async function searchUserActivity(
  params: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>> {
  const propertyId = String(params.propertyId ?? "").trim();
  if (!propertyId) {
    throw new Error("GoogleAnalyticsTool: propertyId is required for User Activity");
  }
  const body: Record<string, unknown> = {};
  const userId = String(params.userId ?? "").trim();
  const clientId = String(params.clientId ?? "").trim();
  if (userId) {
    body.userId = userId;
  }
  if (clientId) {
    body.clientId = clientId;
  }
  const activityTypes = asArray<string>(params.activityTypes);
  if (activityTypes.length) {
    body.activityTypes = activityTypes;
  }
  if (params.activityDateRange) {
    const dr = asRecord(params.activityDateRange);
    if (dr.startDate || dr.endDate) {
      body.activityDateRange = dr;
    }
  }
  if (params.pageSize && Number(params.pageSize) > 0) {
    body.pageSize = Number(params.pageSize);
  }
  if (params.pageToken) {
    body.pageToken = String(params.pageToken);
  }
  const url = `${GA_UA_API}/properties/${encodeURIComponent(propertyId)}:searchUserActivity`;
  const res = await apiRequest("POST", url, token, body);
  const raw = asRecord(res.body);
  const activities = asArray<Record<string, unknown>>(raw.userActivity ?? raw.activities ?? []);
  return {
    userActivity: {
      activities,
      nextPageToken: raw.nextPageToken ?? "",
    },
  };
}

export const googleAnalyticsToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(
    node.parameters.resource ?? ctx.getParam("resource", "report") ?? "report",
  );
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const token = await getAccessToken(ctx);
      const params = { ...node.parameters, ...itemJson };
      if (resource === "report") {
        const json = await runReport(params, token);
        out.push({ json, pairedItem });
      } else if (resource === "userActivity") {
        const json = await searchUserActivity(params, token);
        out.push({ json, pairedItem });
      } else {
        throw new Error(`GoogleAnalyticsTool: unsupported resource "${resource}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

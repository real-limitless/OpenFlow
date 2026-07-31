import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const ANALYTICS_API = "https://analyticsreporting.googleapis.com/v4";
const ANALYTICS_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "").trim();
  }
  return String(resolved ?? "").trim();
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractFixedCollection(
  raw: unknown,
  key: string,
): Array<Record<string, unknown>> {
  const col = asRecord(raw);
  const items = col[key];
  if (Array.isArray(items)) return items as Array<Record<string, unknown>>;
  return [];
}

function computeDateRange(
  dateRange: string,
  startDate: string | undefined,
  endDate: string | undefined,
): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;

  switch (dateRange) {
    case "today":
      return { startDate: today, endDate: today };
    case "yesterday": {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yy = yest.getFullYear();
      const mm = String(yest.getMonth() + 1).padStart(2, "0");
      const dd = String(yest.getDate()).padStart(2, "0");
      return { startDate: `${yy}-${mm}-${dd}`, endDate: `${yy}-${mm}-${dd}` };
    }
    case "last7days": {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 6);
      const wy = weekAgo.getFullYear();
      const wm = String(weekAgo.getMonth() + 1).padStart(2, "0");
      const wd = String(weekAgo.getDate()).padStart(2, "0");
      return { startDate: `${wy}-${wm}-${wd}`, endDate: today };
    }
    case "last30days": {
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 29);
      const my = monthAgo.getFullYear();
      const mm2 = String(monthAgo.getMonth() + 1).padStart(2, "0");
      const md = String(monthAgo.getDate()).padStart(2, "0");
      return { startDate: `${my}-${mm2}-${md}`, endDate: today };
    }
    case "lastCalendarWeek": {
      const dow = now.getDay();
      const mon = new Date(now);
      mon.setDate(mon.getDate() - ((dow + 6) % 7) - 7);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      const fmt = (dt: Date) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };
      return { startDate: fmt(mon), endDate: fmt(sun) };
    }
    case "lastCalendarMonth": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const fmt = (dt: Date) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };
      return { startDate: fmt(firstOfMonth), endDate: fmt(lastOfMonth) };
    }
    case "custom":
      return {
        startDate: startDate ? startDate.slice(0, 10) : "7daysAgo",
        endDate: endDate ? endDate.slice(0, 10) : today,
      };
    default:
      return { startDate: "7daysAgo", endDate: today };
  }
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleAnalyticsOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleAnalytics: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleAnalytics: ${credName} has no accessToken`);
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
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleAnalytics: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function buildUaReportRequest(
  node: INode,
  itemJson: Record<string, unknown>,
  dateRange: { startDate: string; endDate: string },
): Record<string, unknown> {
  const viewId = resolveLocator(node.parameters.viewId, itemJson);
  if (!viewId) throw new Error("GoogleAnalytics: viewId is required for UA report");

  const request: Record<string, unknown> = {
    viewId,
    dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
  };

  const metricsUA = asRecord(node.parameters.metricsUA);
  const metricValues = asArray(metricsUA.metricValues);
  if (metricValues.length > 0) {
    request.metrics = metricValues.map((m: unknown) => {
      const entry = m as Record<string, unknown>;
      const listName = String(entry.listName ?? "");
      const expression = String(entry.expression ?? "");
      return {
        expression: expression || listName || "ga:users",
      };
    });
  } else {
    request.metrics = [{ expression: "ga:users" }];
  }

  const dimensionsUA = asRecord(node.parameters.dimensionsUA);
  const dimensionValues = asArray(dimensionsUA.dimensionValues);
  if (dimensionValues.length > 0) {
    request.dimensions = dimensionValues.map((d: unknown) => {
      const entry = d as Record<string, unknown>;
      const listName = String(entry.listName ?? "");
      const customValue = String(entry.customValue ?? "");
      return { name: customValue || listName || "ga:date" };
    });
  }

  const additionalFields = asRecord(resolveValue(node.parameters.additionalFields, itemJson));
  if (Object.keys(additionalFields).length > 0) {
    const dimensionFilters = additionalFields.dimensionFilters;
    if (dimensionFilters) {
      request.dimensionFilterClauses = asArray(dimensionFilters).map((f: unknown) => {
        const filter = f as Record<string, unknown>;
        return {
          operator: String(filter.operator ?? "EXACT"),
          dimensionName: String(filter.dimensionName ?? ""),
          expressions: asArray(filter.expressions).map(String),
          caseSensitive: filter.caseSensitive === true,
        };
      });
    }
    if (additionalFields.hideTotals === true) request.hideTotals = true;
    if (additionalFields.hideValueRanges === true) request.hideValueRanges = true;
    if (additionalFields.includeEmptyRows === true) request.includeEmptyRows = true;
    if (additionalFields.useResourceQuotas === true) request.useResourceQuotas = true;
  }

  return request;
}

function buildGa4ReportRequest(
  node: INode,
  itemJson: Record<string, unknown>,
  dateRange: { startDate: string; endDate: string },
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
  };

  const metricsGA4 = asRecord(node.parameters.metricsGA4);
  const metricValues = asArray(metricsGA4.metricValues);
  if (metricValues.length > 0) {
    request.metrics = metricValues.map((m: unknown) => {
      const entry = m as Record<string, unknown>;
      const listName = String(entry.listName ?? "");
      const expression = String(entry.expression ?? "");
      const name = String(entry.name ?? "");
      return {
        name: name || expression || listName || "totalUsers",
      };
    });
  }

  const dimensionsGA4 = asRecord(node.parameters.dimensionsGA4);
  const dimensionValues = asArray(dimensionsGA4.dimensionValues);
  if (dimensionValues.length > 0) {
    request.dimensions = dimensionValues.map((d: unknown) => {
      const entry = d as Record<string, unknown>;
      const listName = String(entry.listName ?? "");
      const customValue = String(entry.customValue ?? "");
      return { name: customValue || listName || "date" };
    });
  }

  const additionalFields = asRecord(resolveValue(node.parameters.additionalFields, itemJson));
  if (Object.keys(additionalFields).length > 0) {
    if (additionalFields.keepEmptyRows === true) request.keepEmptyRows = true;
    if (additionalFields.returnPropertyQuota === true) request.returnPropertyQuota = true;
    if (additionalFields.currencyCode) request.currencyCode = String(additionalFields.currencyCode);
    if (additionalFields.metricAggregations) {
      request.metricAggregations = asArray(additionalFields.metricAggregations).map(String);
    }
    if (additionalFields.orderBy) {
      request.orderBy = asArray(additionalFields.orderBy).map((o: unknown) => {
        const ob = o as Record<string, unknown>;
        return {
          metric: ob.metric ? { metricName: String(ob.metric) } : undefined,
          dimension: ob.dimension ? { dimensionName: String(ob.dimension) } : undefined,
          desc: ob.desc === true,
        };
      });
    }
    if (additionalFields.dimensionFilters) {
      request.dimensionFilter = {
        andGroup: {
          expressions: asArray(additionalFields.dimensionFilters).map((f: unknown) => {
            const filter = f as Record<string, unknown>;
            if (filter.filterType === "stringFilter") {
              return {
                filter: {
                  fieldName: String(filter.fieldName ?? ""),
                  stringFilter: {
                    matchType: String(filter.matchType ?? "EXACT"),
                    value: String(filter.value ?? ""),
                    caseSensitive: filter.caseSensitive === true,
                  },
                },
              };
            }
            if (filter.filterType === "inListFilter") {
              return {
                filter: {
                  fieldName: String(filter.fieldName ?? ""),
                  inListFilter: {
                    values: asArray(filter.values).map(String),
                    caseSensitive: filter.caseSensitive === true,
                  },
                },
              };
            }
            if (filter.filterType === "numericFilter") {
              return {
                filter: {
                  fieldName: String(filter.fieldName ?? ""),
                  numericFilter: {
                    operation: String(filter.operation ?? "EQUAL"),
                    value: { int64Value: String(filter.value ?? "0") },
                  },
                },
              };
            }
            if (filter.filterType === "betweenFilter") {
              return {
                filter: {
                  fieldName: String(filter.fieldName ?? ""),
                  betweenFilter: {
                    fromValue: { int64Value: String(filter.fromValue ?? "0") },
                    toValue: { int64Value: String(filter.toValue ?? "0") },
                  },
                },
              };
            }
            return {
              filter: {
                fieldName: String(filter.fieldName ?? ""),
              },
            };
          }),
        },
      };
    }
    if (additionalFields.metricsFilter) {
      request.metricFilter = {
        filter: {
          fieldName: String((additionalFields.metricsFilter as Record<string, unknown>).fieldName ?? ""),
        },
      };
    }
  }

  return request;
}

function simplifyGa4Response(response: Record<string, unknown>): Record<string, unknown>[] {
  const dimensionHeaders = (response.dimensionHeaders as Array<{ name: string }> | undefined) ?? [];
  const metricHeaders = (response.metricHeaders as Array<{ name: string }> | undefined) ?? [];
  const rows = asArray(response.rows);
  return rows.map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const dimensionValues = asArray(r.dimensionValues);
    const metricValues = asArray(r.metricValues);
    const obj: Record<string, unknown> = {};
    dimensionHeaders.forEach((h, i) => {
      const val = dimensionValues[i] as Record<string, unknown> | undefined;
      obj[h.name] = val?.value ?? null;
    });
    metricHeaders.forEach((h, i) => {
      const val = metricValues[i] as Record<string, unknown> | undefined;
      obj[h.name] = val?.value ?? null;
    });
    return obj;
  });
}

function simplifyUaResponse(response: Record<string, unknown>): Record<string, unknown>[] {
  const reports = asArray(response.reports);
  if (reports.length === 0) return [];
  const report = reports[0] as Record<string, unknown>;
  const data = asRecord(report.data);
  const rows = asArray(data.rows);
  const columnHeader = asRecord(report.columnHeader);
  const dimensions = asArray(columnHeader.dimensions);
  const metricHeader = asRecord(columnHeader.metricHeader);
  const metricHeaders = asArray(metricHeader.metricHeaderEntries);
  return rows.map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const dimValues = asArray(r.dimensions);
    const metValues = asArray(r.metrics);
    const obj: Record<string, unknown> = {};
    dimensions.forEach((dim, i) => {
      obj[String(dim)] = dimValues[i] ?? null;
    });
    metValues.forEach((mv: unknown) => {
      const entry = mv as Record<string, unknown>;
      const values = asArray(entry.values);
      metricHeaders.forEach((mh: unknown, mi: number) => {
        const header = mh as Record<string, unknown>;
        obj[String(header.name ?? "")] = values[mi] ?? null;
      });
    });
    return obj;
  });
}

async function reportGetGa4(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const propertyId = resolveLocator(node.parameters.propertyId, itemJson);
  if (!propertyId) throw new Error("GoogleAnalytics: propertyId is required for GA4 report");

  const dateRange = String(node.parameters.dateRange ?? "last7days");
  const startDate = String(node.parameters.startDate ?? "");
  const endDate = String(node.parameters.endDate ?? "");
  const dr = computeDateRange(dateRange, startDate, endDate);

  const body = buildGa4ReportRequest(node, itemJson, dr);
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 50);
  const simple = node.parameters.simple !== false;

  if (!returnAll && limit > 0) {
    body.limit = String(limit);
  }

  const url = `${ANALYTICS_ADMIN_API}/properties/${encodeURIComponent(propertyId)}:runReport`;
  const res = await apiRequest("POST", url, token, body);
  const response = asObj(res.body);

  if (simple) {
    return simplifyGa4Response(response);
  }
  const rows = asArray(response.rows);
  return rows as Record<string, unknown>[];
}

async function reportGetUa(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const dateRange = String(node.parameters.dateRange ?? "last7days");
  const startDate = String(node.parameters.startDate ?? "");
  const endDate = String(node.parameters.endDate ?? "");
  const dr = computeDateRange(dateRange, startDate, endDate);

  const body = buildUaReportRequest(node, itemJson, dr);
  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 50);
  const simple = node.parameters.simple !== false;

  if (!returnAll && limit > 0) {
    if (!body.pageSize) body.pageSize = limit;
  }

  const url = `${ANALYTICS_API}/reports:batchGet`;
  const res = await apiRequest("POST", url, token, { reportRequests: [body] });
  const response = asObj(res.body);

  if (simple) {
    return simplifyUaResponse(response);
  }
  return [response];
}

async function userActivitySearch(
  node: INode,
  itemJson: Record<string, unknown>,
  token: string,
): Promise<Record<string, unknown>[]> {
  const viewId = resolveLocator(node.parameters.viewId, itemJson);
  if (!viewId) throw new Error("GoogleAnalytics: viewId is required for user activity search");
  const userId = String(resolveValue(node.parameters.userId, itemJson) ?? "").trim();
  if (!userId) throw new Error("GoogleAnalytics: userId is required for user activity search");

  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 100);
  const maxLimit = returnAll ? 500 : Math.min(limit, 500);

  const body: Record<string, unknown> = {
    viewId,
    user: { type: "USER_ID", userId },
    pageSize: maxLimit,
  };

  const additionalFields = asRecord(resolveValue(node.parameters.additionalFields, itemJson));
  if (additionalFields.activityTypes) {
    body.activityTypes = asArray(additionalFields.activityTypes).map(String);
  }

  const url = `${ANALYTICS_API}/userActivity:search`;
  const res = await apiRequest("POST", url, token, body);
  const response = asObj(res.body);
  const sessions = asArray(response.sessions);
  return sessions as Record<string, unknown>[];
}

export const googleAnalyticsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(
    node.parameters.resource ?? ctx.getParam("resource", "report") ?? "report",
  );
  const operation = String(
    node.parameters.operation ?? ctx.getParam("operation", "get") ?? "get",
  );
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const token = await getAccessToken(ctx, node);

      if (resource === "report" && operation === "get") {
        const propertyType = String(node.parameters.propertyType ?? ctx.getParam("propertyType", "universal") ?? "universal");
        let results: Record<string, unknown>[];
        if (propertyType === "ga4") {
          results = await reportGetGa4(node, itemJson, token);
        } else {
          results = await reportGetUa(node, itemJson, token);
        }
        out.push({ json: results as unknown as Record<string, unknown>, pairedItem });
      } else if (resource === "userActivity" && operation === "search") {
        const results = await userActivitySearch(node, itemJson, token);
        out.push({ json: results as unknown as Record<string, unknown>, pairedItem });
      } else {
        throw new Error(`GoogleAnalytics: unsupported resource/operation "${resource}/${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
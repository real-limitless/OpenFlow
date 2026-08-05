import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const WEBMASTERS_API = "https://www.googleapis.com/webmasters/v3";
const SEARCHCONSOLE_API = "https://searchconsole.googleapis.com/v1";

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

function parseCommaList(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function computeDate(raw: string): string {
  const lower = raw.toLowerCase();
  const now = new Date();
  if (lower === "today") {
    return now.toISOString().slice(0, 10);
  }
  if (lower.endsWith("daysago")) {
    const n = parseInt(lower.replace("daysago", ""), 10);
    if (!isNaN(n)) {
      const d = new Date(now);
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    }
  }
  return raw;
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const cred = await ctx.getCredential("googleOAuth2Api");
  if (!cred) {
    throw new Error("Google Search Console: googleOAuth2Api credential is required");
  }
  const token = String(cred.accessToken ?? cred.access_token ?? "");
  if (!token) {
    throw new Error("Google Search Console: credential has no accessToken");
  }
  return token;
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
    throw new Error(`Google Search Console: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

function encodeSiteUrl(siteUrl: string): string {
  return encodeURIComponent(siteUrl);
}

async function handleSearchAnalyticsQuery(
  params: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const siteUrl = String(params.siteUrl ?? "");
  if (!siteUrl) throw new Error("Google Search Console: siteUrl is required");

  const startDate = computeDate(String(params.startDate ?? "7daysAgo"));
  const endDate = computeDate(String(params.endDate ?? "today"));
  const dimensions = parseCommaList(params.dimensions);
  const searchType = String(params.searchType ?? "web");
  const aggregationType = String(params.aggregationType ?? "auto");
  const rowLimit = Number(params.rowLimit ?? 1000);
  const returnAll = params.returnAll === true;

  const requestBody: Record<string, unknown> = {
    startDate,
    endDate,
    dimensions: dimensions.length > 0 ? dimensions : undefined,
    type: searchType !== "web" ? searchType : undefined,
    aggregationType,
  };

  const rawFilterGroups = params.dimensionFilterGroups;
  if (rawFilterGroups) {
    const groupContainer = asObj(rawFilterGroups);
    const groups = asArray(groupContainer.groups);
    if (groups.length > 0) {
      requestBody.dimensionFilterGroups = groups.map((g: unknown) => {
        const grp = g as Record<string, unknown>;
        const filtersRaw = asObj(grp.filters);
        const filters = asArray(filtersRaw.filterValues);
        return {
          filters: filters.map((f: unknown) => {
            const fv = f as Record<string, unknown>;
            return {
              dimension: String(fv.dimension ?? ""),
              operator: String(fv.operator ?? "equals"),
              expression: String(fv.expression ?? ""),
            };
          }),
        };
      });
    }
  }

  const url = `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}/searchAnalytics/query`;

  if (returnAll) {
    const allRows: unknown[] = [];
    let startRow = 0;
    const pageSize = Math.min(rowLimit, 25000);
    const maxPages = 50;
    for (let page = 0; page < maxPages; page++) {
      const pageBody = { ...requestBody, rowLimit: pageSize, startRow };
      const res = await apiRequest("POST", url, token, pageBody);
      const response = asObj(res.body);
      const rows = asArray(response.rows);
      allRows.push(...rows);
      const totalRows = Number(response.totalRows ?? 0);
      startRow += pageSize;
      if (startRow >= totalRows || rows.length === 0) break;
    }
    return {
      json: {
        responseAggregationType: aggregationType,
        rows: allRows,
        totalRows: allRows.length,
      },
    };
  }

  requestBody.rowLimit = Math.min(rowLimit, 25000);
  const res = await apiRequest("POST", url, token, requestBody);
  const response = asObj(res.body);
  return {
    json: {
      responseAggregationType: aggregationType,
      rows: asArray(response.rows),
      totalRows: response.totalRows ?? 0,
    },
  };
}

async function handleSitemaps(
  operation: string,
  params: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const siteUrl = String(params.siteUrl ?? "");
  if (!siteUrl) throw new Error("Google Search Console: siteUrl is required");

  if (operation === "list") {
    const url = `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}/sitemaps`;
    const res = await apiRequest("GET", url, token);
    return { json: asObj(res.body) };
  }

  const sitemapUrl = String(params.sitemapUrl ?? "");
  if (!sitemapUrl) throw new Error("Google Search Console: sitemapUrl is required");
  const feedpath = encodeSiteUrl(sitemapUrl);

  if (operation === "get") {
    const url = `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}/sitemaps/${feedpath}`;
    const res = await apiRequest("GET", url, token);
    return { json: asObj(res.body) };
  }

  if (operation === "submit") {
    const url = `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}/sitemaps/${feedpath}`;
    await apiRequest("PUT", url, token);
    return { json: { success: true, sitemapUrl } };
  }

  if (operation === "delete") {
    const url = `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}/sitemaps/${feedpath}`;
    await apiRequest("DELETE", url, token);
    return { json: { success: true } };
  }

  throw new Error(`Google Search Console: unsupported sitemaps operation "${operation}"`);
}

async function handleSites(
  operation: string,
  params: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  if (operation === "list") {
    const url = `${WEBMASTERS_API}/sites`;
    const res = await apiRequest("GET", url, token);
    return { json: asObj(res.body) };
  }

  const siteUrl = String(params.siteUrl ?? "");
  if (!siteUrl) throw new Error("Google Search Console: siteUrl is required");

  if (operation === "get") {
    const url = `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}`;
    const res = await apiRequest("GET", url, token);
    return { json: asObj(res.body) };
  }

  if (operation === "add") {
    const url = `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}`;
    await apiRequest("PUT", url, token);
    return { json: { success: true, siteUrl } };
  }

  if (operation === "delete") {
    const url = `${WEBMASTERS_API}/sites/${encodeSiteUrl(siteUrl)}`;
    await apiRequest("DELETE", url, token);
    return { json: { success: true } };
  }

  throw new Error(`Google Search Console: unsupported sites operation "${operation}"`);
}

async function handleUrlInspection(
  params: Record<string, unknown>,
  token: string,
): Promise<INodeExecutionData> {
  const siteUrl = String(params.siteUrl ?? "");
  const inspectionUrl = String(params.inspectionUrl ?? "");
  if (!siteUrl) throw new Error("Google Search Console: siteUrl is required");
  if (!inspectionUrl) throw new Error("Google Search Console: inspectionUrl is required");

  const body: Record<string, unknown> = {
    siteUrl,
    inspectionUrl,
  };
  const languageCode = String(params.languageCode ?? "");
  if (languageCode) body.languageCode = languageCode;

  const url = `${SEARCHCONSOLE_API}/urlInspection/index:inspect`;
  const res = await apiRequest("POST", url, token, body);
  return { json: asObj(res.body) };
}

export const googleSearchConsoleExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const params = ctx.getParams();
  const resource = String(params.resource ?? "searchAnalytics");
  const operation = String(params.operation ?? "query");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const token = await getAccessToken(ctx, node);

      let result: INodeExecutionData;
      if (resource === "searchAnalytics") {
        result = await handleSearchAnalyticsQuery(params, token);
      } else if (resource === "sitemaps") {
        result = await handleSitemaps(operation, params, token);
      } else if (resource === "sites") {
        result = await handleSites(operation, params, token);
      } else if (resource === "urlInspection") {
        result = await handleUrlInspection(params, token);
      } else {
        throw new Error(`Google Search Console: unsupported resource "${resource}"`);
      }

      out.push({ json: result.json, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      out.push({ json: { error: err instanceof Error ? err.message : String(err) }, pairedItem });
    }
  }

  return [out];
};

import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode, SdkHttpResponse } from "@/sdk";
import { ensureItems, withPairedItem, sdkHttpRequest } from "@/sdk";
import { requireCredential } from "@/sdk/helpers/credentials";

async function apiRequest(opts: { method: string; url: string; headers: Record<string, string>; body?: unknown }): Promise<SdkHttpResponse> {
  const res = await sdkHttpRequest(opts);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`SecurityScorecard API error: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res;
}

const API_BASE = "https://api.securityscorecard.io";

export const securityScorecardExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  let out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "company");
  const operation = String(node.parameters.operation ?? "getScorecard");
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "securityScorecardApi");
  const apiKey = String(cred.apiKey ?? "");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = withPairedItem(item, idx);
    try {
      const isBinaryOp = resource === "report" && operation === "download";
      if (isBinaryOp) {
        await handleDownload(ctx, node, apiKey, out, idx, pairedItem);
        continue;
      }
      const results = await runOperation(ctx, node, apiKey, resource, operation);
      for (const result of results) {
        out.push({ json: result, pairedItem });
      }
      if (results.length === 0) {
        out.push({ json: {}, pairedItem });
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
  apiKey: string,
  resource: string,
  operation: string,
): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = {
    Authorization: `Token ${apiKey}`,
    "content-type": "application/json",
  };

  switch (resource) {
    case "company":
      return companyOperation(ctx, node, apiKey, headers, operation);
    case "industry":
      return industryOperation(ctx, node, headers, operation);
    case "invite":
      return inviteOperation(ctx, node, headers);
    case "portfolio":
      return portfolioOperation(ctx, node, headers, operation);
    case "portfolioCompany":
      return portfolioCompanyOperation(ctx, node, headers, operation);
    case "report":
      return reportOperation(ctx, node, apiKey, headers, operation);
    default:
      throw new Error(`SecurityScorecard: unsupported resource "${resource}"`);
  }
}

async function companyOperation(
  ctx: ExecutionContext,
  node: INode,
  apiKey: string,
  headers: Record<string, string>,
  operation: string,
): Promise<Record<string, unknown>[]> {
  const identifier = String(node.parameters.scorecardIdentifier ?? "").trim();
  if (!identifier) throw new Error("SecurityScorecard: scorecardIdentifier is required");

  if (operation === "getScorecard") {
    const res = await apiRequest({ method: "GET", url: `${API_BASE}/companies/${identifier}`, headers });
    return [res.body as Record<string, unknown>];
  }

  if (operation === "getFactor") {
    let url = `${API_BASE}/companies/${identifier}/factors`;
    const filters = node.parameters.filters as Record<string, unknown> | undefined;
    if (filters) {
      const params = new URLSearchParams();
      if (filters.severity) params.set("severity", String(filters.severity));
      if (filters.severity_in) params.set("severity_in", String(filters.severity_in));
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    const res = await apiRequest({ method: "GET", url, headers });
    return expandEntries(res.body as Record<string, unknown>, ctx, node);
  }

  if (operation === "getFactorHistorical") {
    const url = buildUrl(`${API_BASE}/companies/${identifier}/history/factors/score`, ctx, node);
    const res = await apiRequest({ method: "GET", url, headers });
    return expandSimplify(res.body as Record<string, unknown>, ctx, node);
  }

  if (operation === "getHistoricalScore") {
    const url = buildUrl(`${API_BASE}/companies/${identifier}/history/score`, ctx, node);
    const res = await apiRequest({ method: "GET", url, headers });
    return expandSimplify(res.body as Record<string, unknown>, ctx, node);
  }

  if (operation === "getScorePlan") {
    const score = Number(node.parameters.score ?? 0);
    if (!score) throw new Error("SecurityScorecard: score is required for getScorePlan");
    const res = await apiRequest({ method: "GET", url: `${API_BASE}/companies/${identifier}/score-plans/by-target/${score}`, headers });
    const body = res.body as Record<string, unknown>;
    const entries = (body.entries as Array<Record<string, unknown>>) ?? [];
    return expandEntries(body, ctx, node);
  }

  throw new Error(`SecurityScorecard: unsupported company operation "${operation}"`);
}

async function industryOperation(
  ctx: ExecutionContext,
  node: INode,
  headers: Record<string, string>,
  operation: string,
): Promise<Record<string, unknown>[]> {
  const industry = String(node.parameters.industry ?? "technology").trim();
  if (!industry) throw new Error("SecurityScorecard: industry is required");

  if (operation === "getScore") {
    const res = await apiRequest({ method: "GET", url: `${API_BASE}/industries/${industry}/score`, headers });
    return [res.body as Record<string, unknown>];
  }

  if (operation === "getFactor") {
    const res = await apiRequest({ method: "GET", url: `${API_BASE}/industries/${industry}/factors`, headers });
    return expandEntries(res.body as Record<string, unknown>, ctx, node);
  }

  if (operation === "getFactorHistorical") {
    const res = await apiRequest({ method: "GET", url: `${API_BASE}/industries/${industry}/history/factors`, headers });
    return expandSimplify(res.body as Record<string, unknown>, ctx, node);
  }

  throw new Error(`SecurityScorecard: unsupported industry operation "${operation}"`);
}

async function inviteOperation(
  _ctx: ExecutionContext,
  node: INode,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const email = String(node.parameters.email ?? "").trim();
  const firstName = String(node.parameters.firstName ?? "").trim();
  const lastName = String(node.parameters.lastName ?? "").trim();
  const message = String(node.parameters.message ?? "").trim();
  if (!email || !firstName || !lastName || !message) {
    throw new Error("SecurityScorecard: email, firstName, lastName, and message are required for invite create");
  }

  const body: Record<string, unknown> = {
    email,
    first_name: firstName,
    last_name: lastName,
    message,
  };

  const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
  if (additionalFields) {
    for (const [key, value] of Object.entries(additionalFields)) {
      if (value !== undefined && value !== null && value !== "") {
        body[key] = value;
      }
    }
  }

  const res = await apiRequest({ method: "POST", url: `${API_BASE}/invitations`, headers, body });
  return [res.body as Record<string, unknown>];
}

async function portfolioOperation(
  ctx: ExecutionContext,
  node: INode,
  headers: Record<string, string>,
  operation: string,
): Promise<Record<string, unknown>[]> {
  if (operation === "create") {
    const body: Record<string, unknown> = {};
    body.name = String(node.parameters.name ?? "");
    if (!body.name) throw new Error("SecurityScorecard: name is required for portfolio create");
    const desc = node.parameters.description;
    if (desc) body.description = String(desc);
    const privacy = node.parameters.privacy;
    if (privacy) body.privacy = String(privacy);
    const res = await apiRequest({ method: "POST", url: `${API_BASE}/portfolios`, headers, body });
    return [res.body as Record<string, unknown>];
  }

  if (operation === "getAll") {
    const res = await apiRequest({ method: "GET", url: `${API_BASE}/portfolios`, headers });
    return expandEntries(res.body as Record<string, unknown>, ctx, node);
  }

  const portfolioId = String(node.parameters.portfolioId ?? "").trim();
  if (!portfolioId) throw new Error("SecurityScorecard: portfolioId is required");

  if (operation === "delete") {
    await apiRequest({ method: "DELETE", url: `${API_BASE}/portfolios/${portfolioId}`, headers });
    return [{ success: true }];
  }

  if (operation === "update") {
    const body: Record<string, unknown> = {};
    const name = node.parameters.name;
    if (name) body.name = String(name);
    const desc = node.parameters.description;
    if (desc) body.description = String(desc);
    const privacy = node.parameters.privacy;
    if (privacy) body.privacy = String(privacy);
    const res = await apiRequest({ method: "PUT", url: `${API_BASE}/portfolios/${portfolioId}`, headers, body });
    return [res.body as Record<string, unknown>];
  }

  throw new Error(`SecurityScorecard: unsupported portfolio operation "${operation}"`);
}

async function portfolioCompanyOperation(
  ctx: ExecutionContext,
  node: INode,
  headers: Record<string, string>,
  operation: string,
): Promise<Record<string, unknown>[]> {
  const portfolioId = String(node.parameters.portfolioId ?? "").trim();
  if (!portfolioId) throw new Error("SecurityScorecard: portfolioId is required");

  if (operation === "add") {
    const domain = String(node.parameters.domain ?? "").trim();
    if (!domain) throw new Error("SecurityScorecard: domain is required for portfolio company add");
    const body = { domain };
    const res = await apiRequest({ method: "POST", url: `${API_BASE}/portfolios/${portfolioId}/companies`, headers, body });
    return [res.body as Record<string, unknown>];
  }

  if (operation === "remove") {
    const domain = String(node.parameters.domain ?? "").trim();
    if (!domain) throw new Error("SecurityScorecard: domain is required for portfolio company remove");
    await apiRequest({ method: "DELETE", url: `${API_BASE}/portfolios/${portfolioId}/companies/${domain}`, headers });
    return [{ success: true }];
  }

  if (operation === "getAll") {
    let url = `${API_BASE}/portfolios/${portfolioId}/companies`;
    const filters = node.parameters.filters as Record<string, unknown> | undefined;
    if (filters) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    const res = await apiRequest({ method: "GET", url, headers });
    return expandEntries(res.body as Record<string, unknown>, ctx, node);
  }

  throw new Error(`SecurityScorecard: unsupported portfolio company operation "${operation}"`);
}

async function reportOperation(
  ctx: ExecutionContext,
  node: INode,
  apiKey: string,
  headers: Record<string, string>,
  operation: string,
): Promise<Record<string, unknown>[]> {
  if (operation === "getAll") {
    const res = await apiRequest({ method: "GET", url: `${API_BASE}/reports/recent`, headers });
    return expandEntries(res.body as Record<string, unknown>, ctx, node);
  }

  if (operation === "generate") {
    const reportType = String(node.parameters.report ?? "detailed").trim();
    const body: Record<string, unknown> = {};

    if (reportType === "portfolio") {
      const portfolioId = String(node.parameters.portfolioId ?? "").trim();
      if (!portfolioId) throw new Error("SecurityScorecard: portfolioId is required when report is portfolio");
      body.portfolio = portfolioId;
    } else {
      const identifier = String(node.parameters.scorecardIdentifier ?? "").trim();
      if (!identifier) throw new Error("SecurityScorecard: scorecardIdentifier is required for report generate");
      body.scorecard_identifier = identifier;
    }

    if (reportType === "events-json") {
      const date = String(node.parameters.date ?? "").trim();
      if (!date) throw new Error("SecurityScorecard: date is required for events-json report");
      body.params = { date };
      const branding = node.parameters.branding;
      if (branding) body.branding = String(branding);
    } else if (reportType === "full-scorecard-json") {
      body.params = {};
      const branding = node.parameters.branding;
      if (branding) body.branding = String(branding);
    } else if (reportType === "issues" || reportType === "portfolio") {
      const format = node.parameters.format;
      if (format) body.format = String(format);
      const branding = node.parameters.branding;
      if (branding) body.branding = String(branding);
    } else if (reportType === "scorecard-footprint") {
      const opts = node.parameters.options as Record<string, unknown> | undefined;
      if (opts) {
        if (opts.format) body.format = String(opts.format);
        if (opts.countries) body.countries = String(opts.countries);
        if (opts.ips) body.ips = String(opts.ips);
        if (opts.subdomains) body.subdomains = String(opts.subdomains);
      }
      const branding = node.parameters.branding;
      if (branding) body.branding = String(branding);
    } else {
      const branding = node.parameters.branding;
      if (branding) body.branding = String(branding);
    }

    const res = await apiRequest({ method: "POST", url: `${API_BASE}/reports/${reportType}`, headers, body });
    return [res.body as Record<string, unknown>];
  }

  if (operation === "download") {
    throw new Error("SecurityScorecard: download should be handled at the executor level");
  }

  throw new Error(`SecurityScorecard: unsupported report operation "${operation}"`);
}

async function handleDownload(
  ctx: ExecutionContext,
  node: INode,
  apiKey: string,
  outItems: INodeExecutionData[],
  currentIdx: number,
  pairedItem: INodeExecutionData,
): Promise<void> {
  const url = String(node.parameters.url ?? "").trim();
  if (!url) throw new Error("SecurityScorecard: url is required for report download");
  const binaryPropertyName = String(node.parameters.binaryPropertyName ?? "data").trim();

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`SecurityScorecard: download failed with HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const contentDisposition = res.headers.get("content-disposition") ?? "";
  const fileNameMatch = contentDisposition.match(/filename\s*=\s*"?([^";\n]+)"?/i);
  const fileName = fileNameMatch ? fileNameMatch[1] : "report";

  const items = ctx.getInputItems(0);
  const item = items[currentIdx];
  const binary: Record<string, { data: string; mimeType: string; fileName: string }> = {};
  binary[binaryPropertyName] = { data: base64, mimeType: contentType, fileName };
  outItems.push({
    json: item.json,
    binary,
    pairedItem,
  });
}

function expandEntries(
  body: Record<string, unknown>,
  ctx: ExecutionContext,
  node: INode,
): Record<string, unknown>[] {
  const entries = (body.entries as Array<Record<string, unknown>>) ?? [];
  const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
  const limited = returnAll ? entries : applyTruncate(entries, ctx, node);
  if (limited.length === 0) return [{}];
  return limited;
}

function expandSimplify(
  body: Record<string, unknown>,
  ctx: ExecutionContext,
  node: INode,
): Record<string, unknown>[] {
  const simple = node.parameters.simple === true || node.parameters.simple === "true";
  const entries = (body.entries as Array<Record<string, unknown>>) ?? [];

  if (!simple) {
    const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
    const limited = returnAll ? entries : applyTruncate(entries, ctx, node);
    if (limited.length === 0) return [{}];
    return limited;
  }

  const flattened: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    const date = entry.date;
    const factors = entry.factors as Array<Record<string, unknown>> ?? [];
    for (const factor of factors) {
      for (const [factorName, score] of Object.entries(factor)) {
        flattened.push({ date, [factorName]: score });
      }
    }
  }
  if (flattened.length === 0) return [{}];
  return flattened;
}

function buildUrl(base: string, _ctx: ExecutionContext, node: INode): string {
  const options = node.parameters.options as Record<string, unknown> | undefined;
  if (!options) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function applyTruncate(
  entries: Array<Record<string, unknown>>,
  _ctx: ExecutionContext,
  node: INode,
): Array<Record<string, unknown>> {
  const limit = Number(node.parameters.limit ?? 100);
  return entries.slice(0, Math.min(limit, 100));
}

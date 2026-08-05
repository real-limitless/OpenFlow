import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.lemlist.com/api";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", `return (${raw.slice(1)})`);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function getBool(val: unknown, def = false): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val === "true" || val === "1";
  return def;
}

export const lemlistExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "activity");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      if (operation === "getAll" && Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r as Record<string, unknown>, pairedItem });
        }
      } else {
        out.push({ json: result, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("lemlistApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Lemlist: lemlistApi credential is not configured");
  }
  return apiKey;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (resource) {
    case "activity":
      return activityGetAll(ctx, node, itemJson);
    case "campaign":
      if (operation === "getAll") return campaignGetAll(ctx, node, itemJson);
      if (operation === "getStats") return campaignGetStats(ctx, node, itemJson);
      break;
    case "enrichment":
      if (operation === "get") return enrichmentGet(ctx, node, itemJson);
      if (operation === "enrichLead") return enrichmentEnrichLead(ctx, node, itemJson);
      if (operation === "enrichPerson") return enrichmentEnrichPerson(ctx, node, itemJson);
      break;
    case "lead":
      if (operation === "create") return leadCreate(ctx, node, itemJson);
      if (operation === "delete") return leadDelete(ctx, node, itemJson);
      if (operation === "get") return leadGet(ctx, node, itemJson);
      if (operation === "unsubscribe") return leadUnsubscribe(ctx, node, itemJson);
      break;
    case "team":
      if (operation === "get") return teamGet(ctx, node);
      if (operation === "getCredits") return teamGetCredits(ctx, node);
      break;
    case "unsubscribe":
      if (operation === "add") return unsubscribeAdd(ctx, node, itemJson);
      if (operation === "delete") return unsubscribeDelete(ctx, node, itemJson);
      if (operation === "getAll") return unsubscribeGetAll(ctx, node, itemJson);
      break;
  }
  throw new Error(`Lemlist: unsupported resource/operation "${resource}/${operation}"`);
}

async function lemlistRequest(url: string, options: {
  method?: string;
  body?: unknown;
  apiKey: string;
}): Promise<Record<string, unknown>> {
  const { method = "GET", body, apiKey } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${apiKey}:`)}`,
    };
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const obj = asObj(parsed);
    if (response.status === 429) {
      throw new Error("Lemlist: rate limited (HTTP 429)");
    }
    if (response.status < 200 || response.status >= 300) {
      const desc = obj.message ? String(obj.message) : `HTTP ${response.status}`;
      throw new Error(`Lemlist: ${desc}`);
    }
    return obj;
  } finally {
    clearTimeout(timer);
  }
}

function buildFilters(node: INode, itemJson: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
  const campaignId = String(resolveValue(filters.campaignId, itemJson) ?? "");
  const type = String(resolveValue(filters.type, itemJson) ?? "");
  const leadId = String(resolveValue(filters.leadId, itemJson) ?? "");
  const isFirst = getBool(resolveValue(filters.isFirst, itemJson));
  if (campaignId) params.set("campaignId", campaignId);
  if (type) params.set("type", type);
  if (leadId) params.set("leadId", leadId);
  if (isFirst) params.set("isFirst", "true");
  return params;
}

async function activityGetAll(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const apiKey = await getApiKey(ctx);
  const returnAll = getBool(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 5);
  const filters = buildFilters(node, itemJson);

  let offset = 0;
  let allResults: Record<string, unknown>[] = [];
  const pageLimit = returnAll ? 100 : Math.max(1, Math.min(Math.floor(limit), 100));

  while (true) {
    filters.set("offset", String(offset));
    filters.set("limit", String(pageLimit));
    const url = `${API_BASE}/activities?${filters.toString()}`;
    const body = await lemlistRequest(url, { apiKey });
    const items = (body.data ?? body.activities ?? []) as Record<string, unknown>[];
    allResults = allResults.concat(items);
    if (!returnAll || items.length === 0) break;
    offset += items.length;
  }

  if (!returnAll) {
    allResults = allResults.slice(0, Math.floor(limit));
  }

  return allResults;
}

async function campaignGetAll(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const apiKey = await getApiKey(ctx);
  const returnAll = getBool(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 5);
  const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
  const version = String(resolveValue(filters.version, itemJson) ?? "");

  const params = new URLSearchParams();
  if (version) params.set("version", version);

  let offset = 0;
  let allResults: Record<string, unknown>[] = [];
  const pageLimit = returnAll ? 100 : Math.max(1, Math.min(Math.floor(limit), 100));

  while (true) {
    params.set("offset", String(offset));
    params.set("limit", String(pageLimit));
    const url = `${API_BASE}/campaigns?${params.toString()}`;
    const body = await lemlistRequest(url, { apiKey });
    const items = (body.data ?? body.campaigns ?? []) as Record<string, unknown>[];
    allResults = allResults.concat(items);
    if (!returnAll || items.length === 0) break;
    offset += items.length;
  }

  if (!returnAll) {
    allResults = allResults.slice(0, Math.floor(limit));
  }

  return allResults;
}

async function campaignGetStats(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
  if (!campaignId) throw new Error("Lemlist: campaignId is required for getStats");

  const params = new URLSearchParams();
  params.set("campaignId", campaignId);
  const startDate = String(resolveValue(node.parameters.startDate, itemJson) ?? "");
  const endDate = String(resolveValue(node.parameters.endDate, itemJson) ?? "");
  const timezone = String(resolveValue(node.parameters.timezone, itemJson) ?? "");
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (timezone) params.set("timezone", timezone);

  const url = `${API_BASE}/campaigns/${campaignId}/stats?${params.toString()}`;
  return lemlistRequest(url, { apiKey });
}

async function enrichmentGet(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const enrichId = String(resolveValue(node.parameters.enrichId, itemJson) ?? "");
  if (!enrichId) throw new Error("Lemlist: enrichId is required for enrichment get");

  const url = `${API_BASE}/enrichments/${enrichId}`;
  return lemlistRequest(url, { apiKey });
}

async function enrichmentEnrichLead(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const leadId = String(resolveValue(node.parameters.leadId, itemJson) ?? "");
  if (!leadId) throw new Error("Lemlist: leadId is required for enrichLead");

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = { leadId };
  for (const key of ["findEmail", "verifyEmail", "linkedinEnrichment", "findPhone"]) {
    if (additionalFields[key] !== undefined) {
      body[key] = getBool(additionalFields[key]);
    }
  }

  const url = `${API_BASE}/enrichments`;
  return lemlistRequest(url, { method: "POST", body, apiKey });
}

async function enrichmentEnrichPerson(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const personFields = (node.parameters.personFields ?? {}) as Record<string, unknown>;

  const body: Record<string, unknown> = {};
  for (const key of ["findEmail", "verifyEmail", "linkedinEnrichment", "findPhone"]) {
    if (additionalFields[key] !== undefined) {
      body[key] = getBool(additionalFields[key]);
    }
  }
  for (const key of ["email", "firstName", "lastName", "linkedinUrl", "companyName", "companyDomain"]) {
    const val = resolveValue(personFields[key], itemJson);
    if (val) body[key] = val;
  }

  const url = `${API_BASE}/enrichments`;
  return lemlistRequest(url, { method: "POST", body, apiKey });
}

async function leadCreate(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!campaignId || !email) throw new Error("Lemlist: campaignId and email are required for lead create");

  const body: Record<string, unknown> = { campaignId, email };

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  for (const key of ["firstName", "lastName", "companyName", "companyDomain", "phone", "linkedinUrl", "picture", "jobTitle", "icebreaker"]) {
    const val = resolveValue(additionalFields[key], itemJson);
    if (val) body[key] = val;
  }
  for (const key of ["deduplicate", "findEmail", "verifyEmail", "findPhone", "linkedinEnrichment"]) {
    if (additionalFields[key] !== undefined) {
      body[key] = getBool(additionalFields[key]);
    }
  }

  const url = `${API_BASE}/leads`;
  return lemlistRequest(url, { method: "POST", body, apiKey });
}

async function leadDelete(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!campaignId || !email) throw new Error("Lemlist: campaignId and email are required for lead delete");

  const url = `${API_BASE}/leads/${encodeURIComponent(campaignId)}/${encodeURIComponent(email)}`;
  return lemlistRequest(url, { method: "DELETE", apiKey });
}

async function leadGet(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!email) throw new Error("Lemlist: email is required for lead get");

  const url = `${API_BASE}/leads/${encodeURIComponent(email)}`;
  return lemlistRequest(url, { apiKey });
}

async function leadUnsubscribe(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!campaignId || !email) throw new Error("Lemlist: campaignId and email are required for lead unsubscribe");

  const url = `${API_BASE}/leads/${encodeURIComponent(campaignId)}/${encodeURIComponent(email)}/unsubscribe`;
  return lemlistRequest(url, { method: "POST", apiKey });
}

async function teamGet(
  ctx: ExecutionContext,
  _node: INode,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const url = `${API_BASE}/team`;
  return lemlistRequest(url, { apiKey });
}

async function teamGetCredits(
  ctx: ExecutionContext,
  _node: INode,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const url = `${API_BASE}/team/credits`;
  return lemlistRequest(url, { apiKey });
}

async function unsubscribeAdd(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!email) throw new Error("Lemlist: email is required for unsubscribe add");

  const url = `${API_BASE}/unsubscribes/${encodeURIComponent(email)}`;
  return lemlistRequest(url, { method: "POST", apiKey });
}

async function unsubscribeDelete(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!email) throw new Error("Lemlist: email is required for unsubscribe delete");

  const url = `${API_BASE}/unsubscribes/${encodeURIComponent(email)}`;
  return lemlistRequest(url, { method: "DELETE", apiKey });
}

async function unsubscribeGetAll(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const apiKey = await getApiKey(ctx);
  const returnAll = getBool(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 5);

  const params = new URLSearchParams();
  let offset = 0;
  let allResults: Record<string, unknown>[] = [];
  const pageLimit = returnAll ? 100 : Math.max(1, Math.min(Math.floor(limit), 100));

  while (true) {
    params.set("offset", String(offset));
    params.set("limit", String(pageLimit));
    const url = `${API_BASE}/unsubscribes?${params.toString()}`;
    const body = await lemlistRequest(url, { apiKey });
    const items = (body.data ?? body.unsubscribes ?? []) as Record<string, unknown>[];
    allResults = allResults.concat(items);
    if (!returnAll || items.length === 0) break;
    offset += items.length;
  }

  if (!returnAll) {
    allResults = allResults.slice(0, Math.floor(limit));
  }

  return allResults;
}

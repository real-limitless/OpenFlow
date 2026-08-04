import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.hubapi.com";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", "return " + raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1"));
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

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function parseJsonArray(raw: unknown): Record<string, unknown>[] {
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

export const hubspotToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "contact");
  const operation = String(node.parameters.operation ?? "upsert");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const appTokenCred = await ctx.getCredential("hubspotAppToken");
  if (appTokenCred) {
    const data = appTokenCred as Record<string, unknown>;
    const token = String(data.appToken ?? data.accessToken ?? "");
    if (token) return { Authorization: `Bearer ${token}` };
  }

  const oauthCred = await ctx.getCredential("hubspotOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? data.access_token ?? "");
    if (token) return { Authorization: `Bearer ${token}` };
  }

  const apiKeyCred = await ctx.getCredential("hubspotApi");
  if (apiKeyCred) {
    const data = apiKeyCred as Record<string, unknown>;
    const apiKey = String(data.apiKey ?? "");
    if (apiKey) return { Authorization: `Bearer ${apiKey}` };
  }

  throw new Error("HubSpot Tool: No valid credential found. Configure hubspotAppToken, hubspotOAuth2Api, or hubspotApi.");
}

async function apiRequest(
  method: string,
  path: string,
  auth: Record<string, string>,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${API_BASE}${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      ...auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const errMsg = (obj.message as string) ?? (obj.error as string) ?? `HubSpot API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  const auth = await getAuthHeaders(ctx);

  switch (resource) {
    case "contact": return runContactOperation(node, operation, itemJson, auth);
    case "contactList": return runContactListOperation(node, operation, itemJson, auth);
    case "company": return runCompanyOperation(node, operation, itemJson, auth);
    case "deal": return runDealOperation(node, operation, itemJson, auth);
    case "engagement": return runEngagementOperation(node, operation, itemJson, auth);
    case "ticket": return runTicketOperation(node, operation, itemJson, auth);
    default: throw new Error(`HubSpot Tool: unsupported resource "${resource}"`);
  }
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

async function runContactOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "upsert") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const rawFields = node.parameters.additionalFields;
    const fields = parseJson(rawFields ?? {});
    if (email) fields.email = email;

    const res = await apiRequest("POST", "/crm/v3/objects/contacts", auth, { properties: fields });
    const isNew = res.id !== undefined;
    return { json: { vid: Number(res.id ?? 0), isNew } };
  }

  if (operation === "delete") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HubSpot Tool: contactId is required for contact delete");
    await apiRequest("DELETE", `/crm/v3/objects/contacts/${contactId}`, auth);
    return { json: { vid: contactId, deleted: true, reason: "Contact deleted" } };
  }

  if (operation === "get") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HubSpot Tool: contactId is required for contact get");
    const res = await apiRequest("GET", `/crm/v3/objects/contacts/${contactId}`, auth);
    return { json: { vid: Number(res.id ?? 0), properties: res.properties ?? {} } };
  }

  if (operation === "getAll") {
    const limit = Number(node.parameters.limit ?? 100);
    const offset = Number(node.parameters.offset ?? 0);
    const res = await apiRequest("GET", "/crm/v3/objects/contacts", auth, undefined, {
      limit: String(limit),
      after: String(offset),
    });
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ vid: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "getRecentlyCreatedUpdated") {
    const since = String(resolveValue(node.parameters.since, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (since) params.createdAfter = since;
    const res = await apiRequest("GET", "/crm/v3/objects/contacts", auth, undefined, params);
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ vid: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "search") {
    const filterGroupsUi = parseJson(node.parameters.filterGroupsUi as Record<string, unknown> ?? {});
    const filterGroupValues = parseJsonArray(filterGroupsUi.filterGroupValues ?? []);
    const filters = filterGroupValues.length > 0
      ? parseJsonArray((filterGroupValues[0] as Record<string, unknown>).filters ?? [])
      : [];

    const body: Record<string, unknown> = {};
    if (filters.length > 0) {
      body.filterGroups = [{ filters }];
    } else {
      const searchQuery = String(resolveValue(node.parameters.searchQuery, itemJson) ?? "");
      if (searchQuery) body.query = searchQuery;
    }

    const limit = Number(node.parameters.limit ?? 50);
    body.limit = limit;
    const res = await apiRequest("POST", "/crm/v3/objects/contacts/search", auth, body);
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ vid: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  throw new Error(`HubSpot Tool: unsupported contact operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Contact List
// ---------------------------------------------------------------------------

async function runContactListOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> }> {
  const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
  if (!listId) throw new Error("HubSpot Tool: listId is required");

  if (operation === "add") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HubSpot Tool: contactId is required for contact list add");
    const body = { vids: [Number(contactId)] };
    await apiRequest("POST", `/contacts/v1/lists/${listId}/add`, auth, body);
    return { json: { listId: Number(listId), contactId, added: true } };
  }

  if (operation === "remove") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HubSpot Tool: contactId is required for contact list remove");
    const body = { vids: [Number(contactId)] };
    await apiRequest("POST", `/contacts/v1/lists/${listId}/remove`, auth, body);
    return { json: { listId: Number(listId), contactId, removed: true } };
  }

  throw new Error(`HubSpot Tool: unsupported contactList operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

async function runCompanyOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "create") {
    const rawFields = node.parameters.additionalFields;
    const fields = parseJson(rawFields ?? {});
    const res = await apiRequest("POST", "/crm/v3/objects/companies", auth, { properties: fields });
    return { json: { companyId: Number(res.id ?? 0), isDeleted: false } };
  }

  if (operation === "delete") {
    const companyId = String(resolveValue(node.parameters.companyId, itemJson) ?? "");
    if (!companyId) throw new Error("HubSpot Tool: companyId is required for company delete");
    await apiRequest("DELETE", `/crm/v3/objects/companies/${companyId}`, auth);
    return { json: { companyId: Number(companyId), deleted: true } };
  }

  if (operation === "get") {
    const companyId = String(resolveValue(node.parameters.companyId, itemJson) ?? "");
    if (!companyId) throw new Error("HubSpot Tool: companyId is required for company get");
    const res = await apiRequest("GET", `/crm/v3/objects/companies/${companyId}`, auth);
    return { json: { companyId: Number(res.id ?? 0), properties: res.properties ?? {} } };
  }

  if (operation === "getAll") {
    const limit = Number(node.parameters.limit ?? 100);
    const offset = Number(node.parameters.offset ?? 0);
    const res = await apiRequest("GET", "/crm/v3/objects/companies", auth, undefined, { limit: String(limit), after: String(offset) });
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ companyId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "getRecentlyCreated") {
    const since = String(resolveValue(node.parameters.since, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (since) params.createdAfter = since;
    const res = await apiRequest("GET", "/crm/v3/objects/companies", auth, undefined, params);
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ companyId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "getRecentlyModified") {
    const since = String(resolveValue(node.parameters.since, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (since) params.updatedAfter = since;
    const res = await apiRequest("GET", "/crm/v3/objects/companies", auth, undefined, params);
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ companyId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "searchByDomain") {
    const domain = String(resolveValue(node.parameters.domain, itemJson) ?? "");
    if (!domain) throw new Error("HubSpot Tool: domain is required for company searchByDomain");
    const limit = Number(node.parameters.limit ?? 100);
    const res = await apiRequest("POST", "/crm/v3/objects/companies/search", auth, { query: domain, limit });
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ companyId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "update") {
    const companyId = String(resolveValue(node.parameters.companyId, itemJson) ?? "");
    if (!companyId) throw new Error("HubSpot Tool: companyId is required for company update");
    const rawFields = node.parameters.additionalFields;
    const fields = parseJson(rawFields ?? {});
    const res = await apiRequest("PATCH", `/crm/v3/objects/companies/${companyId}`, auth, { properties: fields });
    return { json: { companyId: Number(res.id ?? 0), properties: res.properties ?? {} } };
  }

  throw new Error(`HubSpot Tool: unsupported company operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

async function runDealOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "create") {
    const stage = String(resolveValue(node.parameters.stage, itemJson) ?? "");
    const rawFields = node.parameters.additionalFields;
    const fields = parseJson(rawFields ?? {});
    if (stage) fields.dealstage = stage;
    const body: Record<string, unknown> = { properties: fields };
    const res = await apiRequest("POST", "/crm/v3/objects/deals", auth, body);
    return { json: { dealId: Number(res.id ?? 0), portalId: Number(res.portalId ?? 0), isDeleted: false } };
  }

  if (operation === "delete") {
    const dealId = String(resolveValue(node.parameters.dealId, itemJson) ?? "");
    if (!dealId) throw new Error("HubSpot Tool: dealId is required for deal delete");
    await apiRequest("DELETE", `/crm/v3/objects/deals/${dealId}`, auth);
    return { json: { dealId: Number(dealId), deleted: true } };
  }

  if (operation === "get") {
    const dealId = String(resolveValue(node.parameters.dealId, itemJson) ?? "");
    if (!dealId) throw new Error("HubSpot Tool: dealId is required for deal get");
    const res = await apiRequest("GET", `/crm/v3/objects/deals/${dealId}`, auth);
    return { json: { dealId: Number(res.id ?? 0), properties: res.properties ?? {} } };
  }

  if (operation === "getAll") {
    const limit = Number(node.parameters.limit ?? 100);
    const offset = Number(node.parameters.offset ?? 0);
    const res = await apiRequest("GET", "/crm/v3/objects/deals", auth, undefined, { limit: String(limit), after: String(offset) });
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ dealId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "getRecentlyCreated") {
    const since = String(resolveValue(node.parameters.since, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (since) params.createdAfter = since;
    const res = await apiRequest("GET", "/crm/v3/objects/deals", auth, undefined, params);
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ dealId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "getRecentlyModified") {
    const since = String(resolveValue(node.parameters.since, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (since) params.updatedAfter = since;
    const res = await apiRequest("GET", "/crm/v3/objects/deals", auth, undefined, params);
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ dealId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "search") {
    const searchQuery = String(resolveValue(node.parameters.searchQuery, itemJson) ?? "");
    const limit = Number(node.parameters.limit ?? 50);
    const body: Record<string, unknown> = { limit };
    if (searchQuery) body.query = searchQuery;
    const res = await apiRequest("POST", "/crm/v3/objects/deals/search", auth, body);
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ dealId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "update") {
    const dealId = String(resolveValue(node.parameters.dealId, itemJson) ?? "");
    if (!dealId) throw new Error("HubSpot Tool: dealId is required for deal update");
    const stage = String(resolveValue(node.parameters.stage, itemJson) ?? "");
    const rawFields = node.parameters.additionalFields;
    const fields = parseJson(rawFields ?? {});
    if (stage) fields.dealstage = stage;
    const res = await apiRequest("PATCH", `/crm/v3/objects/deals/${dealId}`, auth, { properties: fields });
    return { json: { dealId: Number(res.id ?? 0), properties: res.properties ?? {} } };
  }

  throw new Error(`HubSpot Tool: unsupported deal operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

async function runEngagementOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "create") {
    const engagementType = String(resolveValue(node.parameters.type, itemJson) ?? "NOTE");
    const metadata = parseJson(resolveValue(node.parameters.metadata, itemJson));
    const additionalFields = parseJson(node.parameters.additionalFields as Record<string, unknown> ?? {});
    const contactIds = additionalFields.contactIds as Array<unknown> | undefined;
    const associations: Record<string, unknown> = {};
    if (contactIds && Array.isArray(contactIds)) {
      associations.contactIds = contactIds;
    }

    const body: Record<string, unknown> = {
      engagement: { type: engagementType },
      metadata,
      associations,
    };
    const res = await apiRequest("POST", "/engagements/v1/engagements", auth, body);
    const engagement = (res.engagement ?? {}) as Record<string, unknown>;
    const assoc = (res.associations ?? {}) as Record<string, unknown>;
    return { json: { engagement: { id: Number(engagement.id ?? 0), type: String(engagement.type ?? engagementType) }, associations: assoc } };
  }

  if (operation === "delete") {
    const engagementId = String(resolveValue(node.parameters.engagementId, itemJson) ?? "");
    if (!engagementId) throw new Error("HubSpot Tool: engagementId is required for engagement delete");
    await apiRequest("DELETE", `/engagements/v1/engagements/${engagementId}`, auth);
    return { json: { engagementId: Number(engagementId), deleted: true } };
  }

  if (operation === "get") {
    const engagementId = String(resolveValue(node.parameters.engagementId, itemJson) ?? "");
    if (!engagementId) throw new Error("HubSpot Tool: engagementId is required for engagement get");
    const res = await apiRequest("GET", `/engagements/v1/engagements/${engagementId}`, auth);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const limit = Number(node.parameters.limit ?? 100);
    const offset = Number(node.parameters.offset ?? 0);
    const res = await apiRequest("GET", "/engagements/v1/engagements/paged", auth, undefined, { limit: String(limit), offset: String(offset) });
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => asObj(r)) };
  }

  throw new Error(`HubSpot Tool: unsupported engagement operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

async function runTicketOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "create") {
    const rawFields = node.parameters.additionalFields;
    const fields = parseJson(rawFields ?? {});
    const res = await apiRequest("POST", "/crm/v3/objects/tickets", auth, { properties: fields });
    return { json: { ticketId: Number(res.id ?? 0), isDeleted: false } };
  }

  if (operation === "delete") {
    const ticketId = String(resolveValue(node.parameters.ticketId, itemJson) ?? "");
    if (!ticketId) throw new Error("HubSpot Tool: ticketId is required for ticket delete");
    await apiRequest("DELETE", `/crm/v3/objects/tickets/${ticketId}`, auth);
    return { json: { ticketId: Number(ticketId), deleted: true } };
  }

  if (operation === "get") {
    const ticketId = String(resolveValue(node.parameters.ticketId, itemJson) ?? "");
    if (!ticketId) throw new Error("HubSpot Tool: ticketId is required for ticket get");
    const res = await apiRequest("GET", `/crm/v3/objects/tickets/${ticketId}`, auth);
    return { json: { ticketId: Number(res.id ?? 0), properties: res.properties ?? {} } };
  }

  if (operation === "getAll") {
    const limit = Number(node.parameters.limit ?? 100);
    const offset = Number(node.parameters.offset ?? 0);
    const res = await apiRequest("GET", "/crm/v3/objects/tickets", auth, undefined, { limit: String(limit), after: String(offset) });
    const results = (res.results ?? []) as Record<string, unknown>[];
    return { json: results.map((r) => ({ ticketId: Number(r.id ?? 0), properties: r.properties ?? {} })) };
  }

  if (operation === "update") {
    const ticketId = String(resolveValue(node.parameters.ticketId, itemJson) ?? "");
    if (!ticketId) throw new Error("HubSpot Tool: ticketId is required for ticket update");
    const rawFields = node.parameters.additionalFields;
    const fields = parseJson(rawFields ?? {});
    const res = await apiRequest("PATCH", `/crm/v3/objects/tickets/${ticketId}`, auth, { properties: fields });
    return { json: { ticketId: Number(res.id ?? 0), properties: res.properties ?? {} } };
  }

  throw new Error(`HubSpot Tool: unsupported ticket operation "${operation}"`);
}

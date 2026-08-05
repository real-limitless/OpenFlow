import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.intercom.io";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveString(raw: unknown, itemJson: Record<string, unknown>): string {
  const v = resolveValue(raw, itemJson);
  if (v == null) return "";
  return String(v);
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const cred = await ctx.getCredential("intercomApi");
  const token = cred ? String(cred.apiKey ?? cred.accessToken ?? "") : "";
  if (!token) {
    throw new Error("Intercom: intercomApi credential is not configured");
  }
  return token;
}

async function intercomRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  let url = `${API_BASE}${path}`;
  if (params) {
    const search = new URLSearchParams(params).toString();
    if (search) url += `?${search}`;
  }
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
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* keep empty */
  }
  if (!res.ok) {
    const errMsg =
      (data as { error?: { message?: string }; message?: string }).error?.message ??
      (data as { message?: string }).message ??
      `HTTP ${res.status}`;
    throw new Error(`Intercom: ${errMsg}`);
  }
  return data;
}

function collectCustomAttributes(
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const customAttributesUi = node.parameters.customAttributesUi as
    | { customAttributesValues?: Array<{ name: string; value: unknown }> }
    | undefined;
  if (customAttributesUi?.customAttributesValues?.length) {
    const attrs: Record<string, unknown> = {};
    for (const entry of customAttributesUi.customAttributesValues) {
      const name = resolveString(entry.name, itemJson);
      if (name) attrs[name] = resolveValue(entry.value, itemJson);
    }
    return attrs;
  }
  const customAttributesJson = node.parameters.customAttributesJson as string | undefined;
  if (customAttributesJson) {
    const resolved = resolveString(customAttributesJson, itemJson);
    try {
      return JSON.parse(resolved) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export const intercomExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "user");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, binary: item.binary, pairedItem });
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
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getAccessToken(ctx, node);

  if (resource === "company") {
    return runCompanyOperation(token, node, operation, itemJson);
  }
  if (resource === "lead") {
    return runLeadOperation(token, node, operation, itemJson);
  }
  if (resource === "user") {
    return runUserOperation(token, node, operation, itemJson);
  }
  throw new Error(`Intercom: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

async function runCompanyOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create" || operation === "update") {
    const body: Record<string, unknown> = {};
    const companyId = resolveString(node.parameters.companyId, itemJson);
    if (companyId) body.company_id = companyId;
    const name = resolveString(node.parameters.name, itemJson);
    if (name) body.name = name;
    const plan = resolveString(node.parameters.plan, itemJson);
    if (plan) body.plan = plan;
    const monthlySpend = node.parameters.monthlySpend;
    if (monthlySpend != null && monthlySpend !== "") body.monthly_spend = Number(monthlySpend);
    const size = node.parameters.size;
    if (size != null && size !== "") body.size = Number(size);
    const website = resolveString(node.parameters.website, itemJson);
    if (website) body.website = website;
    const industry = resolveString(node.parameters.industry, itemJson);
    if (industry) body.industry = industry;
    const customAttrs = collectCustomAttributes(node, itemJson);
    if (customAttrs) body.custom_attributes = customAttrs;

    if (companyId) {
      return intercomRequest(token, "POST", "/companies", body);
    }
    return intercomRequest(token, "POST", "/companies", body);
  }

  if (operation === "get") {
    const selectBy = String(node.parameters.selectBy ?? "companyId");
    const value = resolveString(node.parameters.value, itemJson);
    if (!value) throw new Error("Intercom: company get requires a value");
    let path: string;
    if (selectBy === "companyId") {
      path = `/companies?company_id=${encodeURIComponent(value)}`;
    } else if (selectBy === "id") {
      path = `/companies/${encodeURIComponent(value)}`;
    } else {
      path = `/companies?name=${encodeURIComponent(value)}`;
    }
    return intercomRequest(token, "GET", path);
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = {};
    const segmentId = resolveString(node.parameters.segmentId, itemJson);
    if (segmentId) params.segment_id = segmentId;
    const tagId = resolveString(node.parameters.tagId, itemJson);
    if (tagId) params.tag_id = tagId;
    return getAllPages(token, "/companies", "data", returnAll, limit, params);
  }

  if (operation === "listUsers") {
    const listBy = String(node.parameters.listBy ?? "id");
    const value = resolveString(node.parameters.value, itemJson);
    if (!value) throw new Error("Intercom: list users requires a value");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const path =
      listBy === "companyId"
        ? `/companies/${encodeURIComponent(value)}/users`
        : `/companies/id/${encodeURIComponent(value)}/users`;
    return getAllPages(token, path, "data", returnAll, limit);
  }

  throw new Error(`Intercom: unsupported company operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------

async function runLeadOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create" || operation === "update") {
    const body: Record<string, unknown> = {};
    const email = resolveString(node.parameters.email, itemJson);
    if (email) body.email = email;
    const name = resolveString(node.parameters.name, itemJson);
    if (name) body.name = name;
    const phone = resolveString(node.parameters.phone, itemJson);
    if (phone) body.phone = phone;
    const avatar = resolveString(node.parameters.avatar, itemJson);
    if (avatar) body.avatar = avatar;
    const companies = node.parameters.companies;
    if (Array.isArray(companies)) body.companies = companies;
    const unsubscribed = node.parameters.unsubscribedFromEmails;
    if (unsubscribed != null) body.unsubscribed_from_emails = Boolean(unsubscribed);
    const updateLastRequestAt = node.parameters.updateLastRequestAt;
    if (updateLastRequestAt != null) body.update_last_request_at = Boolean(updateLastRequestAt);
    const utmSource = resolveString(node.parameters.utmSource, itemJson);
    if (utmSource) body.utm_source = utmSource;
    const utmMedium = resolveString(node.parameters.utmMedium, itemJson);
    if (utmMedium) body.utm_medium = utmMedium;
    const utmCampaign = resolveString(node.parameters.utmCampaign, itemJson);
    if (utmCampaign) body.utm_campaign = utmCampaign;
    const utmTerm = resolveString(node.parameters.utmTerm, itemJson);
    if (utmTerm) body.utm_term = utmTerm;
    const utmContent = resolveString(node.parameters.utmContent, itemJson);
    if (utmContent) body.utm_content = utmContent;
    const customAttrs = collectCustomAttributes(node, itemJson);
    if (customAttrs) body.custom_attributes = customAttrs;

    if (operation === "update") {
      const updateBy = String(node.parameters.updateBy ?? "id");
      const value = resolveString(node.parameters.value, itemJson);
      if (!value) throw new Error("Intercom: lead update requires a value");
      if (updateBy === "userId") {
        body.user_id = value;
      } else {
        body.id = value;
      }
      return intercomRequest(token, "POST", "/contacts", body);
    }

    return intercomRequest(token, "POST", "/contacts", body);
  }

  if (operation === "delete") {
    const deleteBy = String(node.parameters.deleteBy ?? "id");
    const value = resolveString(node.parameters.value, itemJson);
    if (!value) throw new Error("Intercom: lead delete requires a value");
    if (deleteBy === "userId") {
      const res = await intercomRequest(
        token,
        "GET",
        `/contacts?user_id=${encodeURIComponent(value)}`,
      );
      const contact = (res as { data?: { id?: string } }).data;
      if (!contact?.id) throw new Error("Intercom: lead not found");
      return intercomRequest(token, "DELETE", `/contacts/${contact.id}`);
    }
    return intercomRequest(token, "DELETE", `/contacts/${encodeURIComponent(value)}`);
  }

  if (operation === "get") {
    const selectBy = String(node.parameters.selectBy ?? "email");
    const value = resolveString(node.parameters.value, itemJson);
    if (!value) throw new Error("Intercom: lead get requires a value");
    let path: string;
    if (selectBy === "email") {
      path = `/contacts?email=${encodeURIComponent(value)}`;
    } else if (selectBy === "id") {
      path = `/contacts/${encodeURIComponent(value)}`;
    } else if (selectBy === "userId") {
      path = `/contacts?user_id=${encodeURIComponent(value)}`;
    } else {
      path = `/contacts?phone=${encodeURIComponent(value)}`;
    }
    return intercomRequest(token, "GET", path);
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = {};
    const email = resolveString(node.parameters.email, itemJson);
    if (email) params.email = email;
    const phone = resolveString(node.parameters.phone, itemJson);
    if (phone) params.phone = phone;
    return getAllPages(token, "/contacts", "data", returnAll, limit, params);
  }

  throw new Error(`Intercom: unsupported lead operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

async function runUserOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create" || operation === "update") {
    const body: Record<string, unknown> = {};

    if (operation === "create") {
      const identifierType = String(node.parameters.identifierType ?? "email");
      const idValue = resolveString(node.parameters.idValue, itemJson);
      if (idValue) {
        body[identifierType] = idValue;
      }
    }

    const email = resolveString(node.parameters.email, itemJson);
    if (email) body.email = email;
    const name = resolveString(node.parameters.name, itemJson);
    if (name) body.name = name;
    const phone = resolveString(node.parameters.phone, itemJson);
    if (phone) body.phone = phone;
    const userId = resolveString(node.parameters.userId, itemJson);
    if (userId) body.user_id = userId;
    const avatar = resolveString(node.parameters.avatar, itemJson);
    if (avatar) body.avatar = avatar;
    const companies = node.parameters.companies;
    if (Array.isArray(companies)) body.companies = companies;
    const sessionCount = node.parameters.sessionCount;
    if (sessionCount != null && sessionCount !== "") body.session_count = Number(sessionCount);
    const unsubscribed = node.parameters.unsubscribedFromEmails;
    if (unsubscribed != null) body.unsubscribed_from_emails = Boolean(unsubscribed);
    const updateLastRequestAt = node.parameters.updateLastRequestAt;
    if (updateLastRequestAt != null) body.update_last_request_at = Boolean(updateLastRequestAt);
    const utmSource = resolveString(node.parameters.utmSource, itemJson);
    if (utmSource) body.utm_source = utmSource;
    const utmMedium = resolveString(node.parameters.utmMedium, itemJson);
    if (utmMedium) body.utm_medium = utmMedium;
    const utmCampaign = resolveString(node.parameters.utmCampaign, itemJson);
    if (utmCampaign) body.utm_campaign = utmCampaign;
    const utmTerm = resolveString(node.parameters.utmTerm, itemJson);
    if (utmTerm) body.utm_term = utmTerm;
    const utmContent = resolveString(node.parameters.utmContent, itemJson);
    if (utmContent) body.utm_content = utmContent;
    const customAttrs = collectCustomAttributes(node, itemJson);
    if (customAttrs) body.custom_attributes = customAttrs;

    if (operation === "update") {
      const updateBy = String(node.parameters.updateBy ?? "id");
      const value = resolveString(node.parameters.value, itemJson);
      if (!value) throw new Error("Intercom: user update requires a value");
      if (updateBy === "email") {
        body.email = value;
      } else if (updateBy === "userId") {
        body.user_id = value;
      } else {
        body.id = value;
      }
      return intercomRequest(token, "POST", "/contacts", body);
    }

    return intercomRequest(token, "POST", "/contacts", body);
  }

  if (operation === "delete") {
    const id = resolveString(node.parameters.id, itemJson);
    if (!id) throw new Error("Intercom: user delete requires an ID");
    return intercomRequest(token, "DELETE", `/contacts/${encodeURIComponent(id)}`);
  }

  if (operation === "get") {
    const selectBy = String(node.parameters.selectBy ?? "id");
    const value = resolveString(node.parameters.value, itemJson);
    if (!value) throw new Error("Intercom: user get requires a value");
    let path: string;
    if (selectBy === "id") {
      path = `/contacts/${encodeURIComponent(value)}`;
    } else {
      path = `/contacts?user_id=${encodeURIComponent(value)}`;
    }
    return intercomRequest(token, "GET", path);
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = {};
    const companyId = resolveString(node.parameters.companyId, itemJson);
    if (companyId) params.company_id = companyId;
    const email = resolveString(node.parameters.email, itemJson);
    if (email) params.email = email;
    const segmentId = resolveString(node.parameters.segmentId, itemJson);
    if (segmentId) params.segment_id = segmentId;
    const tagId = resolveString(node.parameters.tagId, itemJson);
    if (tagId) params.tag_id = tagId;
    return getAllPages(token, "/contacts", "data", returnAll, limit, params);
  }

  throw new Error(`Intercom: unsupported user operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

async function getAllPages(
  token: string,
  path: string,
  dataKey: string,
  returnAll: boolean,
  limit: number,
  params?: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let url = `${API_BASE}${path}`;
  if (params) {
    const search = new URLSearchParams(params).toString();
    if (search) url += `?${search}`;
  }
  if (!returnAll) {
    const separator = url.includes("?") ? "&" : "?";
    url += `${separator}per_page=${Math.min(limit, 150)}`;
  }

  while (url && (!returnAll || items.length < limit)) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      break;
    }
    if (!res.ok) {
      const errMsg =
        (data as { error?: { message?: string }; message?: string }).error?.message ??
        (data as { message?: string }).message ??
        `HTTP ${res.status}`;
      throw new Error(`Intercom: ${errMsg}`);
    }

    const pageData = data[dataKey];
    if (Array.isArray(pageData)) {
      for (const item of pageData) {
        items.push(item as Record<string, unknown>);
        if (!returnAll && items.length >= limit) break;
      }
    }

    const pages = data.pages as { next?: string } | undefined;
    url = pages?.next ?? "";
    if (!returnAll && items.length >= limit) break;
  }

  return items;
}

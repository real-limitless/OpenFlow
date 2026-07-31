import { createHash } from "node:crypto";
import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

function deriveApiBase(apiKey: string): string {
  const parts = apiKey.split("-");
  const dc = parts.length > 1 ? parts[parts.length - 1] : "us1";
  return `https://${dc}.api.mailchimp.com/3.0`;
}

function subscriberHash(email: string): string {
  return createHash("md5").update(email.toLowerCase()).digest("hex");
}

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

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function collectFixedCollection(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const values = obj.values as Array<Record<string, unknown>> | undefined;
  if (!values || !Array.isArray(values)) return {};
  const result: Record<string, unknown> = {};
  for (const entry of values) {
    if (entry.name) result[String(entry.name)] = entry.value;
  }
  return result;
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<{ headers: Record<string, string>; apiBase: string }> {
  const apiKeyCred = await ctx.getCredential("mailchimpApi");
  if (apiKeyCred) {
    const data = apiKeyCred as Record<string, unknown>;
    const apiKey = String(data.apiKey ?? "");
    if (apiKey) {
      const encoded = Buffer.from(`user:${apiKey}`).toString("base64");
      return { headers: { Authorization: `Basic ${encoded}` }, apiBase: deriveApiBase(apiKey) };
    }
  }

  const oauthCred = await ctx.getCredential("mailchimpOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? data.access_token ?? "");
    if (token) return { headers: { Authorization: `Bearer ${token}` }, apiBase: "https://us1.api.mailchimp.com/3.0" };
  }

  throw new Error(
    "Mailchimp: No valid credential found. Configure mailchimpApi or mailchimpOAuth2Api.",
  );
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function apiRequest(
  method: string,
  path: string,
  auth: Record<string, string>,
  apiBase: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${apiBase}${path}${qs}`;
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
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed as Record<string, unknown> ?? {};
      const errDetail = obj.detail as string ?? "";
      const errMsg = errDetail || `Mailchimp API error: ${response.status}`;
      const err = new Error(errMsg);
      Object.assign(err, { status: response.status });
      throw err;
    }
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

async function apiRequestAll(
  auth: Record<string, string>,
  apiBase: string,
  path: string,
  params: Record<string, string>,
  returnAll: boolean,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  const pageSize = returnAll ? 1000 : Math.min(limit, 1000);
  let offset = 0;

  do {
    const pageParams: Record<string, string> = { ...params, count: String(pageSize), offset: String(offset) };
    const res = await apiRequest("GET", path, auth, apiBase, undefined, pageParams);
    const items = (res.members ?? res.campaigns ?? res.interests ?? []) as Record<string, unknown>[];
    results.push(...items);
    offset += pageSize;
    if (!returnAll) break;
  } while (results.length > 0 && offset < 10000);

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}

export const mailchimpExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "member");
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

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
) {
  const { headers: auth, apiBase } = await getAuthHeaders(ctx);

  switch (resource) {
    case "member": return runMemberOperation(node, operation, itemJson, auth, apiBase);
    case "memberTag": return runMemberTagOperation(node, operation, itemJson, auth, apiBase);
    case "campaign": return runCampaignOperation(node, operation, itemJson, auth, apiBase);
    case "listGroup": return runListGroupOperation(node, operation, itemJson, auth, apiBase);
    default: throw new Error(`Mailchimp: unsupported resource "${resource}"`);
  }
}

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

async function runMemberOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
  apiBase: string,
) {
  const list = String(resolveValue(node.parameters.list, itemJson) ?? "");
  if (!list) throw new Error("Mailchimp: list is required for member operations");

  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");

  if (operation === "create") {
    if (!email) throw new Error("Mailchimp: email is required for member create");
    const status = String(resolveValue(node.parameters.status, itemJson) ?? "");
    if (!status) throw new Error("Mailchimp: status is required for member create");
    const hash = subscriberHash(email);

    const body: Record<string, unknown> = {
      email_address: email,
      status,
    };

    const jsonParams = node.parameters.jsonParameters === true;
    const rawOptions = node.parameters.options as Record<string, unknown> | undefined;
    if (rawOptions && typeof rawOptions === "object") {
      if (rawOptions.emailType) body.email_type = rawOptions.emailType;
      if (rawOptions.language) body.language = rawOptions.language;
      if (rawOptions.vip === true || rawOptions.vip === false) body.vip = rawOptions.vip;
      if (rawOptions.ipOptIn === true) body.ip_opt = true;
      if (rawOptions.ipSignup) body.ip_signup = rawOptions.ipSignup;
      if (rawOptions.timestampSignup) body.timestamp_signup = rawOptions.timestampSignup;
      if (rawOptions.tags) body.tags = String(rawOptions.tags).split(",").map((t) => t.trim()).filter(Boolean).map((t) => ({ name: t, status: "active" }));
      if (rawOptions.timestampOpt) body.timestamp_opt = rawOptions.timestampOpt;
    }

    if (jsonParams) {
      const mergeFields = parseJson(resolveValue(node.parameters.mergeFieldsJson, itemJson));
      if (Object.keys(mergeFields).length > 0) body.merge_fields = mergeFields;
      const location = parseJson(resolveValue(node.parameters.locationJson, itemJson));
      if (Object.keys(location).length > 0) body.location = location;
      const groups = parseJson(resolveValue(node.parameters.groupJson, itemJson));
      if (Object.keys(groups).length > 0) body.interests = groups;
    } else {
      const mergeFields = collectFixedCollection(node.parameters.mergeFieldsUi);
      if (Object.keys(mergeFields).length > 0) body.merge_fields = mergeFields;
      const locUi = node.parameters.locationFieldsUi as Record<string, unknown> | undefined;
      if (locUi) {
        const locVal = (locUi.value as Record<string, unknown>) ?? locUi;
        const lat = Number(resolveValue(locVal.latitude, itemJson) ?? 0);
        const lon = Number(resolveValue(locVal.longitude, itemJson) ?? 0);
        if (lat || lon) body.location = { latitude: lat, longitude: lon };
      }
      const groups = collectFixedCollection(node.parameters.groupsUi);
      if (Object.keys(groups).length > 0) body.interests = groups;
    }

    const res = await apiRequest("POST", `/lists/${list}/members`, auth, apiBase, body);
    return { json: res };
  }

  if (operation === "get") {
    if (!email) throw new Error("Mailchimp: email is required for member get");
    const hash = subscriberHash(email);
    const params: Record<string, string> = {};
    const rawOptions = node.parameters.options as Record<string, unknown> | undefined;
    if (rawOptions?.fields) params.fields = String(rawOptions.fields);
    if (rawOptions?.excludeFields) params.exclude_fields = String(rawOptions.excludeFields);
    const res = await apiRequest("GET", `/lists/${list}/members/${hash}`, auth, apiBase, undefined, params);
    return { json: res };
  }

  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 500);
    const params: Record<string, string> = {};
    const rawOptions = node.parameters.options as Record<string, unknown> | undefined;
    if (rawOptions?.status) params.status = String(rawOptions.status);
    if (rawOptions?.sinceLastChanged) params.since_last_changed = String(rawOptions.sinceLastChanged);
    if (rawOptions?.beforeLastChanged) params.before_last_changed = String(rawOptions.beforeLastChanged);
    if (rawOptions?.beforeTimestampOpt) params.before_timestamp_opt = String(rawOptions.beforeTimestampOpt);
    if (rawOptions?.emailType) params.email_type = String(rawOptions.emailType);

    const members = await apiRequestAll(auth, apiBase, `/lists/${list}/members`, params, returnAll, limit);
    return members.map((m) => ({ json: m }));
  }

  if (operation === "update") {
    if (!email) throw new Error("Mailchimp: email is required for member update");
    const hash = subscriberHash(email);
    const body: Record<string, unknown> = {};
    const rawUpdate = node.parameters.updateFields as Record<string, unknown> | undefined;
    if (rawUpdate && typeof rawUpdate === "object") {
      if (rawUpdate.status) body.status = rawUpdate.status;
      if (rawUpdate.emailType) body.email_type = rawUpdate.emailType;
      if (rawUpdate.language) body.language = rawUpdate.language;
      if (rawUpdate.vip === true || rawUpdate.vip === false) body.vip = rawUpdate.vip;
      if (rawUpdate.ipOptIn === true) body.ip_opt = true;
      if (rawUpdate.ipSignup) body.ip_signup = rawUpdate.ipSignup;
      if (rawUpdate.timestampSignup) body.timestamp_signup = rawUpdate.timestampSignup;
      if (rawUpdate.skipMergeValidation === true) body.skip_merge_validation = true;
      if (rawUpdate.timestampOpt) body.timestamp_opt = rawUpdate.timestampOpt;
    }
    const jsonParams = node.parameters.jsonParameters === true;
    if (jsonParams) {
      const mergeFields = parseJson(resolveValue(node.parameters.mergeFieldsJson, itemJson));
      if (Object.keys(mergeFields).length > 0) body.merge_fields = mergeFields;
      const location = parseJson(resolveValue(node.parameters.locationJson, itemJson));
      if (Object.keys(location).length > 0) body.location = location;
      const groups = parseJson(resolveValue(node.parameters.groupJson, itemJson));
      if (Object.keys(groups).length > 0) body.interests = groups;
    } else if (rawUpdate && typeof rawUpdate === "object") {
      const mergeFields = collectFixedCollection(rawUpdate.mergeFieldsUi);
      if (Object.keys(mergeFields).length > 0) body.merge_fields = mergeFields;
      const locUi = rawUpdate.locationFieldsUi as Record<string, unknown> | undefined;
      if (locUi) {
        const locVal = (locUi.value as Record<string, unknown>) ?? locUi;
        const lat = Number(resolveValue(locVal.latitude, itemJson) ?? 0);
        const lon = Number(resolveValue(locVal.longitude, itemJson) ?? 0);
        if (lat || lon) body.location = { latitude: lat, longitude: lon };
      }
      const groups = collectFixedCollection(rawUpdate.groupsUi);
      if (Object.keys(groups).length > 0) body.interests = groups;
    }
    if (Object.keys(body).length === 0) {
      throw new Error("Mailchimp: at least one field must be provided for member update");
    }
    const res = await apiRequest("PATCH", `/lists/${list}/members/${hash}`, auth, apiBase, body);
    return { json: res };
  }

  if (operation === "delete") {
    if (!email) throw new Error("Mailchimp: email is required for member delete");
    const hash = subscriberHash(email);
    try {
      await apiRequest("DELETE", `/lists/${list}/members/${hash}`, auth, apiBase);
    } catch (err) {
      const status = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 0;
      if (status !== 404) throw err;
    }
    return { json: { error: "" } };
  }

  throw new Error(`Mailchimp: unsupported member operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Member Tag
// ---------------------------------------------------------------------------

async function runMemberTagOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
  apiBase: string,
) {
  const list = String(resolveValue(node.parameters.list, itemJson) ?? "");
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!list || !email) throw new Error("Mailchimp: list and email are required for member tag operations");
  const hash = subscriberHash(email);

  const rawTags = node.parameters.tags;
  const tags: string[] = typeof rawTags === "string" && rawTags
    ? rawTags.split(",").map((t) => t.trim()).filter(Boolean)
    : Array.isArray(rawTags) ? rawTags.map(String) : [];

  const status = operation === "create" ? "active" : "inactive";
  const body: Record<string, unknown> = {
    tags: tags.map((name) => ({ name, status })),
  };

  const rawOptions = node.parameters.options as Record<string, unknown> | undefined;
  if (rawOptions?.isSyncing === true) body.is_syncing = true;

  await apiRequest("POST", `/lists/${list}/members/${hash}/tags`, auth, apiBase, body);
  return { json: { success: true } };
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

async function runCampaignOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
  apiBase: string,
) {
  if (operation === "get") {
    const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
    if (!campaignId) throw new Error("Mailchimp: campaignId is required for campaign get");
    const res = await apiRequest("GET", `/campaigns/${campaignId}`, auth, apiBase);
    return { json: res };
  }

  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 10);
    const params: Record<string, string> = {};
    const rawOptions = node.parameters.options as Record<string, unknown> | undefined;
    if (rawOptions && typeof rawOptions === "object") {
      if (rawOptions.status) params.status = String(rawOptions.status);
      if (rawOptions.sortField) params.sort_field = String(rawOptions.sortField);
      if (rawOptions.sortDirection) params.sort_dir = String(rawOptions.sortDirection);
      if (rawOptions.beforeCreateTime) params.before_create_time = String(rawOptions.beforeCreateTime);
      if (rawOptions.beforeSendTime) params.before_send_time = String(rawOptions.beforeSendTime);
      if (rawOptions.sinceCreateTime) params.since_create_time = String(rawOptions.sinceCreateTime);
      if (rawOptions.sinceSendTime) params.since_send_time = String(rawOptions.sinceSendTime);
      if (rawOptions.listId) params.list_id = String(rawOptions.listId);
      if (rawOptions.fields) params.fields = String(rawOptions.fields);
      if (rawOptions.excludeFields) params.exclude_fields = String(rawOptions.excludeFields);
    }

    const campaigns = await apiRequestAll(auth, apiBase, "/campaigns", params, returnAll, limit);
    return campaigns.map((c) => ({ json: c }));
  }

  if (operation === "delete") {
    const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
    if (!campaignId) throw new Error("Mailchimp: campaignId is required for campaign delete");
    await apiRequest("DELETE", `/campaigns/${campaignId}`, auth, apiBase);
    return { json: {} };
  }

  if (operation === "replicate") {
    const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
    if (!campaignId) throw new Error("Mailchimp: campaignId is required for campaign replicate");
    const res = await apiRequest("POST", `/campaigns/${campaignId}/actions/replicate`, auth, apiBase);
    return { json: res };
  }

  if (operation === "resend") {
    const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
    if (!campaignId) throw new Error("Mailchimp: campaignId is required for campaign resend");
    const res = await apiRequest("POST", `/campaigns/${campaignId}/actions/resend`, auth, apiBase);
    return { json: res };
  }

  if (operation === "send") {
    const campaignId = String(resolveValue(node.parameters.campaignId, itemJson) ?? "");
    if (!campaignId) throw new Error("Mailchimp: campaignId is required for campaign send");
    const res = await apiRequest("POST", `/campaigns/${campaignId}/actions/send`, auth, apiBase);
    if (res && Object.keys(res).length > 0) return { json: res };
    return { json: { campaignId, status: "sent" } };
  }

  throw new Error(`Mailchimp: unsupported campaign operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// List Group
// ---------------------------------------------------------------------------

async function runListGroupOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
  apiBase: string,
) {
  const list = String(resolveValue(node.parameters.list, itemJson) ?? "");
  const groupCategory = String(resolveValue(node.parameters.groupCategory, itemJson) ?? "");
  if (!list || !groupCategory) {
    throw new Error("Mailchimp: list and groupCategory are required for listGroup");
  }

  const returnAll = node.parameters.returnAll === true;
  const limit = Number(node.parameters.limit ?? 500);
  const params: Record<string, string> = {};

  const interests = await apiRequestAll(auth, apiBase, `/lists/${list}/interest-categories/${groupCategory}/interests`, params, returnAll, limit);
  return interests.map((i) => ({ json: i }));
}
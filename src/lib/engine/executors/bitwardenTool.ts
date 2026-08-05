import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.bitwarden.com";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

async function bwRequest(
  method: string,
  path: string,
  token: string,
  environment: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const baseUrl = environment === "selfHosted"
    ? (() => { throw new Error("Bitwarden: self-hosted environment requires a custom domain URL (not implemented)"); })()
    : `${API_BASE}/v1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Bitwarden request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(cred: Record<string, unknown>): Promise<string> {
  const clientId = String(cred.clientId ?? "");
  const clientSecret = String(cred.clientSecret ?? "");
  const environment = String(cred.environment ?? "cloud");
  if (!clientId || !clientSecret) {
    throw new Error("Bitwarden: clientId and clientSecret are required in credentials");
  }
  const baseUrl = environment === "selfHosted"
    ? (() => { throw new Error("Bitwarden: self-hosted identity URL not implemented"); })()
    : `${API_BASE}/identity`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "api.organization",
    });
    const response = await fetch(`${baseUrl}/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    const data: Record<string, unknown> = text ? JSON.parse(text) : {};
    const token = String(data.access_token ?? "");
    if (!token) throw new Error("Bitwarden: failed to obtain access token");
    return token;
  } finally {
    clearTimeout(timer);
  }
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

function processApiError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message = typeof obj.message === "string" ? obj.message : typeof obj.error === "string" ? obj.error : `HTTP ${status}`;
  return new Error(`Bitwarden: ${message}`);
}

async function requestOk(
  method: string,
  path: string,
  token: string,
  environment: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await bwRequest(method, path, token, environment, body);
  if (res.status < 200 || res.status >= 300) throw processApiError(res.body, res.status);
  return asObj(res.body);
}

function buildPaginationSearchParams(
  returnAll: boolean,
  limit: number,
  search?: string,
): string {
  if (returnAll && !search) return "";
  const capped = Math.max(1, Math.floor(limit));
  const parts: string[] = [];
  if (!returnAll) parts.push(`limit=${capped}`);
  if (search) parts.push(`search=${encodeURIComponent(search)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

// ── Collection operations ──────────────────────────────────────────────────

async function collectionGet(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const collectionId = String(params.collectionId ?? "");
  if (!collectionId) throw new Error("Bitwarden: collectionId is required");
  const obj = await requestOk("GET", `/collections/${collectionId}`, token, environment);
  return [obj];
}

async function collectionGetAll(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(params.returnAll);
  const limit = Number(params.limit ?? 10);
  const qs = buildPaginationSearchParams(returnAll, limit);
  const obj = await requestOk("GET", `/collections${qs}`, token, environment);
  const data = obj.data ?? [];
  const items = Array.isArray(data) ? data : [];
  return returnAll ? items : items.slice(0, limit);
}

async function collectionDelete(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const collectionId = String(params.collectionId ?? "");
  if (!collectionId) throw new Error("Bitwarden: collectionId is required");
  await requestOk("DELETE", `/collections/${collectionId}`, token, environment);
  return [{ success: true }];
}

async function collectionUpdate(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const collectionId = String(params.collectionId ?? "");
  if (!collectionId) throw new Error("Bitwarden: collectionId is required");
  const updateFields = (params.updateFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  if (updateFields.groups !== undefined) body.groups = updateFields.groups;
  if (updateFields.externalId !== undefined) body.externalId = updateFields.externalId;
  if (updateFields.groupIds) {
    body.groups = String(updateFields.groupIds).split(",").map((s) => s.trim()).filter(Boolean);
  }
  const obj = await requestOk("PUT", `/collections/${collectionId}`, token, environment, body);
  return [obj];
}

// ── Event operations ──────────────────────────────────────────────────────

async function eventGetAll(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(params.returnAll);
  const limit = Number(params.limit ?? 10);
  const filters = (params.filters ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (!returnAll) parts.push(`limit=${Math.max(1, Math.floor(limit))}`);
  if (filters.actorId) parts.push(`actor=${encodeURIComponent(String(filters.actorId))}`);
  if (filters.itemId) parts.push(`item=${encodeURIComponent(String(filters.itemId))}`);
  if (filters.action) parts.push(`action=${encodeURIComponent(String(filters.action))}`);
  if (filters.startDate) parts.push(`start=${encodeURIComponent(String(filters.startDate))}`);
  if (filters.endDate) parts.push(`end=${encodeURIComponent(String(filters.endDate))}`);
  const qs = parts.length ? `?${parts.join("&")}` : "";
  const obj = await requestOk("GET", `/events${qs}`, token, environment);
  const data = obj.data ?? [];
  const items = Array.isArray(data) ? data : [];
  return returnAll ? items : items.slice(0, limit);
}

// ── Group operations ───────────────────────────────────────────────────────

async function groupGet(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const groupId = String(params.groupId ?? "");
  if (!groupId) throw new Error("Bitwarden: groupId is required");
  const obj = await requestOk("GET", `/groups/${groupId}`, token, environment);
  return [obj];
}

async function groupGetAll(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(params.returnAll);
  const limit = Number(params.limit ?? 10);
  const qs = buildPaginationSearchParams(returnAll, limit);
  const obj = await requestOk("GET", `/groups${qs}`, token, environment);
  const data = obj.data ?? [];
  const items = Array.isArray(data) ? data : [];
  return returnAll ? items : items.slice(0, limit);
}

async function groupCreate(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const name = String(params.name ?? "");
  if (!name) throw new Error("Bitwarden: group name is required");
  const obj = await requestOk("POST", "/groups", token, environment, { name });
  return [obj];
}

async function groupDelete(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const groupId = String(params.groupId ?? "");
  if (!groupId) throw new Error("Bitwarden: groupId is required");
  await requestOk("DELETE", `/groups/${groupId}`, token, environment);
  return [{ success: true }];
}

async function groupUpdate(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const groupId = String(params.groupId ?? "");
  if (!groupId) throw new Error("Bitwarden: groupId is required");
  const updateFields = (params.updateFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  if (updateFields.name !== undefined) body.name = updateFields.name;
  if (updateFields.externalId !== undefined) body.externalId = updateFields.externalId;
  const obj = await requestOk("PUT", `/groups/${groupId}`, token, environment, body);
  return [obj];
}

async function groupGetMembers(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const groupId = String(params.groupId ?? "");
  if (!groupId) throw new Error("Bitwarden: groupId is required");
  const obj = await requestOk("GET", `/groups/${groupId}/members`, token, environment);
  const data = obj.data ?? [];
  return Array.isArray(data) ? data : [];
}

async function groupUpdateMembers(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const groupId = String(params.groupId ?? "");
  if (!groupId) throw new Error("Bitwarden: groupId is required");
  const memberIds = String(params.memberIds ?? "");
  if (!memberIds) throw new Error("Bitwarden: memberIds is required for updateMembers");
  const members = memberIds.split(",").map((s) => s.trim()).filter(Boolean);
  const obj = await requestOk("PUT", `/groups/${groupId}/members`, token, environment, { members });
  return [obj];
}

// ── Member operations ─────────────────────────────────────────────────────

async function memberGet(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const memberId = String(params.memberId ?? "");
  if (!memberId) throw new Error("Bitwarden: memberId is required");
  const obj = await requestOk("GET", `/members/${memberId}`, token, environment);
  return [obj];
}

async function memberGetAll(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(params.returnAll);
  const limit = Number(params.limit ?? 10);
  const filters = (params.filters ?? {}) as Record<string, unknown>;
  const search = String(filters.search ?? "");
  const qs = buildPaginationSearchParams(returnAll, limit, search || undefined);
  const obj = await requestOk("GET", `/members${qs}`, token, environment);
  const data = obj.data ?? [];
  const items = Array.isArray(data) ? data : [];
  return returnAll ? items : items.slice(0, limit);
}

async function memberCreate(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const email = String(params.email ?? "");
  if (!email) throw new Error("Bitwarden: email is required to invite a member");
  const body: Record<string, unknown> = { email };
  const type = params.type;
  if (type !== undefined && type !== "") body.type = Number(type);
  const obj = await requestOk("POST", "/members", token, environment, body);
  return [obj];
}

async function memberDelete(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const memberId = String(params.memberId ?? "");
  if (!memberId) throw new Error("Bitwarden: memberId is required");
  await requestOk("DELETE", `/members/${memberId}`, token, environment);
  return [{ success: true }];
}

async function memberUpdate(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const memberId = String(params.memberId ?? "");
  if (!memberId) throw new Error("Bitwarden: memberId is required");
  const updateFields = (params.updateFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  if (updateFields.type !== undefined) body.type = Number(updateFields.type);
  if (updateFields.externalId !== undefined) body.externalId = updateFields.externalId;
  const obj = await requestOk("PUT", `/members/${memberId}`, token, environment, body);
  return [obj];
}

async function memberGetGroups(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const memberId = String(params.memberId ?? "");
  if (!memberId) throw new Error("Bitwarden: memberId is required");
  const obj = await requestOk("GET", `/members/${memberId}/groups`, token, environment);
  const data = obj.data ?? [];
  return Array.isArray(data) ? data : [];
}

async function memberUpdateGroups(
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  const memberId = String(params.memberId ?? "");
  if (!memberId) throw new Error("Bitwarden: memberId is required");
  const groupIds = String(params.groupIds ?? "");
  if (!groupIds) throw new Error("Bitwarden: groupIds is required for updateGroups");
  const groups = groupIds.split(",").map((s) => s.trim()).filter(Boolean);
  const obj = await requestOk("PUT", `/members/${memberId}/groups`, token, environment, { groups });
  return [obj];
}

// ── Resource router ────────────────────────────────────────────────────────

async function runResource(
  resource: string,
  operation: string,
  params: Record<string, unknown>,
  token: string,
  environment: string,
): Promise<Record<string, unknown>[]> {
  switch (resource) {
    case "collection": {
      switch (operation) {
        case "get": return collectionGet(params, token, environment);
        case "getAll": return collectionGetAll(params, token, environment);
        case "delete": return collectionDelete(params, token, environment);
        case "update": return collectionUpdate(params, token, environment);
        default: throw new Error(`Bitwarden: unsupported collection operation "${operation}"`);
      }
    }
    case "event": {
      switch (operation) {
        case "getAll": return eventGetAll(params, token, environment);
        default: throw new Error(`Bitwarden: unsupported event operation "${operation}"`);
      }
    }
    case "group": {
      switch (operation) {
        case "get": return groupGet(params, token, environment);
        case "getAll": return groupGetAll(params, token, environment);
        case "create": return groupCreate(params, token, environment);
        case "delete": return groupDelete(params, token, environment);
        case "update": return groupUpdate(params, token, environment);
        case "getMembers": return groupGetMembers(params, token, environment);
        case "updateMembers": return groupUpdateMembers(params, token, environment);
        default: throw new Error(`Bitwarden: unsupported group operation "${operation}"`);
      }
    }
    case "member": {
      switch (operation) {
        case "get": return memberGet(params, token, environment);
        case "getAll": return memberGetAll(params, token, environment);
        case "create": return memberCreate(params, token, environment);
        case "delete": return memberDelete(params, token, environment);
        case "update": return memberUpdate(params, token, environment);
        case "getGroups": return memberGetGroups(params, token, environment);
        case "updateGroups": return memberUpdateGroups(params, token, environment);
        default: throw new Error(`Bitwarden: unsupported member operation "${operation}"`);
      }
    }
    default: throw new Error(`Bitwarden: unsupported resource "${resource}"`);
  }
}

export const bitwardenToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("bitwardenApi");
  if (!cred) throw new Error("Bitwarden: bitwardenApi credential is not configured");

  const environment = String(cred.environment ?? "cloud");
  const token = await getAccessToken(cred);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const raw = node.parameters;
      const resource = String(resolveValue(raw.resource, itemJson) ?? "collection");
      const operation = String(resolveValue(raw.operation, itemJson) ?? "get");
      const params: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(raw)) {
        params[key] = resolveValue(val, itemJson);
      }
      const isGetAll = params.operation === "getAll";
      const results = await runResource(resource, operation, params, token, environment);
      if (isGetAll) {
        out.push({ json: { ...itemJson, data: results }, pairedItem });
      } else {
        for (const json of results) {
          out.push({ json: { ...itemJson, ...json }, pairedItem });
        }
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, error: message }, pairedItem });
    }
  }

  return [out];
};

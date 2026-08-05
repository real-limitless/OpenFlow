import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.affinity.co";

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

function getNum(raw: unknown, itemJson: Record<string, unknown>): number {
  const v = resolveValue(raw, itemJson);
  return Number(v ?? 0);
}

function getStr(raw: unknown, itemJson: Record<string, unknown>): string {
  return String(resolveValue(raw, itemJson) ?? "");
}

function parseArray(raw: unknown): number[] {
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try { return JSON.parse(raw); } catch { return raw.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n)); }
  }
  if (Array.isArray(raw)) return raw.map(Number).filter(n => !isNaN(n));
  return [];
}

const ARRAY_KEYS = ["lists", "list_entries", "organizations", "persons"] as const;

function extractArray(res: ApiResponse): Record<string, unknown>[] {
  if (Array.isArray(res)) return res as Record<string, unknown>[];
  const data = (res as Record<string, unknown>).data;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  for (const key of ARRAY_KEYS) {
    const val = (res as Record<string, unknown>)[key];
    if (Array.isArray(val)) return val as Record<string, unknown>[];
  }
  return [];
}

type ApiResponse = Record<string, unknown> | Record<string, unknown>[];

async function apiRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<ApiResponse> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${API_BASE}${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Basic ${btoa(`${apiKey}:`)}`,
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
      const obj = asObj(parsed as Record<string, unknown>);
      const errMsg = (obj.message as string) ?? (obj.error as string) ?? `Affinity API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    if (Array.isArray(parsed)) return parsed;
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

async function apiGetAll(
  path: string,
  apiKey: string,
  params: Record<string, string>,
  returnAll: boolean,
): Promise<Record<string, unknown>[]> {
  const allItems: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const p: Record<string, string> = { ...params };
    if (cursor) p.page_token = cursor;
    const res = await apiRequest("GET", path, apiKey, undefined, p);
    const items = extractArray(res);
    allItems.push(...items);
    if (!returnAll && allItems.length >= Number(params.limit ?? 50)) break;
    const resObj = res as Record<string, unknown>;
    cursor = resObj.page_token as string | undefined;
  } while (returnAll && cursor);
  if (!returnAll && Number(params.limit) > 0) {
    return allItems.slice(0, Number(params.limit));
  }
  return allItems;
}

export const affinityToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "list");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("affinityApi");
  if (!cred) throw new Error("Affinity Tool: no credential found for affinityApi");
  const apiKey = String((cred as Record<string, unknown>).apiKey ?? "");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(node, resource, operation, itemJson, apiKey);
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
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Array<{ json: Record<string, unknown> }>> {
  switch (resource) {
    case "list": return runListOperation(node, operation, itemJson, apiKey);
    case "listEntry": return runListEntryOperation(node, operation, itemJson, apiKey);
    case "organization": return runOrganizationOperation(node, operation, itemJson, apiKey);
    case "person": return runPersonOperation(node, operation, itemJson, apiKey);
    default: throw new Error(`Affinity Tool: unsupported resource "${resource}"`);
  }
}

async function runListOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Array<{ json: Record<string, unknown> }>> {
  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true;
    const limit = getNum(node.parameters.limit, itemJson);
    const params: Record<string, string> = { limit: String(!returnAll && limit > 0 ? limit : 50) };
    const results = await apiGetAll("/lists", apiKey, params, returnAll);
    return results.map(r => ({ json: r }));
  }

  if (operation === "get") {
    const listId = getNum(node.parameters.listId, itemJson);
    const res = await apiRequest("GET", `/lists/${listId}`, apiKey);
    return [{ json: res }];
  }

  throw new Error(`Affinity Tool: unsupported list operation "${operation}"`);
}

async function runListEntryOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Array<{ json: Record<string, unknown> }>> {
  const listId = getNum(node.parameters.listId, itemJson);

  if (operation === "create") {
    const entityId = getNum(node.parameters.entityId, itemJson);
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const body: Record<string, unknown> = { entity_id: entityId };
    if (additionalFields?.creator_id) body.creator_id = Number(additionalFields.creator_id);
    const res = await apiRequest("POST", `/lists/${listId}/list-entries`, apiKey, body);
    return [{ json: res }];
  }

  if (operation === "delete") {
    const listEntryId = getNum(node.parameters.listEntryId, itemJson);
    const res = await apiRequest("DELETE", `/lists/${listId}/list-entries/${listEntryId}`, apiKey);
    return [{ json: Object.keys(res).length > 0 ? res : {} }];
  }

  if (operation === "get") {
    const listEntryId = getNum(node.parameters.listEntryId, itemJson);
    const res = await apiRequest("GET", `/lists/${listId}/list-entries/${listEntryId}`, apiKey);
    return [{ json: res }];
  }

  if (operation === "getAll") {
    const limit = getNum(node.parameters.limit, itemJson);
    const returnAll = node.parameters.returnAll === true;
    const params: Record<string, string> = { limit: String(!returnAll && limit > 0 ? limit : 50) };
    const results = await apiGetAll(`/lists/${listId}/list-entries`, apiKey, params, returnAll);
    return results.map(r => ({ json: r }));
  }

  throw new Error(`Affinity Tool: unsupported listEntry operation "${operation}"`);
}

async function runOrganizationOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Array<{ json: Record<string, unknown> }>> {
  if (operation === "create") {
    const name = getStr(node.parameters.name, itemJson);
    if (!name) throw new Error("Affinity Tool: name is required for organization create");
    const body: Record<string, unknown> = { name };
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additionalFields) {
      if (additionalFields.domain) body.domain = String(additionalFields.domain);
      if (additionalFields.persons) body.person_ids = parseArray(additionalFields.persons);
    }
    const res = await apiRequest("POST", "/organizations", apiKey, body);
    return [{ json: res }];
  }

  if (operation === "delete") {
    const organizationId = getNum(node.parameters.organizationId, itemJson);
    const res = await apiRequest("DELETE", `/organizations/${organizationId}`, apiKey);
    return [{ json: Object.keys(res).length > 0 ? res : { id: organizationId, deleted: true } }];
  }

  if (operation === "get") {
    const organizationId = getNum(node.parameters.organizationId, itemJson);
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    let path = `/organizations/${organizationId}`;
    if (additionalFields?.withInteractionDates) path += "?with_interaction_dates=true";
    const res = await apiRequest("GET", path, apiKey);
    return [{ json: res }];
  }

  if (operation === "getAll") {
    const limit = getNum(node.parameters.limit, itemJson);
    const returnAll = node.parameters.returnAll === true;
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const params: Record<string, string> = { limit: String(!returnAll && limit > 0 ? limit : 50) };
    if (additionalFields?.term) params.term = String(additionalFields.term);
    if (additionalFields?.withInteractionDates) params.with_interaction_dates = "true";
    const results = await apiGetAll("/organizations", apiKey, params, returnAll);
    return results.map(r => ({ json: r }));
  }

  if (operation === "update") {
    const organizationId = getNum(node.parameters.organizationId, itemJson);
    const body: Record<string, unknown> = {};
    const name = getStr(node.parameters.name, itemJson);
    if (name) body.name = name;
    const updateFields = node.parameters.updateFields as Record<string, unknown> | undefined;
    if (updateFields) {
      if (updateFields.domain) body.domain = String(updateFields.domain);
      if (updateFields.persons) body.person_ids = parseArray(updateFields.persons);
    }
    if (Object.keys(body).length === 0) throw new Error("Affinity Tool: at least one field required for organization update");
    const res = await apiRequest("PUT", `/organizations/${organizationId}`, apiKey, body);
    return [{ json: res }];
  }

  throw new Error(`Affinity Tool: unsupported organization operation "${operation}"`);
}

async function runPersonOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Array<{ json: Record<string, unknown> }>> {
  if (operation === "create") {
    const firstName = getStr(node.parameters.firstName, itemJson);
    const lastName = getStr(node.parameters.lastName, itemJson);
    if (!firstName || !lastName) throw new Error("Affinity Tool: firstName and lastName are required for person create");
    const body: Record<string, unknown> = { first_name: firstName, last_name: lastName };
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (additionalFields) {
      if (additionalFields.emails) body.emails = String(additionalFields.emails).split(",").map(s => s.trim()).filter(Boolean);
      if (additionalFields.organizations) body.organization_ids = parseArray(additionalFields.organizations);
    }
    const res = await apiRequest("POST", "/persons", apiKey, body);
    return [{ json: res }];
  }

  if (operation === "delete") {
    const personId = getNum(node.parameters.personId, itemJson);
    const res = await apiRequest("DELETE", `/persons/${personId}`, apiKey);
    return [{ json: Object.keys(res).length > 0 ? res : { id: personId, deleted: true } }];
  }

  if (operation === "get") {
    const personId = getNum(node.parameters.personId, itemJson);
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    let path = `/persons/${personId}`;
    if (additionalFields?.withInteractionDates) path += "?with_interaction_dates=true";
    const res = await apiRequest("GET", path, apiKey);
    return [{ json: res }];
  }

  if (operation === "getAll") {
    const limit = getNum(node.parameters.limit, itemJson);
    const returnAll = node.parameters.returnAll === true;
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const params: Record<string, string> = { limit: String(!returnAll && limit > 0 ? limit : 50) };
    if (additionalFields?.term) params.term = String(additionalFields.term);
    if (additionalFields?.withInteractionDates) params.with_interaction_dates = "true";
    const results = await apiGetAll("/persons", apiKey, params, returnAll);
    return results.map(r => ({ json: r }));
  }

  if (operation === "update") {
    const personId = getNum(node.parameters.personId, itemJson);
    const body: Record<string, unknown> = {};
    const firstName = getStr(node.parameters.firstName, itemJson);
    const lastName = getStr(node.parameters.lastName, itemJson);
    if (firstName) body.first_name = firstName;
    if (lastName) body.last_name = lastName;
    const updateFields = node.parameters.updateFields as Record<string, unknown> | undefined;
    if (updateFields) {
      if (updateFields.lastName) body.last_name = String(updateFields.lastName);
      if (updateFields.firstName) body.first_name = String(updateFields.firstName);
      if (updateFields.emails) body.emails = String(updateFields.emails).split(",").map(s => s.trim()).filter(Boolean);
      if (updateFields.organizations) body.organization_ids = parseArray(updateFields.organizations);
    }
    if (Object.keys(body).length === 0) throw new Error("Affinity Tool: at least one field required for person update");
    const res = await apiRequest("PUT", `/persons/${personId}`, apiKey, body);
    return [{ json: res }];
  }

  throw new Error(`Affinity Tool: unsupported person operation "${operation}"`);
}

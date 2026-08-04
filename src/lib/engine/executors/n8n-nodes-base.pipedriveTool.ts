import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.pipedrive.com/v2";

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

function resolveObject(obj: Record<string, unknown>, itemJson: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveValue(value, itemJson);
  }
  return result;
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

function extractFields(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
}

type OpResultList = OpResult | OpResult[];

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const apiTokenCred = await ctx.getCredential("pipedriveApi");
  if (apiTokenCred) {
    const data = apiTokenCred as Record<string, unknown>;
    const apiToken = String(data.apiToken ?? data.api_key ?? "");
    if (apiToken) return { "X-API-Token": apiToken };
  }

  const oauthCred = await ctx.getCredential("pipedriveOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? data.access_token ?? "");
    if (token) return { Authorization: `Bearer ${token}` };
  }

  throw new Error("Pipedrive: No valid credential found. Configure pipedriveApi or pipedriveOAuth2Api.");
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
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const errMsg = (obj.message as string) ?? (obj.error as string) ?? `Pipedrive API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as unknown as Record<string, unknown>).status = response.status;
      throw err;
    }
    const result = asObj(parsed as Record<string, unknown>);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function apiRequestRaw(
  method: string,
  path: string,
  auth: Record<string, string>,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = { ...auth, Accept: "*/*" };
    const init: RequestInit = { method, headers, signal: controller.signal };
    const response = await fetch(url, init);
    if (!response.ok) {
      const err = new Error(`Pipedrive API error: ${response.status}`);
      (err as unknown as Record<string, unknown>).status = response.status;
      throw err;
    }
    const body = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    return { body, contentType };
  } finally {
    clearTimeout(timer);
  }
}

function unwrapData(res: Record<string, unknown>): Record<string, unknown> {
  return (res.data as Record<string, unknown>) ?? res;
}

async function runDealOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("POST", "/deals", auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "get") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for deal get");
    const res = await apiRequest("GET", `/deals/${id}`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "getAll") {
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/deals", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    const pagination = res.pagination ?? {};
    return { json: { data: items, pagination } };
  }

  if (operation === "update") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for deal update");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("PATCH", `/deals/${id}`, auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for deal delete");
    const res = await apiRequest("DELETE", `/deals/${id}`, auth);
    return { json: { id, success: true, ...res } };
  }

  if (operation === "duplicate") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for deal duplicate");
    const res = await apiRequest("POST", `/deals/${id}/duplicate`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "search") {
    const searchTerm = String(resolveValue(node.parameters.searchTerm, itemJson) ?? "");
    if (!searchTerm) throw new Error("Pipedrive: searchTerm is required for deal search");
    const params: Record<string, string> = { term: searchTerm };
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/deals/search", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    return { json: { data: items, pagination: res.pagination ?? {} } };
  }

  throw new Error(`Pipedrive: unsupported deal operation "${operation}"`);
}

async function runActivityOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("POST", "/activities", auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "get") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for activity get");
    const res = await apiRequest("GET", `/activities/${id}`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "getAll") {
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/activities", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    const pagination = res.pagination ?? {};
    return { json: { data: items, pagination } };
  }

  if (operation === "update") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for activity update");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("PATCH", `/activities/${id}`, auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for activity delete");
    await apiRequest("DELETE", `/activities/${id}`, auth);
    return { json: { id, success: true } };
  }

  throw new Error(`Pipedrive: unsupported activity operation "${operation}"`);
}

async function runOrganizationOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("POST", "/organizations", auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "get") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for organization get");
    const res = await apiRequest("GET", `/organizations/${id}`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "getAll") {
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/organizations", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    const pagination = res.pagination ?? {};
    return { json: { data: items, pagination } };
  }

  if (operation === "update") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for organization update");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("PATCH", `/organizations/${id}`, auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for organization delete");
    await apiRequest("DELETE", `/organizations/${id}`, auth);
    return { json: { id, success: true } };
  }

  if (operation === "search") {
    const searchTerm = String(resolveValue(node.parameters.searchTerm, itemJson) ?? "");
    if (!searchTerm) throw new Error("Pipedrive: searchTerm is required for organization search");
    const params: Record<string, string> = { term: searchTerm };
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/organizations/search", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    return { json: { data: items, pagination: res.pagination ?? {} } };
  }

  throw new Error(`Pipedrive: unsupported organization operation "${operation}"`);
}

async function runPersonOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("POST", "/persons", auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "get") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for person get");
    const res = await apiRequest("GET", `/persons/${id}`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "getAll") {
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/persons", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    const pagination = res.pagination ?? {};
    return { json: { data: items, pagination } };
  }

  if (operation === "update") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for person update");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("PATCH", `/persons/${id}`, auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for person delete");
    await apiRequest("DELETE", `/persons/${id}`, auth);
    return { json: { id, success: true } };
  }

  if (operation === "search") {
    const searchTerm = String(resolveValue(node.parameters.searchTerm, itemJson) ?? "");
    if (!searchTerm) throw new Error("Pipedrive: searchTerm is required for person search");
    const params: Record<string, string> = { term: searchTerm };
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/persons/search", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    return { json: { data: items, pagination: res.pagination ?? {} } };
  }

  throw new Error(`Pipedrive: unsupported person operation "${operation}"`);
}

async function runProductOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("POST", "/products", auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "get") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for product get");
    const res = await apiRequest("GET", `/products/${id}`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "getAll") {
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/products", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    const pagination = res.pagination ?? {};
    return { json: { data: items, pagination } };
  }

  if (operation === "update") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for product update");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("PATCH", `/products/${id}`, auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for product delete");
    await apiRequest("DELETE", `/products/${id}`, auth);
    return { json: { id, success: true } };
  }

  throw new Error(`Pipedrive: unsupported product operation "${operation}"`);
}

async function runLeadOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("POST", "/leads", auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "get") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for lead get");
    const res = await apiRequest("GET", `/leads/${id}`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "getAll") {
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/leads", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    const pagination = res.pagination ?? {};
    return { json: { data: items, pagination } };
  }

  if (operation === "update") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for lead update");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("PATCH", `/leads/${id}`, auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for lead delete");
    await apiRequest("DELETE", `/leads/${id}`, auth);
    return { json: { id, success: true } };
  }

  throw new Error(`Pipedrive: unsupported lead operation "${operation}"`);
}

async function runNoteOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("POST", "/notes", auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "get") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for note get");
    const res = await apiRequest("GET", `/notes/${id}`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "getAll") {
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/notes", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    const pagination = res.pagination ?? {};
    return { json: { data: items, pagination } };
  }

  if (operation === "update") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for note update");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("PATCH", `/notes/${id}`, auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for note delete");
    await apiRequest("DELETE", `/notes/${id}`, auth);
    return { json: { id, success: true } };
  }

  throw new Error(`Pipedrive: unsupported note operation "${operation}"`);
}

async function runFileOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  if (operation === "create") {
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const binaryPropertyName = String(node.parameters.binaryPropertyName ?? "data");
    if (binaryPropertyName && item.binary?.[binaryPropertyName]) {
      const bin = item.binary[binaryPropertyName];
      const formData = new FormData();
      const blob = new Blob(
        [Uint8Array.from(atob(bin.data), (c) => c.charCodeAt(0))],
        { type: bin.mimeType },
      );
      formData.append("file", blob, bin.fileName ?? "upload");
      for (const [k, v] of Object.entries(resolved)) {
        formData.append(k, String(v));
      }
      const res = await apiRequest("POST", "/files", auth, undefined);
      return { json: unwrapData(res) };
    }
    const res = await apiRequest("POST", "/files", auth, resolved);
    return { json: unwrapData(res) };
  }

  if (operation === "get") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for file get");
    const res = await apiRequest("GET", `/files/${id}`, auth);
    return { json: unwrapData(res) };
  }

  if (operation === "getAll") {
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", "/files", auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    const pagination = res.pagination ?? {};
    return { json: { data: items, pagination } };
  }

  if (operation === "download") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for file download");
    const raw = await apiRequestRaw("GET", `/files/${id}/download`, auth);
    const fileName = `file_${id}`;
    const mimeType = raw.contentType;
    const binaryData = Buffer.from(raw.body).toString("base64");
    return {
      json: { id, fileName, mimeType, downloaded: true },
      binary: {
        data: { data: binaryData, mimeType, fileName },
      },
    };
  }

  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!id) throw new Error("Pipedrive: resourceIdentifier is required for file delete");
    await apiRequest("DELETE", `/files/${id}`, auth);
    return { json: { id, success: true } };
  }

  throw new Error(`Pipedrive: unsupported file operation "${operation}"`);
}

async function runDealActivityOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "getAll") {
    const dealId = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!dealId) throw new Error("Pipedrive: resourceIdentifier (deal ID) is required for deal activity list");
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", `/deals/${dealId}/activities`, auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    return { json: { data: items, dealId } };
  }

  throw new Error(`Pipedrive: unsupported deal activity operation "${operation}"`);
}

async function runDealProductOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "create") {
    const dealId = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!dealId) throw new Error("Pipedrive: resourceIdentifier (deal ID) is required for deal product create");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("POST", `/deals/${dealId}/products`, auth, resolved);
    return { json: { dealId, ...unwrapData(res) } };
  }

  if (operation === "getAll") {
    const dealId = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!dealId) throw new Error("Pipedrive: resourceIdentifier (deal ID) is required for deal product list");
    const query = parseJson(resolveValue(node.parameters.query, itemJson));
    const params: Record<string, string> = {};
    if (query.limit) params.limit = String(query.limit);
    if (query.start) params.start = String(query.start);
    const res = await apiRequest("GET", `/deals/${dealId}/products`, auth, undefined, params);
    const items = (res.data ?? []) as Record<string, unknown>[];
    return { json: { data: items, dealId } };
  }

  if (operation === "update") {
    const dealId = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!dealId) throw new Error("Pipedrive: resourceIdentifier (deal ID) is required for deal product update");
    const productId = String(resolveValue(node.parameters.productIdentifier, itemJson) ?? "");
    if (!productId) throw new Error("Pipedrive: productIdentifier is required for deal product update");
    const rawFields = resolveValue(node.parameters.requestFields, itemJson);
    const fields = extractFields(rawFields);
    const resolved = resolveObject(fields, itemJson);
    const res = await apiRequest("PATCH", `/deals/${dealId}/products/${productId}`, auth, resolved);
    return { json: { dealId, productId, ...unwrapData(res) } };
  }

  if (operation === "delete") {
    const dealId = String(resolveValue(node.parameters.resourceIdentifier, itemJson) ?? "");
    if (!dealId) throw new Error("Pipedrive: resourceIdentifier (deal ID) is required for deal product delete");
    const productId = String(resolveValue(node.parameters.productIdentifier, itemJson) ?? "");
    if (!productId) throw new Error("Pipedrive: productIdentifier is required for deal product delete");
    await apiRequest("DELETE", `/deals/${dealId}/products/${productId}`, auth);
    return { json: { dealId, productId, success: true } };
  }

  throw new Error(`Pipedrive: unsupported deal product operation "${operation}"`);
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const auth = await getAuthHeaders(ctx);

  switch (resource) {
    case "Deal": return runDealOperation(node, operation, itemJson, auth);
    case "Activity": return runActivityOperation(node, operation, itemJson, auth);
    case "Organization": return runOrganizationOperation(node, operation, itemJson, auth);
    case "Person": return runPersonOperation(node, operation, itemJson, auth);
    case "Product": return runProductOperation(node, operation, itemJson, auth);
    case "Lead": return runLeadOperation(node, operation, itemJson, auth);
    case "Note": return runNoteOperation(node, operation, itemJson, auth);
    case "File": return runFileOperation(node, operation, itemJson, auth, item);
    case "Deal Activity": return runDealActivityOperation(node, operation, itemJson, auth);
    case "Deal Product": return runDealProductOperation(node, operation, itemJson, auth);
    default: throw new Error(`Pipedrive: unsupported resource "${resource}"`);
  }
}

export const pipedriveToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "Deal");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        const entry: INodeExecutionData = { json: r.json, pairedItem };
        if (r.binary) {
          entry.binary = r.binary;
        }
        out.push(entry);
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

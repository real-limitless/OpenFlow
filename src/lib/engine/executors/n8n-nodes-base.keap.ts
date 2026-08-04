import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.infusionsoft.com/crm/rest/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

export const keapExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "contact");
  const operation = String(node.parameters.operation ?? "retrieve");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("keapOAuth2Api");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("Keap: keapOAuth2Api credential is not configured");
  }
  return accessToken;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (resource) {
    case "company":
      return runCompanyOperation(ctx, node, operation, itemJson);
    case "contact":
      return runContactOperation(ctx, node, operation, itemJson);
    case "contactNote":
      return runContactNoteOperation(ctx, node, operation, itemJson);
    case "contactTag":
      return runContactTagOperation(ctx, node, operation, itemJson);
    case "ecommerceOrder":
      return runEcommerceOrderOperation(ctx, node, operation, itemJson);
    case "ecommerceProduct":
      return runEcommerceProductOperation(ctx, node, operation, itemJson);
    case "email":
      return runEmailOperation(ctx, node, operation, itemJson);
    case "file":
      return runFileOperation(ctx, node, operation, itemJson);
    default:
      throw new Error(`Keap: unsupported resource "${resource}"`);
  }
}

function parseJsonParams(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const raw = resolveValue(node.parameters.jsonParameters, itemJson);
  if (typeof raw === "string") {
    try { return JSON.parse(raw); }
    catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function getContactId(node: INode, itemJson: Record<string, unknown>): string {
  return String(resolveValue(node.parameters.contactId, itemJson) ?? "");
}

async function apiRequest(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${API_BASE}${path}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(obj.message ?? obj.error ?? `Keap API error: ${response.status}`);
      throw new Error(errMsg);
    }
    return parsed ? asObj(parsed) : {};
  } catch (err) {
    if (err instanceof Error && err.message.includes("Keap")) throw err;
    throw new Error(`Keap request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function apiRequestList(
  token: string,
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const res = await apiRequest(token, "GET", path, undefined, params);
  const items = (res.records ?? res.data ?? res.emails ?? res.files ?? []) as Record<string, unknown>[];
  return items;
}

// -- Company --
async function runCompanyOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);
  if (operation === "create") {
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "POST", "/companies", body);
  }
  if (operation === "retrieveAll") {
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(limit) };
    return apiRequestList(token, "/companies", params);
  }
  throw new Error(`Keap: unsupported company operation "${operation}"`);
}

// -- Contact --
async function runContactOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);
  if (operation === "upsert") {
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "POST", "/contacts", body);
  }
  if (operation === "delete") {
    const contactId = getContactId(node, itemJson);
    if (!contactId) throw new Error("Keap: contactId is required for delete");
    return apiRequest(token, "DELETE", `/contacts/${contactId}`);
  }
  if (operation === "retrieve") {
    const contactId = getContactId(node, itemJson);
    if (!contactId) throw new Error("Keap: contactId is required for retrieve");
    return apiRequest(token, "GET", `/contacts/${contactId}`);
  }
  if (operation === "retrieveAll") {
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(limit) };
    return apiRequestList(token, "/contacts", params);
  }
  throw new Error(`Keap: unsupported contact operation "${operation}"`);
}

// -- Contact Note --
async function runContactNoteOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);
  const contactId = getContactId(node, itemJson);
  if (!contactId) throw new Error("Keap: contactId is required for contact note operations");

  if (operation === "create") {
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "POST", `/contacts/${contactId}/notes`, body);
  }
  if (operation === "delete") {
    const noteId = String(resolveValue(node.parameters.noteId, itemJson) ?? "");
    if (!noteId) throw new Error("Keap: noteId is required for delete");
    return apiRequest(token, "DELETE", `/contacts/${contactId}/notes/${noteId}`);
  }
  if (operation === "get") {
    const noteId = String(resolveValue(node.parameters.noteId, itemJson) ?? "");
    if (!noteId) throw new Error("Keap: noteId is required for get");
    return apiRequest(token, "GET", `/contacts/${contactId}/notes/${noteId}`);
  }
  if (operation === "retrieveAll") {
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(limit) };
    return apiRequestList(token, `/contacts/${contactId}/notes`, params);
  }
  if (operation === "update") {
    const noteId = String(resolveValue(node.parameters.noteId, itemJson) ?? "");
    if (!noteId) throw new Error("Keap: noteId is required for update");
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "PUT", `/contacts/${contactId}/notes/${noteId}`, body);
  }
  throw new Error(`Keap: unsupported contactNote operation "${operation}"`);
}

// -- Contact Tag --
async function runContactTagOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);
  const contactId = getContactId(node, itemJson);
  if (!contactId) throw new Error("Keap: contactId is required for contact tag operations");

  if (operation === "addTags") {
    const rawTagIds = resolveValue(node.parameters.tagIds, itemJson);
    const tagIds = Array.isArray(rawTagIds) ? rawTagIds : String(rawTagIds ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const body: Record<string, unknown> = { tagIds };
    return apiRequest(token, "POST", `/contacts/${contactId}/tags`, body);
  }
  if (operation === "deleteTag") {
    const tagId = String(resolveValue(node.parameters.tagId, itemJson) ?? "");
    if (!tagId) throw new Error("Keap: tagId is required");
    return apiRequest(token, "DELETE", `/contacts/${contactId}/tags/${tagId}`);
  }
  if (operation === "retrieveAll") {
    return apiRequestList(token, `/contacts/${contactId}/tags`);
  }
  throw new Error(`Keap: unsupported contactTag operation "${operation}"`);
}

// -- Ecommerce Order --
async function runEcommerceOrderOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);
  if (operation === "create") {
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "POST", "/orders", body);
  }
  if (operation === "get") {
    const orderId = String(resolveValue(node.parameters.orderId, itemJson) ?? "");
    if (!orderId) throw new Error("Keap: orderId is required");
    return apiRequest(token, "GET", `/orders/${orderId}`);
  }
  if (operation === "delete") {
    const orderId = String(resolveValue(node.parameters.orderId, itemJson) ?? "");
    if (!orderId) throw new Error("Keap: orderId is required");
    return apiRequest(token, "DELETE", `/orders/${orderId}`);
  }
  if (operation === "retrieveAll") {
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(limit) };
    return apiRequestList(token, "/orders", params);
  }
  throw new Error(`Keap: unsupported ecommerceOrder operation "${operation}"`);
}

// -- Ecommerce Product --
async function runEcommerceProductOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);
  if (operation === "create") {
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "POST", "/products", body);
  }
  if (operation === "delete") {
    const productId = String(resolveValue(node.parameters.productId, itemJson) ?? "");
    if (!productId) throw new Error("Keap: productId is required");
    return apiRequest(token, "DELETE", `/products/${productId}`);
  }
  if (operation === "get") {
    const productId = String(resolveValue(node.parameters.productId, itemJson) ?? "");
    if (!productId) throw new Error("Keap: productId is required");
    return apiRequest(token, "GET", `/products/${productId}`);
  }
  if (operation === "retrieveAll") {
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(limit) };
    return apiRequestList(token, "/products", params);
  }
  throw new Error(`Keap: unsupported ecommerceProduct operation "${operation}"`);
}

// -- Email --
async function runEmailOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);
  if (operation === "createRecord") {
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "POST", "/emails", body);
  }
  if (operation === "retrieveAll") {
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(limit) };
    return apiRequestList(token, "/emails", params);
  }
  if (operation === "send") {
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "POST", "/emails/send", body);
  }
  throw new Error(`Keap: unsupported email operation "${operation}"`);
}

// -- File --
async function runFileOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getToken(ctx);
  if (operation === "delete") {
    const fileId = String(resolveValue(node.parameters.fileId, itemJson) ?? "");
    if (!fileId) throw new Error("Keap: fileId is required");
    return apiRequest(token, "DELETE", `/files/${fileId}`);
  }
  if (operation === "retrieveAll") {
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(limit) };
    return apiRequestList(token, "/files", params);
  }
  if (operation === "upload") {
    const body = parseJsonParams(node, itemJson);
    return apiRequest(token, "POST", "/files", body);
  }
  throw new Error(`Keap: unsupported file operation "${operation}"`);
}

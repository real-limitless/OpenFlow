import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

interface FieldValue {
  fieldId?: string;
  fieldValue?: unknown;
}

const API_BASE = "https://api.webflow.com/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const webflowToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];

  const resource = (node.parameters.resource as string) ?? "item";
  const operation = (node.parameters.operation as string) ?? "get";

  if (resource !== "item") {
    throw new Error(`Webflow Tool: unsupported resource "${resource}"`);
  }

  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, operation, itemJson);
      out.push({ json: result as Record<string, unknown>, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | unknown[]> {
  const collectionId = String(resolveValue(node.parameters.collectionId, itemJson) ?? "");
  if (!collectionId) throw new Error("Webflow Tool: collectionId is required");

  const headers = await authHeaders(ctx);

  const op = operation === "delete" ? "deleteItem" : operation;

  switch (op) {
    case "create":
      return createItem(node, itemJson, collectionId, headers);
    case "get":
      return getItem(node, itemJson, collectionId, headers);
    case "getAll":
      return getManyItems(node, itemJson, collectionId, headers);
    case "update":
      return updateItem(node, itemJson, collectionId, headers);
    case "deleteItem":
      return deleteItem(node, itemJson, collectionId, headers);
    default:
      throw new Error(`Webflow Tool: unsupported operation "${operation}"`);
  }
}

async function authHeaders(
  ctx: ExecutionContext,
): Promise<Record<string, string>> {
  const oauthCred = await ctx.getCredential("webflowOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? "");
    if (token) {
      return {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      };
    }
  }

  const apiCred = await ctx.getCredential("webflowApi");
  if (apiCred) {
    const data = apiCred as Record<string, unknown>;
    const token = String(data.accessToken ?? "");
    if (token) {
      return {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      };
    }
  }

  throw new Error("Webflow Tool: No valid credential found. Configure webflowOAuth2Api or webflowApi.");
}

function buildFieldData(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const fieldsUi = node.parameters.fieldsUi as { fieldValues?: FieldValue[] } | undefined;
  const fieldValues = fieldsUi?.fieldValues ?? [];
  const fieldData: Record<string, unknown> = {};
  for (const fv of fieldValues) {
    const fieldId = String(resolveValue(fv.fieldId, itemJson) ?? "");
    if (!fieldId) continue;
    fieldData[fieldId] = resolveValue(fv.fieldValue, itemJson);
  }
  return fieldData;
}

async function createItem(
  node: INode,
  itemJson: Record<string, unknown>,
  collectionId: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const live = node.parameters.live === true;
  const suffix = live ? "/live" : "";
  const url = `${API_BASE}/collections/${collectionId}/items${suffix}`;
  const body = { fieldData: buildFieldData(node, itemJson) };
  const res = await webflowRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Webflow Tool: HTTP ${res.status}`);
  }
  return asObject(res.body);
}

async function getItem(
  node: INode,
  itemJson: Record<string, unknown>,
  collectionId: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const itemId = String(resolveValue(node.parameters.itemId, itemJson) ?? "");
  if (!itemId) throw new Error("Webflow Tool: itemId is required");
  const url = `${API_BASE}/collections/${collectionId}/items/${itemId}`;
  const res = await webflowRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Webflow Tool: HTTP ${res.status}`);
  }
  return asObject(res.body);
}

async function getManyItems(
  node: INode,
  itemJson: Record<string, unknown>,
  collectionId: string,
  headers: Record<string, string>,
): Promise<unknown[]> {
  const returnAll = node.parameters.returnAll === true;
  const base = `${API_BASE}/collections/${collectionId}/items`;

  if (returnAll) {
    const all: unknown[] = [];
    let offset = 0;
    const pageSize = 100;
    for (;;) {
      const url = `${base}?limit=${pageSize}&offset=${offset}`;
      const res = await webflowRequest("GET", url, headers);
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Webflow Tool: HTTP ${res.status}`);
      }
      const page = extractItems(res.body);
      all.push(...page);
      if (page.length < pageSize) break;
      offset += page.length;
    }
    return all;
  }

  const limit = Number(node.parameters.limit ?? 100);
  const url = `${base}?limit=${limit}`;
  const res = await webflowRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Webflow Tool: HTTP ${res.status}`);
  }
  return extractItems(res.body);
}

async function updateItem(
  node: INode,
  itemJson: Record<string, unknown>,
  collectionId: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const itemId = String(resolveValue(node.parameters.itemId, itemJson) ?? "");
  if (!itemId) throw new Error("Webflow Tool: itemId is required");
  const live = node.parameters.live === true;
  const suffix = live ? "/live" : "";
  const url = `${API_BASE}/collections/${collectionId}/items/${itemId}${suffix}`;
  const body = { fieldData: buildFieldData(node, itemJson) };
  const res = await webflowRequest("PATCH", url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Webflow Tool: HTTP ${res.status}`);
  }
  return asObject(res.body);
}

async function deleteItem(
  node: INode,
  itemJson: Record<string, unknown>,
  collectionId: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const itemId = String(resolveValue(node.parameters.itemId, itemJson) ?? "");
  if (!itemId) throw new Error("Webflow Tool: itemId is required");
  const url = `${API_BASE}/collections/${collectionId}/items/${itemId}`;
  const res = await webflowRequest("DELETE", url, headers);
  if (res.status === 204) return { success: true };
  return { success: false };
}

async function webflowRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Webflow Tool request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function asObject(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function extractItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as unknown[];
  }
  return [];
}

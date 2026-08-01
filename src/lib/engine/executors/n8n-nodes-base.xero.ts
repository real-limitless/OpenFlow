import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.xero.com/api.xro/2.0";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function pluralResource(resource: string): string {
  if (resource === "contact") return "Contacts";
  if (resource === "invoice") return "Invoices";
  return resource.charAt(0).toUpperCase() + resource.slice(1) + "s";
}

export const xeroExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];

  const resource = (node.parameters.resource as string) ?? "contact";
  const operation = (node.parameters.operation as string) ?? "create";

  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      if (operation === "getAll" && Array.isArray(result)) {
        for (const entity of result) {
          out.push({ json: entity as Record<string, unknown>, pairedItem });
        }
      } else {
        out.push({ json: result as Record<string, unknown>, pairedItem });
      }
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
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | unknown[]> {
  const plural = pluralResource(resource);
  const headers = await authHeaders(ctx);
  const baseUrl = `${API_BASE}/${plural}`;

  switch (operation) {
    case "create":
      return createResource(node, itemJson, baseUrl, plural, headers);
    case "get": {
      const idField = resource === "contact" ? "contactId" : "invoiceId";
      const id = String(resolveValue(node.parameters[idField], itemJson) ?? "");
      if (!id) throw new Error(`Xero: ${idField} is required for get operation`);
      const url = `${baseUrl}/${id}`;
      return httpRequest("GET", url, headers);
    }
    case "getAll": {
      const queryParams = (node.parameters.queryParams as Record<string, unknown>) ?? {};
      const returnAll = node.parameters.returnAll === true;
      const limit = Number(node.parameters.limit ?? 100);
      const params = buildQueryParams(queryParams, returnAll ? undefined : limit);
      const url = params ? `${baseUrl}?${params}` : baseUrl;
      const result = await httpRequest("GET", url, headers);
      const entities = extractEntities(result, plural);
      if (returnAll && entities.length >= (Number(queryParams.page ?? 1) === 1 ? 100 : 100)) {
        return await paginateAll(url, plural, headers, entities, queryParams);
      }
      return entities;
    }
    case "update": {
      const idField = resource === "contact" ? "contactId" : "invoiceId";
      const id = String(resolveValue(node.parameters[idField], itemJson) ?? "");
      if (!id) throw new Error(`Xero: ${idField} is required for update operation`);
      const url = `${baseUrl}/${id}`;
      const fieldsKey = "updateFields";
      const rawFields = (node.parameters[fieldsKey] as Record<string, unknown>) ?? {};
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawFields)) {
        fields[k] = resolveValue(v, itemJson);
      }
      const body: Record<string, unknown> = {};
      body[plural] = [fields];
      return httpRequest("POST", url, headers, body);
    }
    default:
      throw new Error(`Xero: unsupported operation "${operation}"`);
  }
}

async function authHeaders(
  ctx: ExecutionContext,
): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("xeroOAuth2Api");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("Xero: xeroOAuth2Api credential is not configured");
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

function buildQueryParams(
  qp: Record<string, unknown>,
  limit?: number,
): string {
  const parts: string[] = [];
  if (qp.where) parts.push(`where=${encodeURIComponent(String(qp.where))}`);
  if (qp.order) parts.push(`order=${encodeURIComponent(String(qp.order))}`);
  const page = qp.page !== undefined ? Number(qp.page) : 1;
  parts.push(`page=${page}`);
  if (qp.includeArchived === true) parts.push("includeArchived=true");
  if (limit !== undefined) parts.push(`pageSize=${limit}`);
  return parts.join("&");
}

function extractEntities(body: unknown, plural: string): unknown[] {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    const arr = obj[plural];
    if (Array.isArray(arr)) return arr;
  }
  return [];
}

async function paginateAll(
  baseUrl: string,
  plural: string,
  headers: Record<string, string>,
  initial: unknown[],
  queryParams: Record<string, unknown>,
): Promise<unknown[]> {
  const all = [...initial];
  let page = 2;
  for (;;) {
    const qp = { ...queryParams, page };
    const url = `${baseUrl}?${buildQueryParams(qp)}`;
    const result = await httpRequest("GET", url, headers);
    const entities = extractEntities(result, plural);
    if (entities.length === 0) break;
    all.push(...entities);
    if (entities.length < 100) break;
    page++;
  }
  return all;
}

async function createResource(
  node: INode,
  itemJson: Record<string, unknown>,
  baseUrl: string,
  plural: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const rawFields = (node.parameters.additionalFields as Record<string, unknown>) ?? {};
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    fields[k] = resolveValue(v, itemJson);
  }
  const body: Record<string, unknown> = {};
  body[plural] = [fields];
  return httpRequest("POST", baseUrl, headers, body);
}

async function httpRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Xero: HTTP ${response.status}${parsed ? ` - ${JSON.stringify(parsed)}` : ""}`);
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { data: parsed };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Xero:")) throw err;
    throw new Error(`Xero request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

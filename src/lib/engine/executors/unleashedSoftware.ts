import type { NodeExecutor, INodeExecutionData, INode, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";
import crypto from "node:crypto";

const API_BASE = "https://api.unleashedsoftware.com";
const CRED_NAME = "unleashedSoftwareApi";

function buildSignature(queryString: string, apiKey: string): string {
  return crypto.createHmac("sha1", apiKey).update(queryString).digest("base64");
}

function buildAuthHeaders(queryString: string, apiId: string, apiKey: string): Record<string, string> {
  const signature = buildSignature(queryString, apiKey);
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "api-auth-id": apiId,
    "api-auth-signature": signature,
  };
}

async function getCredential(ctx: ExecutionContext): Promise<{ apiId: string; apiKey: string }> {
  const cred = await ctx.getCredential(CRED_NAME);
  if (!cred) throw new Error("Unleashed Software: unleashedSoftwareApi credential is not configured");
  const data = cred as Record<string, unknown>;
  const apiId = String(data.apiId ?? "");
  const apiKey = String(data.apiKey ?? "");
  if (!apiId) throw new Error("Unleashed Software: apiId is required");
  if (!apiKey) throw new Error("Unleashed Software: apiKey is required");
  return { apiId, apiKey };
}

async function unleashedRequest(
  url: string,
  apiId: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const queryString = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const authHeaders = buildAuthHeaders(queryString, apiId, apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { method: "GET", headers: authHeaders, signal: controller.signal });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Unleashed Software: HTTP ${response.status}${parsed ? ` - ${JSON.stringify(parsed).slice(0, 500)}` : ""}`,
      );
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { data: parsed };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Unleashed Software:")) throw err;
    throw new Error(
      `Unleashed Software request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function toQueryString(params: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== null) {
      parts.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

async function paginateAll(
  baseUrl: string,
  queryParams: Record<string, string | undefined>,
  apiId: string,
  apiKey: string,
  initialItems: unknown[],
  initialPagination: { pageNumber: number; pageSize: number; numberOfPages: number },
): Promise<unknown[]> {
  const all = [...initialItems];
  for (let page = initialPagination.pageNumber + 1; page <= initialPagination.numberOfPages; page++) {
    const pageParams = { ...queryParams, page: String(page), pageSize: String(initialPagination.pageSize) };
    const url = `${baseUrl}${toQueryString(pageParams)}`;
    const result = await unleashedRequest(url, apiId, apiKey);
    const pagination = result.Pagination as Record<string, unknown> | undefined;
    const items = result.Items as unknown[] | undefined;
    if (items) all.push(...items);
    if (!pagination || page >= (pagination.numberOfPages as number)) break;
  }
  return all;
}

export const unleashedSoftwareExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];

  const resource = String(node.parameters.resource ?? "salesOrder");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);

      if (Array.isArray(result)) {
        for (const entity of result) {
          out.push({
            json: entity as Record<string, unknown>,
            pairedItem,
          });
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
  const { apiId, apiKey } = await getCredential(ctx);

  if (resource === "salesOrder") {
    return runSalesOrder(node, operation, apiId, apiKey, itemJson);
  }
  if (resource === "stockOnHand") {
    return runStockOnHand(node, operation, apiId, apiKey, itemJson);
  }

  throw new Error(`Unleashed Software: unsupported resource "${resource}"`);
}

function runSalesOrder(
  node: INode,
  operation: string,
  apiId: string,
  apiKey: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | unknown[]> {
  if (operation !== "getAll") {
    throw new Error(`Unleashed Software: unsupported operation "${operation}" for salesOrder`);
  }

  return getSalesOrders(node, apiId, apiKey, itemJson);
}

async function getSalesOrders(
  node: INode,
  apiId: string,
  apiKey: string,
  itemJson: Record<string, unknown>,
): Promise<unknown[]> {
  const filters = (node.parameters.filters as Record<string, unknown>) ?? {};
  const returnAll = node.parameters.returnAll === true;
  const limit = Math.min(Number(node.parameters.limit ?? 100), 1000);

  const params: Record<string, string | undefined> = {};

  if (filters.customerId) params.customerId = String(filters.customerId);
  if (filters.customerCode) params.customerCode = String(filters.customerCode);
  if (filters.endDate) params.endDate = String(filters.endDate);
  if (filters.modifiedSince) params.modifiedSince = String(filters.modifiedSince);
  if (filters.orderNumber) params.orderNumber = String(filters.orderNumber);
  if (filters.orderStatus) {
    const statuses = filters.orderStatus;
    params.orderStatus = Array.isArray(statuses) ? statuses.join(",") : String(statuses);
  }
  if (filters.startDate) params.startDate = String(filters.startDate);
  if (filters.productId) params.productId = String(filters.productId);

  const pageSize = returnAll ? 200 : Math.min(limit, 200);
  params.pageSize = String(pageSize);

  const baseUrl = `${API_BASE}/SalesOrders`;
  const url = `${baseUrl}${toQueryString(params)}`;
  const result = await unleashedRequest(url, apiId, apiKey);

  const pagination = result.Pagination as Record<string, unknown> | undefined;
  const items = (result.Items as unknown[]) ?? [];

  if (returnAll && pagination && (pagination.numberOfPages as number) > 1) {
    const initialPagination = {
      pageNumber: 1,
      pageSize,
      numberOfPages: pagination.numberOfPages as number,
    };
    return paginateAll(baseUrl, params, apiId, apiKey, items, initialPagination);
  }

  if (!returnAll && items.length > limit) {
    return items.slice(0, limit);
  }

  return items;
}

function runStockOnHand(
  node: INode,
  operation: string,
  apiId: string,
  apiKey: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | unknown[]> {
  if (operation === "get") {
    return getStockOnHandById(node, apiId, apiKey, itemJson);
  }
  if (operation === "getAll") {
    return getAllStockOnHand(node, apiId, apiKey, itemJson);
  }

  throw new Error(`Unleashed Software: unsupported operation "${operation}" for stockOnHand`);
}

async function getStockOnHandById(
  node: INode,
  apiId: string,
  apiKey: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const productId = String(node.parameters.productId ?? itemJson.productId ?? "");
  if (!productId) {
    throw new Error("Unleashed Software: productId is required for stockOnHand get operation");
  }
  const url = `${API_BASE}/StockOnHand/${productId}`;
  return unleashedRequest(url, apiId, apiKey);
}

async function getAllStockOnHand(
  node: INode,
  apiId: string,
  apiKey: string,
  itemJson: Record<string, unknown>,
): Promise<unknown[]> {
  const filters = (node.parameters.filters as Record<string, unknown>) ?? {};
  const returnAll = node.parameters.returnAll === true;

  const params: Record<string, string | undefined> = {};

  if (filters.asAtDate) params.asAtDate = String(filters.asAtDate);
  if (filters.IsAssembled !== undefined) params.IsAssembled = String(filters.IsAssembled);
  if (filters.modifiedSince) params.modifiedSince = String(filters.modifiedSince);
  if (filters.orderBy) params.orderBy = String(filters.orderBy);
  if (filters.productId) params.productId = String(filters.productId);
  if (filters.warehouseCode) params.warehouseCode = String(filters.warehouseCode);
  if (filters.warehouseName) params.warehouseName = String(filters.warehouseName);

  const pageSize = returnAll ? 200 : Math.min(Number(node.parameters.limit ?? 100), 200);
  params.pageSize = String(pageSize);

  const baseUrl = `${API_BASE}/StockOnHand`;
  const url = `${baseUrl}${toQueryString(params)}`;
  const result = await unleashedRequest(url, apiId, apiKey);

  const pagination = result.Pagination as Record<string, unknown> | undefined;
  const items = (result.Items as unknown[]) ?? [];

  if (returnAll && pagination && (pagination.numberOfPages as number) > 1) {
    const initialPagination = {
      pageNumber: 1,
      pageSize,
      numberOfPages: pagination.numberOfPages as number,
    };
    return paginateAll(baseUrl, params, apiId, apiKey, items, initialPagination);
  }

  return items;
}

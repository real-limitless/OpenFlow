import type { NodeExecutor, INodeExecutionData, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_VERSION = "2024-01";
const SHOPIFY_API = "shopifyApi";

interface ShopifyResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

interface CredentialResult {
  baseUrl: string;
  accessToken: string;
}

async function getCredential(ctx: {
  getCredential(name: string): Promise<unknown | null>;
}): Promise<CredentialResult> {
  const cred = await ctx.getCredential(SHOPIFY_API);
  if (!cred) throw new Error("Shopify: shopifyApi credential is not configured");
  const data = cred as Record<string, unknown>;
  const subdomain = String(data.shopSubdomain ?? "");
  const accessToken = String(data.accessToken ?? "");
  if (!subdomain) throw new Error("Shopify: shopSubdomain is required");
  if (!accessToken) throw new Error("Shopify: accessToken is required");
  const baseUrl = `https://${subdomain}.myshopify.com/admin/api/${API_VERSION}`;
  return { baseUrl, accessToken };
}

async function shopifyRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
  accessToken?: string,
): Promise<ShopifyResponse> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${baseUrl}/${path}${qs}`;
  const headers: Record<string, string> = {
    "X-Shopify-Access-Token": accessToken ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch { }

  const respHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { respHeaders[k] = v; });

  const resp: ShopifyResponse = { status: response.status, headers: respHeaders, body: parsed };

  if (response.status === 204) return resp;
  if (response.status < 200 || response.status >= 300) {
    const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>) : {};
    const errMsg = (obj.errors as string) ?? `Request failed with status code ${response.status}`;
    const err = new Error(String(errMsg));
    (err as unknown as Record<string, unknown>).status = response.status;
    throw err;
  }
  return resp;
}

function extractPageInfo(linkHeader: string): string | undefined {
  const match = linkHeader.match(/page_info=([a-f0-9]+)[^&]*>;\s*rel="next"/);
  return match ? match[1] : undefined;
}

async function shopifyGetAll(
  baseUrl: string,
  plural: string,
  accessToken: string,
  node: INode,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const results: Record<string, unknown>[] = [];
  let pageInfo: string | undefined;

  while (true) {
    const params: Record<string, string> = { limit: String(Math.min(250, returnAll ? 250 : limit)) };
    if (pageInfo) params.page_info = pageInfo;
    const resp = await shopifyRequest(baseUrl, "GET", `${plural}.json`, undefined, params, accessToken);
    const obj = resp.body && typeof resp.body === "object" && !Array.isArray(resp.body)
      ? (resp.body as Record<string, unknown>) : {};
    const link = resp.headers["link"];
    pageInfo = link ? extractPageInfo(link) : undefined;
    const items = obj[plural] as unknown[];
    if (Array.isArray(items)) {
      for (const item of items) {
        results.push(item as Record<string, unknown>);
        if (!returnAll && results.length >= limit) return results;
      }
    }
    if (!pageInfo || (!returnAll && results.length >= limit)) break;
  }
  return results;
}

function mapProductFields(fields: Record<string, unknown>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (fields.title !== undefined) m.title = fields.title;
  if (fields.bodyHtml !== undefined) m.body_html = fields.bodyHtml;
  if (fields.vendor !== undefined) m.vendor = fields.vendor;
  if (fields.productType !== undefined) m.product_type = fields.productType;
  if (fields.tags !== undefined) m.tags = fields.tags;
  if (fields.status !== undefined) m.status = fields.status;
  if (fields.publishedScope !== undefined) m.published_scope = fields.publishedScope;
  if (fields.handle !== undefined) m.handle = fields.handle;
  if (fields.images !== undefined) m.images = fields.images;
  if (fields.options !== undefined) m.options = fields.options;
  if (fields.variants !== undefined) m.variants = fields.variants;
  return m;
}

export const shopifyExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "product");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r, pairedItem });
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
  ctx: { getCredential(name: string): Promise<unknown | null> },
  node: INode,
  resource: string,
  operation: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const { baseUrl, accessToken } = await getCredential(ctx);
  const plural = resource === "product" ? "products" : "orders";
  const singular = resource;

  if (operation === "getAll") {
    return shopifyGetAll(baseUrl, plural, accessToken, node);
  }

  if (operation === "create") {
    const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const fields = additionalFields ?? {};
    const mapped = resource === "product" ? mapProductFields(fields) : { ...fields };
    const body: Record<string, unknown> = {};
    body[singular] = mapped;
    const resp = await shopifyRequest(baseUrl, "POST", `${plural}.json`, body, undefined, accessToken);
    const obj = resp.body && typeof resp.body === "object" && !Array.isArray(resp.body)
      ? (resp.body as Record<string, unknown>) : {};
    return (obj[singular] ?? obj) as Record<string, unknown>;
  }

  const idKey = resource === "product" ? "productId" : "orderId";
  const id = Number(node.parameters[idKey] ?? 0);
  if (!id) throw new Error(`Shopify: ${idKey} is required for ${operation} ${resource}`);

  if (operation === "get") {
    const resp = await shopifyRequest(baseUrl, "GET", `${plural}/${id}.json`, undefined, undefined, accessToken);
    const obj = resp.body && typeof resp.body === "object" && !Array.isArray(resp.body)
      ? (resp.body as Record<string, unknown>) : {};
    return (obj[singular] ?? obj) as Record<string, unknown>;
  }

  if (operation === "update") {
    const updateFields = node.parameters.updateFields as Record<string, unknown> | undefined;
    const fields = updateFields ?? {};
    const mapped = resource === "product" ? mapProductFields(fields) : { ...fields };
    const body: Record<string, unknown> = {};
    body[singular] = mapped;
    const resp = await shopifyRequest(baseUrl, "PUT", `${plural}/${id}.json`, body, undefined, accessToken);
    const obj = resp.body && typeof resp.body === "object" && !Array.isArray(resp.body)
      ? (resp.body as Record<string, unknown>) : {};
    return (obj[singular] ?? obj) as Record<string, unknown>;
  }

  if (operation === "delete") {
    await shopifyRequest(baseUrl, "DELETE", `${plural}/${id}.json`, undefined, undefined, accessToken);
    return { success: true };
  }

  throw new Error(`Shopify: unsupported operation "${operation}" for resource "${resource}"`);
}
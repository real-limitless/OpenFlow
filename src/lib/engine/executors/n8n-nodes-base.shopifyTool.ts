import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_VERSION = "2024-01";
const SHOPIFY_API = "shopifyApi";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw === "string") {
    if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
      try {
        const fn = new Function("$json", "return " + raw.replace(/^\=/, ""));
        return fn(itemJson);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.map((v) => resolveValue(v, itemJson));
  }
  if (raw && typeof raw === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      resolved[k] = resolveValue(v, itemJson);
    }
    return resolved;
  }
  return raw;
}

async function getCredential(ctx: ExecutionContext): Promise<{ baseUrl: string; accessToken: string }> {
  const cred = await ctx.getCredential(SHOPIFY_API);
  if (!cred) throw new Error("Shopify Tool: shopifyApi credential is not configured");
  const data = cred as Record<string, unknown>;
  const subdomain = String(resolveValue(data.shopSubdomain, {}) ?? "");
  const accessToken = String(resolveValue(data.accessToken, {}) ?? "");
  if (!subdomain) throw new Error("Shopify Tool: shopSubdomain is required");
  if (!accessToken) throw new Error("Shopify Tool: accessToken is required");
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
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
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
  } catch {}

  const respHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { respHeaders[k] = v; });

  const resp = { status: response.status, headers: respHeaders, body: parsed };

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
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(resolveValue(node.parameters.returnAll, itemJson));
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
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

export const shopifyToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "product");
  const operation = String(node.parameters.operation ?? "get");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const { baseUrl, accessToken } = await getCredential(ctx);
      const plural = resource === "product" ? "products" : "orders";
      const singular = resource;

      let result: Record<string, unknown> | Record<string, unknown>[];

      if (operation === "getAll") {
        result = await shopifyGetAll(baseUrl, plural, accessToken, node, itemJson);
        for (const r of result) {
          out.push({ json: r, pairedItem });
        }
        continue;
      }

      if (operation === "create") {
        const rawFields = node.parameters.additionalFields;
        const fields = rawFields && typeof rawFields === "object"
          ? rawFields as Record<string, unknown>
          : {};
        const resolved: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          resolved[k] = resolveValue(v, itemJson);
        }
        const mapped = resource === "product" ? mapProductFields(resolved) : { ...resolved };
        const body: Record<string, unknown> = {};
        body[singular] = mapped;
        const resp = await shopifyRequest(baseUrl, "POST", `${plural}.json`, body, undefined, accessToken);
        const obj = resp.body && typeof resp.body === "object" && !Array.isArray(resp.body)
          ? (resp.body as Record<string, unknown>) : {};
        result = (obj[singular] ?? obj) as Record<string, unknown>;
      } else {
        const idKey = resource === "product" ? "productId" : "orderId";
        const id = Number(resolveValue(node.parameters[idKey], itemJson) ?? 0);
        if (!id) throw new Error(`Shopify Tool: ${idKey} is required for ${operation} ${resource}`);

        if (operation === "get") {
          const resp = await shopifyRequest(baseUrl, "GET", `${plural}/${id}.json`, undefined, undefined, accessToken);
          const obj = resp.body && typeof resp.body === "object" && !Array.isArray(resp.body)
            ? (resp.body as Record<string, unknown>) : {};
          result = (obj[singular] ?? obj) as Record<string, unknown>;
        } else if (operation === "update") {
          const rawFields = node.parameters.updateFields;
          const fields = rawFields && typeof rawFields === "object"
            ? rawFields as Record<string, unknown>
            : {};
          const resolved: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(fields)) {
            resolved[k] = resolveValue(v, itemJson);
          }
          const mapped = resource === "product" ? mapProductFields(resolved) : { ...resolved };
          const body: Record<string, unknown> = {};
          body[singular] = mapped;
          const resp = await shopifyRequest(baseUrl, "PUT", `${plural}/${id}.json`, body, undefined, accessToken);
          const obj = resp.body && typeof resp.body === "object" && !Array.isArray(resp.body)
            ? (resp.body as Record<string, unknown>) : {};
          result = (obj[singular] ?? obj) as Record<string, unknown>;
        } else if (operation === "delete") {
          await shopifyRequest(baseUrl, "DELETE", `${plural}/${id}.json`, undefined, undefined, accessToken);
          result = { success: true };
        } else {
          throw new Error(`Shopify Tool: unsupported operation "${operation}" for resource "${resource}"`);
        }
      }

      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r as Record<string, unknown>, pairedItem });
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

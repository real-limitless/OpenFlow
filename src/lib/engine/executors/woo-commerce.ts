import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_NAMESPACE = "wc/v3";

const RESOURCE_ENDPOINTS: Record<string, string> = {
  customer: "customers",
  order: "orders",
  product: "products",
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", "return " + raw.replace(/^\=/, ""));
      const result = fn(itemJson);
      return result;
    } catch {
      return raw;
    }
  }
  return raw;
}

async function getCredential(ctx: ExecutionContext): Promise<{ baseUrl: string; consumerKey: string; consumerSecret: string }> {
  const cred = await ctx.getCredential("woocommerceApi");
  if (!cred) throw new Error("WooCommerce: woocommerceApi credential is not configured");
  const data = cred as Record<string, unknown>;
  const storeUrl = String(data.url ?? data.storeUrl ?? data.store_url ?? "");
  const consumerKey = String(data.consumerKey ?? data.consumer_key ?? data.key ?? "");
  const consumerSecret = String(data.consumerSecret ?? data.consumer_secret ?? data.secret ?? "");
  if (!storeUrl) throw new Error("WooCommerce: store URL is required");
  if (!consumerKey) throw new Error("WooCommerce: consumer key is required");
  if (!consumerSecret) throw new Error("WooCommerce: consumer secret is required");
  const baseUrl = storeUrl.replace(/\/+$/, "") + "/" + API_NAMESPACE;
  return { baseUrl, consumerKey, consumerSecret };
}

function buildEndpoint(resource: string, id?: string): string {
  const segment = RESOURCE_ENDPOINTS[resource];
  if (!segment) throw new Error(`WooCommerce: unsupported resource "${resource}"`);
  return id ? `${segment}/${id}` : segment;
}

async function wooRequest(
  baseUrl: string,
  method: string,
  path: string,
  consumerKey: string,
  consumerSecret: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<unknown> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${baseUrl}/${path}${qs}`;
  const auth = btoa(`${consumerKey}:${consumerSecret}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {}
    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const msg = typeof parsed === "object" && parsed !== null
        ? String((parsed as Record<string, unknown>).message ?? (parsed as Record<string, unknown>).code ?? `Request failed with status code ${response.status}`)
        : `Request failed with status code ${response.status}`;
      const err = new Error(msg);
      (err as unknown as Record<string, unknown>).status = response.status;
      throw err;
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function getAllPaginated(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  returnAll: boolean,
  limit: number,
): Promise<Record<string, unknown>[]> {
  let page = 1;
  const perPage = params.perPage ? parseInt(params.perPage, 10) : 10;
  const results: Record<string, unknown>[] = [];
  while (true) {
    const p: Record<string, string> = { ...params, per_page: String(perPage), page: String(page) };
    const res = await wooRequest(baseUrl, "GET", path, consumerKey, consumerSecret, undefined, p);
    const items = res as unknown as Record<string, unknown>[];
    if (Array.isArray(items)) {
      for (const item of items) {
        results.push(item);
        if (!returnAll && results.length >= limit) return results;
      }
      if (items.length < perPage) return results;
    } else {
      return results;
    }
    page++;
  }
}

export const wooCommerceExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "product");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const { baseUrl, consumerKey, consumerSecret } = await getCredential(ctx);
      const endpoint = buildEndpoint(resource);

      let result: unknown;

      if (operation === "getAll") {
        const rawOptions = node.parameters.options as Record<string, unknown> | undefined;
        const options = rawOptions ?? {};
        const params: Record<string, string> = {};
        const perPage = resolveValue(options.perPage, itemJson);
        if (perPage) params.perPage = String(perPage);
        const page = resolveValue(options.page, itemJson);
        if (page) params.page = String(page);
        const order = resolveValue(options.order, itemJson);
        if (order) params.order = String(order);
        const orderBy = resolveValue(options.orderBy, itemJson);
        if (orderBy) params.orderby = String(orderBy);
        const search = resolveValue(options.search, itemJson);
        if (search) params.search = String(search);
        const returnAll = Boolean(node.parameters.returnAll);
        const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
        const items_arr = await getAllPaginated(baseUrl, endpoint, params, consumerKey, consumerSecret, returnAll, limit);
        for (const r of items_arr) {
          out.push({ json: r, pairedItem });
        }
        continue;
      }

      if (operation === "create") {
        const rawData = node.parameters.data;
        let data: Record<string, unknown> = {};
        if (typeof rawData === "string") {
          try {
            data = rawData ? JSON.parse(rawData) : {};
          } catch {
            const resolved = resolveValue(rawData, itemJson);
            if (resolved && typeof resolved === "object") data = resolved as Record<string, unknown>;
          }
        } else if (rawData && typeof rawData === "object") {
          data = rawData as Record<string, unknown>;
        }
        result = await wooRequest(baseUrl, "POST", endpoint, consumerKey, consumerSecret, data);
      } else if (operation === "get") {
        const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
        if (!id) throw new Error("WooCommerce: resource ID is required for get operation");
        result = await wooRequest(baseUrl, "GET", buildEndpoint(resource, id), consumerKey, consumerSecret);
      } else if (operation === "update") {
        const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
        if (!id) throw new Error("WooCommerce: resource ID is required for update operation");
        const rawData = node.parameters.data;
        let data: Record<string, unknown> = {};
        if (typeof rawData === "string") {
          try {
            data = rawData ? JSON.parse(rawData) : {};
          } catch {
            const resolved = resolveValue(rawData, itemJson);
            if (resolved && typeof resolved === "object") data = resolved as Record<string, unknown>;
          }
        } else if (rawData && typeof rawData === "object") {
          data = rawData as Record<string, unknown>;
        }
        result = await wooRequest(baseUrl, "PUT", buildEndpoint(resource, id), consumerKey, consumerSecret, data);
      } else if (operation === "delete") {
        const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
        if (!id) throw new Error("WooCommerce: resource ID is required for delete operation");
        const params: Record<string, string> = { force: "true" };
        result = await wooRequest(baseUrl, "DELETE", buildEndpoint(resource, id), consumerKey, consumerSecret, undefined, params);
      } else {
        throw new Error(`WooCommerce: unsupported operation "${operation}"`);
      }

      if (result && typeof result === "object") {
        out.push({ json: result as Record<string, unknown>, pairedItem });
      } else {
        out.push({ json: { success: true, id: String(resolveValue(node.parameters.id, itemJson) ?? "") }, pairedItem });
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
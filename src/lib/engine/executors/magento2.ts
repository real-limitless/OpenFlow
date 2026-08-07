import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

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

function extractTracks(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const vals = obj.values as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(vals)) return vals;
  return [];
}

function extractItems(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const vals = obj.values as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(vals)) return vals;
  return [];
}

async function apiRequest(
  method: string,
  host: string,
  path: string,
  token: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${host.replace(/\/+$/, "")}/rest/V1${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
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
    try { parsed = text ? JSON.parse(text) : null; } catch { }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const errMsg = (obj.message as string) ?? `Magento API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

async function getAuth(ctx: ExecutionContext): Promise<{ host: string; token: string }> {
  const cred = await ctx.getCredential("magento2Api");
  if (!cred) throw new Error("Magento 2: No credential found. Configure magento2Api.");
  const data = cred as Record<string, unknown>;
  const host = String(data.host ?? data.url ?? "");
  const token = String(data.accessToken ?? data.apiKey ?? data.token ?? "");
  if (!host || !token) throw new Error("Magento 2: Credential missing host or accessToken.");
  return { host, token };
}

function parseNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export const magento2Executor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "customer");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();
  const { host, token } = await getAuth(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(node, resource, operation, itemJson, host, token);
      if (result === "passthrough") {
        out.push({ json: itemJson, pairedItem });
      } else if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r, pairedItem });
        }
      } else {
        out.push({ json: result, pairedItem });
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
  host: string,
  token: string,
): Promise<Record<string, unknown> | Record<string, unknown>[] | "passthrough"> {
  switch (resource) {
    case "customer": return runCustomer(node, operation, itemJson, host, token);
    case "invoice": return runInvoice(node, operation, itemJson, host, token);
    case "order": return runOrder(node, operation, itemJson, host, token);
    case "product": return runProduct(node, operation, itemJson, host, token);
    default: throw new Error(`Magento 2: unsupported resource "${resource}"`);
  }
}

async function runCustomer(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  host: string,
  token: string,
): Promise<Record<string, unknown> | Record<string, unknown>[] | "passthrough"> {
  if (operation === "create") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const firstName = String(resolveValue(node.parameters.firstName, itemJson) ?? "");
    const lastName = String(resolveValue(node.parameters.lastName, itemJson) ?? "");
    if (!email || !firstName || !lastName) {
      throw new Error("Magento 2: email, firstName, and lastName are required for customer create");
    }
    const body: Record<string, unknown> = {
      customer: { email, firstname: firstName, lastname: lastName },
    };
    const addFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (addFields && typeof addFields === "object") {
      const cust = body.customer as Record<string, unknown>;
      if (addFields.websiteId) cust.website_id = parseNum(addFields.websiteId);
      if (addFields.storeId) cust.store_id = parseNum(addFields.storeId);
      if (addFields.groupId) cust.group_id = parseNum(addFields.groupId);
      if (addFields.prefix) cust.prefix = String(addFields.prefix);
      if (addFields.middlename) cust.middlename = String(addFields.middlename);
      if (addFields.suffix) cust.suffix = String(addFields.suffix);
      if (addFields.dob) cust.dob = String(addFields.dob);
      if (addFields.taxVat) cust.taxvat = String(addFields.taxVat);
      if (addFields.gender) cust.gender = parseNum(addFields.gender);
      if (addFields.confirmation) cust.confirmation = String(addFields.confirmation);
      if (addFields.sendEmail) cust.sendemail = Boolean(addFields.sendEmail);
    }
    return apiRequest("POST", host, "/customers", token, body);
  }

  if (operation === "delete") {
    const customerId = String(resolveValue(node.parameters.customerId, itemJson) ?? "");
    if (!customerId) throw new Error("Magento 2: customerId is required for customer delete");
    await apiRequest("DELETE", host, `/customers/${customerId}`, token);
    return "passthrough";
  }

  if (operation === "get") {
    const customerId = String(resolveValue(node.parameters.customerId, itemJson) ?? "");
    if (!customerId) throw new Error("Magento 2: customerId is required for customer get");
    return apiRequest("GET", host, `/customers/${customerId}`, token);
  }

  if (operation === "getAll") {
    const limit = getListLimit(node);
    const raw = await apiRequest("GET", host, "/customers/search", token, undefined, {
      "searchCriteria[pageSize]": String(limit),
      "searchCriteria[currentPage]": "1",
    });
    const items = (raw as Record<string, unknown>).items as unknown[] | undefined;
    return Array.isArray(items) ? items : [raw];
  }

  if (operation === "update") {
    const customerId = String(resolveValue(node.parameters.customerId, itemJson) ?? "");
    if (!customerId) throw new Error("Magento 2: customerId is required for customer update");
    const up = node.parameters.updateFields as Record<string, unknown> | undefined;
    const cust: Record<string, unknown> = {};
    if (up && typeof up === "object") {
      if (up.email) cust.email = String(up.email);
      if (up.firstName) cust.firstname = String(up.firstName);
      if (up.lastName) cust.lastname = String(up.lastName);
      if (up.website_id) cust.website_id = parseNum(up.website_id);
    }
    return apiRequest("PUT", host, `/customers/${customerId}`, token, { customer: cust });
  }

  throw new Error(`Magento 2: unsupported customer operation "${operation}"`);
}

async function runInvoice(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  host: string,
  token: string,
): Promise<Record<string, unknown> | "passthrough"> {
  if (operation === "create") {
    const orderId = String(resolveValue(node.parameters.orderId, itemJson) ?? "");
    if (!orderId) throw new Error("Magento 2: orderId is required for invoice create");
    const body: Record<string, unknown> = {};
    const items = extractItems(node.parameters.items);
    if (items.length > 0) body.items = items;
    if (node.parameters.notify) body.notify = true;
    if (node.parameters.appendComment) {
      body.appendComment = true;
      if (node.parameters.comment) body.comment = { comment: String(node.parameters.comment) };
    }
    if (node.parameters.capture) body.capture = Boolean(node.parameters.capture);
    return apiRequest("POST", host, `/invoice/${orderId}/create`, token, body);
  }
  throw new Error(`Magento 2: unsupported invoice operation "${operation}"`);
}

async function runOrder(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  host: string,
  token: string,
): Promise<Record<string, unknown> | Record<string, unknown>[] | "passthrough"> {
  if (operation === "cancel") {
    const orderId = String(resolveValue(node.parameters.orderId, itemJson) ?? "");
    if (!orderId) throw new Error("Magento 2: orderId is required for order cancel");
    await apiRequest("POST", host, `/orders/${orderId}/cancel`, token);
    return "passthrough";
  }

  if (operation === "get") {
    const orderId = String(resolveValue(node.parameters.orderId, itemJson) ?? "");
    if (!orderId) throw new Error("Magento 2: orderId is required for order get");
    return apiRequest("GET", host, `/orders/${orderId}`, token);
  }

  if (operation === "getAll") {
    const limit = getListLimit(node);
    const raw = await apiRequest("GET", host, "/orders/search", token, undefined, {
      "searchCriteria[pageSize]": String(limit),
      "searchCriteria[currentPage]": "1",
    });
    const items = (raw as Record<string, unknown>).items as unknown[] | undefined;
    return Array.isArray(items) ? items : [raw];
  }

  if (operation === "ship") {
    const orderId = String(resolveValue(node.parameters.orderId, itemJson) ?? "");
    if (!orderId) throw new Error("Magento 2: orderId is required for order ship");
    const body: Record<string, unknown> = {};
    const items = extractItems(node.parameters.items);
    if (items.length > 0) body.items = items;
    if (node.parameters.notify) body.notify = true;
    if (node.parameters.appendComment && node.parameters.comment) {
      body.comment = { comment: String(node.parameters.comment) };
    }
    const tracks = extractTracks(node.parameters.tracks);
    if (tracks.length > 0) {
      body.tracks = tracks.map((t) => ({
        trackNumber: String(t.trackNumber ?? ""),
        title: String(t.title ?? ""),
        carrierCode: String(t.carrierCode ?? ""),
      }));
    }
    return apiRequest("POST", host, `/order/${orderId}/ship`, token, body);
  }

  throw new Error(`Magento 2: unsupported order operation "${operation}"`);
}

async function runProduct(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  host: string,
  token: string,
): Promise<Record<string, unknown> | Record<string, unknown>[] | "passthrough"> {
  if (operation === "create") {
    const sku = String(resolveValue(node.parameters.sku, itemJson) ?? "");
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const attributeSetId = parseNum(resolveValue(node.parameters.attributeSetId, itemJson));
    const price = parseNum(resolveValue(node.parameters.price, itemJson));
    if (!sku || !name || !attributeSetId || !price) {
      throw new Error("Magento 2: sku, name, attributeSetId, and price are required for product create");
    }
    const product: Record<string, unknown> = {
      sku,
      name,
      attribute_set_id: attributeSetId,
      price,
    };
    const addFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
    if (addFields && typeof addFields === "object") {
      if (addFields.status) product.status = parseNum(addFields.status);
      if (addFields.visibility) product.visibility = parseNum(addFields.visibility);
      if (addFields.typeId) product.type_id = String(addFields.typeId);
      if (addFields.weight) product.weight = parseNum(addFields.weight);
      if (addFields.taxClassId) product.tax_class_id = parseNum(addFields.taxClassId);
      if (addFields.description) product.description = String(addFields.description);
      if (addFields.shortDescription) product.short_description = String(addFields.shortDescription);
      if (addFields.metaTitle) product.meta_title = String(addFields.metaTitle);
      if (addFields.metaKeyword) product.meta_keyword = String(addFields.metaKeyword);
      if (addFields.metaDescription) product.meta_description = String(addFields.metaDescription);
    }
    return apiRequest("POST", host, "/products", token, { product });
  }

  if (operation === "delete") {
    const sku = String(resolveValue(node.parameters.sku, itemJson) ?? "");
    if (!sku) throw new Error("Magento 2: sku is required for product delete");
    await apiRequest("DELETE", host, `/products/${encodeURIComponent(sku)}`, token);
    return "passthrough";
  }

  if (operation === "get") {
    const sku = String(resolveValue(node.parameters.sku, itemJson) ?? "");
    if (!sku) throw new Error("Magento 2: sku is required for product get");
    return apiRequest("GET", host, `/products/${encodeURIComponent(sku)}`, token);
  }

  if (operation === "getAll") {
    const limit = getListLimit(node);
    const raw = await apiRequest("GET", host, "/products/search", token, undefined, {
      "searchCriteria[pageSize]": String(limit),
      "searchCriteria[currentPage]": "1",
    });
    const items = (raw as Record<string, unknown>).items as unknown[] | undefined;
    return Array.isArray(items) ? items : [raw];
  }

  if (operation === "update") {
    const sku = String(resolveValue(node.parameters.sku, itemJson) ?? "");
    if (!sku) throw new Error("Magento 2: sku is required for product update");
    const up = node.parameters.updateFields as Record<string, unknown> | undefined;
    const product: Record<string, unknown> = {};
    if (up && typeof up === "object") {
      if (up.name) product.name = String(up.name);
      if (up.attributeSetId) product.attribute_set_id = parseNum(up.attributeSetId);
      if (up.price) product.price = parseNum(up.price);
    }
    return apiRequest("PUT", host, `/products/${encodeURIComponent(sku)}`, token, { product });
  }

  throw new Error(`Magento 2: unsupported product operation "${operation}"`);
}

function getListLimit(node: INode): number {
  if (node.parameters.returnAll) return 200;
  return parseNum(node.parameters.limit) || 50;
}

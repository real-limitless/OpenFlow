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

async function apiRequest(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${baseUrl.replace(/\/+$/, "")}${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      "Api-Token": apiKey,
      Accept: "application/json",
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
    }
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

    if (response.status === 204) return {};
    const obj = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { data: parsed };

    if (response.status < 200 || response.status >= 300) {
      const errMsg = String((obj as Record<string, unknown>).message ?? obj as string ?? `ActiveCampaign API error: ${response.status}`);
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return obj;
  } finally {
    clearTimeout(timer);
  }
}

async function getAuth(ctx: ExecutionContext): Promise<{ baseUrl: string; apiKey: string }> {
  const cred = await ctx.getCredential("activeCampaignApi");
  if (!cred) throw new Error("ActiveCampaign: credential 'activeCampaignApi' is required");
  const data = cred as Record<string, unknown>;
  const baseUrl = String(data.url ?? data.apiUrl ?? data.api_url ?? "");
  const apiKey = String(data.apiKey ?? data.api_key ?? data.apiToken ?? "");
  if (!baseUrl || !apiKey) throw new Error("ActiveCampaign: credential must include apiUrl and apiKey");
  return { baseUrl, apiKey };
}

function p(key: string, node: INode, itemJson: Record<string, unknown>): unknown {
  return resolveValue(node.parameters[key], itemJson);
}

function ps(key: string, node: INode, itemJson: Record<string, unknown>): string {
  return String(resolveValue(node.parameters[key], itemJson) ?? "");
}

function pn(key: string, node: INode, itemJson: Record<string, unknown>): number {
  return Number(resolveValue(node.parameters[key], itemJson) ?? 0);
}

export const activeCampaignExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "contact");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const { baseUrl, apiKey } = await getAuth(ctx);
      const result = await runOperation(baseUrl, apiKey, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  baseUrl: string,
  apiKey: string,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown> }[]> {
  switch (resource) {
    case "contact": return runContact(baseUrl, apiKey, node, operation, itemJson);
    case "contactList": return runContactList(baseUrl, apiKey, node, operation, itemJson);
    case "contactTag": return runContactTag(baseUrl, apiKey, node, operation, itemJson);
    case "account": return runAccount(baseUrl, apiKey, node, operation, itemJson);
    case "accountContact": return runAccountContact(baseUrl, apiKey, node, operation, itemJson);
    case "connection": return runConnection(baseUrl, apiKey, node, operation, itemJson);
    case "deal": return runDeal(baseUrl, apiKey, node, operation, itemJson);
    case "ecommerceOrder": return runEcommerceOrder(baseUrl, apiKey, node, operation, itemJson);
    case "ecommerceCustomer": return runEcommerceCustomer(baseUrl, apiKey, node, operation, itemJson);
    case "ecommerceOrderProducts": return runEcommerceOrderProducts(baseUrl, apiKey, node, operation, itemJson);
    case "list": return runList(baseUrl, apiKey, node, operation, itemJson);
    case "tag": return runTag(baseUrl, apiKey, node, operation, itemJson);
    default: throw new Error(`ActiveCampaign: unsupported resource "${resource}"`);
  }
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

async function runContact(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const contact: Record<string, unknown> = {
      email: ps("email", node, itemJson),
    };
    const firstName = ps("firstName", node, itemJson);
    const lastName = ps("lastName", node, itemJson);
    const phone = ps("phone", node, itemJson);
    if (firstName) contact.firstName = firstName;
    if (lastName) contact.lastName = lastName;
    if (phone) contact.phone = phone;
    const fieldValues = node.parameters.fieldValues;
    if (fieldValues) {
      contact.fieldValues = fieldValues;
    }
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/contacts", { contact });
    return { json: { contact: res.contact ?? {} } };
  }

  if (operation === "update") {
    const contactId = ps("contactId", node, itemJson);
    const update: Record<string, unknown> = {};
    const email = ps("email", node, itemJson);
    const firstName = ps("firstName", node, itemJson);
    const lastName = ps("lastName", node, itemJson);
    const phone = ps("phone", node, itemJson);
    if (email) update.email = email;
    if (firstName) update.firstName = firstName;
    if (lastName) update.lastName = lastName;
    if (phone) update.phone = phone;
    const fieldValues = node.parameters.fieldValues;
    if (fieldValues) update.fieldValues = fieldValues;
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/contacts/${contactId}`, { contact: update });
    return { json: { contact: res.contact ?? {} } };
  }

  if (operation === "delete") {
    const contactId = ps("contactId", node, itemJson);
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/contacts/${contactId}`);
    return { json: { deleted: true, contactId } };
  }

  if (operation === "get") {
    const contactId = ps("contactId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/contacts/${contactId}`);
    return { json: { contact: res.contact ?? {} } };
  }

  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const returnAll = !!node.parameters.returnAll;
    const params: Record<string, string> = {};
    if (!returnAll) {
      params.limit = String(limit);
      params.offset = String(offset);
    }
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/contacts", undefined, params);
    const contacts = (res.contacts ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { contacts, meta } };
  }

  throw new Error(`ActiveCampaign: unsupported contact operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Contact List
// ---------------------------------------------------------------------------

async function runContactList(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const contactId = ps("contactId", node, itemJson);
  const listId = ps("listId", node, itemJson);

  if (operation === "add") {
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/contactLists", {
      contactList: { contact: contactId, list: listId },
    });
    return { json: { contactList: res.contactList ?? {} } };
  }

  if (operation === "remove") {
    const contactListId = ps("contactListId", node, itemJson) || `${contactId}-${listId}`;
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/contactLists/${contactListId}`);
    return { json: { deleted: true, contactId, listId } };
  }

  throw new Error(`ActiveCampaign: unsupported contactList operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Contact Tag
// ---------------------------------------------------------------------------

async function runContactTag(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const contactId = ps("contactId", node, itemJson);
  const tagId = ps("tagId", node, itemJson);

  if (operation === "add") {
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/contactTags", {
      contactTag: { contact: contactId, tag: tagId },
    });
    return { json: { contactTag: res.contactTag ?? {} } };
  }

  if (operation === "remove") {
    const contactTagId = ps("contactTagId", node, itemJson) || `${contactId}-${tagId}`;
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/contactTags/${contactTagId}`);
    return { json: { deleted: true, contactId, tagId } };
  }

  throw new Error(`ActiveCampaign: unsupported contactTag operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

async function runAccount(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const account: Record<string, unknown> = { name: ps("name", node, itemJson) };
    const accountUrl = ps("accountUrl", node, itemJson);
    if (accountUrl) account.accountUrl = accountUrl;
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/accounts", { account });
    return { json: { account: res.account ?? {} } };
  }

  if (operation === "update") {
    const accountId = ps("accountId", node, itemJson);
    const account: Record<string, unknown> = {};
    const name = ps("name", node, itemJson);
    const accountUrl = ps("accountUrl", node, itemJson);
    if (name) account.name = name;
    if (accountUrl) account.accountUrl = accountUrl;
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/accounts/${accountId}`, { account });
    return { json: { account: res.account ?? {} } };
  }

  if (operation === "delete") {
    const accountId = ps("accountId", node, itemJson);
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/accounts/${accountId}`);
    return { json: { deleted: true, accountId } };
  }

  if (operation === "get") {
    const accountId = ps("accountId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/accounts/${accountId}`);
    return { json: { account: res.account ?? {} } };
  }

  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const returnAll = !!node.parameters.returnAll;
    const params: Record<string, string> = {};
    if (!returnAll) {
      params.limit = String(limit);
      params.offset = String(offset);
    }
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/accounts", undefined, params);
    const accounts = (res.accounts ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { accounts, meta } };
  }

  throw new Error(`ActiveCampaign: unsupported account operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Account Contact
// ---------------------------------------------------------------------------

async function runAccountContact(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const body = {
      accountContact: {
        contact: ps("contactId", node, itemJson),
        account: ps("accountId", node, itemJson),
        jobTitle: ps("jobTitle", node, itemJson),
      },
    };
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/accountContacts", body);
    return { json: { accountContact: res.accountContact ?? {} } };
  }

  if (operation === "delete") {
    const accountContactId = ps("accountContactId", node, itemJson);
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/accountContacts/${accountContactId}`);
    return { json: { deleted: true, accountContactId } };
  }

  if (operation === "update") {
    const accountContactId = ps("accountContactId", node, itemJson);
    const body = {
      accountContact: { jobTitle: ps("jobTitle", node, itemJson) },
    };
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/accountContacts/${accountContactId}`, body);
    return { json: { accountContact: res.accountContact ?? {} } };
  }

  throw new Error(`ActiveCampaign: unsupported accountContact operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

async function runConnection(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const body = {
      connection: {
        service: ps("service", node, itemJson),
        externalid: ps("externalid", node, itemJson),
        externalAccountId: ps("externalAccountId", node, itemJson),
        logoUrl: ps("logoUrl", node, itemJson),
        linkUrl: ps("linkUrl", node, itemJson),
      },
    };
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/connections", body);
    return { json: { connection: res.connection ?? {} } };
  }

  if (operation === "update") {
    const connectionId = ps("connectionId", node, itemJson);
    const connection: Record<string, unknown> = {};
    const service = ps("service", node, itemJson);
    const externalid = ps("externalid", node, itemJson);
    const externalAccountId = ps("externalAccountId", node, itemJson);
    const logoUrl = ps("logoUrl", node, itemJson);
    const linkUrl = ps("linkUrl", node, itemJson);
    if (service) connection.service = service;
    if (externalid) connection.externalid = externalid;
    if (externalAccountId) connection.externalAccountId = externalAccountId;
    if (logoUrl) connection.logoUrl = logoUrl;
    if (linkUrl) connection.linkUrl = linkUrl;
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/connections/${connectionId}`, { connection });
    return { json: { connection: res.connection ?? {} } };
  }

  if (operation === "delete") {
    const connectionId = ps("connectionId", node, itemJson);
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/connections/${connectionId}`);
    return { json: { deleted: true, connectionId } };
  }

  if (operation === "get") {
    const connectionId = ps("connectionId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/connections/${connectionId}`);
    return { json: { connection: res.connection ?? {} } };
  }

  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const params: Record<string, string> = {};
    if (limit) params.limit = String(limit);
    if (offset) params.offset = String(offset);
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/connections", undefined, params);
    const connections = (res.connections ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { connections, meta } };
  }

  throw new Error(`ActiveCampaign: unsupported connection operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

async function runDeal(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const body = {
      deal: {
        title: ps("title", node, itemJson),
        contact: ps("contactId", node, itemJson),
        value: ps("value", node, itemJson),
        currency: ps("currency", node, itemJson),
        pipeline: ps("pipelineId", node, itemJson),
        stage: ps("stageId", node, itemJson),
        owner: ps("owner", node, itemJson),
        description: ps("description", node, itemJson),
      },
    };
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/deals", body);
    return { json: { deal: res.deal ?? {} } };
  }

  if (operation === "update") {
    const dealId = ps("dealId", node, itemJson);
    const deal: Record<string, unknown> = {};
    const title = ps("title", node, itemJson);
    const value = ps("value", node, itemJson);
    const currency = ps("currency", node, itemJson);
    const stage = ps("stageId", node, itemJson);
    const owner = ps("owner", node, itemJson);
    const description = ps("description", node, itemJson);
    if (title) deal.title = title;
    if (value) deal.value = value;
    if (currency) deal.currency = currency;
    if (stage) deal.stage = stage;
    if (owner) deal.owner = owner;
    if (description) deal.description = description;
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/deals/${dealId}`, { deal });
    return { json: { deal: res.deal ?? {} } };
  }

  if (operation === "delete") {
    const dealId = ps("dealId", node, itemJson);
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/deals/${dealId}`);
    return { json: { deleted: true, dealId } };
  }

  if (operation === "get") {
    const dealId = ps("dealId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/deals/${dealId}`);
    return { json: { deal: res.deal ?? {} } };
  }

  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const returnAll = !!node.parameters.returnAll;
    const params: Record<string, string> = {};
    if (!returnAll) {
      params.limit = String(limit);
      params.offset = String(offset);
    }
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/deals", undefined, params);
    const deals = (res.deals ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { deals, meta } };
  }

  if (operation === "createNote") {
    const dealId = ps("dealId", node, itemJson);
    const note = ps("note", node, itemJson);
    const body = { note: { note, reltype: "deal", relid: parseInt(dealId, 10) } };
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/notes", body);
    return { json: { note: res.note ?? {} } };
  }

  if (operation === "updateNote") {
    const dealNoteId = ps("dealNoteId", node, itemJson);
    const note = ps("note", node, itemJson);
    const body = { note: { note } };
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/notes/${dealNoteId}`, body);
    return { json: { note: res.note ?? {} } };
  }

  throw new Error(`ActiveCampaign: unsupported deal operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// E-commerce Order
// ---------------------------------------------------------------------------

async function runEcommerceOrder(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const body = {
      ecomOrder: {
        source: ps("source", node, itemJson),
        email: ps("email", node, itemJson),
        total: ps("total", node, itemJson),
        currency: ps("currency", node, itemJson),
        orderDate: ps("orderDate", node, itemJson),
        orderProducts: resolveValue(node.parameters.orderProducts, itemJson) ?? [],
        shippingAmount: ps("shippingAmount", node, itemJson),
        taxAmount: ps("taxAmount", node, itemJson),
        discountAmount: ps("discountAmount", node, itemJson),
        notes: ps("notes", node, itemJson),
      },
    };
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/ecomOrders", body);
    return { json: { ecomOrder: res.ecomOrder ?? {} } };
  }

  if (operation === "update") {
    const orderId = ps("orderId", node, itemJson);
    const ecomOrder: Record<string, unknown> = {};
    const total = ps("total", node, itemJson);
    const currency = ps("currency", node, itemJson);
    const orderProducts = resolveValue(node.parameters.orderProducts, itemJson);
    const shippingAmount = ps("shippingAmount", node, itemJson);
    const taxAmount = ps("taxAmount", node, itemJson);
    const discountAmount = ps("discountAmount", node, itemJson);
    const notes = ps("notes", node, itemJson);
    if (total) ecomOrder.total = total;
    if (currency) ecomOrder.currency = currency;
    if (orderProducts) ecomOrder.orderProducts = orderProducts;
    if (shippingAmount) ecomOrder.shippingAmount = shippingAmount;
    if (taxAmount) ecomOrder.taxAmount = taxAmount;
    if (discountAmount) ecomOrder.discountAmount = discountAmount;
    if (notes) ecomOrder.notes = notes;
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/ecomOrders/${orderId}`, { ecomOrder });
    return { json: { ecomOrder: res.ecomOrder ?? {} } };
  }

  if (operation === "delete") {
    const orderId = ps("orderId", node, itemJson);
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/ecomOrders/${orderId}`);
    return { json: { deleted: true, orderId } };
  }

  if (operation === "get") {
    const orderId = ps("orderId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/ecomOrders/${orderId}`);
    return { json: { ecomOrder: res.ecomOrder ?? {} } };
  }

  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const returnAll = !!node.parameters.returnAll;
    const params: Record<string, string> = {};
    if (!returnAll) {
      params.limit = String(limit);
      params.offset = String(offset);
    }
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/ecomOrders", undefined, params);
    const ecomOrders = (res.ecomOrders ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { ecomOrders, meta } };
  }

  throw new Error(`ActiveCampaign: unsupported ecommerceOrder operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// E-commerce Customer
// ---------------------------------------------------------------------------

async function runEcommerceCustomer(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const ecomCustomer: Record<string, unknown> = {
      email: ps("email", node, itemJson),
      connectionId: ps("connectionId", node, itemJson),
    };
    const firstName = ps("firstName", node, itemJson);
    const lastName = ps("lastName", node, itemJson);
    if (firstName) ecomCustomer.firstName = firstName;
    if (lastName) ecomCustomer.lastName = lastName;
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/ecomCustomers", { ecomCustomer });
    return { json: { ecomCustomer: res.ecomCustomer ?? {} } };
  }

  if (operation === "update") {
    const customerId = ps("customerId", node, itemJson);
    const ecomCustomer: Record<string, unknown> = {};
    const email = ps("email", node, itemJson);
    const firstName = ps("firstName", node, itemJson);
    const lastName = ps("lastName", node, itemJson);
    if (email) ecomCustomer.email = email;
    if (firstName) ecomCustomer.firstName = firstName;
    if (lastName) ecomCustomer.lastName = lastName;
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/ecomCustomers/${customerId}`, { ecomCustomer });
    return { json: { ecomCustomer: res.ecomCustomer ?? {} } };
  }

  if (operation === "delete") {
    const customerId = ps("customerId", node, itemJson);
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/ecomCustomers/${customerId}`);
    return { json: { deleted: true, customerId } };
  }

  if (operation === "get") {
    const customerId = ps("customerId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/ecomCustomers/${customerId}`);
    return { json: { ecomCustomer: res.ecomCustomer ?? {} } };
  }

  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const params: Record<string, string> = {};
    if (limit) params.limit = String(limit);
    if (offset) params.offset = String(offset);
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/ecomCustomers", undefined, params);
    const ecomCustomers = (res.ecomCustomers ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { ecomCustomers, meta } };
  }

  throw new Error(`ActiveCampaign: unsupported ecommerceCustomer operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// E-commerce Order Products
// ---------------------------------------------------------------------------

async function runEcommerceOrderProducts(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const params: Record<string, string> = {};
    if (limit) params.limit = String(limit);
    if (offset) params.offset = String(offset);
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/ecomOrderProducts", undefined, params);
    const ecomOrderProducts = (res.ecomOrderProducts ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { ecomOrderProducts, meta } };
  }

  if (operation === "get") {
    const productId = ps("productId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/ecomOrderProducts/${productId}`);
    return { json: { ecomOrderProduct: res.ecomOrderProduct ?? {} } };
  }

  if (operation === "getByOrderId") {
    const orderId = ps("orderId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/ecomOrders/${orderId}/products`);
    const ecomOrderProducts = (res.ecomOrderProducts ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { ecomOrderProducts, meta } };
  }

  throw new Error(`ActiveCampaign: unsupported ecommerceOrderProducts operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

async function runList(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const params: Record<string, string> = {};
    if (limit) params.limit = String(limit);
    if (offset) params.offset = String(offset);
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/lists", undefined, params);
    const lists = (res.lists ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { lists, meta } };
  }

  throw new Error(`ActiveCampaign: unsupported list operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

async function runTag(
  baseUrl: string,
  apiKey: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const tag: Record<string, unknown> = {
      tag: ps("name", node, itemJson),
      tagType: ps("tagType", node, itemJson),
    };
    const description = ps("description", node, itemJson);
    if (description) tag.description = description;
    const res = await apiRequest(baseUrl, apiKey, "POST", "/api/3/tags", { tag });
    return { json: { tag: res.tag ?? {} } };
  }

  if (operation === "update") {
    const tagId = ps("tagId", node, itemJson);
    const tag: Record<string, unknown> = {};
    const name = ps("name", node, itemJson);
    const tagType = ps("tagType", node, itemJson);
    const description = ps("description", node, itemJson);
    if (name) tag.tag = name;
    if (tagType) tag.tagType = tagType;
    if (description) tag.description = description;
    const res = await apiRequest(baseUrl, apiKey, "PUT", `/api/3/tags/${tagId}`, { tag });
    return { json: { tag: res.tag ?? {} } };
  }

  if (operation === "delete") {
    const tagId = ps("tagId", node, itemJson);
    await apiRequest(baseUrl, apiKey, "DELETE", `/api/3/tags/${tagId}`);
    return { json: { deleted: true, tagId } };
  }

  if (operation === "get") {
    const tagId = ps("tagId", node, itemJson);
    const res = await apiRequest(baseUrl, apiKey, "GET", `/api/3/tags/${tagId}`);
    return { json: { tag: res.tag ?? {} } };
  }

  if (operation === "getAll") {
    const limit = pn("limit", node, itemJson) || 20;
    const offset = pn("offset", node, itemJson) || 0;
    const returnAll = !!node.parameters.returnAll;
    const params: Record<string, string> = {};
    if (!returnAll) {
      params.limit = String(limit);
      params.offset = String(offset);
    }
    const res = await apiRequest(baseUrl, apiKey, "GET", "/api/3/tags", undefined, params);
    const tags = (res.tags ?? []) as Record<string, unknown>[];
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return { json: { tags, meta } };
  }

  throw new Error(`ActiveCampaign: unsupported tag operation "${operation}"`);
}

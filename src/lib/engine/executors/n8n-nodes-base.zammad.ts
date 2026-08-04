import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

interface ZammadCred {
  baseUrl: string;
  authType: string;
  username?: string;
  password?: string;
  accessToken?: string;
  allowUnauthorizedCerts?: boolean;
}

async function getCredential(ctx: ExecutionContext): Promise<ZammadCred> {
  const cred = await ctx.getCredential("zammadApi");
  if (!cred) throw new Error("Zammad: zammadApi credential is not configured");
  return {
    baseUrl: String((cred as Record<string, unknown>).baseUrl ?? "").replace(/\/+$/, ""),
    authType: String((cred as Record<string, unknown>).authType ?? "basicAuth"),
    username: String((cred as Record<string, unknown>).username ?? ""),
    password: String((cred as Record<string, unknown>).password ?? ""),
    accessToken: String((cred as Record<string, unknown>).accessToken ?? ""),
    allowUnauthorizedCerts: Boolean((cred as Record<string, unknown>).allowUnauthorizedCerts),
  };
}

function buildAuthHeaders(cred: ZammadCred): Record<string, string> {
  if (cred.authType === "tokenAuth" && cred.accessToken) {
    return { Authorization: `Token token=${cred.accessToken}` };
  }
  const encoded = btoa(`${cred.username}:${cred.password}`);
  return { Authorization: `Basic ${encoded}` };
}

async function zammadRequest(
  cred: ZammadCred,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const url = new URL(`${cred.baseUrl}/api/v1${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = {
    ...buildAuthHeaders(cred),
    "content-type": "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url.toString(), init);
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const error = String((data as Record<string, unknown>)?.error ?? res.statusText);
    throw new Error(`Zammad: ${error}`);
  }
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }
  return data as Record<string, unknown>;
}

function collectBody(
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const p = node.parameters;
  const rv = (name: string): unknown => resolveValue(p[name], itemJson);

  if (resource === "group" || resource === "organization") {
    const name = rv("name");
    const active = rv("active");
    const note = rv("note");
    if (name) body.name = String(name);
    if (active !== undefined && active !== "") body.active = active;
    if (note) body.note = String(note);
  } else if (resource === "ticket") {
    const title = rv("title");
    if (title) body.title = String(title);
    const group = rv("group");
    if (group) body.group_id = String(group);
    const customer = rv("customer");
    if (customer) body.customer_id = String(customer);
    const priority = rv("priority");
    if (priority) body.priority_id = String(priority);
    const state = rv("state");
    if (state) body.state_id = String(state);
    const owner = rv("owner");
    if (owner) body.owner_id = String(owner);
    const note = rv("note");
    if (note) body.note = String(note);

    if (operation === "create") {
      const articleSubject = rv("articleSubject");
      const articleBody = rv("articleBody");
      if (articleSubject || articleBody) {
        const article: Record<string, unknown> = {};
        if (articleSubject) article.subject = String(articleSubject);
        if (articleBody) article.body = String(articleBody);
        const aType = rv("articleType");
        if (aType) article.type = String(aType);
        const aVisibility = rv("articleVisibility");
        if (aVisibility) article.internal = String(aVisibility) === "internal";
        const aSender = rv("articleSender");
        if (aSender) article.sender = String(aSender);
        body.article = article;
      }
    }
  } else if (resource === "user") {
    const firstname = rv("firstname");
    const lastname = rv("lastname");
    const email = rv("email");
    if (firstname) body.firstname = String(firstname);
    if (lastname) body.lastname = String(lastname);
    if (email) body.email = String(email);
    const active = rv("active");
    if (active !== undefined && active !== "") body.active = active;
    const verified = rv("verified");
    if (verified !== undefined && verified !== "") body.verified = verified;
    const note = rv("note");
    if (note) body.note = String(note);
    const phone = rv("phone");
    if (phone) body.phone = String(phone);
    const organization = rv("organization");
    if (organization) body.organization_id = String(organization);
    const role = rv("role");
    if (role) body.role_ids = String(role);

    const addrStreet = rv("addressStreet");
    const addrCity = rv("addressCity");
    const addrZip = rv("addressZip");
    const addrCountry = rv("addressCountry");
    if (addrStreet) body.street = String(addrStreet);
    if (addrCity) body.city = String(addrCity);
    if (addrZip) body.zip = String(addrZip);
    if (addrCountry) body.country = String(addrCountry);
  }

  return body;
}

export const zammadExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "group");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  const cred = await getCredential(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(cred, node, resource, operation, itemJson);
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

async function runOperation(
  cred: ZammadCred,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (resource) {
    case "group":
      return runGroupOperation(cred, node, operation, itemJson);
    case "organization":
      return runOrganizationOperation(cred, node, operation, itemJson);
    case "ticket":
      return runTicketOperation(cred, node, operation, itemJson);
    case "user":
      return runUserOperation(cred, node, operation, itemJson);
    default:
      throw new Error(`Zammad: unsupported resource "${resource}"`);
  }
}

function getResourceId(node: INode, resource: string, itemJson: Record<string, unknown>): string {
  const paramName = `${resource}Id`;
  return String(resolveValue(node.parameters[paramName] ?? node.parameters.id, itemJson) ?? "");
}

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

async function runGroupOperation(
  cred: ZammadCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const body = collectBody(node, "group", operation, itemJson);
    if (!body.name) throw new Error("Zammad: name is required for group create");
    return await zammadRequest(cred, "POST", "/groups", body);
  }
  if (operation === "get") {
    const id = getResourceId(node, "group", itemJson);
    if (!id) throw new Error("Zammad: groupId is required for group get");
    return await zammadRequest(cred, "GET", `/groups/${id}`);
  }
  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const limit = node.parameters.limit;
    if (limit) params.per_page = String(limit);
    const page = node.parameters.page;
    if (page) params.page = String(page);
    return await zammadRequest(cred, "GET", "/groups", undefined, params);
  }
  if (operation === "update") {
    const id = getResourceId(node, "group", itemJson);
    if (!id) throw new Error("Zammad: groupId is required for group update");
    const body = collectBody(node, "group", operation, itemJson);
    if (Object.keys(body).length === 0) throw new Error("Zammad: No update data provided");
    return await zammadRequest(cred, "PUT", `/groups/${id}`, body);
  }
  if (operation === "delete") {
    const id = getResourceId(node, "group", itemJson);
    if (!id) throw new Error("Zammad: groupId is required for group delete");
    return await zammadRequest(cred, "DELETE", `/groups/${id}`);
  }
  throw new Error(`Zammad: unsupported group operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

async function runOrganizationOperation(
  cred: ZammadCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const body = collectBody(node, "organization", operation, itemJson);
    if (!body.name) throw new Error("Zammad: name is required for organization create");
    return await zammadRequest(cred, "POST", "/organizations", body);
  }
  if (operation === "get") {
    const id = getResourceId(node, "organization", itemJson);
    if (!id) throw new Error("Zammad: organizationId is required for organization get");
    return await zammadRequest(cred, "GET", `/organizations/${id}`);
  }
  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const limit = node.parameters.limit;
    if (limit) params.per_page = String(limit);
    const page = node.parameters.page;
    if (page) params.page = String(page);
    return await zammadRequest(cred, "GET", "/organizations", undefined, params);
  }
  if (operation === "update") {
    const id = getResourceId(node, "organization", itemJson);
    if (!id) throw new Error("Zammad: organizationId is required for organization update");
    const body = collectBody(node, "organization", operation, itemJson);
    if (Object.keys(body).length === 0) throw new Error("Zammad: No update data provided");
    return await zammadRequest(cred, "PUT", `/organizations/${id}`, body);
  }
  if (operation === "delete") {
    const id = getResourceId(node, "organization", itemJson);
    if (!id) throw new Error("Zammad: organizationId is required for organization delete");
    return await zammadRequest(cred, "DELETE", `/organizations/${id}`);
  }
  throw new Error(`Zammad: unsupported organization operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

async function runTicketOperation(
  cred: ZammadCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const body = collectBody(node, "ticket", operation, itemJson);
    if (!body.title) throw new Error("Zammad: title is required for ticket create");
    return await zammadRequest(cred, "POST", "/tickets", body);
  }
  if (operation === "get") {
    const id = getResourceId(node, "ticket", itemJson);
    if (!id) throw new Error("Zammad: ticketId is required for ticket get");
    return await zammadRequest(cred, "GET", `/tickets/${id}`);
  }
  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const limit = node.parameters.limit;
    if (limit) params.per_page = String(limit);
    const page = node.parameters.page;
    if (page) params.page = String(page);
    return await zammadRequest(cred, "GET", "/tickets", undefined, params);
  }
  if (operation === "update") {
    const id = getResourceId(node, "ticket", itemJson);
    if (!id) throw new Error("Zammad: ticketId is required for ticket update");
    const body = collectBody(node, "ticket", operation, itemJson);
    if (Object.keys(body).length === 0) throw new Error("Zammad: No update data provided");
    return await zammadRequest(cred, "PUT", `/tickets/${id}`, body);
  }
  if (operation === "delete") {
    const id = getResourceId(node, "ticket", itemJson);
    if (!id) throw new Error("Zammad: ticketId is required for ticket delete");
    return await zammadRequest(cred, "DELETE", `/tickets/${id}`);
  }
  throw new Error(`Zammad: unsupported ticket operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

async function runUserOperation(
  cred: ZammadCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const body = collectBody(node, "user", operation, itemJson);
    if (!body.firstname) throw new Error("Zammad: firstname is required for user create");
    if (!body.lastname) throw new Error("Zammad: lastname is required for user create");
    if (!body.email) throw new Error("Zammad: email is required for user create");
    return await zammadRequest(cred, "POST", "/users", body);
  }
  if (operation === "get") {
    const id = getResourceId(node, "user", itemJson);
    if (!id) throw new Error("Zammad: userId is required for user get");
    return await zammadRequest(cred, "GET", `/users/${id}`);
  }
  if (operation === "getAll") {
    const params: Record<string, string> = {};
    const query = node.parameters.query;
    if (query) params.query = String(query);
    const limit = node.parameters.limit;
    if (limit) params.per_page = String(limit);
    const page = node.parameters.page;
    if (page) params.page = String(page);
    return await zammadRequest(cred, "GET", "/users/search", undefined, params);
  }
  if (operation === "getSelf") {
    return await zammadRequest(cred, "GET", "/users/me");
  }
  if (operation === "update") {
    const id = getResourceId(node, "user", itemJson);
    if (!id) throw new Error("Zammad: userId is required for user update");
    const body = collectBody(node, "user", operation, itemJson);
    if (Object.keys(body).length === 0) throw new Error("Zammad: No update data provided");
    return await zammadRequest(cred, "PUT", `/users/${id}`, body);
  }
  if (operation === "delete") {
    const id = getResourceId(node, "user", itemJson);
    if (!id) throw new Error("Zammad: userId is required for user delete");
    return await zammadRequest(cred, "DELETE", `/users/${id}`);
  }
  throw new Error(`Zammad: unsupported user operation "${operation}"`);
}
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

interface ZendeskCred {
  subdomain: string;
  email?: string;
  apiToken?: string;
  accessToken?: string;
}

async function getCredential(ctx: ExecutionContext, authentication: string): Promise<ZendeskCred> {
  if (authentication === "oAuth2") {
    const cred = await ctx.getCredential("zendeskOAuth2Api");
    if (!cred) throw new Error("Zendesk: zendeskOAuth2Api credential is not configured");
    return {
      subdomain: String(cred.subdomain ?? ""),
      accessToken: String(cred.accessToken ?? ""),
    };
  }
  const cred = await ctx.getCredential("zendeskApi");
  if (!cred) throw new Error("Zendesk: zendeskApi credential is not configured");
  return {
    subdomain: String(cred.subdomain ?? ""),
    email: String(cred.email ?? ""),
    apiToken: String(cred.apiToken ?? ""),
  };
}

function buildAuthHeaders(cred: ZendeskCred): Record<string, string> {
  if (cred.accessToken) {
    return { Authorization: `Bearer ${cred.accessToken}` };
  }
  const encoded = btoa(`${cred.email}/token:${cred.apiToken}`);
  return { Authorization: `Basic ${encoded}` };
}

async function zendeskRequest(
  cred: ZendeskCred,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = `https://${cred.subdomain}.zendesk.com/api/v2`;
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = {
    ...buildAuthHeaders(cred),
    "content-type": "application/json",
  };
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const error = String((data as Record<string, unknown>)?.error ?? res.statusText);
    throw new Error(`Zendesk: ${error}`);
  }
  return data;
}

export const zendeskExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "ticket");
  const operation = String(node.parameters.operation ?? "getAll");
  const authentication = String(node.parameters.authentication ?? "apiToken");
  const continueOnFail = ctx.continueOnFail();

  const cred = await getCredential(ctx, authentication);

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
  cred: ZendeskCred,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (resource) {
    case "ticket":
      return runTicketOperation(cred, node, operation, itemJson);
    case "ticketField":
      return runTicketFieldOperation(cred, node, operation, itemJson);
    case "user":
      return runUserOperation(cred, node, operation, itemJson);
    case "organization":
      return runOrganizationOperation(cred, node, operation, itemJson);
    default:
      throw new Error(`Zendesk: unsupported resource "${resource}"`);
  }
}

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

async function runTicketOperation(
  cred: ZendeskCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    const data = await zendeskRequest(cred, "POST", "/tickets.json", body);
    return data;
  }
  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for delete");
    await zendeskRequest(cred, "DELETE", `/tickets/${id}.json`);
    return { deleted: true, id };
  }
  if (operation === "get") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for get");
    return await zendeskRequest(cred, "GET", `/tickets/${id}.json`);
  }
  if (operation === "getAll") {
    const raw = resolveValue(node.parameters.queryParameters, itemJson);
    const params = typeof raw === "string" && raw ? JSON.parse(raw) : undefined;
    return await zendeskRequest(cred, "GET", "/tickets.json", undefined, params);
  }
  if (operation === "recover") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for recover");
    return await zendeskRequest(cred, "PUT", `/suspended_tickets/${id}/recover.json`);
  }
  if (operation === "update") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for update");
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await zendeskRequest(cred, "PUT", `/tickets/${id}.json`, body);
  }
  throw new Error(`Zendesk: unsupported ticket operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Ticket Field
// ---------------------------------------------------------------------------

async function runTicketFieldOperation(
  cred: ZendeskCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "get") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for get ticket field");
    return await zendeskRequest(cred, "GET", `/ticket_fields/${id}.json`);
  }
  if (operation === "getAll") {
    const raw = resolveValue(node.parameters.queryParameters, itemJson);
    const params = typeof raw === "string" && raw ? JSON.parse(raw) : undefined;
    return await zendeskRequest(cred, "GET", "/ticket_fields.json", undefined, params);
  }
  throw new Error(`Zendesk: unsupported ticket field operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

async function runUserOperation(
  cred: ZendeskCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await zendeskRequest(cred, "POST", "/users.json", body);
  }
  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for delete user");
    await zendeskRequest(cred, "DELETE", `/users/${id}.json`);
    return { deleted: true, id };
  }
  if (operation === "get") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for get user");
    return await zendeskRequest(cred, "GET", `/users/${id}.json`);
  }
  if (operation === "getAll") {
    const raw = resolveValue(node.parameters.queryParameters, itemJson);
    const params = typeof raw === "string" && raw ? JSON.parse(raw) : undefined;
    return await zendeskRequest(cred, "GET", "/users.json", undefined, params);
  }
  if (operation === "getOrganizations") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for get organizations");
    return await zendeskRequest(cred, "GET", `/users/${id}/organizations.json`);
  }
  if (operation === "getUserData") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for get user data");
    return await zendeskRequest(cred, "GET", `/users/${id}.json`);
  }
  if (operation === "search") {
    const raw = resolveValue(node.parameters.queryParameters, itemJson);
    const params = typeof raw === "string" && raw ? JSON.parse(raw) : undefined;
    return await zendeskRequest(cred, "GET", "/users/search.json", undefined, params);
  }
  if (operation === "update") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for update user");
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await zendeskRequest(cred, "PUT", `/users/${id}.json`, body);
  }
  throw new Error(`Zendesk: unsupported user operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

async function runOrganizationOperation(
  cred: ZendeskCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "count") {
    return await zendeskRequest(cred, "GET", "/organizations/count.json");
  }
  if (operation === "create") {
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await zendeskRequest(cred, "POST", "/organizations.json", body);
  }
  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for delete organization");
    await zendeskRequest(cred, "DELETE", `/organizations/${id}.json`);
    return { deleted: true, id };
  }
  if (operation === "get") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for get organization");
    return await zendeskRequest(cred, "GET", `/organizations/${id}.json`);
  }
  if (operation === "getAll") {
    const raw = resolveValue(node.parameters.queryParameters, itemJson);
    const params = typeof raw === "string" && raw ? JSON.parse(raw) : undefined;
    return await zendeskRequest(cred, "GET", "/organizations.json", undefined, params);
  }
  if (operation === "getOrganizationData") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for get organization data");
    return await zendeskRequest(cred, "GET", `/organizations/${id}.json`);
  }
  if (operation === "update") {
    const id = String(resolveValue(node.parameters.id, itemJson) ?? "");
    if (!id) throw new Error("Zendesk: id is required for update organization");
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await zendeskRequest(cred, "PUT", `/organizations/${id}.json`, body);
  }
  throw new Error(`Zendesk: unsupported organization operation "${operation}"`);
}
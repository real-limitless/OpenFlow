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

interface FreshdeskCred {
  domain: string;
  apiKey: string;
}

async function getCredential(ctx: ExecutionContext): Promise<FreshdeskCred> {
  const cred = await ctx.getCredential("freshdeskApi");
  if (!cred) throw new Error("Freshdesk: freshdeskApi credential is not configured");
  return {
    domain: String(cred.domain ?? ""),
    apiKey: String(cred.apiKey ?? ""),
  };
}

async function freshdeskRequest(
  cred: FreshdeskCred,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = `https://${cred.domain}.freshdesk.com/api/v2`;
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${cred.apiKey}:X`)}`,
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
    const error = String((data as Record<string, unknown>)?.description ?? res.statusText);
    throw new Error(`Freshdesk: ${error}`);
  }
  return data;
}

export const freshdeskExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "ticket");
  const operation = String(node.parameters.operation ?? "create");
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
  cred: FreshdeskCred,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (resource) {
    case "contact":
      return runContactOperation(cred, node, operation, itemJson);
    case "ticket":
      return runTicketOperation(cred, node, operation, itemJson);
    default:
      throw new Error(`Freshdesk: unsupported resource "${resource}"`);
  }
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

async function runContactOperation(
  cred: FreshdeskCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await freshdeskRequest(cred, "POST", "/contacts", body);
  }
  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!id) throw new Error("Freshdesk: contactId is required for delete");
    await freshdeskRequest(cred, "DELETE", `/contacts/${id}`);
    return { deleted: true, id };
  }
  if (operation === "get") {
    const id = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!id) throw new Error("Freshdesk: contactId is required for get");
    return await freshdeskRequest(cred, "GET", `/contacts/${id}`);
  }
  if (operation === "getAll") {
    const raw = resolveValue(node.parameters.queryParameters, itemJson);
    const params = typeof raw === "string" && raw ? JSON.parse(raw) : undefined;
    return await freshdeskRequest(cred, "GET", "/contacts", undefined, params as Record<string, string> | undefined);
  }
  if (operation === "update") {
    const id = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!id) throw new Error("Freshdesk: contactId is required for update");
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await freshdeskRequest(cred, "PUT", `/contacts/${id}`, body);
  }
  throw new Error(`Freshdesk: unsupported contact operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

async function runTicketOperation(
  cred: FreshdeskCred,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "create") {
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await freshdeskRequest(cred, "POST", "/tickets", body);
  }
  if (operation === "delete") {
    const id = String(resolveValue(node.parameters.ticketId, itemJson) ?? "");
    if (!id) throw new Error("Freshdesk: ticketId is required for delete");
    await freshdeskRequest(cred, "DELETE", `/tickets/${id}`);
    return { deleted: true, id };
  }
  if (operation === "get") {
    const id = String(resolveValue(node.parameters.ticketId, itemJson) ?? "");
    if (!id) throw new Error("Freshdesk: ticketId is required for get");
    return await freshdeskRequest(cred, "GET", `/tickets/${id}`);
  }
  if (operation === "getAll") {
    const raw = resolveValue(node.parameters.queryParameters, itemJson);
    const params = typeof raw === "string" && raw ? JSON.parse(raw) : undefined;
    return await freshdeskRequest(cred, "GET", "/tickets", undefined, params as Record<string, string> | undefined);
  }
  if (operation === "update") {
    const id = String(resolveValue(node.parameters.ticketId, itemJson) ?? "");
    if (!id) throw new Error("Freshdesk: ticketId is required for update");
    const raw = resolveValue(node.parameters.requestFields, itemJson);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : (raw ?? {});
    return await freshdeskRequest(cred, "PUT", `/tickets/${id}`, body);
  }
  throw new Error(`Freshdesk: unsupported ticket operation "${operation}"`);
}

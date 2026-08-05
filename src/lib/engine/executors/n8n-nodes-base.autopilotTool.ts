import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api2.autopilothq.com/v1";

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

function parseJsonArray(raw: unknown): Record<string, unknown>[] {
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

async function apiRequest(
  ctx: ExecutionContext,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const auth = await getAuthHeaders(ctx);
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${API_BASE}${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      ...auth,
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
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
      const errMsg = (obj.message as string) ?? (obj.error as string) ?? `Autopilot API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed);
  } finally {
    clearTimeout(timer);
  }
}

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("autopilotApi");
  if (!cred) throw new Error("Autopilot: missing autopilotApi credential");
  const data = cred as Record<string, unknown>;
  const apiKey = String(data.apiKey ?? data.autopilotApi ?? "");
  if (!apiKey) throw new Error("Autopilot: apiKey is required in autopilotApi credential");
  return { autopilotapi: apiKey };
}

export const autopilotToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "contact");
  const operation = String(node.parameters.operation ?? "upsert");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
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
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  switch (resource) {
    case "contact": return runContactOperation(ctx, node, operation, itemJson);
    case "contactJourney": return runContactJourneyOperation(ctx, node, operation, itemJson);
    case "contactList": return runContactListOperation(ctx, node, operation, itemJson);
    case "list": return runListNodeOperation(ctx, node, operation, itemJson);
    default: throw new Error(`Autopilot: unsupported resource "${resource}"`);
  }
}

async function runContactOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "upsert") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("Autopilot: email is required for contact upsert");
    const rawAdditional = node.parameters.additionalFields as Record<string, unknown> | undefined;
    const body: Record<string, unknown> = { email };
    if (rawAdditional) {
      for (const [key, val] of Object.entries(rawAdditional)) {
        body[key] = val;
      }
    }
    const res = await apiRequest(ctx, "POST", "/contact", body);
    return { json: { contact_id: res.contact_id ?? "", email, ...res as Record<string, unknown> } };
  }

  if (operation === "delete") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? itemJson.contactId ?? "");
    if (!contactId) throw new Error("Autopilot: contactId is required for contact delete");
    await apiRequest(ctx, "DELETE", `/contact/${contactId}`);
    return { json: { contactId, deleted: true } };
  }

  if (operation === "get") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? itemJson.contactId ?? "");
    if (!contactId) throw new Error("Autopilot: contactId is required for contact get");
    const res = await apiRequest(ctx, "GET", `/contact/${contactId}`);
    return { json: { contact_id: res.contact_id ?? contactId, ...res as Record<string, unknown> } };
  }

  if (operation === "getAll") {
    const res = await apiRequest(ctx, "GET", "/contacts");
    const contacts = parseJsonArray(res.contacts ?? res._embedded?.contacts ?? []);
    return { json: contacts.map((c) => ({ contact_id: c.contact_id ?? "", ...c })) };
  }

  throw new Error(`Autopilot: unsupported contact operation "${operation}"`);
}

async function runContactJourneyOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "add") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? itemJson.contactId ?? "");
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? itemJson.listId ?? "");
    if (!contactId || !listId) throw new Error("Autopilot: contactId and listId are required for journey add");
    const body = { contact_id: contactId };
    await apiRequest(ctx, "POST", `/journey/${listId}/contact`, body);
    return { json: { contactId, listId, added: true } };
  }

  throw new Error(`Autopilot: unsupported contactJourney operation "${operation}"`);
}

async function runContactListOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "add") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? itemJson.contactId ?? "");
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? itemJson.listId ?? "");
    if (!contactId || !listId) throw new Error("Autopilot: contactId and listId are required for list add");
    await apiRequest(ctx, "POST", `/list/${listId}/contact/${contactId}`);
    return { json: { contactId, listId, added: true } };
  }

  if (operation === "check") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? itemJson.contactId ?? "");
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? itemJson.listId ?? "");
    if (!contactId || !listId) throw new Error("Autopilot: contactId and listId are required for list check");
    try {
      await apiRequest(ctx, "GET", `/list/${listId}/contact/${contactId}`);
      return { json: { contactId, listId, onList: true } };
    } catch {
      return { json: { contactId, listId, onList: false } };
    }
  }

  if (operation === "getAll") {
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? itemJson.listId ?? "");
    if (!listId) throw new Error("Autopilot: listId is required for contact list getAll");
    const res = await apiRequest(ctx, "GET", `/list/${listId}/contacts`);
    const contacts = parseJsonArray(res.contacts ?? []);
    return { json: contacts.map((c) => ({ contact_id: c.contact_id ?? "", ...c })) };
  }

  if (operation === "remove") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? itemJson.contactId ?? "");
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? itemJson.listId ?? "");
    if (!contactId || !listId) throw new Error("Autopilot: contactId and listId are required for list remove");
    await apiRequest(ctx, "DELETE", `/list/${listId}/contact/${contactId}`);
    return { json: { contactId, listId, removed: true } };
  }

  throw new Error(`Autopilot: unsupported contactList operation "${operation}"`);
}

async function runListNodeOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? itemJson.name ?? "");
    if (!name) throw new Error("Autopilot: name is required for list create");
    const res = await apiRequest(ctx, "POST", "/list", { name });
    return { json: { list_id: res.list_id ?? "", name, ...res as Record<string, unknown> } };
  }

  if (operation === "getAll") {
    const res = await apiRequest(ctx, "GET", "/lists");
    const lists = parseJsonArray(res.lists ?? res._embedded?.lists ?? []);
    return { json: lists.map((l) => ({ list_id: l.list_id ?? "", name: l.name ?? "", ...l })) };
  }

  throw new Error(`Autopilot: unsupported list operation "${operation}"`);
}

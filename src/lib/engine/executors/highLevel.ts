import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://rest.gohighlevel.com/v1";

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

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function resolveJsonParam(node: INode, name: string, itemJson: Record<string, unknown>): Record<string, unknown> {
  const raw = resolveValue(node.parameters[name], itemJson);
  return parseJson(raw);
}

export const highLevelExecutor: NodeExecutor = async (ctx, node) => {
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
      out.push({ json: result.json, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && "status" in err ? Number((err as Record<string, unknown>).status) : 500;
      out.push({ json: { error: { message, code } }, pairedItem });
    }
  }

  return [out];
};

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const apiKeyCred = await ctx.getCredential("highLevelApi");
  if (apiKeyCred) {
    const data = apiKeyCred as Record<string, unknown>;
    const apiKey = String(data.apiKey ?? data.accessToken ?? "");
    if (apiKey) return { Authorization: `Bearer ${apiKey}` };
  }

  const oauthCred = await ctx.getCredential("highLevelOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? data.access_token ?? "");
    if (token) return { Authorization: `Bearer ${token}` };
  }

  throw new Error("HighLevel: No valid credential found. Configure highLevelApi or highLevelOAuth2Api.");
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const auth = await getAuthHeaders(ctx);

  switch (resource) {
    case "contact": return runContactOperation(node, operation, itemJson, auth);
    case "opportunity": return runOpportunityOperation(node, operation, itemJson, auth);
    case "task": return runTaskOperation(node, operation, itemJson, auth);
    case "calendar": return runCalendarOperation(node, operation, itemJson, auth);
    default: throw new Error(`HighLevel: unsupported resource "${resource}"`);
  }
}

async function apiRequest(
  method: string,
  path: string,
  auth: Record<string, string>,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
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
    try { parsed = text ? JSON.parse(text) : null; } catch { }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const errMsg = (obj.message as string) ?? (obj.error as string) ?? `HighLevel API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as unknown as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

async function runContactOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "upsert") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const fields = resolveJsonParam(node, "contactFields", itemJson);
    if (email) fields.email = email;
    const res = await apiRequest("POST", "/contacts/upsert", auth, fields);
    return { json: { contact: res.contact ?? res, status: "created" } };
  }

  if (operation === "delete") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HighLevel: contactId is required for contact delete");
    await apiRequest("DELETE", `/contacts/${contactId}`, auth);
    return { json: { contactId, deleted: true } };
  }

  if (operation === "get") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HighLevel: contactId is required for contact get");
    const res = await apiRequest("GET", `/contacts/${contactId}`, auth);
    return { json: { contact: res.contact ?? res } };
  }

  if (operation === "getAll") {
    const queryOpts = resolveJsonParam(node, "queryOptions", itemJson);
    const limit = String(node.parameters.limit ?? 20);
    const params: Record<string, string> = { limit, ...Object.fromEntries(Object.entries(queryOpts).map(([k, v]) => [k, String(v)])) };
    const res = await apiRequest("GET", "/contacts", auth, undefined, params);
    return { json: { contacts: res.contacts ?? res.results ?? [], meta: res.meta ?? {} } };
  }

  if (operation === "update") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HighLevel: contactId is required for contact update");
    const fields = resolveJsonParam(node, "contactFields", itemJson);
    const res = await apiRequest("PUT", `/contacts/${contactId}`, auth, fields);
    return { json: { contact: res.contact ?? res, status: "updated" } };
  }

  throw new Error(`HighLevel: unsupported contact operation "${operation}"`);
}

async function runOpportunityOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const fields = resolveJsonParam(node, "opportunityFields", itemJson);
    const res = await apiRequest("POST", "/opportunities", auth, fields);
    return { json: { opportunity: res.opportunity ?? res, status: "created" } };
  }

  if (operation === "delete") {
    const opportunityId = String(resolveValue(node.parameters.opportunityId, itemJson) ?? "");
    if (!opportunityId) throw new Error("HighLevel: opportunityId is required for opportunity delete");
    await apiRequest("DELETE", `/opportunities/${opportunityId}`, auth);
    return { json: { opportunityId, deleted: true } };
  }

  if (operation === "get") {
    const opportunityId = String(resolveValue(node.parameters.opportunityId, itemJson) ?? "");
    if (!opportunityId) throw new Error("HighLevel: opportunityId is required for opportunity get");
    const res = await apiRequest("GET", `/opportunities/${opportunityId}`, auth);
    return { json: { opportunity: res.opportunity ?? res } };
  }

  if (operation === "getAll") {
    const queryOpts = resolveJsonParam(node, "queryOptions", itemJson);
    const limit = String(node.parameters.limit ?? 20);
    const params: Record<string, string> = { limit, ...Object.fromEntries(Object.entries(queryOpts).map(([K, v]) => [K, String(v)])) };
    const res = await apiRequest("GET", "/opportunities", auth, undefined, params);
    return { json: { opportunities: res.opportunities ?? res.results ?? [], meta: res.meta ?? {} } };
  }

  if (operation === "update") {
    const opportunityId = String(resolveValue(node.parameters.opportunityId, itemJson) ?? "");
    if (!opportunityId) throw new Error("HighLevel: opportunityId is required for opportunity update");
    const fields = resolveJsonParam(node, "opportunityFields", itemJson);
    const res = await apiRequest("PUT", `/opportunities/${opportunityId}`, auth, fields);
    return { json: { opportunity: res.opportunity ?? res, status: "updated" } };
  }

  throw new Error(`HighLevel: unsupported opportunity operation "${operation}"`);
}

async function runTaskOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const fields = resolveJsonParam(node, "taskFields", itemJson);
    const res = await apiRequest("POST", "/tasks", auth, fields);
    return { json: { task: res.task ?? res, status: "created" } };
  }

  if (operation === "delete") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("HighLevel: taskId is required for task delete");
    await apiRequest("DELETE", `/tasks/${taskId}`, auth);
    return { json: { taskId, deleted: true } };
  }

  if (operation === "get") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("HighLevel: taskId is required for task get");
    const res = await apiRequest("GET", `/tasks/${taskId}`, auth);
    return { json: { task: res.task ?? res } };
  }

  if (operation === "getAll") {
    const queryOpts = resolveJsonParam(node, "queryOptions", itemJson);
    const limit = String(node.parameters.limit ?? 20);
    const params: Record<string, string> = { limit, ...Object.fromEntries(Object.entries(queryOpts).map(([k, v]) => [k, String(v)])) };
    const res = await apiRequest("GET", "/tasks", auth, undefined, params);
    return { json: { tasks: res.tasks ?? res.results ?? [], meta: res.meta ?? {} } };
  }

  if (operation === "update") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("HighLevel: taskId is required for task update");
    const fields = resolveJsonParam(node, "taskFields", itemJson);
    const res = await apiRequest("PUT", `/tasks/${taskId}`, auth, fields);
    return { json: { task: res.task ?? res, status: "updated" } };
  }

  throw new Error(`HighLevel: unsupported task operation "${operation}"`);
}

async function runCalendarOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> }> {
  const calendarId = String(resolveValue(node.parameters.calendarId, itemJson) ?? "");
  if (!calendarId) throw new Error("HighLevel: calendarId is required for calendar operations");

  if (operation === "getFreeSlots") {
    const queryOpts = resolveJsonParam(node, "queryOptions", itemJson);
    const params: Record<string, string> = { ...Object.fromEntries(Object.entries(queryOpts).map(([k, v]) => [k, String(v)])) };
    const res = await apiRequest("GET", `/calendars/${calendarId}/free-slots`, auth, undefined, params);
    return { json: { slots: res.slots ?? res.freeSlots ?? res, meta: res.meta ?? {} } };
  }

  if (operation === "bookAppointment") {
    const fields = resolveJsonParam(node, "appointmentFields", itemJson);
    const res = await apiRequest("POST", `/calendars/${calendarId}/appointments`, auth, fields);
    return { json: { appointment: res.appointment ?? res, status: "booked" } };
  }

  throw new Error(`HighLevel: unsupported calendar operation "${operation}"`);
}
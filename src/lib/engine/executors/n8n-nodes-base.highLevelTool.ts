import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE_V1 = "https://rest.gohighlevel.com/v1";
const API_BASE_V2 = "https://services.leadconnectorhq.com";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const expr = raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1");
      const fn = new Function("$json", "return " + expr);
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

export const highLevelToolExecutor: NodeExecutor = async (ctx, node) => {
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
      const result = await runOperation(ctx, node, resource, operation, itemJson);
      out.push({ json: result.json, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }
  return [out];
};

async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const oauthCred = await ctx.getCredential("highLevelOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? data.access_token ?? "");
    if (token) return { Authorization: `Bearer ${token}` };
  }
  const apiKeyCred = await ctx.getCredential("highLevelApi");
  if (apiKeyCred) {
    const data = apiKeyCred as Record<string, unknown>;
    const apiKey = String(data.apiKey ?? data.accessToken ?? "");
    if (apiKey) return { Authorization: `Bearer ${apiKey}` };
  }
  throw new Error("HighLevel: No valid credential found. Configure highLevelOAuth2Api or highLevelApi.");
}

function apiBase(): string {
  return API_BASE_V2;
}

async function apiRequest(
  method: string,
  path: string,
  auth: Record<string, string>,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params && Object.keys(params).length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${apiBase()}${path}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = {
      ...auth,
      "Content-Type": "application/json",
      Accept: "application/json",
      Version: "2021-07-28",
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

async function runContactOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create" || operation === "upsert") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const phone = String(resolveValue(node.parameters.phone, itemJson) ?? "");
    const body: Record<string, unknown> = {};
    if (email) body.email = email;
    if (phone) body.phone = phone;
    const fields = parseJson(node.parameters.additionalFields as Record<string, unknown> ?? {});
    for (const [k, v] of Object.entries(fields)) {
      body[k] = resolveValue(v, itemJson);
    }
    const res = await apiRequest("POST", "/contacts/upsert", auth, body);
    const contact = (res.contact ?? res) as Record<string, unknown>;
    return { json: { id: contact.id, email: contact.email, firstName: contact.firstName, lastName: contact.lastName, phone: contact.phone, ...contact } };
  }

  if (operation === "delete") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HighLevel: contactId is required for delete");
    await apiRequest("DELETE", `/contacts/${contactId}`, auth);
    return { json: { success: true, contactId } };
  }

  if (operation === "get") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HighLevel: contactId is required for get");
    const res = await apiRequest("GET", `/contacts/${contactId}`, auth);
    const contact = (res.contact ?? res) as Record<string, unknown>;
    return { json: contact };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 20);
    const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
    const params: Record<string, string> = { limit: String(returnAll ? 100 : limit) };
    if (query) params.query = query;
    const res = await apiRequest("GET", "/contacts", auth, undefined, params);
    const contacts = ((res.contacts ?? res.results ?? []) as Record<string, unknown>[]).slice(0, returnAll ? undefined : limit);
    return { json: contacts };
  }

  if (operation === "update") {
    const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
    if (!contactId) throw new Error("HighLevel: contactId is required for update");
    const fields = parseJson(node.parameters.additionalFields as Record<string, unknown> ?? {});
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      body[k] = resolveValue(v, itemJson);
    }
    const res = await apiRequest("PUT", `/contacts/${contactId}`, auth, body);
    return { json: (res.contact ?? res) as Record<string, unknown> };
  }

  throw new Error(`HighLevel: unsupported contact operation "${operation}"`);
}

async function runOpportunityOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> }> {
  const pipelineId = String(resolveValue(node.parameters.pipelineId, itemJson) ?? "");

  if (operation === "create") {
    if (!pipelineId) throw new Error("HighLevel: pipelineId is required for opportunity create");
    const stageId = String(resolveValue(node.parameters.stageId, itemJson) ?? "");
    const contactIdentifier = String(resolveValue(node.parameters.contactIdentifier, itemJson) ?? "");
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    const status = String(node.parameters.status ?? "open");
    if (!contactIdentifier) throw new Error("HighLevel: contactIdentifier is required for opportunity create");
    if (!title) throw new Error("HighLevel: title is required for opportunity create");
    if (!stageId) throw new Error("HighLevel: stageId is required for opportunity create");
    const body: Record<string, unknown> = {
      contactId: contactIdentifier,
      name: title,
      status,
      pipelineId,
      pipelineStageId: stageId,
    };
    const fields = parseJson(node.parameters.additionalFields as Record<string, unknown> ?? {});
    for (const [k, v] of Object.entries(fields)) {
      body[k] = resolveValue(v, itemJson);
    }
    const res = await apiRequest("POST", "/opportunities", auth, body);
    return { json: (res.opportunity ?? res) as Record<string, unknown> };
  }

  if (operation === "delete") {
    const opportunityId = String(resolveValue(node.parameters.opportunityId, itemJson) ?? "");
    if (!opportunityId) throw new Error("HighLevel: opportunityId is required for delete");
    await apiRequest("DELETE", `/opportunities/${opportunityId}`, auth);
    return { json: { success: true, opportunityId } };
  }

  if (operation === "get") {
    const opportunityId = String(resolveValue(node.parameters.opportunityId, itemJson) ?? "");
    if (!opportunityId) throw new Error("HighLevel: opportunityId is required for get");
    const res = await apiRequest("GET", `/opportunities/${opportunityId}`, auth);
    return { json: (res.opportunity ?? res) as Record<string, unknown> };
  }

  if (operation === "getAll") {
    if (!pipelineId) throw new Error("HighLevel: pipelineId is required for opportunity getAll");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 20);
    const params: Record<string, string> = {
      pipeline_id: pipelineId,
      limit: String(returnAll ? 100 : limit),
    };
    const status = String(node.parameters.status ?? "");
    if (status) params.status = status;
    const res = await apiRequest("GET", "/opportunities", auth, undefined, params);
    const opportunities = ((res.opportunities ?? res.results ?? []) as Record<string, unknown>[]).slice(0, returnAll ? undefined : limit);
    return { json: opportunities };
  }

  if (operation === "update") {
    const opportunityId = String(resolveValue(node.parameters.opportunityId, itemJson) ?? "");
    if (!opportunityId) throw new Error("HighLevel: opportunityId is required for update");
    if (!pipelineId) throw new Error("HighLevel: pipelineId is required for opportunity update");
    const fields = parseJson(node.parameters.additionalFields as Record<string, unknown> ?? {});
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      body[k] = resolveValue(v, itemJson);
    }
    const res = await apiRequest("PUT", `/opportunities/${opportunityId}`, auth, body);
    return { json: (res.opportunity ?? res) as Record<string, unknown> };
  }

  throw new Error(`HighLevel: unsupported opportunity operation "${operation}"`);
}

async function runTaskOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<{ json: Record<string, unknown> }> {
  const contactId = String(resolveValue(node.parameters.contactId, itemJson) ?? "");
  if (!contactId) throw new Error("HighLevel: contactId is required for task operations");

  if (operation === "create") {
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    const dueDate = String(resolveValue(node.parameters.dueDate, itemJson) ?? "");
    if (!title) throw new Error("HighLevel: title is required for task create");
    const body: Record<string, unknown> = {
      title,
      contactId,
      dueDate: dueDate || undefined,
    };
    const res = await apiRequest("POST", "/tasks", auth, body);
    const task = (res.task ?? res) as Record<string, unknown>;
    return { json: { id: task.id, title: task.title, dueDate: task.dueDate, status: task.status ?? "incompleted", ...task } };
  }

  if (operation === "delete") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("HighLevel: taskId is required for task delete");
    await apiRequest("DELETE", `/tasks/${taskId}`, auth);
    return { json: { success: true, taskId } };
  }

  if (operation === "get") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("HighLevel: taskId is required for task get");
    const res = await apiRequest("GET", `/tasks/${taskId}`, auth);
    return { json: (res.task ?? res) as Record<string, unknown> };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 20);
    const params: Record<string, string> = {
      contactId,
      limit: String(returnAll ? 100 : limit),
    };
    const res = await apiRequest("GET", "/tasks", auth, undefined, params);
    const tasks = ((res.tasks ?? res.results ?? []) as Record<string, unknown>[]).slice(0, returnAll ? undefined : limit);
    return { json: tasks };
  }

  if (operation === "update") {
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("HighLevel: taskId is required for task update");
    const body: Record<string, unknown> = {};
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    if (title) body.title = title;
    const dueDate = String(resolveValue(node.parameters.dueDate, itemJson) ?? "");
    if (dueDate) body.dueDate = dueDate;
    const status = String(node.parameters.status ?? "");
    if (status) body.status = status;
    const res = await apiRequest("PUT", `/tasks/${taskId}`, auth, body);
    return { json: (res.task ?? res) as Record<string, unknown> };
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
    const startDate = String(resolveValue(node.parameters.startDate, itemJson) ?? "");
    const endDate = String(resolveValue(node.parameters.endDate, itemJson) ?? "");
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const res = await apiRequest("GET", `/calendars/${calendarId}/free-slots`, auth, undefined, Object.keys(params).length > 0 ? params : undefined);
    return { json: { slots: res.slots ?? res.freeSlots ?? [] } };
  }

  if (operation === "bookAppointment") {
    const startTime = String(resolveValue(node.parameters.startTime, itemJson) ?? "");
    const endTime = String(resolveValue(node.parameters.endTime, itemJson) ?? "");
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const firstName = String(resolveValue(node.parameters.firstName, itemJson) ?? "");
    const lastName = String(resolveValue(node.parameters.lastName, itemJson) ?? "");
    if (!startTime) throw new Error("HighLevel: startTime is required for bookAppointment");
    if (!endTime) throw new Error("HighLevel: endTime is required for bookAppointment");
    const body: Record<string, unknown> = {
      startTime,
      endTime,
      email,
      firstName,
      lastName,
    };
    const res = await apiRequest("POST", `/calendars/${calendarId}/appointments`, auth, body);
    const appointment = (res.appointment ?? res) as Record<string, unknown>;
    return { json: { id: appointment.id, status: "booked", startTime: appointment.startTime ?? startTime, endTime: appointment.endTime ?? endTime, contactEmail: email, ...appointment } };
  }

  throw new Error(`HighLevel: unsupported calendar operation "${operation}"`);
}

import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.pagerduty.com";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const pagerDutyExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "incident");
  const operation = String(node.parameters.operation ?? "create");
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
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getAuthHeaders(ctx: ExecutionContext, node: INode): Promise<Record<string, string>> {
  const authentication = String(node.parameters.authentication ?? "apiToken");
  if (authentication === "oAuth2") {
    const cred = await ctx.getCredential("pagerDutyOAuth2Api");
    const token = cred ? String(cred.accessToken ?? "") : "";
    if (!token) throw new Error("PagerDuty: pagerDutyOAuth2Api credential is not configured");
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.pagerduty+json;version=2",
    };
  }
  const cred = await ctx.getCredential("pagerDutyApi");
  const token = cred ? String(cred.apiToken ?? "") : "";
  if (!token) throw new Error("PagerDuty: pagerDutyApi credential is not configured");
  return {
    Authorization: `Token token=${token}`,
    Accept: "application/vnd.pagerduty+json;version=2",
  };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (resource === "incident") {
    return runIncidentOperation(ctx, node, operation, itemJson);
  }
  if (resource === "incidentNote") {
    return runIncidentNoteOperation(ctx, node, operation, itemJson);
  }
  if (resource === "logEntry") {
    return runLogEntryOperation(ctx, node, itemJson);
  }
  if (resource === "user") {
    return runUserOperation(ctx, node, operation, itemJson);
  }
  throw new Error(`PagerDuty: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Incident
// ---------------------------------------------------------------------------

async function runIncidentOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const headers = await getAuthHeaders(ctx, node);

  if (operation === "create") {
    let title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    const serviceId = String(resolveValue(node.parameters.serviceId, itemJson) ?? "");
    if (!title && itemJson.title) title = String(itemJson.title);
    if (!title) throw new Error("PagerDuty: title is required");
    if (!serviceId && itemJson.serviceId) throw new Error("PagerDuty: serviceId is required");

    const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
    const incident: Record<string, unknown> = {
      type: "incident",
      title,
      service: { id: serviceId || String(itemJson.serviceId ?? ""), type: "service_reference" },
    };
    if (additionalFields.details) incident.body = { type: "incident_body", details: String(additionalFields.details) };
    if (additionalFields.urgency) incident.urgency = String(additionalFields.urgency);
    if (additionalFields.incidentKey) incident.incident_key = String(additionalFields.incidentKey);
    if (additionalFields.escalationPolicyId) {
      incident.escalation_policy = { id: String(additionalFields.escalationPolicyId), type: "escalation_policy_reference" };
    }
    if (additionalFields.priorityId) {
      incident.priority = { id: String(additionalFields.priorityId), type: "priority_reference" };
    }

    const from = String(resolveValue(node.parameters.email, itemJson) ?? itemJson.email ?? "");
    const body: Record<string, unknown> = { incident };
    const res = await pagerDutyRequest(headers, "POST", `${API_BASE}/incidents`, body, from || undefined);
    return { json: asObj(res.incident) };
  }

  if (operation === "get") {
    const incidentId = String(resolveValue(node.parameters.incidentId, itemJson) ?? itemJson.incidentId ?? "");
    if (!incidentId) throw new Error("PagerDuty: incidentId is required");
    const res = await pagerDutyRequest(headers, "GET", `${API_BASE}/incidents/${incidentId}`);
    return { json: asObj(res.incident) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(returnAll ? 100 : Math.min(limit, 100)) };
    const res = await pagerDutyRequest(headers, "GET", `${API_BASE}/incidents`, undefined, undefined, params);
    const incidents = (res.incidents ?? []) as Record<string, unknown>[];
    const sliced = returnAll ? incidents : incidents.slice(0, limit);
    return sliced.map((inc) => ({ json: inc }));
  }

  if (operation === "update") {
    const incidentId = String(resolveValue(node.parameters.incidentId, itemJson) ?? itemJson.incidentId ?? "");
    if (!incidentId) throw new Error("PagerDuty: incidentId is required");

    const updateFields = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
    const incident: Record<string, unknown> = { type: "incident" };
    if (updateFields.title) incident.title = String(updateFields.title);
    if (updateFields.status) incident.status = String(updateFields.status);
    if (updateFields.escalationPolicyId) {
      incident.escalation_policy = { id: String(updateFields.escalationPolicyId), type: "escalation_policy_reference" };
    }
    if (updateFields.priorityId) {
      incident.priority = { id: String(updateFields.priorityId), type: "priority_reference" };
    }
    if (updateFields.resolution) incident.resolution = String(updateFields.resolution);

    const from = String(resolveValue(node.parameters.email, itemJson) ?? itemJson.email ?? "");
    const body: Record<string, unknown> = { incident };
    const res = await pagerDutyRequest(headers, "PUT", `${API_BASE}/incidents/${incidentId}`, body, from || undefined);
    return { json: asObj(res.incident) };
  }

  throw new Error(`PagerDuty: unsupported incident operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Incident Note
// ---------------------------------------------------------------------------

async function runIncidentNoteOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const headers = await getAuthHeaders(ctx, node);
  const incidentId = String(resolveValue(node.parameters.incidentId, itemJson) ?? itemJson.incidentId ?? "");
  if (!incidentId) throw new Error("PagerDuty: incidentId is required for incident notes");

  if (operation === "create") {
    const content = String(itemJson.content ?? "");
    if (!content) throw new Error("PagerDuty: content is required from input item for incident note");
    const from = String(resolveValue(node.parameters.email, itemJson) ?? itemJson.email ?? "");
    const body: Record<string, unknown> = { note: { content } };
    const res = await pagerDutyRequest(headers, "POST", `${API_BASE}/incidents/${incidentId}/notes`, body, from || undefined);
    return { json: asObj(res.note) };
  }

  if (operation === "get") {
    const noteId = String(itemJson.noteId ?? "");
    if (!noteId) throw new Error("PagerDuty: noteId is required from input item");
    const res = await pagerDutyRequest(headers, "GET", `${API_BASE}/incidents/${incidentId}/notes/${noteId}`);
    return { json: asObj(res.note) };
  }

  if (operation === "getAll") {
    const res = await pagerDutyRequest(headers, "GET", `${API_BASE}/incidents/${incidentId}/notes`);
    const notes = (res.notes ?? []) as Record<string, unknown>[];
    return notes.map((n) => ({ json: n }));
  }

  throw new Error(`PagerDuty: unsupported incident note operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Log Entry
// ---------------------------------------------------------------------------

async function runLogEntryOperation(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const headers = await getAuthHeaders(ctx, node);
  const params: Record<string, string> = { limit: "100" };
  const res = await pagerDutyRequest(headers, "GET", `${API_BASE}/log_entries`, undefined, undefined, params);
  const entries = (res.log_entries ?? []) as Record<string, unknown>[];
  return entries.map((e) => ({ json: e }));
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

async function runUserOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const headers = await getAuthHeaders(ctx, node);

  if (operation === "get") {
    const userId = String(itemJson.userId ?? "");
    if (!userId) throw new Error("PagerDuty: userId is required from input item");
    const res = await pagerDutyRequest(headers, "GET", `${API_BASE}/users/${userId}`);
    return { json: asObj(res.user) };
  }

  if (operation === "getAll") {
    const params: Record<string, string> = { limit: "100" };
    const res = await pagerDutyRequest(headers, "GET", `${API_BASE}/users`, undefined, undefined, params);
    const users = (res.users ?? []) as Record<string, unknown>[];
    return users.map((u) => ({ json: u }));
  }

  throw new Error(`PagerDuty: unsupported user operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function pagerDutyRequest(
  headers: Record<string, string>,
  method: string,
  url: string,
  body?: Record<string, unknown>,
  from?: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const fullUrl = params ? `${url}?${new URLSearchParams(params).toString()}` : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (from) init.headers = { ...init.headers as Record<string, string>, From: from };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(fullUrl, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errObj = obj.error ? asObj(obj.error) : {};
      const errMsg = String(errObj.message ?? obj.message ?? `Request failed with status code ${response.status}`);
      throw new Error(`PagerDuty: ${errMsg}`);
    }
    return asObj(parsed);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("PagerDuty:")) throw err;
    if (err instanceof Error) throw new Error(`PagerDuty request failed: ${err.message}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

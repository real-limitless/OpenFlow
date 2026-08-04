import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://graph.microsoft.com/v1.0/me/todo";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (!raw.startsWith("=") && !/\{\{[\s\S]*?\}\}/.test(raw)) return raw;
  const result = evaluateExpression(raw, { json: itemJson });
  return result.ok ? result.value : raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function graphRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Microsoft Graph request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processGraphError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const message = typeof obj.message === "string" ? obj.message : `HTTP ${status}`;
  return new Error(`Microsoft Graph: ${message}`);
}

async function requestOk(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const res = await graphRequest(method, url, headers, body);
  if (res.status < 200 || res.status >= 300) throw processGraphError(res.body, res.status);
  return asObj(res.body);
}

const TASK_FIELDS = new Set([
  "title", "displayName", "dueDateTime", "importance", "timeZone",
  "isReminderOn", "reminderDateTime", "categories", "startDateTime",
  "bodyContent",
]);

function buildTaskBody(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const title = resolveValue(node.parameters.title ?? node.parameters.displayName, itemJson);
  if (title) body.title = String(title);
  for (const key of TASK_FIELDS) {
    if (key === "title" || key === "displayName") continue;
    const raw = node.parameters[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (key === "bodyContent") {
      const type = resolveValue(node.parameters.bodyType, itemJson) ?? "text";
      (body as Record<string, unknown>).body = { content: String(resolveValue(raw, itemJson)), contentType: String(type) };
    } else if (key === "bodyType") {
      continue;
    } else {
      body[key] = resolveValue(raw, itemJson);
    }
  }
  const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
  if (additionalFields && typeof additionalFields === "object") {
    for (const [key, value] of Object.entries(additionalFields)) {
      body[key] = value;
    }
  }
  return body;
}

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("microsoftToDoOAuth2Api") ?? await ctx.getCredential("microsoftEntraServicePrincipalApi");
  const token = cred ? String(cred.accessToken ?? "") : "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function hasUnresolvedFromAI(node: INode): boolean {
  const params = node.parameters;
  for (const value of Object.values(params)) {
    if (typeof value === "string" && value.includes("$fromAI(")) return true;
    if (value && typeof value === "object") {
      if (hasFromAIInObj(value as Record<string, unknown>)) return true;
    }
  }
  return false;
}

function hasFromAIInObj(obj: Record<string, unknown>): boolean {
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.includes("$fromAI(")) return true;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (hasFromAIInObj(value as Record<string, unknown>)) return true;
    }
  }
  return false;
}

export const microsoftToDoToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "task");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  if (hasUnresolvedFromAI(node)) {
    return [items.map((item, idx) => ({
      json: { ...item.json as Record<string, unknown> },
      pairedItem: item.pairedItem ?? { item: idx, input: 0 },
    }))];
  }

  const headers = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(node, resource, operation, itemJson, headers);
      for (const json of results) {
        out.push({ json, pairedItem });
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
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  switch (resource) {
    case "list": return runList(node, operation, itemJson, headers);
    case "task": return runTask(node, operation, itemJson, headers);
    case "linkedResource": return runLinkedResource(node, operation, itemJson, headers);
    default: throw new Error(`Microsoft To Do: unsupported resource "${resource}"`);
  }
}

async function runList(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  if (operation === "create") {
    const displayName = String(resolveValue(node.parameters.displayName, itemJson) ?? "");
    if (!displayName) throw new Error("Microsoft To Do: displayName is required for list create");
    const obj = await requestOk("POST", `${API_BASE}/lists`, headers, { displayName });
    return [obj];
  }

  if (operation === "get") {
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
    if (!listId) throw new Error("Microsoft To Do: listId is required");
    const obj = await requestOk("GET", `${API_BASE}/lists/${encodeURIComponent(listId)}`, headers);
    return [obj];
  }

  if (operation === "getAll") {
    const obj = await requestOk("GET", `${API_BASE}/lists`, headers);
    const values = Array.isArray(obj.value) ? obj.value as Record<string, unknown>[] : [];
    return values;
  }

  if (operation === "update") {
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
    if (!listId) throw new Error("Microsoft To Do: listId is required");
    const displayName = String(resolveValue(node.parameters.displayName, itemJson) ?? "");
    const body: Record<string, unknown> = {};
    if (displayName) body.displayName = displayName;
    const obj = await requestOk("PATCH", `${API_BASE}/lists/${encodeURIComponent(listId)}`, headers, body);
    return [obj];
  }

  if (operation === "delete") {
    const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
    if (!listId) throw new Error("Microsoft To Do: listId is required");
    await requestOk("DELETE", `${API_BASE}/lists/${encodeURIComponent(listId)}`, headers);
    return [{ listId }];
  }

  throw new Error(`Microsoft To Do: unsupported list operation "${operation}"`);
}

async function runTask(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");

  if (operation === "create") {
    if (!listId) throw new Error("Microsoft To Do: listId is required for task create");
    const body = buildTaskBody(node, itemJson);
    const obj = await requestOk("POST", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks`, headers, body);
    return [obj];
  }

  if (operation === "get") {
    if (!listId) throw new Error("Microsoft To Do: listId is required");
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("Microsoft To Do: taskId is required");
    const obj = await requestOk("GET", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, headers);
    return [obj];
  }

  if (operation === "getAll") {
    if (!listId) throw new Error("Microsoft To Do: listId is required for task getAll");
    const returnAll = node.parameters.returnAll === true;
    const limit = Number(node.parameters.limit ?? 50);
    const url = `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks`;
    const obj = await requestOk("GET", url, headers);
    const values: Record<string, unknown>[] = Array.isArray(obj.value) ? obj.value as Record<string, unknown>[] : [];
    if (!returnAll && values.length > limit) {
      return values.slice(0, limit);
    }
    let nextLink = obj["@odata.nextLink"] as string | undefined;
    while (nextLink && returnAll) {
      const nextObj = await requestOk("GET", nextLink, headers);
      const nextValues = Array.isArray(nextObj.value) ? nextObj.value as Record<string, unknown>[] : [];
      values.push(...nextValues);
      nextLink = nextObj["@odata.nextLink"] as string | undefined;
    }
    return values;
  }

  if (operation === "update") {
    if (!listId) throw new Error("Microsoft To Do: listId is required");
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("Microsoft To Do: taskId is required for task update");
    const body = buildTaskBody(node, itemJson);
    const obj = await requestOk("PATCH", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, headers, body);
    return [obj];
  }

  if (operation === "delete") {
    if (!listId) throw new Error("Microsoft To Do: listId is required");
    const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
    if (!taskId) throw new Error("Microsoft To Do: taskId is required");
    await requestOk("DELETE", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, headers);
    return [{ listId, taskId }];
  }

  throw new Error(`Microsoft To Do: unsupported task operation "${operation}"`);
}

async function runLinkedResource(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const listId = String(resolveValue(node.parameters.listId, itemJson) ?? "");
  const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");

  if (operation === "create") {
    if (!listId || !taskId) throw new Error("Microsoft To Do: listId and taskId are required for linkedResource create");
    const link = String(resolveValue(node.parameters.link, itemJson) ?? "");
    const applicationName = String(resolveValue(node.parameters.applicationName, itemJson) ?? "");
    const body: Record<string, unknown> = {};
    if (link) body.webUrl = link;
    if (applicationName) body.applicationName = applicationName;
    const obj = await requestOk("POST", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/linkedResources`, headers, body);
    return [obj];
  }

  if (operation === "get") {
    if (!listId || !taskId) throw new Error("Microsoft To Do: listId and taskId are required");
    const linkedResourceId = String(resolveValue(node.parameters.linkedResourceId, itemJson) ?? "");
    if (!linkedResourceId) throw new Error("Microsoft To Do: linkedResourceId is required");
    const obj = await requestOk("GET", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/linkedResources/${encodeURIComponent(linkedResourceId)}`, headers);
    return [obj];
  }

  if (operation === "getAll") {
    if (!listId || !taskId) throw new Error("Microsoft To Do: listId and taskId are required");
    const obj = await requestOk("GET", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/linkedResources`, headers);
    const values = Array.isArray(obj.value) ? obj.value as Record<string, unknown>[] : [];
    return values;
  }

  if (operation === "update") {
    if (!listId || !taskId) throw new Error("Microsoft To Do: listId and taskId are required");
    const linkedResourceId = String(resolveValue(node.parameters.linkedResourceId, itemJson) ?? "");
    if (!linkedResourceId) throw new Error("Microsoft To Do: linkedResourceId is required");
    const link = String(resolveValue(node.parameters.link, itemJson) ?? "");
    const applicationName = String(resolveValue(node.parameters.applicationName, itemJson) ?? "");
    const body: Record<string, unknown> = {};
    if (link) body.webUrl = link;
    if (applicationName) body.applicationName = applicationName;
    const obj = await requestOk("PATCH", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/linkedResources/${encodeURIComponent(linkedResourceId)}`, headers, body);
    return [obj];
  }

  if (operation === "delete") {
    if (!listId || !taskId) throw new Error("Microsoft To Do: listId and taskId are required");
    const linkedResourceId = String(resolveValue(node.parameters.linkedResourceId, itemJson) ?? "");
    if (!linkedResourceId) throw new Error("Microsoft To Do: linkedResourceId is required");
    await requestOk("DELETE", `${API_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/linkedResources/${encodeURIComponent(linkedResourceId)}`, headers);
    return [{ listId, taskId, linkedResourceId }];
  }

  throw new Error(`Microsoft To Do: unsupported linkedResource operation "${operation}"`);
}

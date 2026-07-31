import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.todoist.com/rest/v2";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

export const todoistExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];

  const operation = (node.parameters.operation as string) ?? "create";
  const continueOnFail = ctx.continueOnFail();

  const headers = await authHeaders(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(operation, node, itemJson, headers);
      if (result === null) {
        out.push({ json: { ...itemJson }, pairedItem });
      } else if (Array.isArray(result)) {
        for (const task of result) {
          out.push({ json: task as Record<string, unknown>, pairedItem });
        }
      } else {
        out.push({ json: result as Record<string, unknown>, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out];
};

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  let token = "";
  const apiCred = await ctx.getCredential("todoistApi");
  if (apiCred && apiCred.apiKey) {
    token = String(apiCred.apiKey);
  } else {
    const oauthCred = await ctx.getCredential("todoistOAuth2Api");
    if (oauthCred && oauthCred.accessToken) {
      token = String(oauthCred.accessToken);
    }
  }
  if (!token) {
    throw new Error("Todoist: credential is not configured (todoistApi or todoistOAuth2Api)");
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function runOperation(
  operation: string,
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | unknown[] | null> {
  switch (operation) {
    case "create":
      return createTask(node, itemJson, headers);
    case "close":
      return closeTask(node, itemJson, headers);
    case "delete":
      return deleteTask(node, itemJson, headers);
    case "get":
      return getTask(node, itemJson, headers);
    case "getAll":
      return getAllTasks(node, itemJson, headers);
    case "reopen":
      return reopenTask(node, itemJson, headers);
    case "update":
      return updateTask(node, itemJson, headers);
    default:
      throw new Error(`Todoist: unsupported operation "${operation}"`);
  }
}

function buildTaskBody(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const content = resolveValue(node.parameters.content, itemJson);
  if (content) body.content = content;

  const description = resolveValue(node.parameters.description, itemJson);
  if (description) body.description = description;

  const labels = resolveValue(node.parameters.labels, itemJson);
  if (labels && typeof labels === "string" && labels.trim()) {
    body.labels = labels.split(",").map((l) => l.trim()).filter(Boolean);
  }

  const priority = resolveValue(node.parameters.priority, itemJson);
  if (priority !== undefined && priority !== null && priority !== "") {
    body.priority = Number(priority);
  }

  const dueDateTime = resolveValue(node.parameters.dueDateTime, itemJson);
  if (dueDateTime && typeof dueDateTime === "string" && dueDateTime.trim()) {
    body.due_datetime = dueDateTime;
  }

  const dueDate = resolveValue(node.parameters.dueDate, itemJson);
  if (dueDate && typeof dueDate === "string" && dueDate.trim()) {
    body.due_date = dueDate;
  }

  const projectId = resolveValue(node.parameters.projectId, itemJson);
  if (projectId) body.project_id = projectId;

  const sectionId = resolveValue(node.parameters.sectionId, itemJson);
  if (sectionId) body.section_id = sectionId;

  const parentId = resolveValue(node.parameters.parentId, itemJson);
  if (parentId) body.parent_id = parentId;

  const order = resolveValue(node.parameters.order, itemJson);
  if (order !== undefined && order !== null && order !== "") {
    body.order = Number(order);
  }

  const assigneeId = resolveValue(node.parameters.assigneeId, itemJson);
  if (assigneeId) body.assignee_id = assigneeId;

  const duration = resolveValue(node.parameters.duration, itemJson);
  if (duration !== undefined && duration !== null && duration !== "") {
    body.duration = Number(duration);
  }

  const dueLang = resolveValue(node.parameters.dueLang, itemJson);
  if (dueLang) body.due_lang = dueLang;

  return body;
}

async function createTask(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const content = resolveValue(node.parameters.content, itemJson);
  if (!content) throw new Error("Todoist: content is required for create operation");

  const body = buildTaskBody(node, itemJson);
  const res = await todoistRequest("POST", `${API_BASE}/tasks`, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Todoist: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return asObject(res.body);
}

async function getTask(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
  if (!taskId) throw new Error("Todoist: taskId is required for get operation");
  const res = await todoistRequest("GET", `${API_BASE}/tasks/${taskId}`, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Todoist: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return asObject(res.body);
}

async function getAllTasks(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<unknown[]> {
  const params = new URLSearchParams();
  const projectId = resolveValue(node.parameters.projectId, itemJson);
  if (projectId) params.set("project_id", String(projectId));
  const filter = resolveValue(node.parameters.filter, itemJson);
  if (filter) params.set("filter", String(filter));
  const limit = Number(resolveValue(node.parameters.limit, itemJson) ?? 50);
  params.set("limit", String(limit));
  const url = `${API_BASE}/tasks?${params.toString()}`;
  const res = await todoistRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Todoist: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  if (Array.isArray(res.body)) return res.body as unknown[];
  return [];
}

async function updateTask(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const taskId = String(resolveValue(node.parameters.taskId, itemJson) ?? "");
  if (!taskId) throw new Error("Todoist: taskId is required for update operation");
  const body = buildTaskBody(node, itemJson);
  const res = await todoistRequest("POST", `${API_BASE}/tasks/${taskId}`, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Todoist: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return asObject(res.body);
}

async function closeTask(
  node: INode,
  _itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<null> {
  const taskId = String(resolveValue(node.parameters.taskId, _itemJson) ?? "");
  if (!taskId) throw new Error("Todoist: taskId is required for close operation");
  const res = await todoistRequest("POST", `${API_BASE}/tasks/${taskId}/close`, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Todoist: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return null;
}

async function deleteTask(
  node: INode,
  _itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<null> {
  const taskId = String(resolveValue(node.parameters.taskId, _itemJson) ?? "");
  if (!taskId) throw new Error("Todoist: taskId is required for delete operation");
  const res = await todoistRequest("DELETE", `${API_BASE}/tasks/${taskId}`, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Todoist: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return null;
}

async function reopenTask(
  node: INode,
  _itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<null> {
  const taskId = String(resolveValue(node.parameters.taskId, _itemJson) ?? "");
  if (!taskId) throw new Error("Todoist: taskId is required for reopen operation");
  const res = await todoistRequest("POST", `${API_BASE}/tasks/${taskId}/reopen`, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Todoist: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return null;
}

async function todoistRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
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
    } catch {
      /* keep text */
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Todoist request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function asObject(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}
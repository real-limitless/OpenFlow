import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String((resolved as Record<string, unknown>).value ?? "").trim();
  }
  return String(resolved ?? "").trim();
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function buildQuery(params: Record<string, string | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function getAccessToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(
    node.parameters.authentication ?? ctx.getParam("authentication", "oAuth2") ?? "oAuth2",
  );
  const credName = authentication === "serviceAccount" ? "googleApi" : "googleTasksOAuth2Api";
  const cred = await ctx.getCredential(credName);
  if (!cred) {
    throw new Error(`GoogleTasksTool: ${credName} credential is not configured`);
  }
  const accessToken = String(cred.accessToken ?? cred.access_token ?? "");
  if (!accessToken) {
    throw new Error(`GoogleTasksTool: ${credName} has no accessToken`);
  }
  return accessToken;
}

async function apiRequest(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  if (res.status < 200 || res.status >= 300) {
    const errObj = asObj(parsed);
    const msg =
      (errObj.error as { message?: string } | undefined)?.message ??
      String(errObj.message ?? `HTTP ${res.status}`);
    throw new Error(`GoogleTasksTool: ${msg}`);
  }
  return { status: res.status, body: parsed };
}

export const googleTasksToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? ctx.getParam("resource", "task") ?? "task");
  const operation = String(node.parameters.operation ?? ctx.getParam("operation", "create") ?? "create");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const results = await runOperation(ctx, node, resource, operation, itemJson);
      const list = Array.isArray(results) ? results : [results];
      for (const json of list) {
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

function resolveTaskListId(node: INode, itemJson: Record<string, unknown>): string {
  const raw = node.parameters.taskListId ?? "@default";
  const resolved = resolveLocator(raw, itemJson);
  if (resolved && resolved !== "@default") return resolved;
  return "@default";
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const token = await getAccessToken(ctx, node);
  const taskListId = resolveTaskListId(node, itemJson);

  if (resource !== "task") {
    throw new Error(`GoogleTasksTool: unsupported resource "${resource}"`);
  }

  switch (operation) {
    case "create":
      return handleCreate(token, node, taskListId, itemJson);
    case "delete":
      return handleDelete(token, node, taskListId, itemJson);
    case "get":
      return handleGet(token, node, taskListId, itemJson);
    case "getAll":
      return handleGetAll(token, node, taskListId, itemJson);
    case "update":
      return handleUpdate(token, node, taskListId, itemJson);
    default:
      throw new Error(`GoogleTasksTool: Unknown operation "${operation}"`);
  }
}

function buildTaskBody(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  const title = resolveValue(node.parameters.title, itemJson);
  if (title) body.title = String(title);

  const notes = resolveValue(node.parameters.notes, itemJson);
  if (notes) body.notes = String(notes);

  const status = resolveValue(node.parameters.status, itemJson);
  if (status) body.status = String(status);

  const dueDate = resolveValue(node.parameters.due, itemJson);
  if (dueDate) {
    const d = String(dueDate);
    body.due = d.includes("T") ? d.slice(0, 10) : d;
  }

  return body;
}

async function handleCreate(
  token: string,
  node: INode,
  taskListId: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = buildTaskBody(node, itemJson);
  const url = taskListId === "@default"
    ? `${TASKS_API}/lists/@default/tasks`
    : `${TASKS_API}/lists/${encodeURIComponent(taskListId)}/tasks`;
  const result = await apiRequest("POST", url, token, body);
  return asObj(result.body);
}

async function handleDelete(
  token: string,
  node: INode,
  taskListId: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const taskId = resolveLocator(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("GoogleTasksTool: Task ID is required for delete");
  const url = taskListId === "@default"
    ? `${TASKS_API}/lists/@default/tasks/${encodeURIComponent(taskId)}`
    : `${TASKS_API}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`;
  await apiRequest("DELETE", url, token);
  return {};
}

async function handleGet(
  token: string,
  node: INode,
  taskListId: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const taskId = resolveLocator(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("GoogleTasksTool: Task ID is required for get");
  const url = taskListId === "@default"
    ? `${TASKS_API}/lists/@default/tasks/${encodeURIComponent(taskId)}`
    : `${TASKS_API}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`;
  const result = await apiRequest("GET", url, token);
  return asObj(result.body);
}

async function handleGetAll(
  token: string,
  node: INode,
  taskListId: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const returnAll = resolveValue(node.parameters.returnAll, itemJson) !== false;
  const maxResults = resolveValue(node.parameters.maxResults, itemJson);
  const showCompleted = resolveValue(node.parameters.showCompleted, itemJson) ?? true;
  const showHidden = resolveValue(node.parameters.showHidden, itemJson) ?? false;

  const qp: Record<string, string | undefined | null> = {
    showCompleted: showCompleted ? "true" : "false",
    showHidden: showHidden ? "true" : "false",
    maxResults: maxResults ? String(maxResults) : returnAll ? undefined : "20",
  };

  const url = taskListId === "@default"
    ? `${TASKS_API}/lists/@default/tasks${buildQuery(qp)}`
    : `${TASKS_API}/lists/${encodeURIComponent(taskListId)}/tasks${buildQuery(qp)}`;
  const result = await apiRequest("GET", url, token);
  const items = asObj(result.body).items;
  if (Array.isArray(items)) return items as Record<string, unknown>[];
  return [];
}

async function handleUpdate(
  token: string,
  node: INode,
  taskListId: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const taskId = resolveLocator(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("GoogleTasksTool: Task ID is required for update");
  const body = buildTaskBody(node, itemJson);
  const url = taskListId === "@default"
    ? `${TASKS_API}/lists/@default/tasks/${encodeURIComponent(taskId)}`
    : `${TASKS_API}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`;
  const result = await apiRequest("PATCH", url, token, body);
  return asObj(result.body);
}

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

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function getApiToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const auth = String(node.parameters.authentication ?? "apiKey");
  const credName = auth === "oAuth2" ? "todoistOAuth2Api" : "todoistApi";
  const cred = await ctx.getCredential(credName);
  if (!cred) return "";
  const d = cred as Record<string, unknown>;
  return String(d.apiKey ?? d.token ?? d.accessToken ?? "");
}

async function todoistRequest(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${API_BASE}/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    const text = await resp.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    if (resp.status < 200 || resp.status >= 300) {
      const obj = asObj(parsed);
      const msg = String(
        (obj as Record<string, unknown>).message ?? obj.error ?? `Todoist request failed ${resp.status}`,
      );
      throw new Error(msg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function successResult(): { json: Record<string, unknown> } {
  return { json: { success: true } };
}

function parseLabels(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* ignore */ }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

async function runTaskCreate(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const body: Record<string, unknown> = {};
  const content = resolveValue(node.parameters.content, itemJson);
  if (content) body.content = String(content);
  else throw new Error("Todoist: content is required for create");
  const description = resolveValue(node.parameters.description, itemJson);
  if (description) body.description = String(description);
  const projectId = resolveValue(node.parameters.projectId, itemJson);
  if (projectId) body.project_id = String(projectId);
  const sectionId = resolveValue(node.parameters.sectionId, itemJson);
  if (sectionId) body.section_id = String(sectionId);
  const labels = parseLabels(resolveValue(node.parameters.labels, itemJson));
  if (labels) body.labels = labels;
  const priority = resolveValue(node.parameters.priority, itemJson);
  if (priority != null && priority !== "") body.priority = Number(priority);
  const dueString = resolveValue(node.parameters.due_string, itemJson);
  if (dueString) body.due_string = String(dueString);
  const dueLang = resolveValue(node.parameters.due_lang, itemJson);
  if (dueLang) body.due_lang = String(dueLang);
  const res = await todoistRequest(token, "POST", "tasks", body);
  return { json: asObj(res) };
}

async function runTaskClose(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const taskId = resolveValue(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("Todoist: taskId is required");
  await todoistRequest(token, "POST", `tasks/${taskId}/close`);
  return successResult();
}

async function runTaskDelete(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const taskId = resolveValue(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("Todoist: taskId is required");
  await todoistRequest(token, "DELETE", `tasks/${taskId}`);
  return successResult();
}

async function runTaskGet(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const taskId = resolveValue(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("Todoist: taskId is required");
  const res = await todoistRequest(token, "GET", `tasks/${taskId}`);
  return { json: asObj(res) };
}

async function runTaskGetAll(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }[]> {
  const params = new URLSearchParams();
  const projectId = resolveValue(node.parameters.projectId, itemJson);
  if (projectId) params.set("project_id", String(projectId));
  const sectionId = resolveValue(node.parameters.sectionId, itemJson);
  if (sectionId) params.set("section_id", String(sectionId));
  const label = resolveValue(node.parameters.label, itemJson);
  if (label) params.set("label", String(label));
  const filter = resolveValue(node.parameters.filter, itemJson);
  if (filter) params.set("filter", String(filter));
  const lang = resolveValue(node.parameters.lang, itemJson);
  if (lang) params.set("lang", String(lang));
  const ids = resolveValue(node.parameters.ids, itemJson);
  if (ids) {
    if (Array.isArray(ids)) params.set("ids", JSON.stringify(ids));
    else params.set("ids", String(ids));
  }
  const qs = params.toString();
  const path = qs ? `tasks?${qs}` : "tasks";
  const res = await todoistRequest(token, "GET", path);
  let tasks = Array.isArray(res) ? (res as Record<string, unknown>[]) : [];
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  if (!returnAll) tasks = tasks.slice(0, limit);
  return tasks.map((t) => ({ json: asObj(t) }));
}

async function runTaskReopen(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const taskId = resolveValue(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("Todoist: taskId is required");
  await todoistRequest(token, "POST", `tasks/${taskId}/reopen`);
  return successResult();
}

async function runTaskUpdate(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const taskId = resolveValue(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("Todoist: taskId is required");
  const body: Record<string, unknown> = {};
  const content = resolveValue(node.parameters.content, itemJson);
  if (content) body.content = String(content);
  const description = resolveValue(node.parameters.description, itemJson);
  if (description) body.description = String(description);
  const projectId = resolveValue(node.parameters.projectId, itemJson);
  if (projectId) body.project_id = String(projectId);
  const sectionId = resolveValue(node.parameters.sectionId, itemJson);
  if (sectionId) body.section_id = String(sectionId);
  const labels = parseLabels(resolveValue(node.parameters.labels, itemJson));
  if (labels) body.labels = labels;
  const priority = resolveValue(node.parameters.priority, itemJson);
  if (priority != null && priority !== "") body.priority = Number(priority);
  const dueString = resolveValue(node.parameters.due_string, itemJson);
  if (dueString) body.due_string = String(dueString);
  const dueLang = resolveValue(node.parameters.due_lang, itemJson);
  if (dueLang) body.due_lang = String(dueLang);
  await todoistRequest(token, "POST", `tasks/${taskId}`, body);
  return successResult();
}

async function runTaskMove(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const taskId = resolveValue(node.parameters.taskId, itemJson);
  if (!taskId) throw new Error("Todoist: taskId is required");
  const body: Record<string, unknown> = {};
  body.id = String(taskId);
  const projectId = resolveValue(node.parameters.projectId, itemJson);
  if (projectId) body.project_id = String(projectId);
  const sectionId = resolveValue(node.parameters.sectionId, itemJson);
  if (sectionId) body.section_id = String(sectionId);
  const parentId = resolveValue(node.parameters.parentId, itemJson);
  if (parentId) body.parent_id = String(parentId);
  const dayOrder = resolveValue(node.parameters.dayOrder, itemJson);
  if (dayOrder != null && dayOrder !== "") body.day_order = Number(dayOrder);
  await todoistRequest(token, "POST", "tasks/move", body);
  return successResult();
}

async function runTaskQuickAdd(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  const text = resolveValue(node.parameters.text, itemJson);
  if (!text) throw new Error("Todoist: text is required for quick add");
  const body: Record<string, unknown> = { text: String(text) };
  const note = resolveValue(node.parameters.note, itemJson);
  if (note) body.note = String(note);
  const projectId = resolveValue(node.parameters.projectId, itemJson);
  if (projectId) body.project_id = String(projectId);
  const sectionId = resolveValue(node.parameters.sectionId, itemJson);
  if (sectionId) body.section_id = String(sectionId);
  const res = await todoistRequest(token, "POST", "quick/add", body);
  return { json: asObj(res) };
}

export const todoistToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail?.() ?? false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: i, input: 0 };
    try {
      const resource = String(node.parameters.resource ?? "task");
      const operation = String(node.parameters.operation ?? "create");
      if (resource !== "task") {
        throw new Error(`Todoist Tool: unsupported resource "${resource}"`);
      }
      const token = await getApiToken(ctx, node);
      if (!token) throw new Error("Todoist: API token is missing");
      let result: { json: Record<string, unknown> } | { json: Record<string, unknown> }[];
      switch (operation) {
        case "create":
          result = await runTaskCreate(token, node, itemJson);
          break;
        case "close":
          result = await runTaskClose(token, node, itemJson);
          break;
        case "delete":
          result = await runTaskDelete(token, node, itemJson);
          break;
        case "get":
          result = await runTaskGet(token, node, itemJson);
          break;
        case "getAll":
          result = await runTaskGetAll(token, node, itemJson);
          break;
        case "reopen":
          result = await runTaskReopen(token, node, itemJson);
          break;
        case "update":
          result = await runTaskUpdate(token, node, itemJson);
          break;
        case "move":
          result = await runTaskMove(token, node, itemJson);
          break;
        case "quickAdd":
          result = await runTaskQuickAdd(token, node, itemJson);
          break;
        default:
          throw new Error(`Todoist Tool: unsupported task operation "${operation}"`);
      }
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: msg }, pairedItem });
    }
  }
  return [out];
};

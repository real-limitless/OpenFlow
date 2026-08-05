import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://app.asana.com/api/1.0";

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

interface OpResult {
  json: Record<string, unknown>;
}
type OpResultList = OpResult | OpResult[];

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

export const asanaExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "Task");
  const operation = String(node.parameters.operation ?? "Create");
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
      out.push({ json: { error: { message, httpCode: code } }, pairedItem });
    }
  }

  return [out];
};

export async function getAuthHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const apiKeyCred = await ctx.getCredential("asanaApi");
  if (apiKeyCred) {
    const data = apiKeyCred as Record<string, unknown>;
    const token = String(data.accessToken ?? data.apiKey ?? "");
    if (token) return { Authorization: `Bearer ${token}` };
  }

  const oauthCred = await ctx.getCredential("asanaOAuth2Api");
  if (oauthCred) {
    const data = oauthCred as Record<string, unknown>;
    const token = String(data.accessToken ?? data.access_token ?? "");
    if (token) return { Authorization: `Bearer ${token}` };
  }

  throw new Error("Asana: No valid credential found. Configure asanaApi or asanaOAuth2Api.");
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const auth = await getAuthHeaders(ctx);

  switch (resource) {
    case "Project": return runProjectOperation(node, operation, itemJson, auth);
    case "Task": return runTaskOperation(node, operation, itemJson, auth);
    case "Subtask": return runSubtaskOperation(node, operation, itemJson, auth);
    case "Task Comment": return runTaskCommentOperation(node, operation, itemJson, auth);
    case "Task Tag": return runTaskTagOperation(node, operation, itemJson, auth);
    case "Task Project": return runTaskProjectOperation(node, operation, itemJson, auth);
    case "User": return runUserOperation(node, operation, itemJson, auth);
    default: throw new Error(`Asana: unsupported resource "${resource}"`);
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
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }

    if (response.status === 204) return {};
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed as Record<string, unknown>);
      const errMsg = (obj.message as string) ?? (obj.error as string) ?? `Asana API error: ${response.status}`;
      const err = new Error(errMsg);
      (err as Record<string, unknown>).status = response.status;
      throw err;
    }
    return asObj(parsed as Record<string, unknown>);
  } finally {
    clearTimeout(timer);
  }
}

function getParamRaw(node: INode, name: string, defaultValue = ""): unknown {
  return node.parameters[name] ?? defaultValue;
}

function getParamStr(node: INode, name: string, itemJson: Record<string, unknown>, defaultValue = ""): string {
  const raw = getParamRaw(node, name, defaultValue);
  return String(resolveValue(raw, itemJson) ?? defaultValue);
}

function getParamNum(node: INode, name: string, itemJson: Record<string, unknown>, defaultValue = 0): number {
  const raw = getParamRaw(node, name, defaultValue);
  return Number(resolveValue(raw, itemJson) ?? defaultValue);
}

function getOptions(node: INode): Record<string, unknown> {
  return (node.parameters.options as Record<string, unknown>) ?? {};
}

function getOptionStr(node: INode, key: string, itemJson: Record<string, unknown>, defaultValue = ""): string {
  const opts = getOptions(node);
  return String(resolveValue(opts[key], itemJson) ?? defaultValue);
}

function getOptionNum(node: INode, key: string, itemJson: Record<string, unknown>, defaultValue = 0): number {
  const opts = getOptions(node);
  return Number(resolveValue(opts[key], itemJson) ?? defaultValue);
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export async function runProjectOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const workspace = getParamStr(node, "workspace", itemJson);
    const name = getParamStr(node, "name", itemJson);
    if (!workspace) throw new Error("Asana: workspace is required for Project Create");
    if (!name) throw new Error("Asana: name is required for Project Create");
    const body: Record<string, unknown> = { data: { workspace, name } };
    const team = getParamStr(node, "team", itemJson);
    const notes = getParamStr(node, "notes", itemJson);
    const dueOn = getParamStr(node, "dueOn", itemJson);
    const privacySetting = getParamStr(node, "privacySetting", itemJson);
    const defaultView = getParamStr(node, "defaultView", itemJson);
    const color = getParamStr(node, "color", itemJson);
    if (team) body.data.team = team;
    if (notes) body.data.notes = notes;
    if (dueOn) body.data.due_on = dueOn;
    if (privacySetting) body.data.privacy_setting = privacySetting;
    if (defaultView) body.data.default_view = defaultView;
    if (color) body.data.color = color;
    const res = await apiRequest("POST", "/projects", auth, body);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  if (operation === "Delete") {
    const project = getParamStr(node, "project", itemJson);
    if (!project) throw new Error("Asana: project is required for Project Delete");
    await apiRequest("DELETE", `/projects/${project}`, auth);
    return { json: { gid: project, resource_type: "project", deleted: true } };
  }

  if (operation === "Get") {
    const project = getParamStr(node, "project", itemJson);
    if (!project) throw new Error("Asana: project is required for Project Get");
    const res = await apiRequest("GET", `/projects/${project}`, auth);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  if (operation === "GetAll") {
    const workspace = getParamStr(node, "workspace", itemJson);
    if (!workspace) throw new Error("Asana: workspace is required for Project GetAll");
    const params: Record<string, string> = { workspace };
    const archived = getParamStr(node, "archived", itemJson);
    const team = getParamStr(node, "team", itemJson);
    if (archived) params.archived = archived;
    if (team) params.team = team;
    const res = await apiRequest("GET", "/projects", auth, undefined, params);
    const data = res.data as Record<string, unknown>[] ?? [];
    return { json: data };
  }

  if (operation === "Update") {
    const project = getParamStr(node, "project", itemJson);
    if (!project) throw new Error("Asana: project is required for Project Update");
    const body: Record<string, unknown> = { data: {} };
    const name = getParamStr(node, "name", itemJson);
    const notes = getParamStr(node, "notes", itemJson);
    const dueOn = getParamStr(node, "dueOn", itemJson);
    const privacySetting = getParamStr(node, "privacySetting", itemJson);
    const defaultView = getParamStr(node, "defaultView", itemJson);
    const color = getParamStr(node, "color", itemJson);
    if (name) body.data.name = name;
    if (notes) body.data.notes = notes;
    if (dueOn) body.data.due_on = dueOn;
    if (privacySetting) body.data.privacy_setting = privacySetting;
    if (defaultView) body.data.default_view = defaultView;
    if (color) body.data.color = color;
    const res = await apiRequest("PUT", `/projects/${project}`, auth, body);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  throw new Error(`Asana: unsupported Project operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export async function runTaskOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const workspace = getParamStr(node, "workspace", itemJson);
    const name = getParamStr(node, "name", itemJson);
    if (!workspace) throw new Error("Asana: workspace is required for Task Create");
    if (!name) throw new Error("Asana: name is required for Task Create");
    const body: Record<string, unknown> = { data: { workspace, name } };
    const project = getParamStr(node, "project", itemJson);
    const notes = getParamStr(node, "notes", itemJson);
    const assignee = getParamStr(node, "assignee", itemJson);
    const dueOn = getParamStr(node, "dueOn", itemJson);
    const dueAt = getParamStr(node, "dueAt", itemJson);
    const completed = getParamStr(node, "completed", itemJson);
    const parent = getParamStr(node, "parent", itemJson);
    const tags = getParamStr(node, "tags", itemJson);
    const followers = getParamStr(node, "followers", itemJson);
    if (project) body.data.projects = [project];
    if (notes) body.data.notes = notes;
    if (assignee) body.data.assignee = assignee;
    if (dueOn) body.data.due_on = dueOn;
    if (dueAt) body.data.due_at = dueAt;
    if (completed !== "") body.data.completed = completed === "true" || completed === true;
    if (parent) body.data.parent = parent;
    if (tags) {
      try { body.data.tags = JSON.parse(String(tags)); } catch { body.data.tags = [tags]; }
    }
    if (followers) {
      try { body.data.followers = JSON.parse(String(followers)); } catch { body.data.followers = [followers]; }
    }
    const res = await apiRequest("POST", "/tasks", auth, body);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  if (operation === "Delete") {
    const task = getParamStr(node, "task", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Delete");
    await apiRequest("DELETE", `/tasks/${task}`, auth);
    return { json: { gid: task, resource_type: "task", deleted: true } };
  }

  if (operation === "Get") {
    const task = getParamStr(node, "task", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Get");
    const res = await apiRequest("GET", `/tasks/${task}`, auth);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  if (operation === "GetAll") {
    const project = getParamStr(node, "project", itemJson);
    if (!project) throw new Error("Asana: project is required for Task GetAll");
    const params: Record<string, string> = { project };
    const completedSince = getParamStr(node, "completedSince", itemJson);
    const modifiedSince = getParamStr(node, "modifiedSince", itemJson);
    const assignee = getParamStr(node, "assignee", itemJson);
    const optFields = getParamStr(node, "optFields", itemJson);
    if (completedSince) params.completed_since = completedSince;
    if (modifiedSince) params.modified_since = modifiedSince;
    if (assignee) params.assignee = assignee;
    if (optFields) params.opt_fields = optFields;
    const res = await apiRequest("GET", "/tasks", auth, undefined, params);
    const data = res.data as Record<string, unknown>[] ?? [];
    return { json: data };
  }

  if (operation === "Search") {
    const workspace = getParamStr(node, "workspace", itemJson);
    if (!workspace) throw new Error("Asana: workspace is required for Task Search");
    const params: Record<string, string> = { workspace };
    const text = getParamStr(node, "text", itemJson);
    const project = getParamStr(node, "project", itemJson);
    const assignee = getParamStr(node, "assignee", itemJson);
    const completed = getParamStr(node, "completed", itemJson);
    const modifiedSince = getParamStr(node, "modifiedSince", itemJson);
    if (text) params.text = text;
    if (project) params.project = project;
    if (assignee) params.assignee = assignee;
    if (completed) params.completed = completed;
    if (modifiedSince) params.modified_since = modifiedSince;
    const res = await apiRequest("GET", "/tasks/search", auth, undefined, params);
    const data = res.data as Record<string, unknown>[] ?? [];
    return { json: data };
  }

  if (operation === "Update") {
    const task = getParamStr(node, "task", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Update");
    const body: Record<string, unknown> = { data: {} };
    const name = getParamStr(node, "name", itemJson);
    const notes = getParamStr(node, "notes", itemJson);
    const assignee = getParamStr(node, "assignee", itemJson);
    const dueOn = getParamStr(node, "dueOn", itemJson);
    const dueAt = getParamStr(node, "dueAt", itemJson);
    const completed = getParamStr(node, "completed", itemJson);
    if (name) body.data.name = name;
    if (notes) body.data.notes = notes;
    if (assignee) body.data.assignee = assignee;
    if (dueOn) body.data.due_on = dueOn;
    if (dueAt) body.data.due_at = dueAt;
    if (completed !== "") body.data.completed = completed === "true" || completed === true;
    const res = await apiRequest("PUT", `/tasks/${task}`, auth, body);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  if (operation === "Move") {
    const task = getParamStr(node, "task", itemJson);
    const project = getParamStr(node, "project", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Move");
    if (!project) throw new Error("Asana: project is required for Task Move");
    const body: Record<string, unknown> = { data: { project } };
    await apiRequest("POST", `/tasks/${task}/addProject`, auth, body);
    const res = await apiRequest("GET", `/tasks/${task}`, auth);
    return { json: res.data as Record<string, unknown> ?? { gid: task, resource_type: "task", projects: [project] } };
  }

  throw new Error(`Asana: unsupported Task operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Subtask
// ---------------------------------------------------------------------------

export async function runSubtaskOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "Create") {
    const task = getParamStr(node, "task", itemJson);
    const name = getParamStr(node, "name", itemJson);
    if (!task) throw new Error("Asana: task is required for Subtask Create");
    if (!name) throw new Error("Asana: name is required for Subtask Create");
    const body: Record<string, unknown> = { data: { parent: task, name } };
    const notes = getParamStr(node, "notes", itemJson);
    const assignee = getParamStr(node, "assignee", itemJson);
    const dueOn = getParamStr(node, "dueOn", itemJson);
    if (notes) body.data.notes = notes;
    if (assignee) body.data.assignee = assignee;
    if (dueOn) body.data.due_on = dueOn;
    const res = await apiRequest("POST", "/tasks", auth, body);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  if (operation === "GetAll") {
    const task = getParamStr(node, "task", itemJson);
    if (!task) throw new Error("Asana: task is required for Subtask GetAll");
    const res = await apiRequest("GET", `/tasks/${task}/subtasks`, auth);
    const data = res.data as Record<string, unknown>[] ?? [];
    return { json: data };
  }

  throw new Error(`Asana: unsupported Subtask operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Task Comment
// ---------------------------------------------------------------------------

export async function runTaskCommentOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "Add") {
    const task = getParamStr(node, "task", itemJson);
    const text = getParamStr(node, "text", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Comment Add");
    if (!text) throw new Error("Asana: text is required for Task Comment Add");
    const body: Record<string, unknown> = { data: { text } };
    const res = await apiRequest("POST", `/tasks/${task}/stories`, auth, body);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  if (operation === "Remove") {
    const task = getParamStr(node, "task", itemJson);
    const comment = getParamStr(node, "comment", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Comment Remove");
    if (!comment) throw new Error("Asana: comment is required for Task Comment Remove");
    await apiRequest("DELETE", `/stories/${comment}`, auth);
    return { json: { gid: comment, resource_type: "story", deleted: true } };
  }

  throw new Error(`Asana: unsupported Task Comment operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Task Tag
// ---------------------------------------------------------------------------

export async function runTaskTagOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "Add") {
    const task = getParamStr(node, "task", itemJson);
    const tag = getParamStr(node, "tag", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Tag Add");
    if (!tag) throw new Error("Asana: tag is required for Task Tag Add");
    const body: Record<string, unknown> = { data: { tag } };
    await apiRequest("POST", `/tasks/${task}/addTag`, auth, body);
    return { json: { gid: task, resource_type: "task", tag: { gid: tag } } };
  }

  if (operation === "Remove") {
    const task = getParamStr(node, "task", itemJson);
    const tag = getParamStr(node, "tag", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Tag Remove");
    if (!tag) throw new Error("Asana: tag is required for Task Tag Remove");
    const body: Record<string, unknown> = { data: { tag } };
    await apiRequest("POST", `/tasks/${task}/removeTag`, auth, body);
    return { json: { gid: task, resource_type: "task", tag: { gid: tag, removed: true } } };
  }

  throw new Error(`Asana: unsupported Task Tag operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Task Project
// ---------------------------------------------------------------------------

export async function runTaskProjectOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "Add") {
    const task = getParamStr(node, "task", itemJson);
    const project = getParamStr(node, "project", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Project Add");
    if (!project) throw new Error("Asana: project is required for Task Project Add");
    const body: Record<string, unknown> = { data: { project } };
    await apiRequest("POST", `/tasks/${task}/addProject`, auth, body);
    return { json: { gid: task, resource_type: "task", project: { gid: project } } };
  }

  if (operation === "Remove") {
    const task = getParamStr(node, "task", itemJson);
    const project = getParamStr(node, "project", itemJson);
    if (!task) throw new Error("Asana: task is required for Task Project Remove");
    if (!project) throw new Error("Asana: project is required for Task Project Remove");
    const body: Record<string, unknown> = { data: { project } };
    await apiRequest("POST", `/tasks/${task}/removeProject`, auth, body);
    return { json: { gid: task, resource_type: "task", project: { gid: project, removed: true } } };
  }

  throw new Error(`Asana: unsupported Task Project operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export async function runUserOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  auth: Record<string, string>,
): Promise<OpResultList> {
  if (operation === "Get") {
    const user = getParamStr(node, "user", itemJson);
    if (!user) throw new Error("Asana: user is required for User Get");
    const res = await apiRequest("GET", `/users/${user}`, auth);
    return { json: res.data as Record<string, unknown> ?? res };
  }

  if (operation === "GetAll") {
    const workspace = getParamStr(node, "workspace", itemJson);
    if (!workspace) throw new Error("Asana: workspace is required for User GetAll");
    const res = await apiRequest("GET", `/workspaces/${workspace}/users`, auth);
    const data = res.data as Record<string, unknown>[] ?? [];
    return { json: data };
  }

  throw new Error(`Asana: unsupported User operation "${operation}"`);
}
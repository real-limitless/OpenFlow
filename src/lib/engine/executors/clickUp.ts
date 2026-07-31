import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.clickup.com/api/v2";

function rlValue(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null) {
    const v = (raw as Record<string, unknown>).value;
    return v ? String(v) : "";
  }
  return String(raw);
}

function asStr(raw: unknown, def = ""): string {
  if (!raw) return def;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>)) {
    return String((raw as Record<string, unknown>).value ?? def);
  }
  return String(raw);
}

function toNum(raw: unknown, def = 0): number {
  const n = Number(raw);
  return isNaN(n) ? def : n;
}

function buildQuery(params: Record<string, unknown>, keys: string[]): string {
  const q = new URLSearchParams();
  for (const k of keys) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== "") {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function apiCall(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: token,
    "Content-Type": "application/json",
  };
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* empty */
    }
    const errMsg = typeof parsed.err === "string" ? parsed.err : `ClickUp API error: ${res.status}`;
    throw new Error(errMsg);
  }
  if (res.status === 204) return { success: true };
  const text = await res.text();
  return text ? JSON.parse(text) : { success: true };
}

async function getToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = asStr(node.parameters.authentication, "accessToken");
  const credName = authentication === "oAuth2" ? "clickUpOAuth2Api" : "clickUpApi";
  const cred = await ctx.getCredential(credName);
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    const fallback = process.env.CLICKUP_ACCESS_TOKEN;
    if (fallback) return fallback;
    throw new Error("ClickUp: no credentials resolved and CLICKUP_ACCESS_TOKEN is not set");
  }
  if (authentication === "oAuth2") {
    return `Bearer ${accessToken}`;
  }
  return accessToken.startsWith("pk_") ? accessToken : `pk_${accessToken}`;
}

interface HandlerParams {
  ctx: ExecutionContext;
  node: INode;
  token: string;
  itemJson: Record<string, unknown>;
}

type ResourceHandler = (
  params: HandlerParams,
) => Promise<Record<string, unknown> | Record<string, unknown>[]>;

const handlers: Record<string, Record<string, ResourceHandler>> = {
  checklist: {
    create: async ({ node, token, itemJson }) => {
      const taskId = asStr(node.parameters.task);
      const name = asStr(node.parameters.checklistName);
      return apiCall("POST", `/task/${taskId}/checklist`, token, { name });
    },
    delete: async ({ node, token }) => {
      const checklistId = asStr(node.parameters.checklistId);
      return apiCall("DELETE", `/checklist/${checklistId}`, token);
    },
    update: async ({ node, token }) => {
      const checklistId = asStr(node.parameters.checklistId);
      const name = asStr(node.parameters.checklistName);
      return apiCall("PUT", `/checklist/${checklistId}`, token, { name });
    },
  },
  checklistItem: {
    create: async ({ node, token }) => {
      const checklistId = asStr(node.parameters.checklistId);
      const name = asStr(node.parameters.itemName);
      const body: Record<string, unknown> = { name };
      const assignee = asStr(node.parameters.assignee);
      if (assignee) body.assignee = toNum(assignee);
      return apiCall("POST", `/checklist/${checklistId}/checklist_item`, token, body);
    },
    delete: async ({ node, token }) => {
      const checklistId = asStr(node.parameters.checklistId);
      const itemId = asStr(node.parameters.itemId);
      return apiCall("DELETE", `/checklist/${checklistId}/checklist_item/${itemId}`, token);
    },
    update: async ({ node, token }) => {
      const checklistId = asStr(node.parameters.checklistId);
      const itemId = asStr(node.parameters.itemId);
      const body: Record<string, unknown> = {};
      const name = asStr(node.parameters.itemName);
      if (name) body.name = name;
      const assignee = asStr(node.parameters.assignee);
      if (assignee) body.assignee = toNum(assignee);
      const resolved = node.parameters.resolved;
      if (resolved !== undefined && resolved !== null) body.resolved = Boolean(resolved);
      return apiCall("PUT", `/checklist/${checklistId}/checklist_item/${itemId}`, token, body);
    },
  },
  comment: {
    create: async ({ node, token }) => {
      const scope = asStr(node.parameters.commentScope, "task");
      const scopeId = asStr(node.parameters.task);
      const text = asStr(node.parameters.commentText);
      const body: Record<string, unknown> = { comment_text: text };
      const notifyAll = node.parameters.notifyAll;
      if (notifyAll !== undefined) body.notify_all = Boolean(notifyAll);
      const assignee = asStr(node.parameters.assignee);
      if (assignee) body.assignee = toNum(assignee);
      return apiCall("POST", `/${scope}/${scopeId}/comment`, token, body);
    },
    delete: async ({ node, token }) => {
      const commentId = asStr(node.parameters.commentId);
      return apiCall("DELETE", `/comment/${commentId}`, token);
    },
    getAll: async ({ node, token }) => {
      const scope = asStr(node.parameters.commentScope, "task");
      const scopeId = asStr(node.parameters.task);
      const qs = buildQuery(node.parameters, ["page"]);
      return apiCall("GET", `/${scope}/${scopeId}/comment${qs}`, token);
    },
    update: async ({ node, token }) => {
      const commentId = asStr(node.parameters.commentId);
      const body: Record<string, unknown> = {};
      const text = asStr(node.parameters.commentText);
      if (text) body.comment_text = text;
      const resolved = node.parameters.resolved;
      if (resolved !== undefined && resolved !== null) body.resolved = Boolean(resolved);
      return apiCall("PUT", `/comment/${commentId}`, token, body);
    },
  },
  folder: {
    create: async ({ node, token }) => {
      const spaceId = rlValue(node.parameters.space);
      const name = asStr(node.parameters.folderName);
      return apiCall("POST", `/space/${spaceId}/folder`, token, { name });
    },
    delete: async ({ node, token }) => {
      const folderId = asStr(node.parameters.folderId);
      return apiCall("DELETE", `/folder/${folderId}`, token);
    },
    get: async ({ node, token }) => {
      const folderId = asStr(node.parameters.folderId);
      return apiCall("GET", `/folder/${folderId}`, token);
    },
    getAll: async ({ node, token }) => {
      const spaceId = rlValue(node.parameters.space);
      return apiCall("GET", `/space/${spaceId}/folder`, token);
    },
    update: async ({ node, token }) => {
      const folderId = asStr(node.parameters.folderId);
      const name = asStr(node.parameters.folderName);
      return apiCall("PUT", `/folder/${folderId}`, token, { name });
    },
  },
  goal: {
    create: async ({ node, token }) => {
      const workspaceId = rlValue(node.parameters.workspace);
      const body: Record<string, unknown> = {
        name: asStr(node.parameters.goalName),
      };
      const dueDate = asStr(node.parameters.dueDate);
      if (dueDate) body.due_date = toNum(dueDate);
      const desc = asStr(node.parameters.goalDescription);
      if (desc) body.description = desc;
      const color = asStr(node.parameters.color);
      if (color) body.color = color;
      const owners = node.parameters.multipleOwners as Record<string, unknown> | undefined;
      if (owners) {
        const ownerList = owners.owner as Array<Record<string, unknown>> | undefined;
        if (ownerList && ownerList.length > 0) {
          body.owners = ownerList.map((o) => ({
            ...(o.teamId ? { team_id: toNum(o.teamId) } : {}),
            ...(o.userId ? { user_id: toNum(o.userId) } : {}),
          }));
        }
      }
      return apiCall("POST", `/team/${workspaceId}/goal`, token, body);
    },
    delete: async ({ node, token }) => {
      const goalId = asStr(node.parameters.goalId);
      return apiCall("DELETE", `/goal/${goalId}`, token);
    },
    get: async ({ node, token }) => {
      const goalId = asStr(node.parameters.goalId);
      return apiCall("GET", `/goal/${goalId}`, token);
    },
    getAll: async ({ node, token }) => {
      const workspaceId = rlValue(node.parameters.workspace);
      return apiCall("GET", `/team/${workspaceId}/goal`, token);
    },
    update: async ({ node, token }) => {
      const goalId = asStr(node.parameters.goalId);
      const body: Record<string, unknown> = {};
      const name = asStr(node.parameters.goalName);
      if (name) body.name = name;
      const dueDate = asStr(node.parameters.dueDate);
      if (dueDate) body.due_date = toNum(dueDate);
      const desc = asStr(node.parameters.goalDescription);
      if (desc) body.description = desc;
      const color = asStr(node.parameters.color);
      if (color) body.color = color;
      return apiCall("PUT", `/goal/${goalId}`, token, body);
    },
  },
  goalKeyResult: {
    create: async ({ node, token }) => {
      const goalId = asStr(node.parameters.goalId);
      const body: Record<string, unknown> = {
        name: asStr(node.parameters.keyResultName),
        type: asStr(node.parameters.keyResultType, "number"),
      };
      const target = node.parameters.targetValue;
      if (target !== undefined && target !== null) body.target_value = toNum(target);
      const unit = asStr(node.parameters.unit);
      if (unit) body.unit = unit;
      return apiCall("POST", `/goal/${goalId}/key_result`, token, body);
    },
    delete: async ({ node, token }) => {
      const goalId = asStr(node.parameters.goalId);
      const krId = asStr(node.parameters.keyResultId);
      return apiCall("DELETE", `/goal/${goalId}/key_result/${krId}`, token);
    },
    update: async ({ node, token }) => {
      const goalId = asStr(node.parameters.goalId);
      const krId = asStr(node.parameters.keyResultId);
      const body: Record<string, unknown> = {};
      const name = asStr(node.parameters.keyResultName);
      if (name) body.name = name;
      return apiCall("PUT", `/goal/${goalId}/key_result/${krId}`, token, body);
    },
  },
  list: {
    create: async ({ node, token }) => {
      const folderId = rlValue(node.parameters.folder);
      const folderless = node.parameters.folderless;
      const spaceId = rlValue(node.parameters.space);
      const body: Record<string, unknown> = { name: asStr(node.parameters.listName) };
      const content = asStr(node.parameters.content);
      if (content) body.content = content;
      const priority = node.parameters.priority;
      if (priority !== undefined && priority !== null) body.priority = toNum(priority);
      const status = asStr(node.parameters.status);
      if (status) body.status = status;
      if (folderless || !folderId) {
        return apiCall("POST", `/space/${spaceId}/list`, token, body);
      }
      return apiCall("POST", `/folder/${folderId}/list`, token, body);
    },
    delete: async ({ node, token }) => {
      const listId = asStr(node.parameters.listId);
      return apiCall("DELETE", `/list/${listId}`, token);
    },
    get: async ({ node, token }) => {
      const listId = asStr(node.parameters.listId);
      return apiCall("GET", `/list/${listId}`, token);
    },
    getAll: async ({ node, token }) => {
      const folderId = rlValue(node.parameters.folder);
      const folderless = node.parameters.folderless;
      const spaceId = rlValue(node.parameters.space);
      if (folderless || !folderId) {
        return apiCall("GET", `/space/${spaceId}/list`, token);
      }
      return apiCall("GET", `/folder/${folderId}/list`, token);
    },
    getCustomFields: async ({ node, token }) => {
      const listId = asStr(node.parameters.listId);
      return apiCall("GET", `/list/${listId}/field`, token);
    },
    getMembers: async ({ node, token }) => {
      const listId = asStr(node.parameters.listId);
      return apiCall("GET", `/list/${listId}/member`, token);
    },
    update: async ({ node, token }) => {
      const listId = asStr(node.parameters.listId);
      const body: Record<string, unknown> = {};
      const name = asStr(node.parameters.listName);
      if (name) body.name = name;
      const priority = node.parameters.priority;
      if (priority !== undefined && priority !== null) body.priority = toNum(priority);
      const dueDate = asStr(node.parameters.dueDate);
      if (dueDate) body.due_date = toNum(dueDate);
      const status = asStr(node.parameters.status);
      if (status) body.status = status;
      const assignee = asStr(node.parameters.assignee);
      if (assignee) body.assignee = toNum(assignee);
      return apiCall("PUT", `/list/${listId}`, token, body);
    },
  },
  spaceTag: {
    create: async ({ node, token }) => {
      const spaceId = rlValue(node.parameters.space);
      const tag = asStr(node.parameters.tagName);
      const body: Record<string, unknown> = { tag };
      const fg = asStr(node.parameters.tagForegroundColor);
      if (fg) body.foreground_color = fg;
      const bg = asStr(node.parameters.tagBackgroundColor);
      if (bg) body.background_color = bg;
      return apiCall("POST", `/space/${spaceId}/tag`, token, body);
    },
    delete: async ({ node, token }) => {
      const spaceId = rlValue(node.parameters.space);
      const tag = asStr(node.parameters.tagName);
      return apiCall("DELETE", `/space/${spaceId}/tag/${encodeURIComponent(tag)}`, token);
    },
    getAll: async ({ node, token }) => {
      const spaceId = rlValue(node.parameters.space);
      return apiCall("GET", `/space/${spaceId}/tag`, token);
    },
    update: async ({ node, token }) => {
      const spaceId = rlValue(node.parameters.space);
      const tag = asStr(node.parameters.tagName);
      const body: Record<string, unknown> = {};
      const newName = asStr(node.parameters.newTagName);
      if (newName) body.tag = newName;
      const fg = asStr(node.parameters.tagForegroundColor);
      if (fg) body.foreground_color = fg;
      const bg = asStr(node.parameters.tagBackgroundColor);
      if (bg) body.background_color = bg;
      return apiCall("PUT", `/space/${spaceId}/tag/${encodeURIComponent(tag)}`, token, body);
    },
  },
  task: {
    create: async ({ node, token }) => {
      const listId = rlValue(node.parameters.list);
      const body: Record<string, unknown> = { name: asStr(node.parameters.taskName) };
      const desc = asStr(node.parameters.taskDescription);
      if (desc) body.description = desc;
      const assignees = asStr(node.parameters.assignees);
      if (assignees)
        body.assignees = assignees
          .split(",")
          .map((s) => toNum(s.trim()))
          .filter((n) => n > 0);
      const tags = asStr(node.parameters.tags);
      if (tags)
        body.tags = tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const status = asStr(node.parameters.taskStatus);
      if (status) body.status = status;
      const priority = node.parameters.priority;
      if (priority !== undefined && priority !== null) body.priority = toNum(priority);
      const dueDate = asStr(node.parameters.taskDueDate);
      if (dueDate) body.due_date = toNum(dueDate);
      const startDate = asStr(node.parameters.startDate);
      if (startDate) body.start_date = toNum(startDate);
      const timeEstimate = node.parameters.timeEstimate;
      if (timeEstimate !== undefined && timeEstimate !== null)
        body.time_estimate = toNum(timeEstimate);
      const parent = asStr(node.parameters.parentTask);
      if (parent) body.parent = parent;
      const linksTo = asStr(node.parameters.linksTo);
      if (linksTo) body.links_to = linksTo;
      const checkRequiredCustomFields = node.parameters.checkRequiredCustomFields;
      if (checkRequiredCustomFields) body.check_required_custom_fields = true;
      const customFieldsJson = asStr(node.parameters.customFieldsJson);
      if (customFieldsJson && customFieldsJson !== "{}") {
        try {
          body.custom_fields = JSON.parse(customFieldsJson);
        } catch {
          /* skip */
        }
      }
      return apiCall("POST", `/list/${listId}/task`, token, body);
    },
    delete: async ({ node, token }) => {
      const listId = rlValue(node.parameters.list);
      const taskId = asStr(node.parameters.taskId);
      return apiCall("DELETE", `/list/${listId}/task/${taskId}`, token);
    },
    get: async ({ node, token }) => {
      const listId = rlValue(node.parameters.list);
      const taskId = asStr(node.parameters.taskId);
      const qp: Record<string, string> = {};
      if (node.parameters.includeSubtasks) qp.include_subtasks = "true";
      if (node.parameters.includeMarkdownDescription) qp.include_markdown_description = "true";
      const qs = Object.keys(qp).length > 0 ? "?" + new URLSearchParams(qp).toString() : "";
      return apiCall("GET", `/list/${listId}/task/${taskId}${qs}`, token);
    },
    getAll: async ({ node, token }) => {
      const listId = rlValue(node.parameters.list);
      const limit = toNum(node.parameters.limit, 100);
      const items: Record<string, unknown>[] = [];
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const qp: Record<string, string> = { page: String(page) };
        if (node.parameters.order_by) qp.order_by = asStr(node.parameters.order_by);
        if (node.parameters.include_closed) qp.include_closed = "true";
        if (node.parameters.archived) qp.archived = "true";
        if (node.parameters.includeSubtasks) qp.include_subtasks = "true";
        if (node.parameters.includeMarkdownDescription) qp.include_markdown_description = "true";
        if (node.parameters.due_date_gt) qp.due_date_gt = asStr(node.parameters.due_date_gt);
        if (node.parameters.due_date_lt) qp.due_date_lt = asStr(node.parameters.due_date_lt);
        if (node.parameters.statuses) qp.statuses = asStr(node.parameters.statuses);
        const assignees = asStr(node.parameters.assignees);
        if (assignees) {
          qp["assignees[]"] = assignees;
        }
        const tags = asStr(node.parameters.tags);
        if (tags) {
          qp["tags[]"] = tags;
        }
        const qs = "?" + new URLSearchParams(qp).toString();
        const result = (await apiCall("GET", `/list/${listId}/task${qs}`, token)) as Record<
          string,
          unknown
        >;
        const tasks = (result.tasks as Array<Record<string, unknown>>) || [];
        for (const task of tasks) {
          items.push(task);
          if (limit > 0 && items.length >= limit) {
            hasMore = false;
            break;
          }
        }
        if (limit > 0 && items.length >= limit) {
          hasMore = false;
        }
        if (!tasks.length) {
          hasMore = false;
        }
        if (hasMore) page++;
      }
      return items;
    },
    getMembers: async ({ node, token }) => {
      const listId = rlValue(node.parameters.list);
      return apiCall("GET", `/list/${listId}/member`, token);
    },
    setCustomField: async ({ node, token }) => {
      const listId = rlValue(node.parameters.list);
      const taskId = asStr(node.parameters.taskId);
      const fieldId = asStr(node.parameters.customFieldId);
      const value = node.parameters.fieldValue;
      return apiCall("POST", `/list/${listId}/task/${taskId}/field/${fieldId}`, token, { value });
    },
    update: async ({ node, token }) => {
      const listId = rlValue(node.parameters.list);
      const taskId = asStr(node.parameters.taskId);
      const body: Record<string, unknown> = {};
      const name = asStr(node.parameters.taskName);
      if (name) body.name = name;
      const desc = asStr(node.parameters.taskDescription);
      if (desc) body.description = desc;
      const assignees = asStr(node.parameters.assignees);
      if (assignees)
        body.assignees = assignees
          .split(",")
          .map((s) => toNum(s.trim()))
          .filter((n) => n > 0);
      const tags = asStr(node.parameters.tags);
      if (tags)
        body.tags = tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const status = asStr(node.parameters.taskStatus);
      if (status) body.status = status;
      const priority = node.parameters.priority;
      if (priority !== undefined && priority !== null) body.priority = toNum(priority);
      const dueDate = asStr(node.parameters.taskDueDate);
      if (dueDate) body.due_date = toNum(dueDate);
      const startDate = asStr(node.parameters.startDate);
      if (startDate) body.start_date = toNum(startDate);
      const timeEstimate = node.parameters.timeEstimate;
      if (timeEstimate !== undefined && timeEstimate !== null)
        body.time_estimate = toNum(timeEstimate);
      const parent = asStr(node.parameters.parentTask);
      if (parent) body.parent = parent;
      const customFieldsJson = asStr(node.parameters.customFieldsJson);
      if (customFieldsJson && customFieldsJson !== "{}") {
        try {
          body.custom_fields = JSON.parse(customFieldsJson);
        } catch {
          /* skip */
        }
      }
      return apiCall("PUT", `/list/${listId}/task/${taskId}`, token, body);
    },
  },
  taskList: {
    add: async ({ node, token }) => {
      const taskId = asStr(node.parameters.taskListTaskId);
      const listId = asStr(node.parameters.taskListId);
      return apiCall("POST", `/list/${listId}/task/${taskId}`, token);
    },
    remove: async ({ node, token }) => {
      const taskId = asStr(node.parameters.taskListTaskId);
      const listId = asStr(node.parameters.taskListId);
      return apiCall("DELETE", `/list/${listId}/task/${taskId}`, token);
    },
  },
  taskTag: {
    add: async ({ node, token }) => {
      const taskId = asStr(node.parameters.taskTagTaskId);
      const listId = asStr(node.parameters.taskTagListId);
      const tagName = asStr(node.parameters.taskTagName);
      return apiCall(
        "POST",
        `/list/${listId}/task/${taskId}/tag/${encodeURIComponent(tagName)}`,
        token,
      );
    },
    remove: async ({ node, token }) => {
      const taskId = asStr(node.parameters.taskTagTaskId);
      const listId = asStr(node.parameters.taskTagListId);
      const tagName = asStr(node.parameters.taskTagName);
      return apiCall(
        "DELETE",
        `/list/${listId}/task/${taskId}/tag/${encodeURIComponent(tagName)}`,
        token,
      );
    },
  },
  taskDependency: {
    create: async ({ node, token }) => {
      const taskId = asStr(node.parameters.depTaskId);
      const dependsOn = asStr(node.parameters.dependsOnTaskId);
      const depType = asStr(node.parameters.dependencyType, "waiting_on");
      const body: Record<string, unknown> = {
        task_id: taskId,
        depends_on: dependsOn,
        type: toNum(depType === "blocking" ? 1 : 0),
      };
      return apiCall("POST", `/task/${taskId}/dependency`, token, body);
    },
    delete: async ({ node, token }) => {
      const taskId = asStr(node.parameters.depTaskId);
      const depId = asStr(node.parameters.dependencyId);
      return apiCall("DELETE", `/task/${taskId}/dependency?depends_on=${depId}`, token);
    },
  },
  timeEntry: {
    create: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const body: Record<string, unknown> = {
        start: asStr(node.parameters.teStart, String(Date.now())),
        duration: asStr(node.parameters.teDuration, "0"),
      };
      const taskId = asStr(node.parameters.teTaskId);
      if (taskId) body.task_id = taskId;
      const desc = asStr(node.parameters.teDescription);
      if (desc) body.description = desc;
      const tags = asStr(node.parameters.teTags);
      if (tags)
        body.tags = tags
          .split(",")
          .map((s) => ({ name: s.trim() }))
          .filter((t) => t.name);
      const billable = node.parameters.teBillable;
      if (billable) body.billable = true;
      const assignee = asStr(node.parameters.teAssignee);
      if (assignee) body.assignee = toNum(assignee);
      return apiCall("POST", `/team/${teamId}/time_entries`, token, body);
    },
    delete: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const teId = asStr(node.parameters.teId);
      return apiCall("DELETE", `/team/${teamId}/time_entries/${teId}`, token);
    },
    get: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const teId = asStr(node.parameters.teId);
      return apiCall("GET", `/team/${teamId}/time_entries/${teId}`, token);
    },
    getAll: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const taskId = asStr(node.parameters.teTaskId);
      let path = `/team/${teamId}/time_entries`;
      const qs = buildQuery(node.parameters, ["page", "start_date", "end_date"]);
      if (taskId) path += `?task_id=${taskId}`;
      if (qs) path += (taskId ? "&" : "?") + qs.slice(1);
      return apiCall("GET", path, token);
    },
    start: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const body: Record<string, unknown> = {};
      const taskId = asStr(node.parameters.teTaskId);
      if (taskId) body.task_id = taskId;
      const desc = asStr(node.parameters.teDescription);
      if (desc) body.description = desc;
      const tags = asStr(node.parameters.teTags);
      if (tags)
        body.tags = tags
          .split(",")
          .map((s) => ({ name: s.trim() }))
          .filter((t) => t.name);
      const billable = node.parameters.teBillable;
      if (billable) body.billable = true;
      const assignee = asStr(node.parameters.teAssignee);
      if (assignee) body.assignee = toNum(assignee);
      return apiCall("POST", `/team/${teamId}/time_entries/start`, token, body);
    },
    stop: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      return apiCall("POST", `/team/${teamId}/time_entries/stop`, token);
    },
    update: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const teId = asStr(node.parameters.teId);
      const body: Record<string, unknown> = {};
      const taskId = asStr(node.parameters.teTaskId);
      if (taskId) body.task_id = taskId;
      const desc = asStr(node.parameters.teDescription);
      if (desc) body.description = desc;
      const tags = asStr(node.parameters.teTags);
      if (tags)
        body.tags = tags
          .split(",")
          .map((s) => ({ name: s.trim() }))
          .filter((t) => t.name);
      const billable = node.parameters.teBillable;
      if (billable) body.billable = true;
      const assignee = asStr(node.parameters.teAssignee);
      if (assignee) body.assignee = toNum(assignee);
      return apiCall("PUT", `/team/${teamId}/time_entries/${teId}`, token, body);
    },
  },
  timeEntryTag: {
    addTag: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const teId = asStr(node.parameters.teId);
      const tagName = asStr(node.parameters.teTagName);
      return apiCall("POST", `/team/${teamId}/time_entries/${teId}/tags`, token, {
        tag_name: tagName,
      });
    },
    getAll: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const teId = asStr(node.parameters.teId);
      return apiCall("GET", `/team/${teamId}/time_entries/${teId}/tags`, token);
    },
    removeTag: async ({ node, token }) => {
      const teamId = rlValue(node.parameters.workspace);
      const teId = asStr(node.parameters.teId);
      const tagName = asStr(node.parameters.teTagName);
      return apiCall("DELETE", `/team/${teamId}/time_entries/${teId}/tags`, token, {
        tag_name: tagName,
      });
    },
  },
};

export const clickUpExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "task");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const handler = handlers[resource]?.[operation];
  if (!handler) {
    throw new Error(`ClickUp: unsupported resource/operation: ${resource}/${operation}`);
  }

  const token = await getToken(ctx, node);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await handler({ ctx, node, token, itemJson });
      if (Array.isArray(result)) {
        for (const r of result) {
          out.push({ json: r, pairedItem });
        }
      } else {
        out.push({ json: result, pairedItem });
      }
    } catch (err) {
      if (continueOnFail) {
        const message = err instanceof Error ? err.message : String(err);
        out.push({ json: { error: { message, code: 500 } }, pairedItem });
      } else {
        throw err;
      }
    }
  }

  return [out];
};

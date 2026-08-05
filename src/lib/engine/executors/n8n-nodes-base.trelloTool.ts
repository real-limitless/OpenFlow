import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.trello.com/1";

function rlValue(raw: unknown, itemJson: Record<string, unknown>): string {
  if (!raw) return "";
  if (typeof raw === "string") return asStr(resolveValue(raw, itemJson));
  if (typeof raw === "object" && raw !== null) {
    const v = (raw as Record<string, unknown>).value;
    return v ? asStr(resolveValue(String(v), itemJson)) : "";
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

function toBool(raw: unknown, def = false): boolean {
  if (raw === undefined || raw === null) return def;
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "1") return true;
  return false;
}

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

async function apiCall(
  method: string,
  path: string,
  key: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  if (body) {
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const res = await fetch(url.toString(), { method });
  if (!res.ok) {
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(text); } catch { /* empty */ }
    const errMsg = typeof parsed?.message === "string" ? String(parsed.message) : `Trello API error: ${res.status}`;
    throw new Error(errMsg);
  }
  if (res.status === 204) return { success: true };
  const text = await res.text();
  return text ? JSON.parse(text) : { success: true };
}

async function getCreds(ctx: ExecutionContext, node: INode): Promise<{ key: string; token: string }> {
  const cred = await ctx.getCredential("trelloApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  const apiToken = cred ? String(cred.apiToken ?? "") : "";
  if (!apiKey || !apiToken) {
    const envKey = process.env.TRELLO_API_KEY;
    const envToken = process.env.TRELLO_API_TOKEN;
    if (envKey && envToken) return { key: envKey, token: envToken };
    throw new Error("Trello Tool: no credentials resolved and TRELLO_API_KEY/TRELLO_API_TOKEN are not set");
  }
  return { key: apiKey, token: apiToken };
}

function mergeAdditionalFields(additionalFields: unknown, itemJson: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!additionalFields || typeof additionalFields !== "object") return out;
  const obj = additionalFields as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (key === "fields") continue;
    out[key] = resolveValue(value, itemJson);
  }
  const fields = obj.fields;
  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (f && typeof f === "object") {
        const name = String((f as Record<string, unknown>).name ?? "");
        const value = (f as Record<string, unknown>).value;
        if (name) out[name] = resolveValue(value, itemJson);
      }
    }
  }
  return out;
}

interface HandlerParams {
  ctx: ExecutionContext;
  node: INode;
  key: string;
  token: string;
  itemJson: Record<string, unknown>;
}

type ResourceHandler = (params: HandlerParams) => Promise<Record<string, unknown> | Record<string, unknown>[]>;

const handlers: Record<string, Record<string, ResourceHandler>> = {
  attachment: {
    create: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const body: Record<string, unknown> = { name: asStr(resolveValue(node.parameters.name, itemJson)) };
      const url = asStr(resolveValue(node.parameters.url, itemJson));
      if (url) body.url = url;
      const mimeType = asStr(resolveValue(node.parameters.mimeType, itemJson));
      if (mimeType) body.mimeType = mimeType;
      return apiCall("POST", `/cards/${cardId}/attachments`, key, token, body);
    },
    delete: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const attachmentId = asStr(resolveValue(node.parameters.attachmentId, itemJson));
      return apiCall("DELETE", `/cards/${cardId}/attachments/${attachmentId}`, key, token);
    },
    get: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const attachmentId = asStr(resolveValue(node.parameters.attachmentId, itemJson));
      const body: Record<string, unknown> = {};
      const fields = asStr(resolveValue(node.parameters.fields, itemJson));
      if (fields) body.fields = fields;
      return apiCall("GET", `/cards/${cardId}/attachments/${attachmentId}`, key, token, body);
    },
    getAll: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const body: Record<string, unknown> = {};
      const fields = asStr(resolveValue(node.parameters.fields, itemJson));
      if (fields) body.fields = fields;
      const filter = asStr(resolveValue(node.parameters.filter, itemJson));
      if (filter) body.filter = filter;
      return apiCall("GET", `/cards/${cardId}/attachments`, key, token, body);
    },
  },
  board: {
    create: async ({ node, key, token, itemJson }) => {
      const body: Record<string, unknown> = { name: asStr(resolveValue(node.parameters.name, itemJson)) };
      const desc = asStr(resolveValue(node.parameters.desc, itemJson));
      if (desc) body.desc = desc;
      const idOrganization = asStr(resolveValue(node.parameters.idOrganization, itemJson));
      if (idOrganization) body.idOrganization = idOrganization;
      const defaultLists = resolveValue(node.parameters.defaultLists, itemJson);
      if (defaultLists !== undefined) {
        body.defaultLists = String(toBool(defaultLists));
      }
      Object.assign(body, mergeAdditionalFields(node.parameters.additionalFields, itemJson));
      return apiCall("POST", "/boards", key, token, body);
    },
    delete: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      return apiCall("DELETE", `/boards/${boardId}`, key, token);
    },
    get: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const body: Record<string, unknown> = {};
      const fields = asStr(resolveValue(node.parameters.fields, itemJson));
      if (fields) body.fields = fields;
      return apiCall("GET", `/boards/${boardId}`, key, token, body);
    },
    update: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const body: Record<string, unknown> = {};
      const name = asStr(resolveValue(node.parameters.name, itemJson));
      if (name) body.name = name;
      const desc = asStr(resolveValue(node.parameters.desc, itemJson));
      if (desc) body.desc = desc;
      const closed = resolveValue(node.parameters.closed, itemJson);
      if (closed !== undefined) body.closed = String(toBool(closed));
      Object.assign(body, mergeAdditionalFields(node.parameters.additionalFields, itemJson));
      return apiCall("PUT", `/boards/${boardId}`, key, token, body);
    },
  },
  boardMember: {
    add: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const memberId = asStr(resolveValue(node.parameters.memberId, itemJson));
      return apiCall("PUT", `/boards/${boardId}/members/${memberId}`, key, token);
    },
    getAll: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      return apiCall("GET", `/boards/${boardId}/members`, key, token);
    },
    invite: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const body: Record<string, unknown> = {
        email: asStr(resolveValue(node.parameters.email, itemJson)),
        fullName: asStr(resolveValue(node.parameters.fullName, itemJson)),
      };
      return apiCall("PUT", `/boards/${boardId}/members`, key, token, body);
    },
    remove: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const memberId = asStr(resolveValue(node.parameters.memberId, itemJson));
      return apiCall("DELETE", `/boards/${boardId}/members/${memberId}`, key, token);
    },
  },
  card: {
    create: async ({ node, key, token, itemJson }) => {
      const listId = rlValue(node.parameters.listId, itemJson);
      const body: Record<string, unknown> = {
        name: asStr(resolveValue(node.parameters.name, itemJson)),
        idList: listId,
      };
      const desc = asStr(resolveValue(node.parameters.desc, itemJson));
      if (desc) body.desc = desc;
      Object.assign(body, mergeAdditionalFields(node.parameters.additionalFields, itemJson));
      return apiCall("POST", "/cards", key, token, body);
    },
    delete: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      return apiCall("DELETE", `/cards/${cardId}`, key, token);
    },
    get: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const body: Record<string, unknown> = {};
      const fields = asStr(resolveValue(node.parameters.fields, itemJson));
      if (fields) body.fields = fields;
      return apiCall("GET", `/cards/${cardId}`, key, token, body);
    },
    update: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const body: Record<string, unknown> = {};
      const name = asStr(resolveValue(node.parameters.name, itemJson));
      if (name) body.name = name;
      const desc = asStr(resolveValue(node.parameters.desc, itemJson));
      if (desc) body.desc = desc;
      const closed = resolveValue(node.parameters.closed, itemJson);
      if (closed !== undefined) body.closed = String(toBool(closed));
      Object.assign(body, mergeAdditionalFields(node.parameters.additionalFields, itemJson));
      return apiCall("PUT", `/cards/${cardId}`, key, token, body);
    },
  },
  cardComment: {
    create: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const text = asStr(resolveValue(node.parameters.text, itemJson));
      return apiCall("POST", `/cards/${cardId}/actions/comments`, key, token, { text });
    },
    delete: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const commentId = asStr(resolveValue(node.parameters.commentId, itemJson));
      return apiCall("DELETE", `/cards/${cardId}/actions/${commentId}/comments`, key, token);
    },
    update: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const commentId = asStr(resolveValue(node.parameters.commentId, itemJson));
      const text = asStr(resolveValue(node.parameters.text, itemJson));
      return apiCall("PUT", `/cards/${cardId}/actions/${commentId}/comments`, key, token, { text });
    },
  },
  checklist: {
    create: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const body: Record<string, unknown> = { name: asStr(resolveValue(node.parameters.name, itemJson)) };
      const pos = asStr(resolveValue(node.parameters.pos, itemJson));
      if (pos) body.pos = pos;
      return apiCall("POST", `/cards/${cardId}/checklists`, key, token, body);
    },
    createCheckItem: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const checklistId = asStr(resolveValue(node.parameters.checklistId, itemJson));
      const body: Record<string, unknown> = { name: asStr(resolveValue(node.parameters.name, itemJson)) };
      const pos = asStr(resolveValue(node.parameters.pos, itemJson));
      if (pos) body.pos = pos;
      const due = asStr(resolveValue(node.parameters.due, itemJson));
      if (due) body.due = due;
      const dueReminder = asStr(resolveValue(node.parameters.dueReminder, itemJson));
      if (dueReminder) body.dueReminder = dueReminder;
      const idMember = asStr(resolveValue(node.parameters.idMember, itemJson));
      if (idMember) body.idMember = idMember;
      return apiCall("POST", `/checklists/${checklistId}/checkItems`, key, token, body);
    },
    delete: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const checklistId = asStr(resolveValue(node.parameters.checklistId, itemJson));
      return apiCall("DELETE", `/cards/${cardId}/checklists/${checklistId}`, key, token);
    },
    deleteCheckItem: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const checklistId = asStr(resolveValue(node.parameters.checklistId, itemJson));
      const checkItemId = asStr(resolveValue(node.parameters.checkItemId, itemJson));
      return apiCall("DELETE", `/cards/${cardId}/checklist/${checklistId}/checkItem/${checkItemId}`, key, token);
    },
    get: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const checklistId = asStr(resolveValue(node.parameters.checklistId, itemJson));
      const body: Record<string, unknown> = {};
      const fields = asStr(resolveValue(node.parameters.fields, itemJson));
      if (fields) body.fields = fields;
      return apiCall("GET", `/cards/${cardId}/checklists/${checklistId}`, key, token, body);
    },
    getAll: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const body: Record<string, unknown> = {};
      const fields = asStr(resolveValue(node.parameters.fields, itemJson));
      if (fields) body.fields = fields;
      return apiCall("GET", `/cards/${cardId}/checklists`, key, token, body);
    },
    getCheckItem: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const checklistId = asStr(resolveValue(node.parameters.checklistId, itemJson));
      const checkItemId = asStr(resolveValue(node.parameters.checkItemId, itemJson));
      return apiCall("GET", `/cards/${cardId}/checklist/${checklistId}/checkItem/${checkItemId}`, key, token);
    },
    getCompletedCheckItems: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      return apiCall("GET", `/cards/${cardId}/checkItemStates`, key, token);
    },
    updateCheckItem: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const checklistId = asStr(resolveValue(node.parameters.checklistId, itemJson));
      const checkItemId = asStr(resolveValue(node.parameters.checkItemId, itemJson));
      const body: Record<string, unknown> = {};
      const name = asStr(resolveValue(node.parameters.name, itemJson));
      if (name) body.name = name;
      const state = asStr(resolveValue(node.parameters.state, itemJson));
      if (state) body.state = state;
      const due = asStr(resolveValue(node.parameters.due, itemJson));
      if (due) body.due = due;
      const dueReminder = asStr(resolveValue(node.parameters.dueReminder, itemJson));
      if (dueReminder) body.dueReminder = dueReminder;
      const idMember = asStr(resolveValue(node.parameters.idMember, itemJson));
      if (idMember) body.idMember = idMember;
      const pos = asStr(resolveValue(node.parameters.pos, itemJson));
      if (pos) body.pos = pos;
      return apiCall("PUT", `/cards/${cardId}/checklist/${checklistId}/checkItem/${checkItemId}`, key, token, body);
    },
  },
  label: {
    addLabel: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const labelId = asStr(resolveValue(node.parameters.labelId, itemJson));
      return apiCall("POST", `/cards/${cardId}/idLabels`, key, token, { value: labelId });
    },
    create: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const body: Record<string, unknown> = {
        name: asStr(resolveValue(node.parameters.name, itemJson)),
        color: asStr(resolveValue(node.parameters.color, itemJson), "green"),
      };
      return apiCall("POST", `/boards/${boardId}/labels`, key, token, body);
    },
    delete: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const labelId = asStr(resolveValue(node.parameters.labelId, itemJson));
      return apiCall("DELETE", `/boards/${boardId}/labels/${labelId}`, key, token);
    },
    get: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const labelId = asStr(resolveValue(node.parameters.labelId, itemJson));
      return apiCall("GET", `/boards/${boardId}/labels/${labelId}`, key, token);
    },
    getAll: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      return apiCall("GET", `/boards/${boardId}/labels`, key, token);
    },
    removeLabel: async ({ node, key, token, itemJson }) => {
      const cardId = rlValue(node.parameters.cardId, itemJson);
      const labelId = asStr(resolveValue(node.parameters.labelId, itemJson));
      return apiCall("DELETE", `/cards/${cardId}/idLabels/${labelId}`, key, token);
    },
    update: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const labelId = asStr(resolveValue(node.parameters.labelId, itemJson));
      const body: Record<string, unknown> = {};
      const name = asStr(resolveValue(node.parameters.name, itemJson));
      if (name) body.name = name;
      const color = asStr(resolveValue(node.parameters.color, itemJson));
      if (color) body.color = color;
      return apiCall("PUT", `/boards/${boardId}/labels/${labelId}`, key, token, body);
    },
  },
  list: {
    archive: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const listId = asStr(resolveValue(node.parameters.listId, itemJson));
      const body: Record<string, unknown> = { closed: String(toBool(resolveValue(node.parameters.closed, itemJson), true)) };
      return apiCall("PUT", `/boards/${boardId}/lists/${listId}`, key, token, body);
    },
    create: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const body: Record<string, unknown> = { name: asStr(resolveValue(node.parameters.name, itemJson)) };
      const pos = asStr(resolveValue(node.parameters.pos, itemJson));
      if (pos) body.pos = pos;
      return apiCall("POST", `/boards/${boardId}/lists`, key, token, body);
    },
    get: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      const listId = asStr(resolveValue(node.parameters.listId, itemJson));
      const body: Record<string, unknown> = {};
      const fields = asStr(resolveValue(node.parameters.fields, itemJson));
      if (fields) body.fields = fields;
      return apiCall("GET", `/boards/${boardId}/lists/${listId}`, key, token, body);
    },
    getAll: async ({ node, key, token, itemJson }) => {
      const boardId = rlValue(node.parameters.boardId, itemJson);
      return apiCall("GET", `/boards/${boardId}/lists`, key, token);
    },
    getCards: async ({ node, key, token, itemJson }) => {
      const listId = asStr(resolveValue(node.parameters.listId, itemJson));
      const body: Record<string, unknown> = {};
      const fields = asStr(resolveValue(node.parameters.fields, itemJson));
      if (fields) body.fields = fields;
      return apiCall("GET", `/lists/${listId}/cards`, key, token, body);
    },
    update: async ({ node, key, token, itemJson }) => {
      const listId = asStr(resolveValue(node.parameters.listId, itemJson));
      const body: Record<string, unknown> = {};
      const name = asStr(resolveValue(node.parameters.name, itemJson));
      if (name) body.name = name;
      const closed = resolveValue(node.parameters.closed, itemJson);
      if (closed !== undefined) body.closed = String(toBool(closed));
      const pos = asStr(resolveValue(node.parameters.pos, itemJson));
      if (pos) body.pos = pos;
      const subscribed = resolveValue(node.parameters.subscribed, itemJson);
      if (subscribed !== undefined) body.subscribed = String(toBool(subscribed));
      return apiCall("PUT", `/lists/${listId}`, key, token, body);
    },
  },
};

export const trelloToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "card");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const handler = handlers[resource]?.[operation];
  if (!handler) {
    throw new Error(`Trello Tool: unsupported resource/operation: ${resource}/${operation}`);
  }

  const { key, token } = await getCreds(ctx, node);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await handler({ ctx, node, key, token, itemJson });
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

import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.twist.com/api/v3";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return raw;
  }
  return raw;
}

const ENDPOINT_MAP: Record<string, Record<string, string>> = {
  channel: {
    create: "channels/add",
    archive: "channels/archive",
    unarchive: "channels/unarchive",
    delete: "channels/remove",
    get: "channels/getone",
    getAll: "channels/get",
    update: "channels/update",
  },
  comment: {
    create: "comments/add",
    delete: "comments/remove",
    get: "comments/getone",
    getAll: "comments/get",
    update: "comments/update",
  },
  messageConversation: {
    create: "conversations/messages/add",
    delete: "conversations/messages/remove",
    get: "conversations/messages/getone",
    getAll: "conversations/messages/get",
    update: "conversations/messages/update",
  },
  thread: {
    create: "threads/add",
    delete: "threads/remove",
    get: "threads/getone",
    getAll: "threads/get",
    update: "threads/update",
  },
};

export const twistExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "thread");
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
        out.push({ json: r, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("twistOAuth2Api");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("Twist: twistOAuth2Api credential is not configured");
  }
  return accessToken;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const endpoint = ENDPOINT_MAP[resource]?.[operation];
  if (!endpoint) {
    throw new Error(`Twist: unsupported resource/operation "${resource}/${operation}"`);
  }

  const token = await getToken(ctx);
  const body = buildBody(node, resource, operation, itemJson);
  const res = await twistRequest(token, "POST", endpoint, body);

  if (operation === "getAll") {
    const items = Array.isArray(res) ? res : (res as Record<string, unknown>[]);
    return items;
  }
  return res;
}

function buildBody(
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const p = node.parameters;

  const workspaceId = resolveValue(p.workspaceId, itemJson);
  if (workspaceId) body.workspace_id = Number(workspaceId);

  if (resource === "channel") {
    if (["archive", "unarchive", "delete", "get", "update"].includes(operation)) {
      const chId = resolveValue(p.channelId, itemJson);
      if (chId) body.id = Number(chId);
    }
    if (operation === "create") {
      if (p.name) body.name = String(p.name);
    }
    if (operation === "getAll") {
      if (workspaceId) body.workspace_id = Number(workspaceId);
    }
    if (operation === "update" || operation === "create") {
      const af = (p.additionalFields ?? {}) as Record<string, unknown>;
      if (af.description) body.description = String(af.description);
      if (af.color) body.color = String(af.color);
      if (af.icon) body.icon = String(af.icon);
      if (af.topic) body.topic = String(af.topic);
      if (af.users) body.users = af.users;
      if (af.guests) body.guests = af.guests;
      if (af.tempId !== undefined) body.temp_id = Number(af.tempId);
    }
  }

  if (resource === "comment") {
    if (["delete", "get", "update"].includes(operation)) {
      const commentId = resolveValue(p.commentId, itemJson);
      if (commentId) body.id = Number(commentId);
    }
    if (["create", "getAll"].includes(operation)) {
      const threadId = resolveValue(p.threadId, itemJson);
      if (threadId) body.thread_id = Number(threadId);
    }
    if (["create", "update"].includes(operation)) {
      if (p.content) body.content = String(p.content);
    }
    if (operation === "getAll") {
      if (workspaceId) body.workspace_id = Number(workspaceId);
      const channelId = resolveValue(p.channelId, itemJson);
      if (channelId) body.channel_id = Number(channelId);
    }
    if (operation === "create") {
      const af = (p.additionalFields ?? {}) as Record<string, unknown>;
      if (af.actions) body.actions = af.actions;
      if (af.attachments) body.attachments = af.attachments;
      if (af.tempId !== undefined) body.temp_id = Number(af.tempId);
    }
  }

  if (resource === "messageConversation") {
    if (["create", "getAll", "delete", "get", "update"].includes(operation)) {
      const convId = resolveValue(p.conversationId, itemJson);
      if (convId) body.conversation_id = Number(convId);
    }
    if (["create", "update"].includes(operation)) {
      if (p.content) body.content = String(p.content);
    }
    if (operation === "create") {
      const af = (p.additionalFields ?? {}) as Record<string, unknown>;
      if (af.actions) body.actions = af.actions;
      if (af.attachments) body.attachments = af.attachments;
      if (af.tempId !== undefined) body.temp_id = Number(af.tempId);
    }
  }

  if (resource === "thread") {
    if (["delete", "get", "update"].includes(operation)) {
      const threadId = resolveValue(p.threadId, itemJson);
      if (threadId) body.id = Number(threadId);
    }
    if (["create", "getAll"].includes(operation)) {
      const channelId = resolveValue(p.channelId, itemJson);
      if (channelId) body.channel_id = Number(channelId);
    }
    if (["create", "update"].includes(operation)) {
      if (p.title) body.title = String(p.title);
      if (p.content) body.content = String(p.content);
    }
    if (operation === "getAll") {
      if (workspaceId) body.workspace_id = Number(workspaceId);
    }
    if (["create", "update"].includes(operation)) {
      const af = (p.additionalFields ?? {}) as Record<string, unknown>;
      if (af.actions) body.actions = af.actions;
      if (af.attachments) body.attachments = af.attachments;
      if (af.tempId !== undefined) body.temp_id = Number(af.tempId);
      if (af.recipients) body.recipients = af.recipients;
    }
  }

  return body;
}

async function twistRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${API_BASE}/${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      signal: controller.signal,
    };
    if (body !== undefined) {
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
    if (response.status < 200 || response.status >= 300) {
      const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
      const errMsg = String(obj.error_string ?? obj.error ?? `Request failed with status ${response.status}`);
      throw new Error(errMsg);
    }
    return (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Twist:")) throw err;
    throw new Error(`Twist request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

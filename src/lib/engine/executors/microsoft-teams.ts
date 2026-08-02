import { ensureItems } from "@/sdk";
import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";

const API_BASE = "https://graph.microsoft.com/v1.0";

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}

export const microsoftTeamsExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "channel");
  const operation = String(node.parameters.operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, item);
      const list = Array.isArray(result) ? result : [result];
      for (const r of list) {
        out.push({ json: r.json, binary: r.binary, pairedItem });
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
  for (const credName of [
    "microsoftTeamsOAuth2Api",
    "microsoftOAuth2Api",
    "microsoftEntraServicePrincipalApi",
  ]) {
    const cred = (await ctx.getCredential(credName)) as Record<string, unknown> | null;
    if (cred) {
      const token = String(cred.accessToken ?? "");
      if (token) return token;
    }
  }
  throw new Error(
    "Microsoft Teams: no valid credential configured. " +
      "Try microsoftTeamsOAuth2Api, microsoftOAuth2Api, or microsoftEntraServicePrincipalApi.",
  );
}

function resolveParam(raw: unknown, itemJson: Record<string, unknown>): string {
  if (typeof raw !== "string") return raw == null ? "" : String(raw);
  if (/\{\{[\s\S]*?\}\}/.test(raw)) {
    const key = raw.replace(/\{\{\s*\$json\.(\w+)\s*\}\}/g, "$1").trim();
    const val = itemJson[key];
    return val == null ? raw : String(val);
  }
  return raw;
}

async function callGraph(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<unknown> {
  let url = `${API_BASE}${path}`;
  if (params && Object.keys(params).length > 0) url += "?" + new URLSearchParams(params).toString();
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    init.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  init.signal = controller.signal;
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (res.status < 200 || res.status >= 300) {
      const errObj = (parsed as Record<string, unknown>) ?? {};
      const inner = (errObj.error as Record<string, unknown>) ?? {};
      const message = String(
        inner.message ?? errObj.message ?? `${method} ${path} failed with ${res.status}`,
      );
      throw new Error(message);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function listAllPaginated(
  token: string,
  basePath: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let nextLink: string | null = basePath.startsWith("http") ? null : `${API_BASE}${basePath}`;
  if (basePath.startsWith("http")) nextLink = basePath;
  while (nextLink) {
    const init: RequestInit = {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    };
    const res = await fetch(nextLink, init);
    const data = (await res.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string };
    if (data.value) items.push(...data.value);
    nextLink = data["@odata.nextLink"] ?? null;
  }
  return items;
}

async function listPaginatedWithLimit(
  token: string,
  basePath: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let nextLink: string | null = `${API_BASE}${basePath}`;
  while (nextLink && items.length < limit) {
    const init: RequestInit = {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    };
    const res = await fetch(nextLink, init);
    const data = (await res.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string };
    if (data.value) items.push(...data.value.slice(0, limit - items.length));
    nextLink = data["@odata.nextLink"] ?? null;
  }
  return items;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult | OpResult[]> {
  if (resource === "channel") return runChannelOp(ctx, node, operation, itemJson);
  if (resource === "channelMessage") return runChannelMessageOp(ctx, node, operation, itemJson);
  if (resource === "chatMessage") return runChatMessageOp(ctx, node, operation, itemJson, item);
  if (resource === "task") return runTaskOp(ctx, node, operation, itemJson);
  throw new Error(`Microsoft Teams: unsupported resource "${resource}"`);
}

// ---- Channel operations ----
async function runChannelOp(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx);
  const teamId = resolveParam(node.parameters.teamId, itemJson);
  if (!teamId) throw new Error("Microsoft Teams: teamId is required");

  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
    const limit = Number(node.parameters.limit ?? 50);
    const channels = returnAll
      ? await listAllPaginated(token, `/teams/${encodeURIComponent(teamId)}/channels`)
      : await listPaginatedWithLimit(token, `/teams/${encodeURIComponent(teamId)}/channels`, limit);
    return channels.map((c) => ({ json: c }));
  }

  if (operation === "get") {
    const channelId = resolveParam(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Microsoft Teams: channelId is required");
    const result = await callGraph(
      token,
      "GET",
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`,
    );
    return { json: result as Record<string, unknown> };
  }

  if (operation === "create") {
    const displayName = resolveParam(node.parameters.displayName, itemJson) || "New Channel";
    const description = resolveParam(node.parameters.description, itemJson);
    const body: Record<string, unknown> = {
      displayName,
      description: description || undefined,
      membershipType: "standard",
    };
    const result = await callGraph(
      token,
      "POST",
      `/teams/${encodeURIComponent(teamId)}/channels`,
      body,
    );
    return { json: result as Record<string, unknown> };
  }

  if (operation === "delete") {
    const channelId = resolveParam(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Microsoft Teams: channelId is required");
    await callGraph(
      token,
      "DELETE",
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`,
    );
    return { json: itemJson };
  }

  if (operation === "update") {
    const channelId = resolveParam(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Microsoft Teams: channelId is required");
    const patch: Record<string, unknown> = {};
    const displayName = resolveParam(node.parameters.displayName, itemJson);
    if (displayName) patch.displayName = displayName;
    const description = resolveParam(node.parameters.description, itemJson);
    if (description) patch.description = description;
    const result = await callGraph(
      token,
      "PATCH",
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`,
      patch,
    );
    return { json: result as Record<string, unknown> };
  }

  throw new Error(`Microsoft Teams: unsupported channel operation "${operation}"`);
}

// ---- Channel Message operations ----
async function runChannelMessageOp(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx);
  const teamId = resolveParam(node.parameters.teamId, itemJson);
  if (!teamId) throw new Error("Microsoft Teams: teamId is required");
  const channelId = resolveParam(node.parameters.channelId, itemJson);
  if (!channelId) throw new Error("Microsoft Teams: channelId is required");

  if (operation === "create") {
    const messageText = resolveParam(node.parameters.messageText, itemJson);
    if (!messageText) throw new Error("Microsoft Teams: messageText is required");
    const body: Record<string, unknown> = {
      body: { content: messageText, contentType: "text" },
    };
    const result = await callGraph(
      token,
      "POST",
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
      body,
    );
    return { json: result as Record<string, unknown> };
  }

  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
    const limit = Number(node.parameters.limit ?? 50);
    const messages = returnAll
      ? await listAllPaginated(
          token,
          `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
        )
      : await listPaginatedWithLimit(
          token,
          `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
          limit,
        );
    return messages.map((m) => ({ json: m }));
  }

  throw new Error(`Microsoft Teams: unsupported channelMessage operation "${operation}"`);
}

// ---- Chat Message operations ----
async function runChatMessageOp(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx);
  const chatId = resolveParam(node.parameters.chatId, itemJson);
  if (!chatId) throw new Error("Microsoft Teams: chatId is required");

  if (operation === "create") {
    const messageText = resolveParam(node.parameters.messageText, itemJson);
    if (!messageText) throw new Error("Microsoft Teams: messageText is required");
    const body: Record<string, unknown> = {
      body: { content: messageText, contentType: "text" },
    };
    const result = await callGraph(
      token,
      "POST",
      `/chats/${encodeURIComponent(chatId)}/messages`,
      body,
    );
    return { json: result as Record<string, unknown> };
  }

  if (operation === "get") {
    const messageId = resolveParam(node.parameters.messageId, itemJson);
    if (!messageId) throw new Error("Microsoft Teams: messageId is required");
    const result = await callGraph(
      token,
      "GET",
      `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
    );
    return { json: result as Record<string, unknown> };
  }

  if (operation === "getAll") {
    const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
    const limit = Number(node.parameters.limit ?? 50);
    const messages = returnAll
      ? await listAllPaginated(token, `/chats/${encodeURIComponent(chatId)}/messages`)
      : await listPaginatedWithLimit(token, `/chats/${encodeURIComponent(chatId)}/messages`, limit);
    return messages.map((m) => ({ json: m }));
  }

  if (operation === "sendAndWait") {
    // Per spec: full wait-and-resume is out of scope.
    // Emit a placeholder outcome instead of hanging on a webhook.
    return { json: { approved: false, timeout: true } };
  }

  throw new Error(`Microsoft Teams: unsupported chatMessage operation "${operation}"`);
}

// ---- Task (Planner) operations ----
async function runTaskOp(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx);

  if (operation === "create") {
    const teamId = resolveParam(node.parameters.teamId, itemJson);
    if (!teamId) throw new Error("Microsoft Teams: teamId is required for task create");
    const title = resolveParam(node.parameters.taskTitle, itemJson);
    if (!title) throw new Error("Microsoft Teams: taskTitle is required");
    const dueDateTime = resolveParam(node.parameters.dueDateTime, itemJson);
    const body: Record<string, unknown> = {
      title,
      planId: teamId,
    };
    if (dueDateTime) {
      body.dueDateTime = dueDateTime;
    }
    const result = await callGraph(token, "POST", "/planner/tasks", body);
    return { json: result as Record<string, unknown> };
  }

  if (operation === "get") {
    const taskId = resolveParam(node.parameters.taskId, itemJson);
    if (!taskId) throw new Error("Microsoft Teams: taskId is required");
    const result = await callGraph(
      token,
      "GET",
      `/planner/tasks/${encodeURIComponent(taskId)}`,
    );
    return { json: result as Record<string, unknown> };
  }

  if (operation === "getAll") {
    // Note: task.getAll requires a planId or groupId. Using a simplified path.
    // Full implementation would need planId resolution from teamId.
    const returnAll = node.parameters.returnAll === true || node.parameters.returnAll === "true";
    const limit = Number(node.parameters.limit ?? 50);
    const tasks = returnAll
      ? await listAllPaginated(token, "/planner/tasks")
      : await listPaginatedWithLimit(token, "/planner/tasks", limit);
    return tasks.map((t) => ({ json: t }));
  }

  if (operation === "update") {
    const taskId = resolveParam(node.parameters.taskId, itemJson);
    if (!taskId) throw new Error("Microsoft Teams: taskId is required");
    const patch: Record<string, unknown> = {};
    const title = resolveParam(node.parameters.taskTitle, itemJson);
    if (title) patch.title = title;
    const dueDateTime = resolveParam(node.parameters.dueDateTime, itemJson);
    if (dueDateTime) patch.dueDateTime = dueDateTime;
    const result = await callGraph(token, "PATCH", `/planner/tasks/${encodeURIComponent(taskId)}`, patch);
    return { json: result as Record<string, unknown> };
  }

  if (operation === "delete") {
    const taskId = resolveParam(node.parameters.taskId, itemJson);
    if (!taskId) throw new Error("Microsoft Teams: taskId is required");
    await callGraph(token, "DELETE", `/planner/tasks/${encodeURIComponent(taskId)}`);
    return { json: itemJson };
  }

  throw new Error(`Microsoft Teams: unsupported task operation "${operation}"`);
}

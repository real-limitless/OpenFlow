import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function(
        "$json",
        `"use strict"; return (${raw.replace(/^\=/, "")})`,
      );
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

async function mattermostRequest(
  baseUrl: string,
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${baseUrl}/api/v4${endpoint}?${new URLSearchParams(params).toString()}`
    : `${baseUrl}/api/v4${endpoint}`;
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
    if (body !== undefined && method !== "GET") {
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
      const obj = asObj(parsed);
      const errMsg = String(obj.error ?? obj.message ?? `Request failed with status code ${response.status}`);
      throw new Error(errMsg);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Mattermost") || err.message.includes("Request failed"))) {
      throw err;
    }
    if (err instanceof Error) {
      throw new Error(`Mattermost request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getCreds(ctx: ExecutionContext): Promise<{ baseUrl: string; accessToken: string }> {
  const cred = await ctx.getCredential("mattermostApi");
  if (!cred) {
    throw new Error("Mattermost: mattermostApi credential is required");
  }
  const baseUrl = String(cred.baseUrl ?? "").replace(/\/+$/, "");
  const accessToken = String(cred.accessToken ?? "");
  if (!baseUrl || !accessToken) {
    throw new Error("Mattermost: baseUrl and accessToken are required in credential");
  }
  return { baseUrl, accessToken };
}

export const mattermostToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "channel");
  const operation = String(node.parameters.operation ?? "create");
  const continueOnFail = ctx.continueOnFail();

  const { baseUrl, accessToken } = await getCreds(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(baseUrl, accessToken, node, resource, operation, itemJson);
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

async function runOperation(
  baseUrl: string,
  token: string,
  node: { parameters: Record<string, unknown> },
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  if (resource === "channel") {
    return runChannelOperation(baseUrl, token, node, operation, itemJson);
  }
  if (resource === "message") {
    return runMessageOperation(baseUrl, token, node, operation, itemJson);
  }
  if (resource === "reaction") {
    return runReactionOperation(baseUrl, token, node, operation, itemJson);
  }
  if (resource === "user") {
    return runUserOperation(baseUrl, token, node, operation, itemJson);
  }
  throw new Error(`Mattermost: unsupported resource "${resource}"`);
}

async function runChannelOperation(
  baseUrl: string,
  token: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  if (operation === "create") {
    const displayName = String(resolveValue(node.parameters.displayName, itemJson) ?? "");
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    const type = String(node.parameters.type ?? "O");
    if (!displayName) throw new Error("Mattermost: displayName is required");
    if (!name) throw new Error("Mattermost: name is required");
    const body: Record<string, unknown> = { name, display_name: displayName, type };
    const teamId = resolveValue(node.parameters.teamId, itemJson);
    if (teamId) body.team_id = String(teamId);
    const purpose = resolveValue(node.parameters.purpose, itemJson);
    if (purpose) body.purpose = String(purpose);
    const header = resolveValue(node.parameters.header, itemJson);
    if (header) body.header = String(header);
    const res = await mattermostRequest(baseUrl, token, "POST", "/channels", body);
    return { json: res };
  }
  if (operation === "delete") {
    const channelId = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    if (!channelId) throw new Error("Mattermost: channelId is required");
    await mattermostRequest(baseUrl, token, "DELETE", `/channels/${channelId}`);
    return { json: { success: true } };
  }
  if (operation === "addUser") {
    const channelId = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    const userId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!channelId) throw new Error("Mattermost: channelId is required");
    if (!userId) throw new Error("Mattermost: userId is required");
    const body: Record<string, unknown> = { user_id: userId };
    await mattermostRequest(baseUrl, token, "POST", `/channels/${channelId}/members`, body);
    return { json: { success: true } };
  }
  if (operation === "members") {
    const channelId = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    if (!channelId) throw new Error("Mattermost: channelId is required");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { per_page: String(returnAll ? 200 : limit) };
    const res = await mattermostRequest(baseUrl, token, "GET", `/channels/${channelId}/members`, undefined, params);
    return Array.isArray(res) ? res.map((m: unknown) => ({ json: m as Record<string, unknown> })) : { json: res };
  }
  if (operation === "restore") {
    const channelId = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    if (!channelId) throw new Error("Mattermost: channelId is required");
    const res = await mattermostRequest(baseUrl, token, "POST", `/channels/${channelId}/restore`);
    return { json: res };
  }
  if (operation === "search") {
    const teamId = String(resolveValue(node.parameters.teamId, itemJson) ?? "");
    const searchTerm = String(resolveValue(node.parameters.searchTerm, itemJson) ?? "");
    if (!teamId) throw new Error("Mattermost: teamId is required");
    if (!searchTerm) throw new Error("Mattermost: searchTerm is required");
    const body: Record<string, unknown> = { term: searchTerm };
    const res = await mattermostRequest(baseUrl, token, "POST", `/teams/${teamId}/channels/search`, body);
    const list = Array.isArray(res) ? res : [];
    return list.map((c: unknown) => ({ json: c as Record<string, unknown> }));
  }
  if (operation === "statistics") {
    const channelId = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    if (!channelId) throw new Error("Mattermost: channelId is required");
    const res = await mattermostRequest(baseUrl, token, "GET", `/channels/${channelId}/stats`);
    return { json: res };
  }
  throw new Error(`Mattermost: unsupported channel operation "${operation}"`);
}

async function runMessageOperation(
  baseUrl: string,
  token: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  if (operation === "post") {
    const channelId = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    const messageText = String(resolveValue(node.parameters.message, itemJson) ?? "");
    if (!channelId) throw new Error("Mattermost: channelId is required");
    if (!messageText) throw new Error("Mattermost: message is required");
    const body: Record<string, unknown> = { channel_id: channelId, message: messageText };
    const rootId = resolveValue(node.parameters.rootId, itemJson);
    if (rootId) body.root_id = String(rootId);
    const props = resolveValue(node.parameters.props, itemJson);
    if (props) {
      if (typeof props === "string") {
        try { body.props = JSON.parse(props); } catch { body.props = props; }
      } else {
        body.props = props;
      }
    }
    const res = await mattermostRequest(baseUrl, token, "POST", "/posts", body);
    return { json: res };
  }
  if (operation === "postEphemeral") {
    const channelId = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    const messageText = String(resolveValue(node.parameters.message, itemJson) ?? "");
    const userId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!channelId) throw new Error("Mattermost: channelId is required");
    if (!messageText) throw new Error("Mattermost: message is required");
    if (!userId) throw new Error("Mattermost: userId is required");
    const body: Record<string, unknown> = { channel_id: channelId, message: messageText, user_id: userId };
    const res = await mattermostRequest(baseUrl, token, "POST", "/posts/ephemeral", body);
    return { json: res };
  }
  if (operation === "delete") {
    const postId = String(resolveValue(node.parameters.postId, itemJson) ?? "");
    if (!postId) throw new Error("Mattermost: postId is required");
    await mattermostRequest(baseUrl, token, "DELETE", `/posts/${postId}`);
    return { json: { success: true } };
  }
  throw new Error(`Mattermost: unsupported message operation "${operation}"`);
}

async function runReactionOperation(
  baseUrl: string,
  token: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  const postId = String(resolveValue(node.parameters.postId, itemJson) ?? "");
  if (!postId) throw new Error("Mattermost: postId is required");

  if (operation === "add") {
    const emojiName = String(resolveValue(node.parameters.emojiName, itemJson) ?? "");
    if (!emojiName) throw new Error("Mattermost: emojiName is required");
    const body: Record<string, unknown> = { post_id: postId, emoji_name: emojiName };
    const res = await mattermostRequest(baseUrl, token, "POST", "/reactions", body);
    return { json: res };
  }
  if (operation === "remove") {
    const emojiName = String(resolveValue(node.parameters.emojiName, itemJson) ?? "");
    if (!emojiName) throw new Error("Mattermost: emojiName is required");
    const body: Record<string, unknown> = { post_id: postId, emoji_name: emojiName };
    await mattermostRequest(baseUrl, token, "DELETE", `/users/me/posts/${postId}/reactions/${emojiName}`, body);
    return { json: { success: true } };
  }
  if (operation === "getAll") {
    const res = await mattermostRequest(baseUrl, token, "GET", `/posts/${postId}/reactions`);
    const list = Array.isArray(res) ? res : [];
    return list.map((r: unknown) => ({ json: r as Record<string, unknown> }));
  }
  throw new Error(`Mattermost: unsupported reaction operation "${operation}"`);
}

async function runUserOperation(
  baseUrl: string,
  token: string,
  node: { parameters: Record<string, unknown> },
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  if (operation === "create") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    const username = String(resolveValue(node.parameters.username, itemJson) ?? "");
    const password = String(resolveValue(node.parameters.password, itemJson) ?? "");
    if (!email) throw new Error("Mattermost: email is required");
    if (!username) throw new Error("Mattermost: username is required");
    if (!password) throw new Error("Mattermost: password is required");
    const body: Record<string, unknown> = { email, username, password };
    const authService = resolveValue(node.parameters.authService, itemJson);
    if (authService) body.auth_service = String(authService);
    const authData = resolveValue(node.parameters.authData, itemJson);
    if (authData) body.auth_data = String(authData);
    const locale = resolveValue(node.parameters.locale, itemJson);
    if (locale) body.locale = String(locale);
    const props = resolveValue(node.parameters.props, itemJson);
    if (props) body.props = props;
    const res = await mattermostRequest(baseUrl, token, "POST", "/users", body);
    return { json: res };
  }
  if (operation === "deactivate") {
    const userId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!userId) throw new Error("Mattermost: userId is required");
    await mattermostRequest(baseUrl, token, "DELETE", `/users/${userId}`);
    return { json: { success: true } };
  }
  if (operation === "getAll") {
    const teamId = resolveValue(node.parameters.teamId, itemJson);
    const inactive = Boolean(node.parameters.inactive);
    const page = Number(node.parameters.page ?? 0);
    const perPage = Number(node.parameters.perPage ?? 50);
    const params: Record<string, string> = { page: String(page), per_page: String(perPage) };
    if (teamId) params.in_team = String(teamId);
    if (inactive) params.inactive = "true";
    const res = await mattermostRequest(baseUrl, token, "GET", "/users", undefined, params);
    const list = Array.isArray(res) ? res : [];
    return list.map((u: unknown) => ({ json: u as Record<string, unknown> }));
  }
  if (operation === "getByEmail") {
    const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
    if (!email) throw new Error("Mattermost: email is required");
    const res = await mattermostRequest(baseUrl, token, "GET", `/users/email/${email}`);
    return { json: res };
  }
  if (operation === "getById") {
    const userId = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!userId) throw new Error("Mattermost: userId is required");
    const res = await mattermostRequest(baseUrl, token, "GET", `/users/${userId}`);
    return { json: res };
  }
  if (operation === "invite") {
    const teamId = String(resolveValue(node.parameters.teamId, itemJson) ?? "");
    const userIds = String(resolveValue(node.parameters.userIds, itemJson) ?? "");
    if (!teamId) throw new Error("Mattermost: teamId is required");
    if (!userIds) throw new Error("Mattermost: userIds is required");
    const body: Record<string, unknown> = { team_id: teamId, user_ids: userIds.split(",").map((s: string) => s.trim()) };
    await mattermostRequest(baseUrl, token, "POST", `/teams/${teamId}/invite`, body);
    return { json: { success: true } };
  }
  throw new Error(`Mattermost: unsupported user operation "${operation}"`);
}

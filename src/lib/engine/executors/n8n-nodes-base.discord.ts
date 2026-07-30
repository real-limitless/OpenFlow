import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://discord.com/api/v10";
const MAX_RETRIES = 5;

const FLAG_SUPPRESS_EMBEDS = 1 << 2;
const FLAG_SUPPRESS_NOTIFICATIONS = 1 << 12;
const FLAG_MAP: Record<string, number> = {
  SUPPRESS_EMBEDS: FLAG_SUPPRESS_EMBEDS,
  SUPPRESS_NOTIFICATIONS: FLAG_SUPPRESS_NOTIFICATIONS,
};

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveResourceLocator(raw: unknown, itemJson: Record<string, unknown>): string {
  const resolved = resolveValue(raw, itemJson);
  if (typeof resolved === "string") return resolved;
  if (resolved && typeof resolved === "object" && "value" in resolved) {
    return String(resolveValue((resolved as Record<string, unknown>).value, itemJson) ?? "");
  }
  return String(resolved ?? "");
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function parseJsonOrThrow(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Discord: invalid JSON in ${label}`);
  }
}

function resolveFlags(flags: unknown): number | undefined {
  if (flags === undefined || flags === null || flags === "") return undefined;
  if (typeof flags === "number") return flags;
  if (Array.isArray(flags)) {
    let bits = 0;
    for (const f of flags) {
      const key = String(f);
      bits |= FLAG_MAP[key] ?? Number(f) ?? 0;
    }
    return bits || undefined;
  }
  const num = Number(flags);
  return isNaN(num) ? undefined : num;
}

function buildEmbeds(
  embedsParam: unknown,
  itemJson: Record<string, unknown>,
): unknown[] {
  if (!embedsParam || typeof embedsParam !== "object") return [];
  const fc = embedsParam as { values?: unknown[] };
  if (!fc.values || !Array.isArray(fc.values)) return [];
  return fc.values
    .map((v) => {
      const entry = v as Record<string, unknown>;
      const inputMethod = String(entry.inputMethod ?? "fields");
      if (inputMethod === "json") {
        const raw = String(entry.embedsJson ?? entry.json ?? "");
        if (!raw) return null;
        return parseJsonOrThrow(raw, "embeds");
      }
      const embed: Record<string, unknown> = {};
      const title = resolveValue(entry.title, itemJson);
      if (title) embed.title = String(title);
      const description = resolveValue(entry.description, itemJson);
      if (description) embed.description = String(description);
      const color = resolveValue(entry.color, itemJson);
      if (color !== undefined && color !== "") embed.color = Number(color);
      const timestamp = resolveValue(entry.timestamp, itemJson);
      if (timestamp) embed.timestamp = String(timestamp);
      const url = resolveValue(entry.url, itemJson);
      if (url) embed.url = String(url);
      const image = resolveValue(entry.image, itemJson);
      if (image) embed.image = { url: String(image) };
      const thumbnail = resolveValue(entry.thumbnail, itemJson);
      if (thumbnail) embed.thumbnail = { url: String(thumbnail) };
      const video = resolveValue(entry.video, itemJson);
      if (video) embed.video = { url: String(video) };
      const author = resolveValue(entry.author, itemJson);
      if (author) embed.author = { name: String(author) };
      return embed;
    })
    .filter((e) => e !== null);
}

function collectFiles(
  filesParam: unknown,
  item: INodeExecutionData,
): Array<{ name: string; data: string; fileName: string; mimeType: string }> {
  if (!filesParam || typeof filesParam !== "object") return [];
  const fc = filesParam as { values?: unknown[] };
  if (!fc.values || !Array.isArray(fc.values)) return [];
  const files: Array<{ name: string; data: string; fileName: string; mimeType: string }> = [];
  for (let i = 0; i < fc.values.length; i++) {
    const entry = fc.values[i] as Record<string, unknown>;
    const fieldName = String(entry.inputFieldName ?? "data");
    const binary = item.binary?.[fieldName];
    if (!binary) continue;
    files.push({
      name: `files[${i}]`,
      data: String(binary.data ?? ""),
      fileName: String(binary.fileName ?? fieldName),
      mimeType: String(binary.mimeType ?? "application/octet-stream"),
    });
  }
  return files;
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
}

type OpResultList = OpResult | OpResult[];

export const discordExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();
  const isV1 = !node.parameters.authentication && !node.parameters.resource;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: OpResultList;
      if (isV1) {
        result = await v1WebhookSend(node, itemJson);
      } else {
        const authentication = String(node.parameters.authentication ?? "botToken");
        const resource = String(node.parameters.resource ?? "message");
        const operation = String(node.parameters.operation ?? "send");
        result = await runV2Operation(ctx, node, authentication, resource, operation, itemJson, item);
      }
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

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function getBotToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("discordBotApi");
  const token = cred ? String(cred.accessToken ?? cred.token ?? cred.botToken ?? "") : "";
  if (!token) throw new Error("Discord: discordBotApi credential is not configured");
  return token;
}

async function getOAuth2Token(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("discordOAuth2Api");
  const token = cred ? String(cred.accessToken ?? "") : "";
  if (!token) throw new Error("Discord: discordOAuth2Api credential is not configured");
  return token;
}

async function getWebhookUrl(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("discordWebhookApi");
  const url = cred ? String(cred.webhookUri ?? cred.url ?? "") : "";
  if (!url) throw new Error("Discord: discordWebhookApi credential is not configured");
  return url;
}

async function getToken(ctx: ExecutionContext, authentication: string): Promise<{ token: string; authType: string }> {
  if (authentication === "oAuth2") {
    return { token: await getOAuth2Token(ctx), authType: "Bearer" };
  }
  return { token: await getBotToken(ctx), authType: "Bot" };
}

// ---------------------------------------------------------------------------
// V1 Webhook Send (legacy)
// ---------------------------------------------------------------------------

async function v1WebhookSend(
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const webhookUri = String(resolveValue(node.parameters.webhookUri, itemJson) ?? "");
  if (!webhookUri) throw new Error("Discord: Webhook uri is required");
  const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;

  let body: Record<string, unknown>;
  if (options.payloadJson) {
    body = asObj(parseJsonOrThrow(String(options.payloadJson), "payloadJson"));
  } else {
    body = { content: text };
    if (options.tts !== undefined) body.tts = Boolean(options.tts);
    if (options.username) body.username = String(resolveValue(options.username, itemJson));
    if (options.avatarUrl) body.avatar_url = String(resolveValue(options.avatarUrl, itemJson));
    if (options.embeds) body.embeds = parseJsonOrThrow(String(options.embeds), "embeds");
    if (options.allowedMentions)
      body.allowed_mentions = parseJsonOrThrow(String(options.allowedMentions), "allowedMentions");
    if (options.components)
      body.components = parseJsonOrThrow(String(options.components), "components");
    if (options.attachments)
      body.attachments = parseJsonOrThrow(String(options.attachments), "attachments");
    const flags = resolveFlags(options.flags);
    if (flags !== undefined) body.flags = flags;
  }

  await discordWebhookPost(webhookUri, body);
  return { json: { success: true } };
}

// ---------------------------------------------------------------------------
// V2 operation router
// ---------------------------------------------------------------------------

async function runV2Operation(
  ctx: ExecutionContext,
  node: INode,
  authentication: string,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  if (authentication === "webhook") {
    return runWebhookOperation(ctx, node, operation, itemJson, item);
  }

  const { token, authType } = await getToken(ctx, authentication);

  // TODO: OAuth2 guild access check via /users/@me/guilds (inferred behavior)

  if (resource === "channel") {
    return runChannelOperation(token, authType, node, operation, itemJson);
  }
  if (resource === "message") {
    return runMessageOperation(token, authType, node, operation, itemJson, item);
  }
  if (resource === "member") {
    return runMemberOperation(token, authType, node, operation, itemJson);
  }
  throw new Error(`Discord: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Channel operations
// ---------------------------------------------------------------------------

async function runChannelOperation(
  token: string,
  authType: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "create") {
    const guildId = resolveResourceLocator(node.parameters.guildId, itemJson);
    if (!guildId) throw new Error("Discord: guildId is required");
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Discord: name is required");
    const type = Number(node.parameters.type ?? 0);
    const body: Record<string, unknown> = { name, type };
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    if (options.nsfw !== undefined) body.nsfw = Boolean(options.nsfw);
    if (options.bitrate !== undefined) body.bitrate = Number(options.bitrate);
    if (options.categoryId) body.parent_id = resolveResourceLocator(options.categoryId, itemJson);
    if (options.position !== undefined) body.position = Number(options.position);
    if (options.rate_limit_per_user !== undefined)
      body.rate_limit_per_user = Number(options.rate_limit_per_user);
    if (options.topic) body.topic = String(resolveValue(options.topic, itemJson));
    if (options.user_limit !== undefined) body.user_limit = Number(options.user_limit);
    const res = await discordRequest(token, authType, "POST", `/guilds/${guildId}/channels`, body);
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    await discordRequest(token, authType, "DELETE", `/channels/${channelId}`);
    return { json: { success: true } };
  }

  if (operation === "get") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const res = await discordRequest(token, authType, "GET", `/channels/${channelId}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    const guildId = resolveResourceLocator(node.parameters.guildId, itemJson);
    if (!guildId) throw new Error("Discord: guildId is required");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const simplify = options.simplify !== false;
    const filter = options.filter as string[] | undefined;
    const res = await discordRequest(token, authType, "GET", `/guilds/${guildId}/channels`);
    let channels = (res as Record<string, unknown>[]).filter(Boolean);
    if (filter && Array.isArray(filter) && filter.length > 0) {
      channels = channels.filter((c) => filter.includes(String(c.type)));
    }
    if (!returnAll) channels = channels.slice(0, limit);
    if (simplify) {
      channels = channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        guild_id: c.guild_id ?? guildId,
      }));
    }
    return channels.map((c) => ({ json: c }));
  }

  if (operation === "update") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const body: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    if (options.nsfw !== undefined) body.nsfw = Boolean(options.nsfw);
    if (options.bitrate !== undefined) body.bitrate = Number(options.bitrate);
    if (options.categoryId) body.parent_id = resolveResourceLocator(options.categoryId, itemJson);
    if (options.position !== undefined) body.position = Number(options.position);
    if (options.rate_limit_per_user !== undefined)
      body.rate_limit_per_user = Number(options.rate_limit_per_user);
    if (options.topic) body.topic = String(resolveValue(options.topic, itemJson));
    if (options.user_limit !== undefined) body.user_limit = Number(options.user_limit);
    const res = await discordRequest(token, authType, "PATCH", `/channels/${channelId}`, body);
    return { json: asObj(res) };
  }

  throw new Error(`Discord: unsupported channel operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Message operations
// ---------------------------------------------------------------------------

async function runMessageOperation(
  token: string,
  authType: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  if (operation === "send" || operation === "sendAndWait") {
    return sendMessage(token, authType, node, itemJson, item, operation === "sendAndWait");
  }
  if (operation === "get") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!messageId) throw new Error("Discord: messageId is required");
    const res = await discordRequest(token, authType, "GET", `/channels/${channelId}/messages/${messageId}`);
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    if (options.simplify !== false) {
      return { json: simplifyMessage(asObj(res)) };
    }
    return { json: asObj(res) };
  }
  if (operation === "getAll") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const simplify = options.simplify !== false;
    const messages = await discordRequestAll(
      token,
      authType,
      `/channels/${channelId}/messages`,
      returnAll,
      limit,
      {},
    );
    if (simplify) {
      return messages.map((m) => ({ json: simplifyMessage(m) }));
    }
    return messages.map((m) => ({ json: m }));
  }
  if (operation === "react") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!messageId) throw new Error("Discord: messageId is required");
    const emoji = String(resolveValue(node.parameters.emoji, itemJson) ?? "");
    if (!emoji) throw new Error("Discord: emoji is required");
    const encodedEmoji = encodeURIComponent(emoji);
    await discordRequest(
      token,
      authType,
      "PUT",
      `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`,
    );
    return { json: { success: true } };
  }
  if (operation === "delete") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!messageId) throw new Error("Discord: messageId is required");
    await discordRequest(token, authType, "DELETE", `/channels/${channelId}/messages/${messageId}`);
    return { json: { success: true } };
  }
  throw new Error(`Discord: unsupported message operation "${operation}"`);
}

function simplifyMessage(msg: Record<string, unknown>): Record<string, unknown> {
  return {
    id: msg.id,
    channel_id: msg.channel_id,
    author: msg.author,
    content: msg.content,
    timestamp: msg.timestamp,
    embeds: msg.embeds,
    attachments: msg.attachments,
  };
}

async function sendMessage(
  token: string,
  authType: string,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  isWait: boolean,
): Promise<OpResult> {
  const sendTo = String(node.parameters.sendTo ?? "channel");
  let channelId: string;

  if (sendTo === "user") {
    const userId = resolveResourceLocator(node.parameters.userId, itemJson);
    if (!userId) throw new Error("Discord: userId is required");
    const dmRes = await discordRequest(token, authType, "POST", "/users/@me/channels", {
      recipient_id: userId,
    });
    channelId = String((dmRes as Record<string, unknown>).id ?? "");
    if (!channelId) throw new Error("Discord: failed to create DM channel");
  } else {
    channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
  }

  if (!channelId) throw new Error("Discord: channelId is required");

  const content = String(resolveValue(node.parameters.content, itemJson) ?? "");
  const embeds = buildEmbeds(node.parameters.embeds, itemJson);
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;

  if (!content && embeds.length === 0) {
    throw new Error("Discord: Either content or embeds must be set");
  }

  const body: Record<string, unknown> = {};
  if (content) body.content = content;
  if (embeds.length > 0) body.embeds = embeds;
  if (options.tts !== undefined) body.tts = Boolean(options.tts);
  const flags = resolveFlags(options.flags);
  if (flags !== undefined) body.flags = flags;
  if (options.message_reference) {
    body.message_reference = {
      message_id: String(resolveValue(options.message_reference, itemJson)),
    };
  }

  const files = collectFiles(node.parameters.files, item);
  let res: unknown;
  if (files.length > 0) {
    res = await discordRequestMultipart(token, authType, `/channels/${channelId}/messages`, body, files);
  } else {
    res = await discordRequest(token, authType, "POST", `/channels/${channelId}/messages`, body);
  }

  if (isWait) {
    // TODO: implement putExecutionToWait + sendAndWaitWebhook resume.
    // On resume, original input items should be returned.
    return { json: { ...itemJson } };
  }
  return { json: asObj(res) };
}

// ---------------------------------------------------------------------------
// Member operations
// ---------------------------------------------------------------------------

async function runMemberOperation(
  token: string,
  authType: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (operation === "getAll") {
    const guildId = resolveResourceLocator(node.parameters.guildId, itemJson);
    if (!guildId) throw new Error("Discord: guildId is required");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const after = String(resolveValue(node.parameters.after, itemJson) ?? "");
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const simplify = options.simplify !== false;
    const params: Record<string, string> = {};
    if (after) params.after = after;
    const members = await discordRequestAll(
      token,
      authType,
      `/guilds/${guildId}/members`,
      returnAll,
      limit,
      params,
    );
    if (simplify) {
      return members.map((m) => ({
        json: {
          user: m.user,
          roles: m.roles,
          permissions: m.permissions,
        },
      }));
    }
    return members.map((m) => ({ json: m }));
  }

  if (operation === "roleAdd" || operation === "roleRemove") {
    const guildId = resolveResourceLocator(node.parameters.guildId, itemJson);
    if (!guildId) throw new Error("Discord: guildId is required");
    const userId = resolveResourceLocator(node.parameters.userId, itemJson);
    if (!userId) throw new Error("Discord: userId is required");
    const roles = node.parameters.role;
    const roleList = Array.isArray(roles) ? roles : [roles];
    const method = operation === "roleAdd" ? "PUT" : "DELETE";
    for (const roleId of roleList) {
      const rid = String(resolveValue(roleId, itemJson));
      if (!rid) continue;
      await discordRequest(
        token,
        authType,
        method,
        `/guilds/${guildId}/members/${userId}/roles/${rid}`,
      );
    }
    return { json: { success: true } };
  }

  throw new Error(`Discord: unsupported member operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// V2 Webhook operations (authentication=webhook)
// ---------------------------------------------------------------------------

async function runWebhookOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  if (operation !== "sendLegacy" && operation !== "send") {
    throw new Error(`Discord: unsupported webhook operation "${operation}"`);
  }

  const webhookUrl = await getWebhookUrl(ctx);
  const content = String(resolveValue(node.parameters.content, itemJson) ?? "");
  const embeds = buildEmbeds(node.parameters.embeds, itemJson);
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;

  if (!content && embeds.length === 0) {
    throw new Error("Discord: Either content or embeds must be set");
  }

  const body: Record<string, unknown> = {};
  if (content) body.content = content;
  if (embeds.length > 0) body.embeds = embeds;
  if (options.tts !== undefined) body.tts = Boolean(options.tts);
  if (options.username) body.username = String(resolveValue(options.username, itemJson));
  if (options.avatar_url) body.avatar_url = String(resolveValue(options.avatar_url, itemJson));
  const flags = resolveFlags(options.flags);
  if (flags !== undefined) body.flags = flags;
  const wait = Boolean(options.wait);

  const files = collectFiles(node.parameters.files, item);
  const url = wait ? `${webhookUrl}?wait=true` : webhookUrl;

  let res: unknown;
  if (files.length > 0) {
    res = await discordWebhookMultipart(url, body, files);
  } else {
    res = await discordWebhookPost(url, body);
  }

  if (wait) {
    return { json: asObj(res) };
  }
  return { json: { success: true } };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function authHeader(authType: string, token: string): string {
  return `${authType} ${token}`;
}

async function discordRequest(
  token: string,
  authType: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = params
    ? `${API_BASE}${path}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}${path}`;
  return discordFetch(url, method, authHeader(authType, token), body);
}

async function discordRequestAll(
  token: string,
  authType: string,
  path: string,
  returnAll: boolean,
  limit: number,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  const pageSize = returnAll ? 100 : Math.min(limit, 100);
  let lastId = "";

  do {
    const pageParams: Record<string, string> = { ...params, limit: String(pageSize) };
    if (lastId) pageParams.before = lastId;
    const res = await discordRequest(token, authType, "GET", path, undefined, pageParams);
    const items = (res as Record<string, unknown>[]).filter(Boolean);
    if (items.length === 0) break;
    results.push(...items);
    lastId = String(items[items.length - 1].id ?? "");
    if (!returnAll) break;
  } while (returnAll && lastId && results.length < 10000);

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}

async function discordRequestMultipart(
  token: string,
  authType: string,
  path: string,
  payload: Record<string, unknown>,
  files: Array<{ name: string; data: string; fileName: string; mimeType: string }>,
): Promise<unknown> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  for (const file of files) {
    const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: file.mimeType });
    form.append(file.name, blob, file.fileName);
  }
  return discordFetchForm(`${API_BASE}${path}`, "POST", authHeader(authType, token), form);
}

async function discordWebhookPost(
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return discordFetch(url, "POST", "", body);
}

async function discordWebhookMultipart(
  url: string,
  payload: Record<string, unknown>,
  files: Array<{ name: string; data: string; fileName: string; mimeType: string }>,
): Promise<unknown> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  for (const file of files) {
    const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: file.mimeType });
    form.append(file.name, blob, file.fileName);
  }
  return discordFetchForm(url, "POST", "", form);
}

async function discordFetch(
  url: string,
  method: string,
  auth: string,
  body?: Record<string, unknown>,
  attempt = 0,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      signal: controller.signal,
    };
    if (auth) init.headers = { ...init.headers, Authorization: auth };
    if (body !== undefined && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    return await handleDiscordResponse(response, url, method, auth, body, attempt);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Discord:")) throw err;
    throw new Error(`Discord request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function discordFetchForm(
  url: string,
  method: string,
  auth: string,
  form: FormData,
  attempt = 0,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const init: RequestInit = { method, body: form, signal: controller.signal };
    if (auth) init.headers = { Authorization: auth };
    const response = await fetch(url, init);
    return await handleDiscordResponse(response, url, method, auth, undefined, attempt, true);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Discord:")) throw err;
    throw new Error(`Discord request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function handleDiscordResponse(
  response: Response,
  url: string,
  method: string,
  auth: string,
  body: Record<string, unknown> | undefined,
  attempt: number,
  isForm = false,
): Promise<unknown> {
  if (response.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = parseFloat(response.headers.get("retry-after") ?? "1");
    const resetAfter = parseFloat(response.headers.get("x-ratelimit-reset-after") ?? "0");
    const delay = (retryAfter || resetAfter || Math.pow(2, attempt)) * 1000;
    await new Promise((r) => setTimeout(r, delay));
    if (isForm) {
      // Rebuild form is not possible here; fall through to error
      throw new Error("Discord: rate limited on multipart request");
    }
    return discordFetch(url, method, auth, body, attempt + 1);
  }

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }

  if (response.status < 200 || response.status >= 300) {
    const obj = asObj(parsed);
    const discordMsg = obj.message ? String(obj.message) : "";
    const errMsg = discordMsg || `Request failed with status code ${response.status}`;
    throw new Error(`Discord: ${errMsg}`);
  }

  if (response.status === 204 || !text) {
    return { success: true };
  }
  return parsed;
}
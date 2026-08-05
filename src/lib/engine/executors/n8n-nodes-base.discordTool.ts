import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://discord.com/api/v10";

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
    return String((resolved as Record<string, unknown>).value ?? "");
  }
  return String(resolved ?? "");
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function parseJsonMaybe(raw: unknown): unknown {
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function hexToInt(color: unknown): number | undefined {
  if (color == null || color === "") return undefined;
  if (typeof color === "number" && Number.isFinite(color)) return color;
  const s = String(color).trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(s)) {
    return parseInt(s.replace(/^#/, ""), 16);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function buildEmbeds(raw: unknown, itemJson: Record<string, unknown>): unknown[] | undefined {
  const resolved = resolveValue(raw, itemJson);
  if (resolved == null || resolved === "") return undefined;
  if (typeof resolved === "string") {
    const parsed = parseJsonMaybe(resolved);
    return Array.isArray(parsed) ? parsed : undefined;
  }
  if (Array.isArray(resolved)) return resolved;
  if (resolved && typeof resolved === "object") {
    const values = (resolved as { values?: unknown[] }).values;
    if (!Array.isArray(values)) return undefined;
    return values.map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      if (e.inputMethod === "json") {
        const parsed = parseJsonMaybe(e.json ?? e.embedsJson);
        if (Array.isArray(parsed)) return parsed[0] ?? {};
        if (parsed && typeof parsed === "object") return parsed;
        return {};
      }
      const embed: Record<string, unknown> = {};
      if (e.title) embed.title = e.title;
      if (e.description) embed.description = e.description;
      if (e.url) embed.url = e.url;
      if (e.timestamp) embed.timestamp = e.timestamp;
      const color = hexToInt(e.color);
      if (color !== undefined) embed.color = color;
      if (e.author) embed.author = typeof e.author === "string" ? { name: e.author } : e.author;
      if (e.image) embed.image = typeof e.image === "string" ? { url: e.image } : e.image;
      if (e.thumbnail) embed.thumbnail = typeof e.thumbnail === "string" ? { url: e.thumbnail } : e.thumbnail;
      if (e.video) embed.video = typeof e.video === "string" ? { url: e.video } : e.video;
      return embed;
    });
  }
  return undefined;
}

const FLAG_MAP: Record<string, number> = {
  SUPPRESS_EMBEDS: 1 << 2,
  SUPPRESS_NOTIFICATIONS: 1 << 12,
};

function flagsToNumber(flags: unknown): number | undefined {
  if (flags == null || flags === "") return undefined;
  if (typeof flags === "number") return flags;
  if (typeof flags === "string" && flags.trim() !== "" && !Number.isNaN(Number(flags))) {
    return Number(flags);
  }
  if (Array.isArray(flags)) {
    let n = 0;
    for (const f of flags) {
      if (typeof f === "number") n |= f;
      else if (typeof f === "string" && FLAG_MAP[f] !== undefined) n |= FLAG_MAP[f];
      else if (typeof f === "string" && !Number.isNaN(Number(f))) n |= Number(f);
    }
    return n || undefined;
  }
  return undefined;
}

function simplifyMessage(msg: Record<string, unknown>): Record<string, unknown> {
  return {
    id: msg.id,
    channel_id: msg.channel_id,
    author: msg.author,
    content: msg.content,
    timestamp: msg.timestamp,
    type: msg.type,
  };
}

function simplifyMember(m: Record<string, unknown>): Record<string, unknown> {
  return {
    user: m.user,
    roles: m.roles,
    permissions: m.permissions,
  };
}

async function getBotToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const auth = String(node.parameters.authentication ?? "botToken");
  const credName = auth === "oAuth2" ? "discordOAuth2Api" : "discordBotApi";
  const cred = await ctx.getCredential(credName);
  if (!cred) return "";
  const token = String(
    (cred as Record<string, unknown>).botToken ??
      (cred as Record<string, unknown>).accessToken ??
      (cred as Record<string, unknown>).token ??
      "",
  );
  return token;
}

async function getWebhookUrl(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<string> {
  const fromParam = resolveValue(node.parameters.webhookUri, itemJson);
  if (fromParam) return String(fromParam);
  const cred = await ctx.getCredential("discordWebhookApi");
  if (cred) {
    return String(
      (cred as Record<string, unknown>).webhookUrl ??
        (cred as Record<string, unknown>).webhookUri ??
        "",
    );
  }
  return "";
}

async function discordFetch(
  url: string,
  init: RequestInit,
  opts?: { retries?: number },
): Promise<unknown> {
  const maxRetries = opts?.retries ?? 0;
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      const text = await resp.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch { /* keep text */ }

      if (resp.status === 429 && attempt < maxRetries) {
        const obj = asObj(parsed);
        const retryAfter =
          Number(resp.headers.get?.("retry-after") ?? obj.retry_after ?? 1) || 1;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        attempt++;
        continue;
      }

      if (resp.status < 200 || resp.status >= 300) {
        if (resp.status === 204) return null;
        const obj = asObj(parsed);
        const err = String(
          (obj as Record<string, unknown>).message ??
            obj.error ??
            `Discord request failed ${resp.status}`,
        );
        throw new Error(err);
      }
      if (resp.status === 204) return null;
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function discordRequest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<unknown> {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${API_BASE}/${path}${qs}`;
  const headers: Record<string, string> = {
    Authorization: token.startsWith("Bot ") || token.startsWith("Bearer ") ? token : `Bot ${token}`,
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return discordFetch(url, init);
}

interface OpResult {
  json: Record<string, unknown>;
}

type OpResultList = OpResult | OpResult[];

export const discordToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail?.() ?? false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: i, input: 0 };
    try {
      const auth = String(node.parameters.authentication ?? "botToken");
      const resource = String(node.parameters.resource ?? "message");
      const operation = String(node.parameters.operation ?? defaultOp(resource));
      let result: OpResultList;
      if (auth === "webhook") {
        result = await runWebhookSend(ctx, node, itemJson);
      } else {
        result = await runOperation(ctx, node, resource, operation, itemJson);
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

function defaultOp(resource: string): string {
  if (resource === "message") return "send";
  if (resource === "member") return "getAll";
  return "create";
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  if (resource === "channel") return runChannelOperation(ctx, node, operation, itemJson);
  if (resource === "message") return runMessageOperation(ctx, node, operation, itemJson);
  if (resource === "member") return runMemberOperation(ctx, node, operation, itemJson);
  throw new Error(`Discord: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Webhook send (tool variant)
// ---------------------------------------------------------------------------

async function runWebhookSend(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const webhookUri = await getWebhookUrl(ctx, node, itemJson);
  if (!webhookUri) throw new Error("Discord: webhookUri is required");

  const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
  const options = parseJsonMaybe(resolveValue(node.parameters.options, itemJson)) as Record<string, unknown> ?? {};

  if (!text && !options.embeds) {
    throw new Error("Discord: text is required");
  }

  const body: Record<string, unknown> = {};
  body.content = text;
  if (options.embeds) {
    const embeds = buildEmbeds(options.embeds, itemJson);
    if (embeds) body.embeds = embeds;
  }
  if (options.username) body.username = resolveValue(options.username, itemJson);
  if (options.avatarUrl) body.avatar_url = resolveValue(options.avatarUrl, itemJson);
  if (options.tts) body.tts = Boolean(options.tts);
  const flags = flagsToNumber(options.flags);
  if (flags !== undefined) body.flags = flags;
  const allowedMentions = parseJsonMaybe(resolveValue(options.allowedMentions, itemJson));
  if (allowedMentions) body.allowed_mentions = allowedMentions;
  const attachments = parseJsonMaybe(resolveValue(options.attachments, itemJson));
  if (attachments) body.attachments = attachments;
  const components = parseJsonMaybe(resolveValue(options.components, itemJson));
  if (components) body.components = components;

  await discordFetch(webhookUri, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { retries: 5 });

  return { json: { success: true } };
}

// ---------------------------------------------------------------------------
// Channel operations
// ---------------------------------------------------------------------------

async function runChannelOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const token = await getBotToken(ctx, node);
  const guildId = resolveResourceLocator(node.parameters.guildId, itemJson);
  const options = parseJsonMaybe(resolveValue(node.parameters.options, itemJson)) as Record<string, unknown> ?? {};

  if (operation === "create") {
    if (!guildId) throw new Error("Discord: guildId is required");
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Discord: name required for channel create");
    const type = Number(resolveValue(node.parameters.type, itemJson) ?? 0);
    const body: Record<string, unknown> = { name, type };
    if (options.nsfw !== undefined) body.nsfw = Boolean(options.nsfw);
    if (options.position !== undefined) body.position = Number(options.position);
    if (options.rateLimitPerUser !== undefined) body.rate_limit_per_user = Number(options.rateLimitPerUser);
    if (options.topic) body.topic = String(resolveValue(options.topic, itemJson) ?? "");
    const categoryId = resolveResourceLocator(options.categoryId, itemJson);
    if (categoryId) body.parent_id = categoryId;
    const permissionOverwrites = parseJsonMaybe(resolveValue(options.permissionOverwrites, itemJson));
    if (permissionOverwrites) body.permission_overwrites = permissionOverwrites;
    const res = await discordRequest(token, "POST", `guilds/${guildId}/channels`, body);
    return { json: asObj(res) };
  }

  if (operation === "delete") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const res = await discordRequest(token, "DELETE", `channels/${channelId}`);
    return { json: res ? asObj(res) : { success: true } };
  }

  if (operation === "get") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const res = await discordRequest(token, "GET", `channels/${channelId}`);
    return { json: asObj(res) };
  }

  if (operation === "getAll") {
    if (!guildId) throw new Error("Discord: guildId is required");
    const res = await discordRequest(token, "GET", `guilds/${guildId}/channels`);
    let channels = Array.isArray(res) ? (res as Record<string, unknown>[]) : [];
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    if (!returnAll) channels = channels.slice(0, limit);
    return channels.map((c) => ({ json: asObj(c) }));
  }

  if (operation === "update") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId is required");
    const body: Record<string, unknown> = {};
    const name = resolveValue(node.parameters.name, itemJson);
    if (name) body.name = String(name);
    if (options.nsfw !== undefined) body.nsfw = Boolean(options.nsfw);
    if (options.position !== undefined) body.position = Number(options.position);
    if (options.rateLimitPerUser !== undefined) body.rate_limit_per_user = Number(options.rateLimitPerUser);
    if (options.topic !== undefined) body.topic = String(resolveValue(options.topic, itemJson) ?? "");
    const categoryId = resolveResourceLocator(options.categoryId, itemJson);
    if (categoryId) body.parent_id = categoryId;
    const permissionOverwrites = parseJsonMaybe(resolveValue(options.permissionOverwrites, itemJson));
    if (permissionOverwrites) body.permission_overwrites = permissionOverwrites;
    const res = await discordRequest(token, "PATCH", `channels/${channelId}`, body);
    return { json: asObj(res) };
  }

  throw new Error(`Discord: unsupported channel operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Message operations
// ---------------------------------------------------------------------------

async function runMessageOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const token = await getBotToken(ctx, node);

  if (operation === "send" || operation === "sendAndWait") {
    const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
    if (!channelId) throw new Error("Discord: channelId required for send");
    const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
    const options = parseJsonMaybe(resolveValue(node.parameters.options, itemJson)) as Record<string, unknown> ?? {};
    const body: Record<string, unknown> = { content: text };
    const embeds = buildEmbeds(options.embeds, itemJson);
    if (embeds) body.embeds = embeds;
    if (options.tts) body.tts = Boolean(options.tts);
    const flags = flagsToNumber(options.flags);
    if (flags !== undefined) body.flags = flags;
    if (operation === "sendAndWait") {
      const responseType = String(node.parameters.responseType ?? "approval");
      const components = buildWaitComponents(responseType, options);
      if (components) body.components = components;
    }
    const res = await discordRequest(token, "POST", `channels/${channelId}/messages`, body);
    return { json: asObj(res) };
  }

  const channelId = resolveResourceLocator(node.parameters.channelId, itemJson);
  if (!channelId) throw new Error("Discord: channelId required for message operation");

  if (operation === "get") {
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!messageId) throw new Error("Discord: messageId is required");
    const res = asObj(await discordRequest(token, "GET", `channels/${channelId}/messages/${messageId}`));
    return { json: simplifyMessage(res) };
  }

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const params: Record<string, string> = { limit: String(returnAll ? 100 : Math.min(limit, 100)) };
    const res = await discordRequest(token, "GET", `channels/${channelId}/messages`, undefined, params);
    let messages = Array.isArray(res) ? (res as Record<string, unknown>[]) : [];
    if (!returnAll) messages = messages.slice(0, limit);
    return messages.map((m) => ({ json: simplifyMessage(asObj(m)) }));
  }

  if (operation === "react") {
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    const emoji = String(resolveValue(node.parameters.emoji, itemJson) ?? "");
    if (!messageId) throw new Error("Discord: messageId required for react");
    if (!emoji) throw new Error("Discord: emoji required for react");
    const encoded = encodeURIComponent(emoji);
    await discordRequest(token, "PUT", `channels/${channelId}/messages/${messageId}/reactions/${encoded}/@me`);
    return { json: { success: true } };
  }

  if (operation === "delete") {
    const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!messageId) throw new Error("Discord: messageId required for delete");
    await discordRequest(token, "DELETE", `channels/${channelId}/messages/${messageId}`);
    return { json: { success: true } };
  }

  throw new Error(`Discord: unsupported message operation "${operation}"`);
}

function buildWaitComponents(
  responseType: string,
  options: Record<string, unknown>,
): unknown[] | undefined {
  if (responseType !== "approval") return undefined;
  const approveLabel = String(options.approveLabel ?? "✓ Approve");
  const denyLabel = String(options.denyLabel ?? "✗ Decline");
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: approveLabel, custom_id: "discord_approve" },
        { type: 2, style: 4, label: denyLabel, custom_id: "discord_deny" },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Member operations
// ---------------------------------------------------------------------------

async function runMemberOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const token = await getBotToken(ctx, node);
  const guildId = resolveResourceLocator(node.parameters.guildId, itemJson);
  if (!guildId) throw new Error("Discord: guildId required for member operation");

  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const after = String(resolveValue(node.parameters.after, itemJson) ?? "");
    const members: Record<string, unknown>[] = [];
    let cursor = after;
    const pageSize = 100;
    const target = returnAll ? Infinity : limit;

    while (members.length < target) {
      const params: Record<string, string> = {
        limit: String(Math.min(pageSize, target - members.length)),
      };
      if (cursor) params.after = cursor;
      const res = await discordRequest(token, "GET", `guilds/${guildId}/members`, undefined, params);
      const batch = Array.isArray(res) ? (res as Record<string, unknown>[]) : [];
      if (batch.length === 0) break;
      members.push(...batch);
      const last = batch[batch.length - 1];
      const user = last.user as Record<string, unknown> | undefined;
      cursor = String(user?.id ?? last.id ?? "");
      if (batch.length < pageSize) break;
      if (!returnAll) break;
    }

    const sliced = returnAll ? members : members.slice(0, limit);
    return sliced.map((m) => ({ json: simplifyMember(asObj(m)) }));
  }

  if (operation === "roleAdd" || operation === "roleRemove") {
    const userId = resolveResourceLocator(node.parameters.userId, itemJson);
    const roleId = resolveResourceLocator(node.parameters.role, itemJson);
    if (!userId || !roleId) throw new Error("Discord: userId and role required");
    const method = operation === "roleAdd" ? "PUT" : "DELETE";
    await discordRequest(token, method, `guilds/${guildId}/members/${userId}/roles/${roleId}`);
    return { json: { success: true } };
  }

  throw new Error(`Discord: unsupported member operation "${operation}"`);
}

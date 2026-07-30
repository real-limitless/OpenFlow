import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://slack.com/api";

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

function parseJsonOrThrow(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Slack: invalid JSON in ${label}`);
  }
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
}

type OpResultList = OpResult | OpResult[];

export const slackExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "message");
  const operation = String(node.parameters.operation ?? "post");
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

async function getToken(ctx: ExecutionContext, node: INode): Promise<string> {
  const authentication = String(node.parameters.authentication ?? "accessToken");
  const credName = authentication === "oAuth2" ? "slackOAuth2Api" : "slackApi";
  const cred = await ctx.getCredential(credName);
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error(`Slack: ${credName} credential is not configured`);
  }
  return accessToken;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  if (resource === "channel") {
    return runChannelOperation(ctx, node, operation, itemJson);
  }
  if (resource === "message") {
    return runMessageOperation(ctx, node, operation, itemJson, item);
  }
  if (resource === "file") {
    return runFileOperation(ctx, node, operation, itemJson, item);
  }
  if (resource === "reaction") {
    return runReactionOperation(ctx, node, operation, itemJson);
  }
  if (resource === "star") {
    return runStarOperation(ctx, node, operation, itemJson);
  }
  if (resource === "user") {
    return runUserOperation(ctx, node, operation, itemJson);
  }
  if (resource === "userGroup") {
    return runUserGroupOperation(ctx, node, operation, itemJson);
  }
  throw new Error(`Slack: unsupported resource "${resource}"`);
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

async function runChannelOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const token = await getToken(ctx, node);

  if (operation === "create") {
    const name = String(resolveValue(node.parameters.channelId, itemJson) ?? "");
    if (!name) throw new Error("Slack: channelId (channel name) is required");
    const visibility = String(node.parameters.channelVisibility ?? "public");
    const body: Record<string, unknown> = { name, is_private: visibility === "private" };
    const res = await slackRequest(token, "POST", "conversations.create", body);
    return { json: asObj(res.channel) };
  }
  if (operation === "get") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = { channel };
    if (options.includeNumMembers) params.include_num_members = "true";
    const res = await slackRequest(token, "GET", "conversations.info", undefined, params);
    return { json: asObj(res.channel) };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = {};
    const types = resolveValue(filters.types, itemJson);
    if (Array.isArray(types) && types.length > 0) params.types = types.join(",");
    if (filters.excludeArchived) params.exclude_archived = "true";
    const channels = await slackRequestAll(
      token,
      "conversations.list",
      "channels",
      returnAll,
      limit,
      params,
    );
    return channels.map((c) => ({ json: c }));
  }
  if (operation === "history") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 100);
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = { channel };
    if (filters.inclusive) params.inclusive = "true";
    const latest = resolveValue(filters.latest, itemJson);
    if (latest) params.latest = String(latest);
    const oldest = resolveValue(filters.oldest, itemJson);
    if (oldest) params.oldest = String(oldest);
    const res = await slackRequest(token, "GET", "conversations.history", undefined, {
      ...params,
      limit: String(returnAll ? 200 : limit),
    });
    const messages = (res.messages ?? []) as Record<string, unknown>[];
    const sliced = returnAll ? messages : messages.slice(0, limit);
    return sliced.map((m) => ({ json: m }));
  }
  if (operation === "replies") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const ts = String(resolveValue(node.parameters.ts, itemJson) ?? "");
    if (!ts) throw new Error("Slack: ts is required");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 100);
    const res = await slackRequest(token, "GET", "conversations.replies", undefined, {
      channel,
      ts,
      limit: String(returnAll ? 200 : limit),
    });
    const messages = (res.messages ?? []) as Record<string, unknown>[];
    const sliced = returnAll ? messages : messages.slice(0, limit);
    return sliced.map((m) => ({ json: m }));
  }
  if (operation === "member") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 100);
    const members = await slackRequestAll(
      token,
      "conversations.members",
      "members",
      returnAll,
      limit,
      { channel },
    );
    return members.map((m) => ({ json: { user: m } }));
  }
  if (operation === "rename") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Slack: name is required");
    const res = await slackRequest(token, "POST", "conversations.rename", { channel, name });
    return { json: asObj(res.channel) };
  }
  if (operation === "setPurpose") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const purpose = String(resolveValue(node.parameters.purpose, itemJson) ?? "");
    if (!purpose) throw new Error("Slack: purpose is required");
    const res = await slackRequest(token, "POST", "conversations.setPurpose", { channel, purpose });
    return { json: asObj(res.channel) };
  }
  if (operation === "setTopic") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const topic = String(resolveValue(node.parameters.topic, itemJson) ?? "");
    if (!topic) throw new Error("Slack: topic is required");
    const res = await slackRequest(token, "POST", "conversations.setTopic", { channel, topic });
    return { json: asObj(res.channel) };
  }
  if (operation === "invite") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const userIds = resolveValue(node.parameters.userIds, itemJson);
    const users = Array.isArray(userIds) ? userIds.join(",") : String(userIds ?? "");
    if (!users) throw new Error("Slack: userIds is required");
    const res = await slackRequest(token, "POST", "conversations.invite", { channel, users });
    return { json: asObj(res.channel) };
  }
  if (operation === "kick") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const user = String(resolveValue(node.parameters.userId, itemJson) ?? "");
    if (!user) throw new Error("Slack: userId is required");
    const res = await slackRequest(token, "POST", "conversations.kick", { channel, user });
    return { json: res };
  }
  if (operation === "join") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const res = await slackRequest(token, "POST", "conversations.join", { channel });
    return { json: asObj(res.channel) };
  }
  if (operation === "leave") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const res = await slackRequest(token, "POST", "conversations.leave", { channel });
    return { json: res };
  }
  if (operation === "archive") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const res = await slackRequest(token, "POST", "conversations.archive", { channel });
    return { json: res };
  }
  if (operation === "unarchive") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const res = await slackRequest(token, "POST", "conversations.unarchive", { channel });
    return { json: res };
  }
  if (operation === "close") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const res = await slackRequest(token, "POST", "conversations.close", { channel });
    return { json: res };
  }
  if (operation === "open") {
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {};
    const chId = resolveResourceLocator(options.channelId, itemJson);
    if (chId) body.channel = chId;
    const users = resolveValue(options.users, itemJson);
    if (Array.isArray(users) && users.length > 0) body.users = users.join(",");
    if (options.returnIm) body.return_im = true;
    const res = await slackRequest(token, "POST", "conversations.open", body);
    return { json: asObj(res.channel) };
  }
  throw new Error(`Slack: unsupported channel operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

async function runMessageOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const token = await getToken(ctx, node);

  if (operation === "post" || operation === "sendAndWait") {
    return postMessage(token, node, itemJson, operation === "sendAndWait");
  }
  if (operation === "update") {
    return updateMessage(token, node, itemJson);
  }
  if (operation === "delete") {
    return deleteMessage(token, node, itemJson);
  }
  if (operation === "getPermalink") {
    const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
    const ts = String(resolveValue(node.parameters.ts, itemJson) ?? "");
    if (!ts) throw new Error("Slack: ts is required");
    const res = await slackRequest(token, "GET", "chat.getPermalink", undefined, {
      channel,
      message_ts: ts,
    });
    return { json: { permalink: res.permalink } };
  }
  if (operation === "search") {
    const query = String(resolveValue(node.parameters.query, itemJson) ?? "");
    if (!query) throw new Error("Slack: query is required");
    const sort = String(node.parameters.sort ?? "desc");
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 25);
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = { query, sort };
    const searchChannel = resolveValue(options.searchChannel, itemJson);
    if (Array.isArray(searchChannel) && searchChannel.length > 0) {
      params.channel = searchChannel.join(",");
    }
    const res = await slackRequest(token, "GET", "search.messages", undefined, {
      ...params,
      count: String(returnAll ? 100 : limit),
    });
    const messages = ((res.messages ?? {}) as Record<string, unknown>).matches as
      | Record<string, unknown>[]
      | undefined;
    const list = messages ?? [];
    const sliced = returnAll ? list : list.slice(0, limit);
    return sliced.map((m) => ({ json: m }));
  }
  throw new Error(`Slack: unsupported message operation "${operation}"`);
}

function resolveMessageChannel(
  node: INode,
  itemJson: Record<string, unknown>,
): { channel: string; isUser: boolean } {
  const select = String(node.parameters.select ?? "channel");
  if (select === "user") {
    const user = resolveResourceLocator(node.parameters.user, itemJson);
    return { channel: user, isUser: true };
  }
  const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
  return { channel, isUser: false };
}

function buildMessageBody(
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const messageType = String(node.parameters.messageType ?? "text");
  const body: Record<string, unknown> = {};

  if (messageType === "text") {
    body.text = String(resolveValue(node.parameters.text, itemJson) ?? "");
  } else if (messageType === "block") {
    const blocksRaw = String(resolveValue(node.parameters.blocksUi, itemJson) ?? "");
    if (blocksRaw) {
      body.blocks = parseJsonOrThrow(blocksRaw, "blocks");
    }
    const fallbackText = resolveValue(node.parameters.text, itemJson);
    if (fallbackText) body.text = String(fallbackText);
  } else if (messageType === "attachment") {
    const attachments = resolveValue(node.parameters.attachments, itemJson);
    if (attachments) body.attachments = attachments;
  }

  const otherOptions = (node.parameters.otherOptions ?? {}) as Record<string, unknown>;
  if (otherOptions.link_names) body.link_names = true;
  if (otherOptions.mrkdwn !== undefined) body.mrkdwn = otherOptions.mrkdwn;
  if (otherOptions.unfurl_links !== undefined) body.unfurl_links = otherOptions.unfurl_links;
  if (otherOptions.unfurl_media !== undefined) body.unfurl_media = otherOptions.unfurl_media;
  if (otherOptions.sendAsUser) body.username = String(otherOptions.sendAsUser);

  const replyField = otherOptions.replyToMessageField as Record<string, unknown> | undefined;
  if (replyField?.thread_ts) body.thread_ts = String(replyField.thread_ts);
  if (replyField?.reply_broadcast) body.reply_broadcast = true;

  const botProfile = otherOptions.botProfile as Record<string, unknown> | undefined;
  if (botProfile?.icon_url) body.icon_url = String(botProfile.icon_url);
  if (botProfile?.icon_emoji) body.icon_emoji = String(botProfile.icon_emoji);

  return body;
}

async function postMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  isWait: boolean,
): Promise<OpResult> {
  const { channel } = resolveMessageChannel(node, itemJson);
  if (!channel) throw new Error("Slack: channel or user is required");
  const body = buildMessageBody(node, itemJson);
  body.channel = channel;

  const otherOptions = (node.parameters.otherOptions ?? {}) as Record<string, unknown>;
  const ephemeral = otherOptions.ephemeral as Record<string, unknown> | undefined;
  if (ephemeral) {
    const targetUser = resolveResourceLocator(ephemeral.user, itemJson);
    if (targetUser) {
      const res = await slackRequest(token, "POST", "chat.postEphemeral", {
        ...body,
        user: targetUser,
      });
      return { json: res };
    }
  }

  const res = await slackRequest(token, "POST", "chat.postMessage", body);

  if (isWait) {
    // TODO: implement putExecutionToWait + sendAndWaitWebhook resume.
    // On resume, original input items should be returned.
    return { json: { ...itemJson } };
  }
  return { json: res };
}

async function updateMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
  const ts = String(resolveValue(node.parameters.ts, itemJson) ?? "");
  if (!ts) throw new Error("Slack: ts is required");
  const body = buildMessageBody(node, itemJson);
  body.channel = channel;
  body.ts = ts;

  const updateFields = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
  if (updateFields.link_names) body.link_names = true;
  if (updateFields.parse) body.parse = String(updateFields.parse);

  const res = await slackRequest(token, "POST", "chat.update", body);
  return { json: res };
}

async function deleteMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const { channel } = resolveMessageChannel(node, itemJson);
  const ts = String(resolveValue(node.parameters.timestamp, itemJson) ?? "");
  if (!ts) throw new Error("Slack: timestamp is required");
  const res = await slackRequest(token, "POST", "chat.delete", { channel, ts });
  return { json: res };
}

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

async function runFileOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const token = await getToken(ctx, node);

  if (operation === "upload") {
    return uploadFile(token, node, itemJson, item);
  }
  if (operation === "get") {
    const fileId = String(resolveValue(node.parameters.fileId, itemJson) ?? "");
    if (!fileId) throw new Error("Slack: fileId is required");
    const res = await slackRequest(token, "GET", "files.info", undefined, { file: fileId });
    return { json: asObj(res.file) };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = {};
    const channelId = resolveResourceLocator(filters.channelId, itemJson);
    if (channelId) params.channel = channelId;
    if (filters.showFilesHidden) params.show_files_hidden_by = "true";
    const tsFrom = resolveValue(filters.tsFrom, itemJson);
    if (tsFrom) params.ts_from = String(tsFrom);
    const tsTo = resolveValue(filters.tsTo, itemJson);
    if (tsTo) params.ts_to = String(tsTo);
    const types = resolveValue(filters.types, itemJson);
    if (Array.isArray(types) && types.length > 0) params.types = types.join(",");
    const userId = resolveResourceLocator(filters.userId, itemJson);
    if (userId) params.user = userId;
    const files = await slackRequestAll(token, "files.list", "files", returnAll, limit, params);
    return files.map((f) => ({ json: f }));
  }
  throw new Error(`Slack: unsupported file operation "${operation}"`);
}

async function uploadFile(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};

  const channelIds = resolveValue(options.channelIds ?? options.channelId, itemJson);
  if (Array.isArray(channelIds) && channelIds.length > 0) {
    fields.channels = channelIds.join(",");
  } else if (typeof channelIds === "string" && channelIds) {
    fields.channels = channelIds;
  }
  const fileName = resolveValue(options.fileName, itemJson);
  if (fileName) fields.filename = String(fileName);
  const initialComment = resolveValue(options.initialComment, itemJson);
  if (initialComment) fields.initial_comment = String(initialComment);
  const threadTs = resolveValue(options.threadTs, itemJson);
  if (threadTs) fields.thread_ts = String(threadTs);
  const title = resolveValue(options.title, itemJson);
  if (title) fields.title = String(title);

  const binaryData = node.parameters.binaryData === true || node.parameters.binaryData === undefined;
  const binaryPropertyName = String(node.parameters.binaryPropertyName ?? "data");
  const fileContent = resolveValue(node.parameters.fileContent, itemJson);

  if (binaryData && item.binary?.[binaryPropertyName]) {
    const binary = item.binary[binaryPropertyName];
    const fileData = {
      data: String(binary.data ?? ""),
      fileName: String(binary.fileName ?? binaryPropertyName),
      mimeType: String(binary.mimeType ?? "application/octet-stream"),
    };
    const res = await slackUploadFile(token, fields, fileData);
    return { json: asObj(res.file) };
  }
  if (fileContent) {
    fields.content = String(fileContent);
    const res = await slackRequest(token, "POST", "files.upload", fields);
    return { json: asObj(res.file) };
  }
  throw new Error("Slack: binary data or file content is required for upload");
}

// ---------------------------------------------------------------------------
// Reaction
// ---------------------------------------------------------------------------

async function runReactionOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const token = await getToken(ctx, node);
  const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
  const timestamp = String(resolveValue(node.parameters.timestamp, itemJson) ?? "");
  if (!timestamp) throw new Error("Slack: timestamp is required");

  if (operation === "add") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Slack: name (emoji) is required");
    const res = await slackRequest(token, "POST", "reactions.add", { channel, timestamp, name });
    return { json: res };
  }
  if (operation === "get") {
    const res = await slackRequest(token, "GET", "reactions.get", undefined, {
      channel,
      timestamp,
    });
    return { json: asObj(res.message) };
  }
  if (operation === "remove") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Slack: name (emoji) is required");
    const res = await slackRequest(token, "POST", "reactions.remove", { channel, timestamp, name });
    return { json: res };
  }
  throw new Error(`Slack: unsupported reaction operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// Star
// ---------------------------------------------------------------------------

async function runStarOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const token = await getToken(ctx, node);

  if (operation === "add") {
    const target = String(node.parameters.target ?? "message");
    const body: Record<string, unknown> = {};
    if (target === "message") {
      const channel = resolveResourceLocator(node.parameters.channelId, itemJson);
      const timestamp = resolveValue(node.parameters.timestamp, itemJson);
      body.channel = channel;
      if (timestamp) body.timestamp = String(timestamp);
    } else if (target === "file") {
      const fileId = String(resolveValue(node.parameters.fileId, itemJson) ?? "");
      body.file = fileId;
    }
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    if (options.fileComment) body.file_comment = String(options.fileComment);
    const res = await slackRequest(token, "POST", "stars.add", body);
    return { json: res };
  }
  if (operation === "delete") {
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {};
    const channel = resolveResourceLocator(options.channelId, itemJson);
    if (channel) body.channel = channel;
    if (options.fileId) body.file = String(options.fileId);
    if (options.fileComment) body.file_comment = String(options.fileComment);
    if (options.timestamp) body.timestamp = String(options.timestamp);
    const res = await slackRequest(token, "POST", "stars.remove", body);
    return { json: res };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const items = await slackRequestAll(token, "stars.list", "items", returnAll, limit, {});
    return items.map((i) => ({ json: i }));
  }
  throw new Error(`Slack: unsupported star operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

async function runUserOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const token = await getToken(ctx, node);

  if (operation === "info") {
    const user = resolveResourceLocator(node.parameters.user, itemJson);
    if (!user) throw new Error("Slack: user is required");
    const res = await slackRequest(token, "GET", "users.info", undefined, { user });
    return { json: asObj(res.user) };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 50);
    const members = await slackRequestAll(token, "users.list", "members", returnAll, limit, {});
    return members.map((m) => ({ json: m }));
  }
  if (operation === "getProfile") {
    const user = resolveResourceLocator(node.parameters.user, itemJson);
    const res = await slackRequest(token, "GET", "users.profile.get", undefined, { user });
    return { json: asObj(res.profile) };
  }
  if (operation === "getPresence") {
    const user = resolveResourceLocator(node.parameters.user, itemJson);
    const res = await slackRequest(token, "GET", "users.getPresence", undefined, { user });
    return { json: res };
  }
  if (operation === "updateProfile") {
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const profile: Record<string, unknown> = {};
    if (options.first_name) profile.first_name = String(options.first_name);
    if (options.last_name) profile.last_name = String(options.last_name);
    if (options.email) profile.email = String(options.email);
    const status = options.status as Record<string, unknown> | undefined;
    if (status?.status_emoji) profile.status_emoji = String(status.status_emoji);
    if (status?.status_text) profile.status_text = String(status.status_text);
    if (status?.status_expiration) profile.status_expiration = Number(status.status_expiration);
    const body: Record<string, unknown> = { profile };
    if (options.user) body.user = String(options.user);
    const res = await slackRequest(token, "POST", "users.profile.set", body);
    return { json: asObj(res.profile) };
  }
  throw new Error(`Slack: unsupported user operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// User Group
// ---------------------------------------------------------------------------

async function runUserGroupOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const token = await getToken(ctx, node);

  if (operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Slack: name is required");
    const options = (node.parameters.Options ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = { name };
    const handle = resolveValue(options.handle, itemJson);
    if (handle) body.handle = String(handle);
    const description = resolveValue(options.description, itemJson);
    if (description) body.description = String(description);
    const channelIds = resolveValue(options.channelIds, itemJson);
    if (Array.isArray(channelIds) && channelIds.length > 0) {
      body.channels = channelIds.join(",");
    }
    if (options.include_count !== undefined) body.include_count = options.include_count;
    const res = await slackRequest(token, "POST", "usergroups.create", body);
    return { json: asObj(res.usergroup) };
  }
  if (operation === "update") {
    const userGroupId = String(resolveValue(node.parameters.userGroupId, itemJson) ?? "");
    if (!userGroupId) throw new Error("Slack: userGroupId is required");
    const updateFields = (node.parameters.updateFields ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = { usergroup: userGroupId };
    const name = resolveValue(updateFields.name, itemJson);
    if (name) body.name = String(name);
    const handle = resolveValue(updateFields.handle, itemJson);
    if (handle) body.handle = String(handle);
    const description = resolveValue(updateFields.description, itemJson);
    if (description) body.description = String(description);
    const channels = resolveValue(updateFields.channels, itemJson);
    if (Array.isArray(channels) && channels.length > 0) body.channels = channels.join(",");
    if (updateFields.include_count !== undefined) body.include_count = updateFields.include_count;
    const res = await slackRequest(token, "POST", "usergroups.update", body);
    return { json: asObj(res.usergroup) };
  }
  if (operation === "updateUsers") {
    const userGroupId = String(resolveValue(node.parameters.userGroupId, itemJson) ?? "");
    if (!userGroupId) throw new Error("Slack: userGroupId is required");
    const body: Record<string, unknown> = { usergroup: userGroupId, users: "" };
    const res = await slackRequest(token, "POST", "usergroups.users.update", body);
    return { json: asObj(res.usergroup) };
  }
  if (operation === "disable") {
    const userGroupId = String(resolveValue(node.parameters.userGroupId, itemJson) ?? "");
    if (!userGroupId) throw new Error("Slack: userGroupId is required");
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = { usergroup: userGroupId };
    if (options.include_count !== undefined) body.include_count = options.include_count;
    const res = await slackRequest(token, "POST", "usergroups.disable", body);
    return { json: asObj(res.usergroup) };
  }
  if (operation === "enable") {
    const userGroupId = String(resolveValue(node.parameters.userGroupId, itemJson) ?? "");
    if (!userGroupId) throw new Error("Slack: userGroupId is required");
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = { usergroup: userGroupId };
    if (options.include_count !== undefined) body.include_count = options.include_count;
    const res = await slackRequest(token, "POST", "usergroups.enable", body);
    return { json: asObj(res.usergroup) };
  }
  if (operation === "getAll") {
    const returnAll = Boolean(node.parameters.returnAll);
    const limit = Number(node.parameters.limit ?? 100);
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const params: Record<string, string> = {};
    if (options.include_count !== false) params.include_count = "true";
    if (options.include_disabled !== false) params.include_disabled = "true";
    if (options.include_users) params.include_users = "true";
    const res = await slackRequest(token, "GET", "usergroups.list", undefined, params);
    const usergroups = (res.usergroups ?? []) as Record<string, unknown>[];
    const sliced = returnAll ? usergroups : usergroups.slice(0, limit);
    return sliced.map((ug) => ({ json: ug }));
  }
  if (operation === "getUsers") {
    const userGroupId = String(resolveValue(node.parameters.userGroupId, itemJson) ?? "");
    if (!userGroupId) throw new Error("Slack: userGroupId is required");
    const res = await slackRequest(token, "GET", "usergroups.users.list", undefined, {
      usergroup: userGroupId,
    });
    const users = (res.users ?? []) as string[];
    return users.map((u) => ({ json: { user: u } }));
  }
  throw new Error(`Slack: unsupported userGroup operation "${operation}"`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function slackRequest(
  token: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = params
    ? `${API_BASE}/${endpoint}?${new URLSearchParams(params).toString()}`
    : `${API_BASE}/${endpoint}`;
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
      const errMsg = String(obj.error ?? `Request failed with status code ${response.status}`);
      throw new Error(errMsg);
    }
    const obj = asObj(parsed);
    if (obj.ok === false) {
      throw new Error(String(obj.error ?? "Slack API request failed"));
    }
    return obj;
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Slack:") || err.message.startsWith("Slack "))) {
      throw err;
    }
    if (err instanceof Error && !err.message.includes("Slack")) {
      throw new Error(`Slack request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function slackRequestAll(
  token: string,
  endpoint: string,
  dataKey: string,
  returnAll: boolean,
  limit: number,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let cursor = "";
  const pageSize = returnAll ? 200 : Math.min(limit, 200);

  do {
    const pageParams: Record<string, string> = { ...params, limit: String(pageSize) };
    if (cursor) pageParams.cursor = cursor;
    const res = await slackRequest(token, "GET", endpoint, undefined, pageParams);
    const items = (res[dataKey] ?? []) as Record<string, unknown>[];
    results.push(...items);
    const metadata = res.response_metadata as Record<string, unknown> | undefined;
    cursor = String(metadata?.next_cursor ?? "");
    if (!returnAll) break;
  } while (cursor && cursor !== "");

  if (!returnAll && limit > 0) {
    return results.slice(0, limit);
  }
  return results;
}

async function slackUploadFile(
  token: string,
  fields: Record<string, unknown>,
  fileData: { data: string; fileName: string; mimeType: string },
): Promise<Record<string, unknown>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const bytes = Uint8Array.from(atob(fileData.data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: fileData.mimeType });
  form.append("file", blob, fileData.fileName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${API_BASE}/files.upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const obj = asObj(parsed);
    if (obj.ok === false) {
      throw new Error(String(obj.error ?? "Slack file upload failed"));
    }
    return obj;
  } finally {
    clearTimeout(timer);
  }
}
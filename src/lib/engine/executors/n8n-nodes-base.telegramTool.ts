import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.telegram.org";

const PARSE_MODE_MAP: Record<string, string> = {
  html: "HTML",
  markdown: "Markdown",
  markdownV2: "MarkdownV2",
};

const MEDIA_OPS: Record<string, string> = {
  sendPhoto: "photo",
  sendVideo: "video",
  sendDocument: "document",
  sendAudio: "audio",
  sendAnimation: "animation",
  sendSticker: "sticker",
};

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, { data: string; mimeType: string; fileName: string }>;
}

async function getToken(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("telegramApi");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("Telegram: telegramApi credential is not configured");
  }
  return accessToken;
}

function buildAdditionalFields(
  additional: Record<string, unknown> | undefined,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!additional) return out;
  const parseMode = resolveValue(additional.parseMode, itemJson);
  if (parseMode !== undefined && parseMode !== "") {
    out.parse_mode = PARSE_MODE_MAP[String(parseMode)] ?? String(parseMode);
  }
  if (additional.disableNotification !== undefined) {
    out.disable_notification = Boolean(resolveValue(additional.disableNotification, itemJson));
  }
  if (additional.disableWebPagePreview !== undefined) {
    out.link_preview_options = {
      is_disabled: Boolean(resolveValue(additional.disableWebPagePreview, itemJson)),
    };
  }
  const replyTo = resolveValue(additional.replyToMessageId, itemJson);
  if (replyTo !== undefined && replyTo !== "") out.reply_to_message_id = replyTo;
  const threadId = resolveValue(additional.messageThreadId, itemJson);
  if (threadId !== undefined && threadId !== "") out.message_thread_id = threadId;
  return out;
}

async function tgRequest(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${API_BASE}/bot${token}/${method}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(url, init);
    return parseTelegramResponse(response);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Telegram:")) throw err;
    throw new Error(`Telegram request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function tgRequestForm(token: string, method: string, form: FormData): Promise<unknown> {
  const url = `${API_BASE}/bot${token}/${method}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { method: "POST", body: form, signal: controller.signal });
    return parseTelegramResponse(response);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Telegram:")) throw err;
    throw new Error(`Telegram request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function parseTelegramResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch { /* keep text */ }
  if (response.status < 200 || response.status >= 300) {
    const obj = asObj(parsed);
    const desc = obj.description ? String(obj.description) : `HTTP ${response.status}`;
    throw new Error(`Telegram: ${desc}`);
  }
  const obj = asObj(parsed);
  if (obj.ok === false) {
    const desc = String(obj.description ?? "Telegram API error");
    throw new Error(`Telegram: ${desc}`);
  }
  return obj.result ?? parsed;
}

async function runChatOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
  if (!chatId) throw new Error("Telegram: chatId is required");

  if (operation === "get") {
    return asObj(await tgRequest(token, "getChat", { chat_id: chatId }));
  }
  if (operation === "getAdministrators") {
    const arr = await tgRequest(token, "getChatAdministrators", { chat_id: chatId });
    return arr as unknown as Record<string, unknown>;
  }
  if (operation === "getMember") {
    const userId = resolveValue(node.parameters.userId, itemJson);
    if (userId === undefined || userId === "") throw new Error("Telegram: userId is required");
    return asObj(await tgRequest(token, "getChatMember", { chat_id: chatId, user_id: userId }));
  }
  if (operation === "leave") {
    return asObj(await tgRequest(token, "leaveChat", { chat_id: chatId }));
  }
  if (operation === "setDescription") {
    const description = String(resolveValue(node.parameters.description, itemJson) ?? "");
    return asObj(await tgRequest(token, "setChatDescription", { chat_id: chatId, description }));
  }
  if (operation === "setTitle") {
    const title = String(resolveValue(node.parameters.title, itemJson) ?? "");
    return asObj(await tgRequest(token, "setChatTitle", { chat_id: chatId, title }));
  }
  throw new Error(`Telegram: unsupported chat operation "${operation}"`);
}

async function runCallbackOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const queryId = String(resolveValue(node.parameters.queryId, itemJson) ?? "");
  if (!queryId) throw new Error("Telegram: queryId is required");
  const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;

  if (operation === "answerQuery") {
    const body: Record<string, unknown> = { callback_query_id: queryId };
    if (additional.text !== undefined) body.text = String(resolveValue(additional.text, itemJson));
    if (additional.showAlert !== undefined)
      body.show_alert = Boolean(resolveValue(additional.showAlert, itemJson));
    if (additional.url !== undefined) body.url = String(resolveValue(additional.url, itemJson));
    if (additional.cacheTime !== undefined)
      body.cache_time = Number(resolveValue(additional.cacheTime, itemJson));
    const result = await tgRequest(token, "answerCallbackQuery", body);
    if (result === true) return { success: true };
    return asObj(result);
  }
  if (operation === "answerInlineQuery") {
    const results = resolveValue(node.parameters.results, itemJson);
    const body: Record<string, unknown> = {
      inline_query_id: queryId,
      results: typeof results === "string" ? results : JSON.stringify(results ?? []),
    };
    if (additional.cacheTime !== undefined)
      body.cache_time = Number(resolveValue(additional.cacheTime, itemJson));
    return asObj(await tgRequest(token, "answerInlineQuery", body));
  }
  throw new Error(`Telegram: unsupported callback operation "${operation}"`);
}

async function runFileOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  if (operation !== "get") {
    throw new Error(`Telegram: unsupported file operation "${operation}"`);
  }
  const fileId = String(resolveValue(node.parameters.fileId, itemJson) ?? "");
  if (!fileId) throw new Error("Telegram: fileId is required");
  const download = Boolean(node.parameters.download ?? false);

  const result = asObj(await tgRequest(token, "getFile", { file_id: fileId }));
  if (!download) return { json: result };

  const filePath = String(result.file_path ?? "");
  if (!filePath) throw new Error("Telegram: file_path missing in getFile response");
  const downloadUrl = `${API_BASE}/file/bot${token}/${filePath}`;
  const res = await fetch(downloadUrl);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Telegram: download HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const base64 = bytesToBase64(buf);
  const fileName = filePath.split("/").pop() ?? "file";
  const binary: Record<string, { data: string; mimeType: string; fileName: string }> = {
    data: { data: base64, mimeType: "application/octet-stream", fileName },
  };
  return { json: { file_id: fileId, file_path: filePath }, binary };
}

async function simpleMessageOp(
  token: string,
  node: INode,
  operation: string,
  method: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
  if (!chatId) throw new Error("Telegram: chatId is required");
  const messageId = resolveValue(node.parameters.messageId, itemJson);
  if (messageId === undefined || messageId === "")
    throw new Error("Telegram: messageId is required");
  return asObj(await tgRequest(token, method, { chat_id: chatId, message_id: messageId }));
}

async function editMessageText(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
  if (!chatId) throw new Error("Telegram: chatId is required");
  const messageId = resolveValue(node.parameters.messageId, itemJson);
  if (messageId === undefined || messageId === "")
    throw new Error("Telegram: messageId is required");
  const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
  if (!text) throw new Error("Telegram: text is required");
  const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...buildAdditionalFields(additional, itemJson),
  };
  return asObj(await tgRequest(token, "editMessageText", body));
}

async function sendMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
  if (!chatId) throw new Error("Telegram: chatId is required");
  const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
  if (!text) throw new Error("Telegram: text is required");
  const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    ...buildAdditionalFields(additional, itemJson),
  };
  return asObj(await tgRequest(token, "sendMessage", body));
}

async function sendLocation(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
  if (!chatId) throw new Error("Telegram: chatId is required");
  const latitude = Number(resolveValue(node.parameters.latitude, itemJson));
  const longitude = Number(resolveValue(node.parameters.longitude, itemJson));
  const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    latitude,
    longitude,
    ...buildAdditionalFields(additional, itemJson),
  };
  return asObj(await tgRequest(token, "sendLocation", body));
}

async function sendMedia(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
  if (!chatId) throw new Error("Telegram: chatId is required");
  const mediaField = MEDIA_OPS[operation];
  const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const binaryFile = Boolean(node.parameters.binaryFile ?? node.parameters.binaryData ?? false);

  if (binaryFile) {
    const binaryPropertyName = String(node.parameters.binaryPropertyName ?? "data");
    const binary = item.binary?.[binaryPropertyName];
    if (!binary) throw new Error(`Telegram: binary property "${binaryPropertyName}" not found`);
    const mimeType = binary.mimeType ?? "application/octet-stream";
    const bytes = base64ToBytes(String(binary.data ?? ""));
    const blob = new Blob([bytes], { type: mimeType });
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append(mediaField, blob, binary.fileName || binaryPropertyName);
    const caption = resolveValue(additional.caption, itemJson);
    if (caption) form.append("caption", String(caption));
    const parseMode = resolveValue(additional.parseMode, itemJson);
    if (parseMode)
      form.append("parse_mode", PARSE_MODE_MAP[String(parseMode)] ?? String(parseMode));
    if (additional.disableNotification !== undefined) {
      form.append("disable_notification", String(Boolean(resolveValue(additional.disableNotification, itemJson))));
    }
    return asObj(await tgRequestForm(token, operation, form));
  }

  const mediaValue = String(resolveValue(node.parameters[mediaField], itemJson) ?? "");
  if (!mediaValue) throw new Error(`Telegram: ${mediaField} is required`);
  const body: Record<string, unknown> = {
    chat_id: chatId,
    [mediaField]: mediaValue,
    ...buildAdditionalFields(additional, itemJson),
  };
  const caption = resolveValue(additional.caption, itemJson);
  if (caption !== undefined && caption !== "") body.caption = String(caption);
  return asObj(await tgRequest(token, operation, body));
}

async function sendAndWait(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
  if (!chatId) throw new Error("Telegram: chatId is required");
  const message = String(resolveValue(node.parameters.message, itemJson) ?? "");
  if (!message) throw new Error("Telegram: message is required");

  const keyboard: Record<string, unknown>[][] = [[{ text: "Approve", callback_data: "approve" }]];
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: message,
    reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
  };
  await tgRequest(token, "sendMessage", body);

  return { json: { ...itemJson } };
}

async function sendMediaGroupOp(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
  if (!chatId) throw new Error("Telegram: chatId is required");
  const mediaItems = (node.parameters.media as { values?: Record<string, unknown>[] })?.values ?? [];
  const additional = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const media: Record<string, unknown>[] = mediaItems.map((m) => {
    const entry: Record<string, unknown> = {
      type: String(resolveValue(m.type, itemJson) ?? "photo"),
      media: String(resolveValue(m.media, itemJson) ?? ""),
    };
    if (m.caption) entry.caption = String(resolveValue(m.caption, itemJson));
    if (m.parseMode)
      entry.parse_mode = PARSE_MODE_MAP[String(resolveValue(m.parseMode, itemJson))] ?? String(resolveValue(m.parseMode, itemJson));
    return entry;
  });
  const body: Record<string, unknown> = {
    chat_id: chatId,
    media: JSON.stringify(media),
    ...buildAdditionalFields(additional, itemJson),
  };
  return asObj(await tgRequest(token, "sendMediaGroup", body));
}

async function runMessageOperation(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  if (operation === "sendChatAction") {
    const chatId = String(resolveValue(node.parameters.chatId, itemJson) ?? "");
    if (!chatId) throw new Error("Telegram: chatId is required");
    const action = String(resolveValue(node.parameters.action, itemJson) ?? "");
    if (!action) throw new Error("Telegram: action is required");
    return { json: asObj(await tgRequest(token, "sendChatAction", { chat_id: chatId, action })) };
  }
  if (operation === "deleteMessage") {
    return { json: await simpleMessageOp(token, node, operation, "deleteMessage", itemJson) };
  }
  if (operation === "editMessageText") {
    return { json: await editMessageText(token, node, itemJson) };
  }
  if (operation === "pinChatMessage") {
    return { json: await simpleMessageOp(token, node, operation, "pinChatMessage", itemJson) };
  }
  if (operation === "unpinChatMessage") {
    return { json: await simpleMessageOp(token, node, operation, "unpinChatMessage", itemJson) };
  }
  if (operation === "sendMessage") {
    return { json: await sendMessage(token, node, itemJson) };
  }
  if (operation === "sendLocation") {
    return { json: await sendLocation(token, node, itemJson) };
  }
  if (operation in MEDIA_OPS) {
    return { json: await sendMedia(token, node, operation, itemJson, item) };
  }
  if (operation === "sendMediaGroup") {
    return { json: await sendMediaGroupOp(token, node, itemJson) };
  }
  if (operation === "sendAndWait") {
    return { json: await sendAndWait(token, node, itemJson) };
  }
  throw new Error(`Telegram: unsupported message operation "${operation}"`);
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  const token = await getToken(ctx);

  if (resource === "chat") {
    return { json: await runChatOperation(token, node, operation, itemJson) };
  }
  if (resource === "callback") {
    return { json: await runCallbackOperation(token, node, operation, itemJson) };
  }
  if (resource === "file") {
    return runFileOperation(token, node, operation, itemJson, item);
  }
  if (resource === "message") {
    return runMessageOperation(token, node, operation, itemJson, item);
  }
  throw new Error(`Telegram: unsupported resource "${resource}"`);
}

export const telegramToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "message");
  const operation = String(node.parameters.operation ?? "sendMessage");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, item);
      out.push({ json: result.json, binary: result.binary, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out];
};

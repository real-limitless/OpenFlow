import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const ATTRIBUTION_SUFFIX = "\n\nThis message was sent automatically with n8n";

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

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return new TextDecoder().decode(base64ToBytes(b64));
}

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
}

type OpResultList = OpResult | OpResult[];

export const gmailExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "message");
  const operation = String(node.parameters.operation ?? "send");
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
  const cred = await ctx.getCredential("gmailOAuth2");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("Gmail: gmailOAuth2 credential is not configured");
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
  if (resource === "message") {
    return runMessageOperation(ctx, node, operation, itemJson, item);
  }
  if (resource === "label") {
    return { json: await runLabelOperation(ctx, node, operation, itemJson) };
  }
  if (resource === "draft") {
    return runDraftOperation(ctx, node, operation, itemJson, item);
  }
  if (resource === "thread") {
    return runThreadOperation(ctx, node, operation, itemJson, item);
  }
  throw new Error(`Gmail: unsupported resource "${resource}"`);
}

function buildEmailMime(
  node: INode,
  itemJson: Record<string, unknown>,
  opts: {
    to: string;
    subject: string;
    body: string;
    emailType: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    senderName?: string;
    inReplyTo?: string;
    references?: string;
  },
): string {
  const headers: string[] = [];
  headers.push(`To: ${opts.to}`);
  headers.push(`Subject: ${opts.subject}`);
  if (opts.cc) headers.push(`Cc: ${opts.cc}`);
  if (opts.bcc) headers.push(`Bcc: ${opts.bcc}`);
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  if (opts.senderName) {
    headers.push(`From: ${opts.senderName}`);
  }
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);
  headers.push("MIME-Version: 1.0");

  const isHtml = opts.emailType === "html";
  if (isHtml) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
  }
  headers.push("Content-Transfer-Encoding: 7bit");

  return `${headers.join("\r\n")}\r\n\r\n${opts.body}`;
}

function getAttachments(
  node: INode,
  item: INodeExecutionData,
): Array<{ data: string; fileName: string; mimeType: string }> {
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const attachmentsUi = options.attachmentsUi as Record<string, unknown> | undefined;
  if (!attachmentsUi) return [];
  const list = (attachmentsUi.attachmentsBinary ?? []) as Array<Record<string, unknown>>;
  const out: Array<{ data: string; fileName: string; mimeType: string }> = [];
  for (const entry of list) {
    const propName = String(entry.property ?? "data");
    const binary = item.binary?.[propName];
    if (!binary) continue;
    out.push({
      data: String(binary.data ?? ""),
      fileName: String(binary.fileName ?? propName),
      mimeType: String(binary.mimeType ?? "application/octet-stream"),
    });
  }
  return out;
}

function buildMultipartEmail(
  node: INode,
  itemJson: Record<string, unknown>,
  opts: {
    to: string;
    subject: string;
    body: string;
    emailType: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    senderName?: string;
    inReplyTo?: string;
    references?: string;
  },
  attachments: Array<{ data: string; fileName: string; mimeType: string }>,
): string {
  const boundary = `boundary_${Math.random().toString(36).slice(2)}`;
  const headers: string[] = [];
  headers.push(`To: ${opts.to}`);
  headers.push(`Subject: ${opts.subject}`);
  if (opts.cc) headers.push(`Cc: ${opts.cc}`);
  if (opts.bcc) headers.push(`Bcc: ${opts.bcc}`);
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  if (opts.senderName) headers.push(`From: ${opts.senderName}`);
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);
  headers.push("MIME-Version: 1.0");
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [headers.join("\r\n"), "", `--${boundary}`];
  const isHtml = opts.emailType === "html";
  if (isHtml) {
    parts.push('Content-Type: text/html; charset="UTF-8"');
  } else {
    parts.push('Content-Type: text/plain; charset="UTF-8"');
  }
  parts.push("Content-Transfer-Encoding: 7bit", "", opts.body);

  for (const att of attachments) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.mimeType}; name="${att.fileName}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(`Content-Disposition: attachment; filename="${att.fileName}"`, "");
    parts.push(att.data);
  }
  parts.push(`--${boundary}--`);
  return parts.join("\r\n");
}

async function runMessageOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResultList> {
  const token = await getToken(ctx);

  if (operation === "send" || operation === "sendAndWait") {
    return sendMessage(ctx, token, node, itemJson, item, operation === "sendAndWait");
  }
  if (operation === "get") {
    return getMessage(token, node, itemJson);
  }
  if (operation === "getAll") {
    return getManyMessages(token, node, itemJson);
  }
  if (operation === "delete") {
    return { json: await deleteMessage(token, node, itemJson) };
  }
  if (operation === "markAsRead") {
    return { json: await modifyMessageLabels(token, node, itemJson, [], ["UNREAD"]) };
  }
  if (operation === "markAsUnread") {
    return { json: await modifyMessageLabels(token, node, itemJson, ["UNREAD"], []) };
  }
  if (operation === "reply") {
    return replyToMessage(token, node, itemJson, item);
  }
  if (operation === "addLabels") {
    return {
      json: await modifyMessageLabels(token, node, itemJson, getLabelIds(node, itemJson), []),
    };
  }
  if (operation === "removeLabels") {
    return {
      json: await modifyMessageLabels(token, node, itemJson, [], getLabelIds(node, itemJson)),
    };
  }
  throw new Error(`Gmail: unsupported message operation "${operation}"`);
}

function getLabelIds(node: INode, itemJson: Record<string, unknown>): string[] {
  const raw = resolveValue(node.parameters.labelIds, itemJson);
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw) return [raw];
  return [];
}

async function sendMessage(
  ctx: ExecutionContext,
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  isWait: boolean,
): Promise<OpResult> {
  const to = String(resolveValue(node.parameters.sendTo, itemJson) ?? "");
  if (!to) throw new Error("Gmail: sendTo is required");
  const subject = String(resolveValue(node.parameters.subject, itemJson) ?? "");
  const emailType = String(node.parameters.emailType ?? "html");
  const message = String(resolveValue(node.parameters.message, itemJson) ?? "");
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const cc = String(resolveValue(options.ccList, itemJson) ?? "");
  const bcc = String(resolveValue(options.bccList, itemJson) ?? "");
  const replyTo = String(resolveValue(options.replyTo, itemJson) ?? "");
  const senderName = String(resolveValue(options.senderName, itemJson) ?? "");
  const appendAttribution = options.appendAttribution !== false;
  const finalBody = appendAttribution ? `${message}${ATTRIBUTION_SUFFIX}` : message;

  const attachments = getAttachments(node, item);
  const mime =
    attachments.length > 0
      ? buildMultipartEmail(
          node,
          itemJson,
          { to, subject, body: finalBody, emailType, cc, bcc, replyTo, senderName },
          attachments,
        )
      : buildEmailMime(node, itemJson, {
          to,
          subject,
          body: finalBody,
          emailType,
          cc,
          bcc,
          replyTo,
          senderName,
        });

  const raw = base64UrlEncode(mime);
  const res = await gmailRequest(token, "POST", `${API_BASE}/messages/send`, { raw });
  const sent = asObj(res);

  if (isWait) {
    // TODO: implement putExecutionToWait + sendAndWaitWebhook resume.
    // On resume, original input items should be returned.
    return { json: { ...itemJson } };
  }
  return { json: sent };
}

async function getMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult> {
  const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
  if (!messageId) throw new Error("Gmail: messageId is required");
  const simple = node.parameters.simple !== false;
  const res = await gmailRequest(token, "GET", `${API_BASE}/messages/${messageId}`);
  const msg = asObj(res);
  if (simple) return { json: simplifyMessage(msg) };
  return { json: msg };
}

async function getManyMessages(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResultList> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const simple = node.parameters.simple !== false;
  const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
  const query = buildSearchQuery(filters, itemJson);

  const params: Record<string, string> = { maxResults: String(returnAll ? 500 : limit) };
  if (query) params.q = query;
  if (filters.includeSpamTrash) params.includeSpamTrash = "true";

  const listRes = await gmailRequest(token, "GET", `${API_BASE}/messages`, undefined, params);
  const list = asObj(listRes);
  const messages = (list.messages ?? []) as Array<Record<string, unknown>>;
  const out: OpResult[] = [];
  for (const m of messages) {
    const id = String(m.id ?? "");
    if (!id) continue;
    const msgRes = await gmailRequest(token, "GET", `${API_BASE}/messages/${id}`);
    const msg = asObj(msgRes);
    out.push({ json: simple ? simplifyMessage(msg) : msg });
  }
  return out;
}

async function deleteMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
  if (!messageId) throw new Error("Gmail: messageId is required");
  await gmailRequest(token, "DELETE", `${API_BASE}/messages/${messageId}`);
  return { success: true };
}

async function modifyMessageLabels(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<Record<string, unknown>> {
  const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
  if (!messageId) throw new Error("Gmail: messageId is required");
  const res = await gmailRequest(token, "POST", `${API_BASE}/messages/${messageId}/modify`, {
    addLabelIds,
    removeLabelIds,
  });
  return asObj(res);
}

async function replyToMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
  if (!messageId) throw new Error("Gmail: messageId is required");
  const emailType = String(node.parameters.emailType ?? "text");
  const message = String(resolveValue(node.parameters.message, itemJson) ?? "");
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const cc = String(resolveValue(options.ccList, itemJson) ?? "");
  const bcc = String(resolveValue(options.bccList, itemJson) ?? "");
  const senderName = String(resolveValue(options.senderName, itemJson) ?? "");

  const origRes = await gmailRequest(token, "GET", `${API_BASE}/messages/${messageId}`);
  const orig = asObj(origRes);
  const threadId = String(orig.threadId ?? "");
  const headers = extractHeaders(orig);
  const inReplyTo = headers["Message-Id"] ?? "";
  const references = headers["References"] ? `${headers["References"]} ${inReplyTo}` : inReplyTo;
  const to = headers["From"] ?? "";

  const attachments = getAttachments(node, item);
  const mime =
    attachments.length > 0
      ? buildMultipartEmail(
          node,
          itemJson,
          {
            to,
            subject: `Re: ${headers["Subject"] ?? ""}`,
            body: message,
            emailType,
            cc,
            bcc,
            senderName,
            inReplyTo,
            references,
          },
          attachments,
        )
      : buildEmailMime(node, itemJson, {
          to,
          subject: `Re: ${headers["Subject"] ?? ""}`,
          body: message,
          emailType,
          cc,
          bcc,
          senderName,
          inReplyTo,
          references,
        });

  const raw = base64UrlEncode(mime);
  const body: Record<string, unknown> = { raw };
  if (threadId) body.threadId = threadId;
  const res = await gmailRequest(token, "POST", `${API_BASE}/messages/send`, body);
  return { json: asObj(res) };
}

function buildSearchQuery(
  filters: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): string {
  const parts: string[] = [];
  const q = String(resolveValue(filters.q, itemJson) ?? "");
  if (q) parts.push(q);
  const sender = String(resolveValue(filters.sender, itemJson) ?? "");
  if (sender) parts.push(`from:${sender}`);
  const readStatus = String(filters.readStatus ?? "unread");
  if (readStatus === "unread") parts.push("is:unread");
  else if (readStatus === "read") parts.push("is:read");
  const after = String(resolveValue(filters.receivedAfter, itemJson) ?? "");
  if (after) parts.push(`after:${after}`);
  const before = String(resolveValue(filters.receivedBefore, itemJson) ?? "");
  if (before) parts.push(`before:${before}`);
  return parts.join(" ");
}

function extractHeaders(msg: Record<string, unknown>): Record<string, string> {
  const payload = msg.payload as Record<string, unknown> | undefined;
  const headersArr = (payload?.headers ?? []) as Array<Record<string, string>>;
  const out: Record<string, string> = {};
  for (const h of headersArr) {
    out[h.name] = h.value;
  }
  return out;
}

function getBodyText(msg: Record<string, unknown>): string {
  const payload = msg.payload as Record<string, unknown> | undefined;
  if (!payload) return "";
  const parts = (payload.parts ?? []) as Array<Record<string, unknown>>;
  if (parts.length === 0) {
    const bodyObj = payload.body as Record<string, unknown> | undefined;
    const data = String(bodyObj?.data ?? payload.data ?? "");
    return data ? base64UrlDecode(data) : "";
  }
  for (const part of parts) {
    const mimeType = String(part.mimeType ?? "");
    if (mimeType === "text/plain" || mimeType === "text/html") {
      const bodyObj = part.body as Record<string, unknown> | undefined;
      const data = String(bodyObj?.data ?? "");
      if (data) return base64UrlDecode(data);
    }
  }
  return "";
}

function simplifyMessage(msg: Record<string, unknown>): Record<string, unknown> {
  const headers = extractHeaders(msg);
  const body = getBodyText(msg);
  const payload = msg.payload as Record<string, unknown> | undefined;
  const parts = ((payload?.parts ?? []) as Array<Record<string, unknown>>) ?? [];
  const hasAttachments = parts.some((p) => {
    const partHeaders = p.headers as Record<string, unknown> | undefined;
    const dispo = String(
      partHeaders?.["Content-Disposition"] ?? partHeaders?.["content-disposition"] ?? "",
    );
    return dispo.includes("attachment");
  });
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: headers["From"],
    to: headers["To"],
    cc: headers["Cc"],
    bcc: headers["Bcc"],
    subject: headers["Subject"],
    date: headers["Date"],
    snippet: msg.snippet,
    body,
    labelIds: msg.labelIds,
    hasAttachments,
  };
}

async function runLabelOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = await getToken(ctx);

  if (operation === "create") {
    const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
    if (!name) throw new Error("Gmail: name is required");
    const options = (node.parameters.options ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {
      name,
      labelListVisibility: String(options.labelListVisibility ?? "labelShow"),
      messageListVisibility: String(options.messageListVisibility ?? "show"),
    };
    const res = await gmailRequest(token, "POST", `${API_BASE}/labels`, body);
    return asObj(res);
  }
  if (operation === "get") {
    const labelId = String(resolveValue(node.parameters.labelId, itemJson) ?? "");
    if (!labelId) throw new Error("Gmail: labelId is required");
    const res = await gmailRequest(token, "GET", `${API_BASE}/labels/${labelId}`);
    return asObj(res);
  }
  if (operation === "getAll") {
    const res = await gmailRequest(token, "GET", `${API_BASE}/labels`);
    return asObj(res);
  }
  if (operation === "delete") {
    const labelId = String(resolveValue(node.parameters.labelId, itemJson) ?? "");
    if (!labelId) throw new Error("Gmail: labelId is required");
    await gmailRequest(token, "DELETE", `${API_BASE}/labels/${labelId}`);
    return { success: true };
  }
  throw new Error(`Gmail: unsupported label operation "${operation}"`);
}

async function runDraftOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  const token = await getToken(ctx);

  if (operation === "create") {
    return createDraft(token, node, itemJson, item);
  }
  if (operation === "get") {
    const draftId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!draftId) throw new Error("Gmail: messageId (draft id) is required");
    const res = await gmailRequest(token, "GET", `${API_BASE}/drafts/${draftId}`);
    return { json: asObj(res) };
  }
  if (operation === "delete") {
    const draftId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
    if (!draftId) throw new Error("Gmail: messageId (draft id) is required");
    await gmailRequest(token, "DELETE", `${API_BASE}/drafts/${draftId}`);
    return { json: { success: true } };
  }
  if (operation === "getAll") {
    const res = await gmailRequest(token, "GET", `${API_BASE}/drafts`);
    return { json: asObj(res) };
  }
  throw new Error(`Gmail: unsupported draft operation "${operation}"`);
}

async function createDraft(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  const subject = String(resolveValue(node.parameters.subject, itemJson) ?? "");
  const emailType = String(node.parameters.emailType ?? "text");
  const message = String(resolveValue(node.parameters.message, itemJson) ?? "");
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const to = String(resolveValue(options.sendTo, itemJson) ?? "");
  const cc = String(resolveValue(options.ccList, itemJson) ?? "");
  const bcc = String(resolveValue(options.bccList, itemJson) ?? "");
  const replyTo = String(resolveValue(options.replyTo, itemJson) ?? "");
  const threadId = String(resolveValue(options.threadId, itemJson) ?? "");

  const attachments = getAttachments(node, item);
  const mime =
    attachments.length > 0
      ? buildMultipartEmail(
          node,
          itemJson,
          { to, subject, body: message, emailType, cc, bcc, replyTo },
          attachments,
        )
      : buildEmailMime(node, itemJson, { to, subject, body: message, emailType, cc, bcc, replyTo });

  const raw = base64UrlEncode(mime);
  const messageBody: Record<string, unknown> = { raw };
  if (threadId) messageBody.threadId = threadId;
  const body: Record<string, unknown> = { message: messageBody };
  const res = await gmailRequest(token, "POST", `${API_BASE}/drafts`, body);
  return { json: asObj(res) };
}

async function runThreadOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  const token = await getToken(ctx);

  if (operation === "get") {
    const threadId = String(resolveValue(node.parameters.threadId, itemJson) ?? "");
    if (!threadId) throw new Error("Gmail: threadId is required");
    const res = await gmailRequest(token, "GET", `${API_BASE}/threads/${threadId}`);
    return { json: asObj(res) };
  }
  if (operation === "getAll") {
    const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
    const query = buildSearchQuery(filters, itemJson);
    const params: Record<string, string> = {};
    if (query) params.q = query;
    if (filters.includeSpamTrash) params.includeSpamTrash = "true";
    const res = await gmailRequest(token, "GET", `${API_BASE}/threads`, undefined, params);
    return { json: asObj(res) };
  }
  if (operation === "delete") {
    const threadId = String(resolveValue(node.parameters.threadId, itemJson) ?? "");
    if (!threadId) throw new Error("Gmail: threadId is required");
    await gmailRequest(token, "DELETE", `${API_BASE}/threads/${threadId}`);
    return { json: { success: true } };
  }
  if (operation === "trash") {
    const threadId = String(resolveValue(node.parameters.threadId, itemJson) ?? "");
    if (!threadId) throw new Error("Gmail: threadId is required");
    const res = await gmailRequest(token, "POST", `${API_BASE}/threads/${threadId}/trash`);
    return { json: asObj(res) };
  }
  if (operation === "untrash") {
    const threadId = String(resolveValue(node.parameters.threadId, itemJson) ?? "");
    if (!threadId) throw new Error("Gmail: threadId is required");
    const res = await gmailRequest(token, "POST", `${API_BASE}/threads/${threadId}/untrash`);
    return { json: asObj(res) };
  }
  if (operation === "reply") {
    return replyInThread(token, node, itemJson, item);
  }
  if (operation === "addLabels") {
    return {
      json: await modifyThreadLabels(token, node, itemJson, getLabelIds(node, itemJson), []),
    };
  }
  if (operation === "removeLabels") {
    return {
      json: await modifyThreadLabels(token, node, itemJson, [], getLabelIds(node, itemJson)),
    };
  }
  throw new Error(`Gmail: unsupported thread operation "${operation}"`);
}

async function replyInThread(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  const threadId = String(resolveValue(node.parameters.threadId, itemJson) ?? "");
  if (!threadId) throw new Error("Gmail: threadId is required");
  const messageId = String(resolveValue(node.parameters.messageId, itemJson) ?? "");
  if (!messageId) throw new Error("Gmail: messageId is required");
  const emailType = String(node.parameters.emailType ?? "text");
  const message = String(resolveValue(node.parameters.message, itemJson) ?? "");
  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const cc = String(resolveValue(options.ccList, itemJson) ?? "");
  const bcc = String(resolveValue(options.bccList, itemJson) ?? "");
  const senderName = String(resolveValue(options.senderName, itemJson) ?? "");

  const origRes = await gmailRequest(token, "GET", `${API_BASE}/messages/${messageId}`);
  const orig = asObj(origRes);
  const headers = extractHeaders(orig);
  const inReplyTo = headers["Message-Id"] ?? "";
  const references = headers["References"] ? `${headers["References"]} ${inReplyTo}` : inReplyTo;
  const to = headers["From"] ?? "";

  const attachments = getAttachments(node, item);
  const mime =
    attachments.length > 0
      ? buildMultipartEmail(
          node,
          itemJson,
          {
            to,
            subject: `Re: ${headers["Subject"] ?? ""}`,
            body: message,
            emailType,
            cc,
            bcc,
            senderName,
            inReplyTo,
            references,
          },
          attachments,
        )
      : buildEmailMime(node, itemJson, {
          to,
          subject: `Re: ${headers["Subject"] ?? ""}`,
          body: message,
          emailType,
          cc,
          bcc,
          senderName,
          inReplyTo,
          references,
        });

  const raw = base64UrlEncode(mime);
  const res = await gmailRequest(token, "POST", `${API_BASE}/messages/send`, {
    raw,
    threadId,
  });
  return { json: asObj(res) };
}

async function modifyThreadLabels(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<Record<string, unknown>> {
  const threadId = String(resolveValue(node.parameters.threadId, itemJson) ?? "");
  if (!threadId) throw new Error("Gmail: threadId is required");
  const res = await gmailRequest(token, "POST", `${API_BASE}/threads/${threadId}/modify`, {
    addLabelIds,
    removeLabelIds,
  });
  return asObj(res);
}

async function gmailRequest(
  token: string,
  method: string,
  url: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<unknown> {
  const fullUrl = params ? `${url}?${new URLSearchParams(params).toString()}` : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(fullUrl, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = obj.message
        ? String(obj.message)
        : (obj.error as Record<string, unknown> | undefined)?.message
          ? String((obj.error as Record<string, unknown>).message)
          : `Request failed with status code ${response.status}`;
      throw new Error(errMsg);
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Request failed")) throw err;
    if (err instanceof Error && !err.message.includes("Gmail:")) {
      throw new Error(`Gmail request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

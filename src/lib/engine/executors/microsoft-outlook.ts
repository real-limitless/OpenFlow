import { ensureItems } from "@/sdk";
import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";

const API_BASE = "https://graph.microsoft.com/v1.0/me";

interface OpResult {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}

export const microsoftOutlookExecutor: NodeExecutor = async (ctx, node) => {
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
  for (const credName of [
    "microsoftOutlookOAuth2Api",
    "microsoftOAuth2Api",
    "microsoftEntraServicePrincipal",
  ]) {
    const cred = await ctx.getCredential(credName) as Record<string, unknown> | null;
    if (cred) {
      const token = String(cred.accessToken ?? "");
      if (token) return token;
    }
  }
  throw new Error(
    "Microsoft Outlook: no valid credential configured. " +
      "Try microsoftOutlookOAuth2Api, microsoftOAuth2Api, or microsoftEntraServicePrincipal.",
  );
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult | OpResult[]> {
  if (resource === "message") return runMessageOp(ctx, node, operation, itemJson, item);
  if (resource === "draft") return runDraftOp(ctx, node, operation, itemJson, item);
  if (resource === "folderMessage") {
    return await runFolderListOp(ctx, node, itemJson);
  }
  if (resource === "messageAttachment") {
    return await runMessageAttachmentOp(ctx, node, operation, itemJson, item);
  }
  return await runGenericOp(ctx, node, resource, operation, itemJson);
}

/** Resolve a parameter value, supporting {{ }} expressions. */
function resolveParam(raw: unknown, itemJson: Record<string, unknown>): string {
  if (typeof raw !== "string") return raw == null ? "" : String(raw);
  if (/\{\{[\s\S]*?\}\}/.test(raw)) {
    const key = raw.replace(/\{\{\s*\$json\.(\w+)\s*\}\}/g, "$1").trim();
    const val = itemJson[key];
    return val == null ? raw : String(val);
  }
  return raw;
}

function resolveList(raw: unknown, itemJson: Record<string, unknown>): string[] {
  const s = resolveParam(raw, itemJson);
  return s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
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

function buildRecipients(
  raw: string | undefined,
  itemJson: Record<string, unknown>,
): Array<{ emailAddress: { address: string } }> {
  if (!raw) return [];
  return resolveList(raw, itemJson).map((addr) => ({ emailAddress: { address: addr } }));
}

function buildMessageBody(
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const bodyContent = resolveParam(node.parameters.bodyContent, itemJson);
  const bodyType = String(node.parameters.bodyType ?? "text");
  const body: Record<string, unknown> = {
    subject: resolveParam(node.parameters.subject, itemJson),
    body: {
      contentType: bodyType === "html" ? "HTML" : "Text",
      content: bodyContent,
    },
    toRecipients: buildRecipients(
      resolveParam(node.parameters.toRecipients, itemJson),
      itemJson,
    ),
  };
  const cc = resolveParam(node.parameters.ccRecipients, itemJson);
  if (cc) body.ccRecipients = buildRecipients(cc, itemJson);
  const bcc = resolveParam(node.parameters.bccRecipients, itemJson);
  if (bcc) body.bccRecipients = buildRecipients(bcc, itemJson);
  return body;
}

// ---- Message operations ----
async function runMessageOp(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx);
  if (operation === "send") return sendMessage(token, node, itemJson, item);
  if (operation === "sendAndWait") return sendAndWait(token, node, itemJson, item);
  if (operation === "reply") return replyMessage(token, node, itemJson, item);
  if (operation === "move") return { json: await moveMessage(token, node, itemJson) };
  if (operation === "get") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook: messageId is required");
    return { json: (await callGraph(token, "GET", `/messages/${encodeURIComponent(id)}`)) as Record<string, unknown> };
  }
  if (operation === "delete") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook: messageId is required");
    await callGraph(token, "DELETE", `/messages/${encodeURIComponent(id)}`);
    return { json: itemJson };
  }
  if (operation === "update") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook: messageId is required");
    const body = buildMessageBody(node, itemJson);
    return { json: (await callGraph(token, "PATCH", `/messages/${encodeURIComponent(id)}`, body)) as Record<string, unknown> };
  }
  if (operation === "getAll") {
    return listAllPaginated(token, node, itemJson, "/messages");
  }
  throw new Error(`Microsoft Outlook: unsupported message operation "${operation}"`);
}

async function sendMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResult> {
  const message = buildMessageBody(node, itemJson);
  if (!message.subject) throw new Error("Microsoft Outlook: subject is required");
  await callGraph(token, "POST", "/sendMail", { message });
  return { json: { success: true } };
}

async function sendAndWait(
  _token: string,
  _node: INode,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResult> {
  // TODO: implement putExecutionToWait + sendAndWaitWebhook resume.
  // Placeholder: emit a timeout outcome so the output shape matches spec.
  return { json: { approved: false, timeout: true } };
}

async function replyMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  _item: INodeExecutionData,
): Promise<OpResult> {
  const messageId = resolveParam(node.parameters.messageId, itemJson);
  if (!messageId) throw new Error("Microsoft Outlook: messageId is required for reply");
  const comment = resolveParam(node.parameters.bodyContent, itemJson);
  const body: Record<string, unknown> = {
    message: buildMessageBody(node, itemJson),
    comment,
  };
  const res = await callGraph(
    token,
    "POST",
    `/messages/${encodeURIComponent(messageId)}/reply`,
    body,
  );
  return { json: (res as Record<string, unknown>) ?? {} };
}

async function moveMessage(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const messageId = resolveParam(node.parameters.messageId, itemJson);
  const destId = resolveParam(node.parameters.destinationFolderId, itemJson);
  if (!messageId || !destId)
    throw new Error("Microsoft Outlook: messageId and destinationFolderId are required for move");
  const res = await callGraph(token, "POST", `/messages/${encodeURIComponent(messageId)}/move`, {
    destinationId: destId,
  });
  return (res as Record<string, unknown>) ?? {};
}

// ---- Draft operations ----
async function runDraftOp(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx);
  if (operation === "create") {
    return {
      json: (await callGraph(token, "POST", "/messages", {
        ...buildMessageBody(node, itemJson),
        isDraft: true,
      })) as Record<string, unknown>,
    };
  }
  if (operation === "send") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook: messageId is required");
    return {
      json: (await callGraph(
        token,
        "POST",
        `/messages/${encodeURIComponent(id)}/send`,
      )) as Record<string, unknown>,
    };
  }
  if (operation === "get") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook: messageId is required");
    return {
      json: (await callGraph(
        token,
        "GET",
        `/messages/${encodeURIComponent(id)}`,
      )) as Record<string, unknown>,
    };
  }
  if (operation === "delete") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook: messageId is required");
    await callGraph(token, "DELETE", `/messages/${encodeURIComponent(id)}`);
    return { json: itemJson };
  }
  if (operation === "update") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook: messageId is required");
    return {
      json: (await callGraph(
        token,
        "PATCH",
        `/messages/${encodeURIComponent(id)}`,
        buildMessageBody(node, itemJson),
      )) as Record<string, unknown>,
    };
  }
  throw new Error(`Microsoft Outlook: unsupported draft operation "${operation}"`);
}

// ---- Folder Message (list messages in folder) ----
async function runFolderListOp(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<OpResult[]> {
  const token = await getToken(ctx);
  const folderId = resolveParam(node.parameters.folderId, itemJson) || "Inbox";
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const results: Record<string, unknown>[] = [];
  let nextLink: string | undefined = `/mailFolders/${encodeURIComponent(folderId)}/messages`;
  const params: Record<string, string> = {};
  if (!returnAll) params.$top = String(limit);
  while (nextLink && (returnAll || results.length < limit)) {
    const res = await callGraph(token, "GET", nextLink, undefined, params);
    const data = res as Record<string, unknown>;
    const value = (data.value ?? []) as Record<string, unknown>[];
    for (const item of value) {
      results.push(item);
      if (!returnAll && results.length >= limit) break;
    }
    nextLink = extractNextLink(data["@odata.nextLink"] as string | undefined);
  }
  return results.map((json) => ({ json }));
}

function extractNextLink(nextLink: string | undefined): string | undefined {
  if (!nextLink) return undefined;
  if (!nextLink.startsWith("http")) return nextLink;
  const url = new URL(nextLink);
  let path = url.pathname;
  const prefix = "/v1.0/me";
  if (path.startsWith(prefix)) path = path.slice(prefix.length);
  return path + url.search;
}

// ---- Generic CRUD for calendar/contact/event/folder ----
async function runGenericOp(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx);
  const endpoints: Record<string, string> = {
    calendar: "/calendars",
    contact: "/contacts",
    event: "/events",
    folder: "/mailFolders",
  };
  const base = endpoints[resource];
  if (!base) throw new Error(`Microsoft Outlook: unsupported resource "${resource}"`);

  if (operation === "getAll") {
    return await listAllPaginated(token, node, itemJson, base);
  }
  if (operation === "create") {
    return { json: (await callGraph(token, "POST", base, buildEntityBody(resource, node, itemJson))) as Record<string, unknown> };
  }
  if (operation === "get") {
    const id = resolveParam(node.parameters[`${resource}Id`], itemJson);
    if (!id) throw new Error(`Microsoft Outlook: ${resource}Id is required`);
    return { json: (await callGraph(token, "GET", `${base}/${encodeURIComponent(id)}`)) as Record<string, unknown> };
  }
  if (operation === "update") {
    const id = resolveParam(node.parameters[`${resource}Id`], itemJson);
    if (!id) throw new Error(`Microsoft Outlook: ${resource}Id is required`);
    return { json: (await callGraph(token, "PATCH", `${base}/${encodeURIComponent(id)}`, buildEntityBody(resource, node, itemJson))) as Record<string, unknown> };
  }
  if (operation === "delete") {
    const id = resolveParam(node.parameters[`${resource}Id`], itemJson);
    if (!id) throw new Error(`Microsoft Outlook: ${resource}Id is required`);
    await callGraph(token, "DELETE", `${base}/${encodeURIComponent(id)}`);
    return { json: itemJson };
  }
  throw new Error(`Microsoft Outlook: unsupported ${resource} operation "${operation}"`);
}

function buildEntityBody(
  resource: string,
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  if (resource === "event") {
    return {
      subject: resolveParam(node.parameters.subject, itemJson),
      start: { dateTime: resolveParam(node.parameters.startDateTime, itemJson), timeZone: "UTC" },
      end: { dateTime: resolveParam(node.parameters.endDateTime, itemJson), timeZone: "UTC" },
    };
  }
  if (resource === "contact") {
    const emailAddresses = resolveList(node.parameters.emailAddresses, itemJson);
    return {
      givenName: resolveParam(node.parameters.givenName, itemJson),
      surname: resolveParam(node.parameters.surname, itemJson),
      emailAddresses: emailAddresses.map((a) => ({ address: a })),
    };
  }
  if (resource === "folder") {
    return { displayName: resolveParam(node.parameters.displayName ?? node.parameters.name, itemJson) };
  }
  if (resource === "calendar") {
    return { name: resolveParam(node.parameters.name ?? node.parameters.displayName, itemJson) };
  }
  return {};
}

// ---- Message Attachment operations ----
async function runMessageAttachmentOp(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult | OpResult[]> {
  const token = await getToken(ctx);
  const messageId = resolveParam(node.parameters.messageId, itemJson);
  if (!messageId) throw new Error("Microsoft Outlook: messageId is required for attachment ops");

  if (operation === "add") {
    const binaryProperty = resolveParam(node.parameters.binaryProperty, itemJson) || "data";
    const binaryData = (item.binary ?? {})[binaryProperty] as Record<string, unknown> | undefined;
    if (!binaryData) throw new Error(`Microsoft Outlook: binary property "${binaryProperty}" not found on input item`);
    const contentBytes = String(binaryData.data ?? "");
    const fileName = String(binaryData.fileName ?? "attachment.bin");
    const contentType = String(binaryData.mimeType ?? "application/octet-stream");
    const body = {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: fileName,
      contentType,
      contentBytes,
    };
    const res = await callGraph(token, "POST", `/messages/${encodeURIComponent(messageId)}/attachments`, body);
    return { json: (res as Record<string, unknown>) ?? {} };
  }

  const attachmentId = resolveParam(node.parameters.attachmentId, itemJson);

  if (operation === "getAll") {
    return listAllPaginated(token, node, itemJson, `/messages/${encodeURIComponent(messageId)}/attachments`);
  }

  if (operation === "get" || operation === "download") {
    if (!attachmentId) throw new Error("Microsoft Outlook: attachmentId is required");
    const res = await callGraph(token, "GET", `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
    const attachment = (res as Record<string, unknown>) ?? {};
    const contentBytes = String(attachment.contentBytes ?? "");
    if (contentBytes) {
      const binary: Record<string, unknown> = {};
      binary[attachmentId] = {
        data: contentBytes,
        mimeType: String(attachment.contentType ?? "application/octet-stream"),
        fileName: String(attachment.name ?? "attachment"),
      };
      return { json: attachment, binary };
    }
    return { json: attachment };
  }

  throw new Error(`Microsoft Outlook: unsupported messageAttachment operation "${operation}"`);
}

async function listAllPaginated(
  token: string,
  node: INode,
  itemJson: Record<string, unknown>,
  basePath: string,
): Promise<OpResult[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const results: Record<string, unknown>[] = [];
  let nextLink: string | undefined = basePath;
  const params: Record<string, string> = {};
  if (!returnAll) params.$top = String(limit);
  while (nextLink && (returnAll || results.length < limit)) {
    const res = await callGraph(token, "GET", nextLink, undefined, params);
    const data = res as Record<string, unknown>;
    const value = (data.value ?? []) as Record<string, unknown>[];
    for (const item of value) {
      results.push(item);
      if (!returnAll && results.length >= limit) break;
    }
    nextLink = extractNextLink(data["@odata.nextLink"] as string | undefined);
  }
  return results.map((json) => ({ json }));
}

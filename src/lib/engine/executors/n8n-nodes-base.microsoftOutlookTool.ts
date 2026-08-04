import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://graph.microsoft.com/v1.0/me";

function resolveParam(raw: unknown, itemJson: Record<string, unknown>): string {
  if (typeof raw !== "string") return raw == null ? "" : String(raw);
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", "return " + raw.replace(/^\s*=\s*/, "").replace(/\{\{([\s\S]*?)\}\}/g, "$1"));
      return String(fn(itemJson));
    } catch {
      return raw;
    }
  }
  return raw;
}

function resolveList(raw: unknown, itemJson: Record<string, unknown>): string[] {
  const s = resolveParam(raw, itemJson);
  return s.split(",").map(p => p.trim()).filter(Boolean);
}

function parseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

async function getToken(ctx: ExecutionContext): Promise<string> {
  for (const credName of [
    "microsoftOutlookOAuth2Api",
    "microsoftOAuth2Api",
    "microsoftEntraServicePrincipal",
  ]) {
    const cred = await ctx.getCredential(credName) as Record<string, unknown> | null;
    if (cred) {
      const token = String(cred.accessToken ?? cred.access_token ?? "");
      if (token) return token;
    }
  }
  throw new Error(
    "Microsoft Outlook Tool: no valid credential configured. " +
    "Try microsoftOutlookOAuth2Api, microsoftOAuth2Api, or microsoftEntraServicePrincipal.",
  );
}

async function callGraph(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${API_BASE}${path}`;
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
    try { parsed = text ? JSON.parse(text) : null; } catch { }
    if (res.status < 200 || res.status >= 300) {
      const errObj = (parsed as Record<string, unknown>) ?? {};
      const inner = (errObj.error as Record<string, unknown>) ?? {};
      const message = String(inner.message ?? errObj.message ?? `${method} ${path} failed with ${res.status}`);
      throw new Error(message);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function buildRecipients(raw: string | undefined, itemJson: Record<string, unknown>): Array<{ emailAddress: { address: string } }> {
  if (!raw) return [];
  return resolveList(raw, itemJson).map(addr => ({ emailAddress: { address: addr } }));
}

function buildMessageBody(node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    subject: resolveParam(node.parameters.subject, itemJson),
    body: {
      contentType: String(node.parameters.bodyType ?? "text") === "html" ? "HTML" : "Text",
      content: resolveParam(node.parameters.bodyContent, itemJson),
    },
    toRecipients: buildRecipients(resolveParam(node.parameters.toRecipients, itemJson), itemJson),
  };
  const cc = resolveParam(node.parameters.ccRecipients, itemJson);
  if (cc) body.ccRecipients = buildRecipients(cc, itemJson);
  const bcc = resolveParam(node.parameters.bccRecipients, itemJson);
  if (bcc) body.bccRecipients = buildRecipients(bcc, itemJson);
  return body;
}

async function listPaginated(token: string, path: string, node: INode, itemJson: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const returnAll = Boolean(node.parameters.returnAll);
  const limit = Number(node.parameters.limit ?? 50);
  const results: Record<string, unknown>[] = [];
  let nextLink: string | undefined = path;
  while (nextLink && (returnAll || results.length < limit)) {
    const res = await callGraph(token, "GET", nextLink);
    const data = res as Record<string, unknown>;
    const value = (data.value ?? []) as Record<string, unknown>[];
    for (const item of value) {
      results.push(item);
      if (!returnAll && results.length >= limit) break;
    }
    const link = data["@odata.nextLink"] as string | undefined;
    nextLink = link ? extractNextLink(link) : undefined;
  }
  return results;
}

function extractNextLink(nextLink: string): string {
  const url = new URL(nextLink);
  let path = url.pathname;
  const prefix = "/v1.0/me";
  if (path.startsWith(prefix)) path = path.slice(prefix.length);
  return path + url.search;
}

export const microsoftOutlookToolExecutor: NodeExecutor = async (ctx, node) => {
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
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<{ json: Record<string, unknown>; binary?: Record<string, unknown> } | { json: Record<string, unknown>; binary?: Record<string, unknown> }[]> {
  const token = await getToken(ctx);

  if (resource === "message") return runMessageOp(token, node, operation, itemJson);
  if (resource === "folderMessage") return runFolderMessageOp(token, node, operation, itemJson);
  if (resource === "draft") return runDraftOp(token, node, operation, itemJson);
  if (resource === "messageAttachment") return runAttachmentOp(token, node, operation, itemJson, item);
  if (resource === "event" || resource === "calendar" || resource === "contact" || resource === "folder") {
    return runGenericOp(token, node, resource, operation, itemJson);
  }
  throw new Error(`Microsoft Outlook Tool: unsupported resource "${resource}"`);
}

async function runMessageOp(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  if (operation === "send") {
    const message = buildMessageBody(node, itemJson);
    if (!message.subject) throw new Error("Microsoft Outlook Tool: subject is required");
    await callGraph(token, "POST", "/sendMail", { message });
    return { json: { success: true } };
  }
  if (operation === "sendAndWait") {
    return { json: { approved: false, timeout: true } };
  }
  if (operation === "reply") {
    const messageId = resolveParam(node.parameters.messageId, itemJson);
    if (!messageId) throw new Error("Microsoft Outlook Tool: messageId is required for reply");
    await callGraph(token, "POST", `/messages/${encodeURIComponent(messageId)}/reply`, {
      message: buildMessageBody(node, itemJson),
      comment: resolveParam(node.parameters.bodyContent, itemJson),
    });
    return { json: { success: true, messageId } };
  }
  if (operation === "move") {
    const messageId = resolveParam(node.parameters.messageId, itemJson);
    const destId = resolveParam(node.parameters.destinationFolderId, itemJson);
    if (!messageId || !destId) throw new Error("Microsoft Outlook Tool: messageId and destinationFolderId are required for move");
    const res = await callGraph(token, "POST", `/messages/${encodeURIComponent(messageId)}/move`, { destinationId: destId });
    return { json: (res as Record<string, unknown>) ?? {} };
  }
  if (operation === "get") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook Tool: messageId is required");
    return { json: (await callGraph(token, "GET", `/messages/${encodeURIComponent(id)}`)) as Record<string, unknown> };
  }
  if (operation === "delete") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook Tool: messageId is required");
    await callGraph(token, "DELETE", `/messages/${encodeURIComponent(id)}`);
    return { json: itemJson };
  }
  if (operation === "update") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook Tool: messageId is required");
    const res = await callGraph(token, "PATCH", `/messages/${encodeURIComponent(id)}`, buildMessageBody(node, itemJson));
    return { json: (res as Record<string, unknown>) ?? {} };
  }
  if (operation === "getAll") {
    const results = await listPaginated(token, "/messages", node, itemJson);
    return { json: results };
  }
  throw new Error(`Microsoft Outlook Tool: unsupported message operation "${operation}"`);
}

async function runFolderMessageOp(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown>[] }> {
  if (operation !== "getAll") throw new Error(`Microsoft Outlook Tool: unsupported folderMessage operation "${operation}"`);
  const folderId = resolveParam(node.parameters.folderId, itemJson) || "Inbox";
  const results = await listPaginated(token, `/mailFolders/${encodeURIComponent(folderId)}/messages`, node, itemJson);
  return { json: results };
}

async function runDraftOp(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> }> {
  if (operation === "create") {
    const res = await callGraph(token, "POST", "/messages", { ...buildMessageBody(node, itemJson), isDraft: true });
    return { json: (res as Record<string, unknown>) ?? {} };
  }
  if (operation === "send") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook Tool: messageId is required");
    await callGraph(token, "POST", `/messages/${encodeURIComponent(id)}/send`);
    return { json: { success: true, messageId: id } };
  }
  if (operation === "get") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook Tool: messageId is required");
    return { json: (await callGraph(token, "GET", `/messages/${encodeURIComponent(id)}`)) as Record<string, unknown> };
  }
  if (operation === "delete") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook Tool: messageId is required");
    await callGraph(token, "DELETE", `/messages/${encodeURIComponent(id)}`);
    return { json: itemJson };
  }
  if (operation === "update") {
    const id = resolveParam(node.parameters.messageId, itemJson);
    if (!id) throw new Error("Microsoft Outlook Tool: messageId is required");
    const res = await callGraph(token, "PATCH", `/messages/${encodeURIComponent(id)}`, buildMessageBody(node, itemJson));
    return { json: (res as Record<string, unknown>) ?? {} };
  }
  throw new Error(`Microsoft Outlook Tool: unsupported draft operation "${operation}"`);
}

async function runAttachmentOp(
  token: string,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<{ json: Record<string, unknown>; binary?: Record<string, unknown> }> {
  const messageId = resolveParam(node.parameters.messageId, itemJson);
  if (!messageId) throw new Error("Microsoft Outlook Tool: messageId is required for attachment ops");

  if (operation === "add") {
    const binaryProperty = resolveParam(node.parameters.binaryPropertyName ?? node.parameters.binaryProperty, itemJson) || "data";
    const binaryData = (item.binary ?? {})[binaryProperty] as Record<string, unknown> | undefined;
    if (!binaryData) throw new Error(`Microsoft Outlook Tool: binary property "${binaryProperty}" not found`);
    const contentBytes = String(binaryData.data ?? "");
    const fileName = String(binaryData.fileName ?? "attachment.bin");
    const contentType = String(binaryData.mimeType ?? "application/octet-stream");
    const res = await callGraph(token, "POST", `/messages/${encodeURIComponent(messageId)}/attachments`, {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: fileName,
      contentType,
      contentBytes,
    });
    return { json: (res as Record<string, unknown>) ?? {} };
  }
  if (operation === "getAll") {
    const results = await listPaginated(token, `/messages/${encodeURIComponent(messageId)}/attachments`, node, itemJson);
    return { json: { value: results } };
  }
  const attachmentId = resolveParam(node.parameters.attachmentId, itemJson);
  if (!attachmentId) throw new Error("Microsoft Outlook Tool: attachmentId is required");
  const res = await callGraph(token, "GET", `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  const attachment = (res as Record<string, unknown>) ?? {};
  const contentBytes = String(attachment.contentBytes ?? "");
  if ((operation === "download" || operation === "get") && contentBytes) {
    return {
      json: attachment,
      binary: {
        [attachmentId]: {
          data: contentBytes,
          mimeType: String(attachment.contentType ?? "application/octet-stream"),
          fileName: String(attachment.name ?? "attachment"),
        },
      },
    };
  }
  return { json: attachment };
}

async function runGenericOp(
  token: string,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<{ json: Record<string, unknown> } | { json: Record<string, unknown>[] }> {
  const endpoints: Record<string, string> = {
    calendar: "/calendars",
    contact: "/contacts",
    event: "/events",
    folder: "/mailFolders",
  };
  const base = endpoints[resource];
  if (!base) throw new Error(`Microsoft Outlook Tool: unsupported resource "${resource}"`);

  if (operation === "getAll") {
    const results = await listPaginated(token, base, node, itemJson);
    return { json: results };
  }
  if (operation === "create") {
    const body = buildEntityBody(resource, node, itemJson);
    const res = await callGraph(token, "POST", base, body);
    return { json: (res as Record<string, unknown>) ?? {} };
  }
  if (operation === "get") {
    const id = resolveParam(node.parameters[`${resource}Id`], itemJson);
    if (!id) throw new Error(`Microsoft Outlook Tool: ${resource}Id is required`);
    return { json: (await callGraph(token, "GET", `${base}/${encodeURIComponent(id)}`)) as Record<string, unknown> };
  }
  if (operation === "update") {
    const id = resolveParam(node.parameters[`${resource}Id`], itemJson);
    if (!id) throw new Error(`Microsoft Outlook Tool: ${resource}Id is required`);
    const res = await callGraph(token, "PATCH", `${base}/${encodeURIComponent(id)}`, buildEntityBody(resource, node, itemJson));
    return { json: (res as Record<string, unknown>) ?? {} };
  }
  if (operation === "delete") {
    const id = resolveParam(node.parameters[`${resource}Id`], itemJson);
    if (!id) throw new Error(`Microsoft Outlook Tool: ${resource}Id is required`);
    await callGraph(token, "DELETE", `${base}/${encodeURIComponent(id)}`);
    return { json: itemJson };
  }
  throw new Error(`Microsoft Outlook Tool: unsupported ${resource} operation "${operation}"`);
}

function buildEntityBody(resource: string, node: INode, itemJson: Record<string, unknown>): Record<string, unknown> {
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
      emailAddresses: emailAddresses.map(a => ({ address: a })),
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

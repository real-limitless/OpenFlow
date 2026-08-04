import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems, sdkHttpRequest } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://graph.facebook.com/v17.0";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function makeBody(
  itemJson: Record<string, unknown>,
  from: string,
  to: string,
  messageType: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: messageType,
  };

  if (messageType === "text") {
    body.text = {
      body: resolveValue(params.text, itemJson),
      preview_url: Boolean(params.previewUrl ?? false),
    };
  } else if (["image", "audio", "document", "video", "sticker"].includes(messageType)) {
    const payload: Record<string, unknown> = {};
    const mediaId = resolveValue(params.mediaId, itemJson);
    const mediaLink = resolveValue(params.mediaLink, itemJson);
    if (mediaId) payload.id = mediaId;
    if (mediaLink) payload.link = mediaLink;
    const caption = resolveValue(params.caption, itemJson);
    if (caption) payload.caption = caption;
    if (messageType === "document") {
      const fn = resolveValue(params.filename, itemJson);
      if (fn) payload.filename = fn;
    }
    body[messageType] = payload;
  } else if (messageType === "location") {
    body.location = {
      longitude: Number(resolveValue(params.longitude, itemJson)),
      latitude: Number(resolveValue(params.latitude, itemJson)),
      name: String(resolveValue(params.locationName, itemJson) ?? ""),
      address: String(resolveValue(params.locationAddress, itemJson) ?? ""),
    };
  } else if (messageType === "contacts") {
    body.contacts = resolveValue(params.contacts, itemJson) ?? [];
  } else if (messageType === "interactive") {
    body.interactive = resolveValue(params.interactive, itemJson) ?? {};
  }

  const contextMsgId = resolveValue(params.contextMessageId, itemJson);
  if (contextMsgId) body.context = { message_id: contextMsgId };

  return body;
}

export const whatsAppToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const out2: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "Message");
  const operation = String(node.parameters.operation ?? "Send");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOp(ctx, node, resource, operation, itemJson, item);
      if (result.outputIndex === 1) {
        out2.push({ json: result.json, pairedItem });
      } else {
        out.push({ json: result.json, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out, out2];
};

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("whatsAppApi");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("WhatsApp Tool: whatsAppApi credential is not configured");
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

interface OpResult {
  json: Record<string, unknown>;
  outputIndex: number;
}

async function runOp(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<OpResult> {
  const headers = await authHeaders(ctx);
  const params = node.parameters;

  const from = String(resolveValue(params.from, itemJson) ?? "");
  if (!from) throw new Error("WhatsApp Tool: from (sender phone number ID) is required");

  if (resource === "Message") {
    return runMessageOp(node, operation, itemJson, item, headers, from, params);
  }
  if (resource === "Media") {
    return runMediaOp(node, operation, itemJson, item, headers, from, params);
  }
  throw new Error(`WhatsApp Tool: unsupported resource "${resource}"`);
}

async function runMessageOp(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
  from: string,
  params: Record<string, unknown>,
): Promise<OpResult> {
  const to = cleanPhoneNumber(String(resolveValue(params.to, itemJson) ?? ""));
  if (!to) throw new Error("WhatsApp Tool: to (recipient phone number) is required");

  if (operation === "Send") {
    return sendOp(node, itemJson, headers, from, to, params);
  }
  if (operation === "Send Template") {
    return sendTemplateOp(node, itemJson, headers, from, to, params);
  }
  if (operation === "Send and Wait for Response") {
    return sendAndWaitOp(node, itemJson, item, headers, from, to, params);
  }
  throw new Error(`WhatsApp Tool: unsupported message operation "${operation}"`);
}

async function sendOp(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  from: string,
  to: string,
  params: Record<string, unknown>,
): Promise<OpResult> {
  const messageType = String(params.messageType ?? "Text").toLowerCase();
  const body = makeBody(itemJson, from, to, messageType, params);
  const res = await waRequest("POST", `${API_BASE}/${from}/messages`, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp Tool: HTTP ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return { json: asObj(res.body), outputIndex: 0 };
}

async function sendTemplateOp(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  from: string,
  to: string,
  params: Record<string, unknown>,
): Promise<OpResult> {
  const templateName = String(resolveValue(params.template, itemJson) ?? "");
  if (!templateName) throw new Error("WhatsApp Tool: template name is required");
  const language = String(resolveValue(params.language, itemJson) ?? "en_US");

  const templateBody: Record<string, unknown> = {
    name: templateName,
    language: { code: language },
  };

  const templateParams = resolveValue(params.templateParameters, itemJson);
  if (templateParams && typeof templateParams === "object") {
    const tp = templateParams as Record<string, unknown>;
    const components: Record<string, unknown>[] = [];
    if (tp.header) {
      components.push({ type: "header", parameters: tp.header as unknown[] });
    }
    if (tp.body) {
      components.push({ type: "body", parameters: tp.body as unknown[] });
    }
    if (tp.buttons) {
      components.push({ type: "button", sub_type: "quick_reply", index: 0, parameters: tp.buttons as unknown[] });
    }
    if (components.length > 0) templateBody.components = components;
  }

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: templateBody,
  };

  const res = await waRequest("POST", `${API_BASE}/${from}/messages`, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp Tool: HTTP ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return { json: asObj(res.body), outputIndex: 0 };
}

async function sendAndWaitOp(
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
  from: string,
  to: string,
  params: Record<string, unknown>,
): Promise<OpResult> {
  const messageType = String(params.messageType ?? "Text").toLowerCase();
  const body = makeBody(itemJson, from, to, messageType, params);
  const res = await waRequest("POST", `${API_BASE}/${from}/messages`, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp Tool: HTTP ${res.status} - ${JSON.stringify(res.body)}`);
  }
  // TODO: implement putExecutionToWait + webhook resume for HITL.
  // For now, route input item to output[1] as a placeholder approval response.
  return { json: { ...itemJson, waitResponse: { approved: true } }, outputIndex: 1 };
}

async function runMediaOp(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
  from: string,
  params: Record<string, unknown>,
): Promise<OpResult> {
  if (operation === "Upload") {
    return uploadMediaOp(node, itemJson, item, headers, from, params);
  }
  if (operation === "Download") {
    return downloadMediaOp(node, itemJson, headers, params);
  }
  if (operation === "Delete") {
    return deleteMediaOp(node, itemJson, headers, params);
  }
  throw new Error(`WhatsApp Tool: unsupported media operation "${operation}"`);
}

async function uploadMediaOp(
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
  from: string,
  params: Record<string, unknown>,
): Promise<OpResult> {
  const propertyName = String(params.inputDataFieldName ?? "data");
  const binary = item.binary?.[propertyName];
  if (!binary) throw new Error(`WhatsApp Tool: binary property "${propertyName}" not found`);

  const mimeType = binary.mimeType ?? "application/octet-stream";
  const base64Data = String(binary.data ?? "");
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  const fn = params.fileName ? String(params.fileName) : binary.fileName || propertyName;
  form.append("file", blob, fn);

  const uploadHeaders = { ...headers };
  delete uploadHeaders["Content-Type"];

  const url = `${API_BASE}/${from}/media`;
  const res = await waRequestForm("POST", url, uploadHeaders, form);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp Tool: media upload HTTP ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return { json: asObj(res.body), outputIndex: 0 };
}

async function downloadMediaOp(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  params: Record<string, unknown>,
): Promise<OpResult> {
  const mediaId = String(resolveValue(params.mediaId, itemJson) ?? "");
  if (!mediaId) throw new Error("WhatsApp Tool: mediaId is required");
  const url = `${API_BASE}/${mediaId}`;
  const res = await waRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp Tool: HTTP ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return { json: asObj(res.body), outputIndex: 0 };
}

async function deleteMediaOp(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  params: Record<string, unknown>,
): Promise<OpResult> {
  const mediaId = String(resolveValue(params.mediaId, itemJson) ?? "");
  if (!mediaId) throw new Error("WhatsApp Tool: mediaId is required");
  const url = `${API_BASE}/${mediaId}`;
  const res = await waRequest("DELETE", url, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp Tool: HTTP ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return { json: { success: true }, outputIndex: 0 };
}

async function waRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = { method, headers, signal: controller.signal };
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`WhatsApp Tool request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function waRequestForm(
  method: string,
  url: string,
  headers: Record<string, string>,
  form: FormData,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { method, headers, body: form, signal: controller.signal });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`WhatsApp Tool request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

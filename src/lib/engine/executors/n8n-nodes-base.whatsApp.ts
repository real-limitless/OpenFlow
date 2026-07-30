import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://graph.facebook.com/v18.0";

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

function templateInfo(template: string): { name: string; language: string } {
  const idx = template.indexOf("|");
  if (idx === -1) return { name: template, language: "" };
  return { name: template.slice(0, idx), language: template.slice(idx + 1) };
}

function transformParam(param: unknown): Record<string, unknown> {
  const p = (param ?? {}) as Record<string, unknown>;
  const type = String(p.type ?? "text");
  const out: Record<string, unknown> = { type };
  if (type === "text") {
    out.text = p.text;
  } else if (type === "currency") {
    out.currency = {
      code: p.code,
      amount_1000: p.amount_1000,
      fallback_value: p.fallback_value,
    };
  } else if (type === "date_time") {
    out.date_time = {
      fallback_value: p.fallback_value,
      date_time: p.date_time,
    };
  }
  return out;
}

function transformButtonParam(bp: Record<string, unknown>): Record<string, unknown> {
  const type = String(bp.type ?? "payload");
  const out: Record<string, unknown> = { type };
  if (type === "payload") out.payload = bp.payload;
  else out.text = bp.text;
  return out;
}

function componentsRequest(components: unknown[]): Record<string, unknown>[] {
  return components.map((comp) => {
    const c = (comp ?? {}) as Record<string, unknown>;
    const type = String(c.type ?? "body");
    const out: Record<string, unknown> = { type };
    if (type === "button") {
      out.sub_type = String(c.sub_type ?? "quick_reply");
      out.index = Number(c.index ?? 0);
      const bp = c.buttonParameters as Record<string, unknown> | undefined;
      if (bp) out.parameters = [transformButtonParam(bp)];
    } else {
      const params = (c.bodyParameters as unknown[]) ?? (c.headerParameters as unknown[]) ?? [];
      out.parameters = params.map(transformParam);
    }
    return out;
  });
}

function resolveComponent(comp: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof comp !== "object" || comp === null) return comp;
  const c = comp as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === "bodyParameters" && Array.isArray(v)) {
      out.bodyParameters = v.map((p) => resolveParam(p, itemJson));
    } else if (k === "buttonParameters" && typeof v === "object" && v !== null) {
      out.buttonParameters = resolveParam(v, itemJson);
    } else {
      out[k] = resolveValue(v, itemJson);
    }
  }
  return out;
}

function resolveParam(param: unknown, itemJson: Record<string, unknown>): Record<string, unknown> {
  const p = (param ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    out[k] = resolveValue(v, itemJson);
  }
  return out;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

export const whatsAppExecutor: NodeExecutor = async (ctx, node) => {
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
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, message }, pairedItem });
    }
  }

  return [out];
};

async function authHeaders(ctx: ExecutionContext): Promise<Record<string, string>> {
  const cred = await ctx.getCredential("whatsAppApi");
  const accessToken = cred ? String(cred.accessToken ?? "") : "";
  if (!accessToken) {
    throw new Error("WhatsApp: whatsAppApi credential is not configured");
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const headers = await authHeaders(ctx);

  if (resource === "message") {
    return runMessageOperation(ctx, node, operation, itemJson, item, headers);
  }
  if (resource === "media") {
    return runMediaOperation(node, operation, itemJson, item, headers);
  }
  throw new Error(`WhatsApp: unsupported resource "${resource}"`);
}

async function runMessageOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const phoneNumberId = String(resolveValue(node.parameters.phoneNumberId, itemJson) ?? "");
  if (!phoneNumberId) throw new Error("WhatsApp: phoneNumberId is required");
  const recipient = cleanPhoneNumber(
    String(resolveValue(node.parameters.recipientPhoneNumber, itemJson) ?? ""),
  );
  if (!recipient) throw new Error("WhatsApp: recipientPhoneNumber is required");

  const url = `${API_BASE}/${phoneNumberId}/messages`;

  if (operation === "send") {
    return sendMessage(ctx, node, itemJson, item, headers, url, recipient, phoneNumberId);
  }
  if (operation === "sendTemplate") {
    return sendTemplate(node, itemJson, headers, url, recipient);
  }
  if (operation === "sendAndWait") {
    return sendAndWait(ctx, node, itemJson, item, headers, url, recipient, phoneNumberId);
  }
  throw new Error(`WhatsApp: unsupported message operation "${operation}"`);
}

async function buildMessageBody(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  recipient: string,
  headers: Record<string, string>,
  phoneNumberId: string,
): Promise<Record<string, unknown>> {
  const messageType = String(node.parameters.messageType ?? "text");
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: recipient,
    type: messageType,
  };

  if (messageType === "text") {
    body.text = { body: resolveValue(node.parameters.textBody, itemJson) };
  } else if (["image", "video", "audio", "document", "sticker"].includes(messageType)) {
    body[messageType] = await buildMediaPayload(
      ctx,
      node,
      itemJson,
      item,
      messageType,
      headers,
      phoneNumberId,
    );
  } else if (messageType === "location") {
    body.location = {
      longitude: Number(resolveValue(node.parameters.longitude, itemJson)),
      latitude: Number(resolveValue(node.parameters.latitude, itemJson)),
      name: resolveValue(node.parameters.locationName, itemJson) ?? "",
      address: resolveValue(node.parameters.locationAddress, itemJson) ?? "",
    };
  } else if (messageType === "contacts") {
    body.contacts = buildContactsPayload(node, itemJson);
  } else {
    throw new Error(`WhatsApp: unsupported messageType "${messageType}"`);
  }

  return body;
}

async function sendMessage(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
  url: string,
  recipient: string,
  phoneNumberId: string,
): Promise<Record<string, unknown>> {
  const body = await buildMessageBody(ctx, node, itemJson, item, recipient, headers, phoneNumberId);
  const res = await waRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp: HTTP ${res.status}`);
  }
  return asObj(res.body);
}

async function buildMediaPayload(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  messageType: string,
  headers: Record<string, string>,
  phoneNumberId: string,
): Promise<Record<string, unknown>> {
  const mediaPath = String(node.parameters.mediaPath ?? "useMediaLink");
  const caption = resolveValue(node.parameters.mediaCaption, itemJson);
  const payload: Record<string, unknown> = {};

  if (mediaPath === "useMediaLink") {
    payload.link = resolveValue(node.parameters.mediaLink, itemJson);
  } else if (mediaPath === "useMediaId") {
    payload.id = resolveValue(node.parameters.mediaId, itemJson);
    if (messageType === "document") {
      payload.filename = resolveValue(node.parameters.mediaFilename, itemJson) ?? "";
    }
  } else if (mediaPath === "useMedian8n") {
    const propertyName = String(node.parameters.mediaPropertyName ?? "data");
    const mediaId = await uploadMedia(item, propertyName, phoneNumberId, headers);
    payload.id = mediaId;
    if (messageType === "document") {
      payload.filename = resolveValue(node.parameters.mediaFilename, itemJson) ?? "";
    }
  }

  if (caption) payload.caption = caption;
  return payload;
}

async function sendTemplate(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
  url: string,
  recipient: string,
): Promise<Record<string, unknown>> {
  const templateVal = String(resolveValue(node.parameters.template, itemJson) ?? "");
  if (!templateVal) throw new Error("WhatsApp: template is required");
  const { name, language } = templateInfo(templateVal);

  const templateBody: Record<string, unknown> = {
    name,
    language: { code: language },
  };

  const components = node.parameters.components as unknown[];
  if (Array.isArray(components) && components.length > 0) {
    templateBody.components = componentsRequest(
      components.map((c) => resolveComponent(c, itemJson)),
    );
  }

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: templateBody,
  };

  const res = await waRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp: HTTP ${res.status}`);
  }
  return asObj(res.body);
}

async function sendAndWait(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
  url: string,
  recipient: string,
  phoneNumberId: string,
): Promise<Record<string, unknown>> {
  const body = await buildMessageBody(ctx, node, itemJson, item, recipient, headers, phoneNumberId);
  const res = await waRequest("POST", url, headers, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp: HTTP ${res.status}`);
  }

  // TODO: implement putExecutionToWait + webhook resume.
  // On resume, original input items should be returned with
  // json.waitResponse containing the human response.
  // For now, pass through the input item json.
  return { ...itemJson };
}

function buildContactsPayload(
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown>[] {
  const contacts = node.parameters.contacts as Record<string, unknown> | undefined;
  if (!contacts) return [{}];
  const out: Record<string, unknown> = {};

  const name = contacts.name as Record<string, unknown> | undefined;
  if (name) {
    out.name = {
      formatted_name: resolveValue(name.formatted_name, itemJson) ?? "",
      first_name: resolveValue(name.first_name, itemJson) ?? "",
      last_name: resolveValue(name.last_name, itemJson) ?? "",
      middle_name: resolveValue(name.middle_name, itemJson) ?? "",
      suffix: resolveValue(name.suffix, itemJson) ?? "",
      prefix: resolveValue(name.prefix, itemJson) ?? "",
    };
  }

  if (contacts.birthday) out.birthday = resolveValue(contacts.birthday, itemJson);
  if (contacts.addresses) out.addresses = contacts.addresses;
  if (contacts.emails) out.emails = contacts.emails;
  if (contacts.organization) out.organization = contacts.organization;
  if (contacts.phones) out.phones = contacts.phones;
  if (contacts.urls) out.urls = contacts.urls;

  return [out];
}

async function runMediaOperation(
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (operation === "mediaUpload") {
    return mediaUpload(node, itemJson, item, headers);
  }
  if (operation === "mediaUrlGet") {
    return mediaUrlGet(node, itemJson, headers);
  }
  if (operation === "mediaDelete") {
    return mediaDelete(node, itemJson, headers);
  }
  throw new Error(`WhatsApp: unsupported media operation "${operation}"`);
}

async function uploadMedia(
  item: INodeExecutionData,
  propertyName: string,
  phoneNumberId: string,
  headers: Record<string, string>,
): Promise<string> {
  const binary = item.binary?.[propertyName];
  if (!binary) throw new Error(`WhatsApp: binary property "${propertyName}" not found`);

  const mimeType = binary.mimeType ?? "application/octet-stream";
  const base64Data = String(binary.data ?? "");
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", blob, binary.fileName || propertyName);

  const uploadHeaders = { ...headers };
  delete uploadHeaders["Content-Type"];

  const url = `${API_BASE}/${phoneNumberId}/media`;
  const res = await waRequestForm("POST", url, uploadHeaders, form);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp: media upload HTTP ${res.status}`);
  }
  return String(asObj(res.body).id ?? "");
}

async function mediaUpload(
  node: INode,
  itemJson: Record<string, unknown>,
  item: INodeExecutionData,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const phoneNumberId = String(resolveValue(node.parameters.phoneNumberId, itemJson) ?? "");
  if (!phoneNumberId) throw new Error("WhatsApp: phoneNumberId is required");
  const propertyName = String(node.parameters.mediaPropertyName ?? "data");
  const filename = resolveValue(node.parameters.mediaFileName, itemJson) as string | undefined;

  const binary = item.binary?.[propertyName];
  if (!binary) throw new Error(`WhatsApp: binary property "${propertyName}" not found`);

  const mimeType = binary.mimeType ?? "application/octet-stream";
  const base64Data = String(binary.data ?? "");
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", blob, filename || binary.fileName || propertyName);

  const uploadHeaders = { ...headers };
  delete uploadHeaders["Content-Type"];

  const url = `${API_BASE}/${phoneNumberId}/media`;
  const res = await waRequestForm("POST", url, uploadHeaders, form);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp: HTTP ${res.status}`);
  }
  return asObj(res.body);
}

async function mediaUrlGet(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const mediaId = String(resolveValue(node.parameters.mediaGetId, itemJson) ?? "");
  if (!mediaId) throw new Error("WhatsApp: mediaGetId is required");
  const url = `${API_BASE}/${mediaId}`;
  const res = await waRequest("GET", url, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp: HTTP ${res.status}`);
  }
  return asObj(res.body);
}

async function mediaDelete(
  node: INode,
  itemJson: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const mediaId = String(resolveValue(node.parameters.mediaDeleteId, itemJson) ?? "");
  if (!mediaId) throw new Error("WhatsApp: mediaDeleteId is required");
  const url = `${API_BASE}/${mediaId}`;
  const res = await waRequest("DELETE", url, headers);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`WhatsApp: HTTP ${res.status}`);
  }
  return { success: res.status === 200 || res.status === 204 };
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
    } catch {
      /* keep text */
    }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`WhatsApp request failed: ${err instanceof Error ? err.message : String(err)}`);
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
    const response = await fetch(url, {
      method,
      headers,
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
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`WhatsApp request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

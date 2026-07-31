import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function rocketchatRequest(
  domain: string,
  userId: string,
  authKey: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${domain.replace(/\/+$/, "")}/api/v1${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        "X-Auth-Token": authKey,
        "X-User-Id": userId,
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
    if (err instanceof Error && (err.message.includes("Request failed") || err.message.includes("X-Auth"))) {
      throw err;
    }
    if (err instanceof Error) {
      throw new Error(`Rocket.Chat request failed: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getCreds(ctx: ExecutionContext): Promise<{ domain: string; userId: string; authKey: string }> {
  const cred = await ctx.getCredential("rocketchatApi");
  if (!cred) {
    throw new Error("Rocket.Chat: rocketchatApi credential is required");
  }
  const domain = String(cred.domain ?? "").replace(/\/+$/, "");
  const userId = String(cred.userId ?? "");
  const authKey = String(cred.authKey ?? "");
  if (!domain || !userId || !authKey) {
    throw new Error("Rocket.Chat: domain, userId, and authKey are required in credential");
  }
  return { domain, userId, authKey };
}

function collectAttachments(node: { parameters: Record<string, unknown> }): Record<string, unknown>[] {
  const jsonParams = Boolean(node.parameters.jsonParameters);
  if (jsonParams) {
    const raw = node.parameters.attachmentsJson;
    if (!raw) return [];
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as Record<string, unknown>[];
      } catch {
        return [];
      }
    }
    if (Array.isArray(raw)) return raw as Record<string, unknown>[];
    return [];
  }

  const attachments = node.parameters.attachments as Record<string, unknown> | undefined;
  if (!attachments) return [];
  const fields = attachments.attachmentsFields as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(fields) || fields.length === 0) return [];

  return fields.map((att) => {
    const result: Record<string, unknown> = {};
    if (att.color) result.color = att.color;
    if (att.text) result.text = att.text;
    if (att.ts) result.ts = att.ts;
    if (att.thumbUrl) result.thumbUrl = att.thumbUrl;
    if (att.messageLink) result.messageLink = att.messageLink;
    if (att.collapsed !== undefined) result.collapsed = Boolean(att.collapsed);
    if (att.authorName) result.authorName = att.authorName;
    if (att.authorLink) result.authorLink = att.authorLink;
    if (att.authorIcon) result.authorIcon = att.authorIcon;
    if (att.title) result.title = att.title;
    if (att.titleLink) result.titleLink = att.titleLink;
    if (att.titleLinkDownload !== undefined) result.titleLinkDownload = Boolean(att.titleLinkDownload);
    if (att.imageUrl) result.imageUrl = att.imageUrl;
    if (att.audioUrl) result.audioUrl = att.audioUrl;
    if (att.videoUrl) result.videoUrl = att.videoUrl;
    if (att.fields) {
      const fc = att.fields as Record<string, unknown>;
      const fv = fc.fieldsValues as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(fv) && fv.length > 0) {
        result.fields = fv.map((f) => {
          const field: Record<string, unknown> = {};
          if (f.short !== undefined) field.short = Boolean(f.short);
          if (f.title) field.title = f.title;
          if (f.value) field.value = f.value;
          return field;
        });
      }
    }
    return result;
  });
}

export const rocketchatExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const { domain, userId, authKey } = await getCreds(ctx);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const channel = String(node.parameters.channel ?? "");
      const text = String(node.parameters.text ?? "");

      const body: Record<string, unknown> = {};
      if (channel) body.channel = channel;
      if (text) body.text = text;

      const opts = (node.parameters.options ?? {}) as Record<string, unknown>;
      if (opts.alias) body.alias = String(opts.alias);
      if (opts.avatar) body.avatar = String(opts.avatar);
      if (opts.emoji) body.emoji = String(opts.emoji);

      const attachments = collectAttachments(node);
      if (attachments.length > 0) {
        body.attachments = attachments;
      }

      const res = await rocketchatRequest(domain, userId, authKey, "POST", "/chat.postMessage", body);
      out.push({ json: res, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
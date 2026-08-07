import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.pushover.net/1/messages.json";

export const pushoverToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("pushoverApi");
  if (!cred) throw new Error("Pushover: pushoverApi credential is required");
  const token = String((cred as Record<string, unknown>).apiKey ?? "");
  if (!token) throw new Error("Pushover: apiKey is missing in credential");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const params = buildParams(node, itemJson, token, item.binary);
      const result = await pushoverRequest(params);
      out.push({ json: result as Record<string, unknown>, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message } }, pairedItem });
    }
  }

  return [out];
};

function buildParams(
  node: { parameters: Record<string, unknown> },
  itemJson: Record<string, unknown>,
  token: string,
  itemBinary?: Record<string, { data: string; mimeType: string }>,
): Record<string, string> {
  const params: Record<string, string> = { token };

  const user = resolveParam(node.parameters.user, itemJson);
  if (!user) throw new Error("Pushover: user is required");
  params.user = String(user);

  const message = resolveParam(node.parameters.message, itemJson);
  if (!message) throw new Error("Pushover: message is required");
  if (String(message).length > 1024) {
    throw new Error("Pushover: message must not exceed 1024 characters");
  }
  params.message = String(message);

  const priority = Number(node.parameters.priority ?? 0);
  params.priority = String(priority);

  if (priority === 2) {
    const retry = Number(node.parameters.retry ?? 0);
    const expire = Number(node.parameters.expire ?? 0);
    if (!retry || !expire) {
      throw new Error("Pushover: retry and expire are required for emergency priority");
    }
    if (retry < 30) {
      throw new Error("Pushover: retry must be at least 30 seconds");
    }
    if (expire > 10800) {
      throw new Error("Pushover: expire must not exceed 10800 seconds");
    }
    params.retry = String(retry);
    params.expire = String(expire);
  }

  const title = resolveParam(node.parameters.title, itemJson);
  if (title) params.title = String(title);

  const device = resolveParam(node.parameters.device, itemJson);
  if (device) params.device = String(device);

  const sound = resolveParam(node.parameters.sound, itemJson);
  if (sound) params.sound = String(sound);

  const timestamp = resolveParam(node.parameters.timestamp, itemJson);
  if (timestamp) params.timestamp = String(timestamp);

  const url = resolveParam(node.parameters.url, itemJson);
  if (url) params.url = String(url);

  const url_title = resolveParam(node.parameters.url_title, itemJson);
  if (url_title) params.url_title = String(url_title);

  const html = node.parameters.html;
  if (html) params.html = "1";

  const ttl = resolveParam(node.parameters.ttl, itemJson);
  if (ttl) params.ttl = String(ttl);

  const attachment = node.parameters.attachment;
  if (attachment) {
    const parentKey = String(resolveParam(node.parameters.parentKey, itemJson) ?? "data");
    const binaryEntry = itemBinary?.[parentKey];
    if (binaryEntry) {
      params.attachment_base64 = binaryEntry.data;
      params.attachment_type = binaryEntry.mimeType;
    }
  }

  return params;
}

async function pushoverRequest(
  params: Record<string, string>,
): Promise<unknown> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    body.append(k, v);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const obj = parsed as Record<string, unknown> | undefined;
    if (!response.ok) {
      const errors = obj?.errors;
      const errMsg = Array.isArray(errors)
        ? errors.join(", ")
        : String(obj?.error ?? `Pushover request failed with status code ${response.status}`);
      throw new Error(errMsg);
    }
    if (obj && obj.status !== 1) {
      const errors = obj.errors;
      const errMsg = Array.isArray(errors) ? errors.join(", ") : "Pushover request failed";
      throw new Error(errMsg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function resolveParam(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      const fn = new Function("$json", `return (${raw.replace(/^=/, "")})`);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

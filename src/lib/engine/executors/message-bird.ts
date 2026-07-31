import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://rest.messagebird.com";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

async function messageBirdRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = new URL(path, API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `AccessKey ${apiKey}`,
        Accept: "application/json",
      },
    };
    if (body !== undefined && method !== "GET") {
      (init.headers as Record<string, string>)["Content-Type"] = "application/json; charset=utf-8";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url.toString(), init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const errMsg = String(
        obj.error?.message ?? obj.message ?? obj.error ?? `MessageBird request failed with status code ${response.status}`,
      );
      throw new Error(errMsg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export const messageBirdExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("messageBirdApi");
  if (!cred) throw new Error("MessageBird: messageBirdApi credential is required");
  const apiKey = String((cred as Record<string, unknown>).apiKey ?? "");
  if (!apiKey) throw new Error("MessageBird: apiKey is missing in credential");

  const resource = String(node.parameters.resource ?? "sms");
  const operation = String(node.parameters.operation ?? "send");

  if (resource === "balance" && operation === "get") {
    try {
      const result = await messageBirdRequest(apiKey, "GET", "/balance");
      const resultBody = asObj(result);
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
        out.push({ json: { ...item.json, ...resultBody }, pairedItem });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
        out.push({ json: { ...item.json, error: { message } }, pairedItem });
      }
    }
    return [out];
  }

  if (resource === "sms" && operation === "send") {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemJson = item.json ?? {};
      const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
      try {
        const originator = String(node.parameters.originator ?? "");
        const recipients = String(node.parameters.recipients ?? "");
        const message = String(node.parameters.message ?? "");
        const additionalFields = (node.parameters.additionalFields as Record<string, unknown>) ?? {};

        const requestBody: Record<string, unknown> = {
          originator,
          recipients,
          body: message,
        };
        if (additionalFields.scheduledDatetime) {
          requestBody.scheduledDatetime = additionalFields.scheduledDatetime;
        }
        if (additionalFields.validity) {
          requestBody.validity = additionalFields.validity;
        }
        if (additionalFields.reference) {
          requestBody.reference = additionalFields.reference;
        }

        const result = await messageBirdRequest(apiKey, "POST", "/messages", requestBody);
        const resultBody = asObj(result);
        out.push({ json: { ...itemJson, ...resultBody }, pairedItem });
      } catch (err) {
        if (!continueOnFail) throw err;
        const message = err instanceof Error ? err.message : String(err);
        out.push({ json: { ...itemJson, error: { message } }, pairedItem });
      }
    }
    return [out];
  }

  throw new Error(`MessageBird: unsupported resource "${resource}" / operation "${operation}"`);
};
import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://gateway.seven.io";

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

async function sevenRequest(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(path, API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
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
        obj.error?.message ??
          obj.message ??
          obj.error ??
          `seven request failed with status code ${response.status}`,
      );
      throw new Error(errMsg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export const sms77Executor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("sms77Api");
  if (!cred) throw new Error("seven: sms77Api credential is required");
  const apiKey = String((cred as Record<string, unknown>).apiKey ?? "");
  if (!apiKey) throw new Error("seven: apiKey is missing in credential");

  const resource = String(node.parameters.resource ?? "sms");
  const operation = String(node.parameters.operation ?? "send");

  if (operation !== "send") {
    throw new Error(`seven: unsupported operation "${operation}"`);
  }

  const apiPath = resource === "voice" ? "/api/voice" : "/api/sms";

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    const to = String(resolveValue(node.parameters.to, itemJson) ?? "");
    const text = String(resolveValue(node.parameters.text, itemJson) ?? "");
    if (!to || !text) {
      throw new Error("seven: to and text are required");
    }

    const from = String(resolveValue(node.parameters.from, itemJson) ?? "");
    const additionalFields = (node.parameters.additionalFields as Record<string, unknown>) ?? {};

    const resolvedFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(additionalFields)) {
      resolvedFields[key] = resolveValue(value, itemJson);
    }

    let lastRaw: Record<string, unknown> | undefined;
    try {
      const requestBody: Record<string, unknown> = {
        to,
        text,
      };
      if (from) requestBody.from = from;

      if (resource === "sms") {
        if (resolvedFields.delay) requestBody.delay = resolvedFields.delay;
        if (resolvedFields.flash) requestBody.flash = true;
        if (resolvedFields.udh) requestBody.udh = resolvedFields.udh;
        if (resolvedFields.ttl !== undefined) requestBody.ttl = resolvedFields.ttl;
        if (resolvedFields.label) requestBody.label = resolvedFields.label;
        if (resolvedFields.performanceTracking) requestBody.performance_tracking = true;
        if (resolvedFields.foreignId) requestBody.foreign_id = resolvedFields.foreignId;
        if (resolvedFields.isBinary) requestBody.is_binary = true;
        if (resolvedFields.getReplies) requestBody.get_replies = true;
      } else {
        if (resolvedFields.ringtime !== undefined)
          requestBody.ringtime = resolvedFields.ringtime;
        if (resolvedFields.foreignId) requestBody.foreign_id = resolvedFields.foreignId;
      }

      const result = await sevenRequest(apiKey, apiPath, requestBody);
      const resultBody = asObj(result);
      lastRaw = resultBody;

      const success = resultBody.success;
      if (success !== undefined && success !== null && String(success) !== "100" && String(success) !== "101") {
        throw new Error(`seven: request failed with success code ${String(success)}`);
      }

      out.push({ json: { ...itemJson, ...resultBody }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, ...(lastRaw ?? {}), error: { message } }, pairedItem });
    }
  }

  return [out];
};

import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://rest.nexmo.com";

function resolveValue(
  value: unknown,
  itemJson: Record<string, unknown>,
  evaluate: (expr: string, json: Record<string, unknown>) => unknown,
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("={{") && trimmed.endsWith("}}")) {
      const resolved = evaluate(trimmed, itemJson);
      if (resolved !== undefined && resolved !== null) return String(resolved);
    }
  }
  return value == null ? "" : String(value);
}

export const vonageExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("vonageApi");
  if (!cred) throw new Error("Vonage: vonageApi credential is not configured");
  const credData = cred as Record<string, unknown>;
  const apiKey = String(credData.apiKey ?? "");
  const apiSecret = String(credData.apiSecret ?? "");
  if (!apiKey || !apiSecret) {
    throw new Error("Vonage: apiKey and apiSecret are required in vonageApi credential");
  }

  const resource = String(node.parameters.resource ?? "sms");
  const operation = String(node.parameters.operation ?? "send");

  if (resource !== "sms" || operation !== "send") {
    throw new Error(`Vonage: unsupported resource "${resource}" / operation "${operation}"`);
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = (item.json ?? {}) as Record<string, unknown>;
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      const from = resolveValue(node.parameters.from, itemJson, ctx.evaluate);
      const to = resolveValue(node.parameters.to, itemJson, ctx.evaluate);
      const message = resolveValue(node.parameters.message, itemJson, ctx.evaluate);

      if (!from || !to || !message) {
        throw new Error("Vonage: from, to, and message parameters are required");
      }

      const options = (node.parameters.options ?? {}) as Record<string, unknown>;
      const body = new URLSearchParams();
      body.set("api_key", apiKey);
      body.set("api_secret", apiSecret);
      body.set("from", from);
      body.set("to", to);
      body.set("text", message);

      if (options.type) body.set("type", String(options.type));
      if (options.ttl != null) body.set("ttl", String(options.ttl));
      if (options.statusCallbackUrl) {
        body.set("status-report-req", "1");
        body.set("callback", String(options.statusCallbackUrl));
      }
      if (options.callbackId) body.set("callback", String(options.callbackId));
      if (options.clientRef) body.set("client-ref", String(options.clientRef));

      const url = `${API_BASE}/sms/json`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: body.toString(),
      });

      const text = await response.text();
      let result: Record<string, unknown> = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = { raw: text };
      }

      const messages = result.messages;
      if (Array.isArray(messages) && messages.length > 0) {
        const first = messages[0] as Record<string, unknown>;
        if (String(first.status ?? "") !== "0") {
          const errorText = String(first["error-text"] ?? first["error"] ?? `Vonage API returned status ${first.status}`);
          throw new Error(errorText);
        }
      }

      out.push({ json: { ...itemJson, ...result }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, error: { message } }, pairedItem });
    }
  }

  return [out];
};

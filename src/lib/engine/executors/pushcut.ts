import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.pushcut.io/v1";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

function resolveExpression(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      let expr = raw.replace(/^=/, "");
      expr = expr.replace(/\{\{([\s\S]*?)\}\}/g, (_, inner) => inner.trim());
      const fn = new Function("$json", `return (${expr})`);
      return fn(itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

function extractAdditionalFields(
  additionalFields: Record<string, unknown> | undefined,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  if (!additionalFields) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(additionalFields)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = resolveExpression(value, itemJson);
  }
  return out;
}

export const pushcutExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("pushcutApi");
  if (!cred) throw new Error("Pushcut: pushcutApi credential is required");
  const apiKey = String((cred as Record<string, unknown>).apiKey ?? "");
  if (!apiKey) throw new Error("Pushcut: apiKey is missing in credential");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const notification = String(resolveExpression(node.parameters.notification, itemJson) ?? "");
      if (!notification) throw new Error("Pushcut: notification is required");

      const additionalFields = node.parameters.additionalFields as Record<string, unknown> | undefined;
      const extra = extractAdditionalFields(additionalFields, itemJson);

      const body: Record<string, unknown> = { notification };
      if (extra.identifier) body.identifier = String(extra.identifier);
      if (extra.sendAt) body.sendAt = String(extra.sendAt);
      if (extra.delay) body.delay = String(extra.delay);

      const url = `${API_BASE}/notifications`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "API-Key": apiKey,
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
            obj.error?.message ?? obj.message ?? obj.error ?? `Pushcut API request failed with status code ${response.status}`,
          );
          throw new Error(errMsg);
        }
        out.push({ json: asObj(parsed) as Record<string, unknown>, pairedItem });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: { message, type: "api_error" } }, pairedItem });
    }
  }

  return [out];
};
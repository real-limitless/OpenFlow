import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.mailcheck.co/v1";

function resolveEmail(raw: unknown, itemJson: Record<string, unknown>): string {
  if (typeof raw !== "string") return "";
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? String(result.value ?? "") : raw;
  }
  return raw;
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

export const mailcheckToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("mailcheckApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Mailcheck Tool: mailcheckApi credential is not configured");
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const email = resolveEmail(node.parameters.email, itemJson);
      if (!email) throw new Error("Mailcheck Tool: email parameter is required");
      const result = await mailcheckRequest(apiKey, email);
      out.push({ json: { ...itemJson, emailCheck: result }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, error: message }, pairedItem });
    }
  }

  return [out];
};

async function mailcheckRequest(
  apiKey: string,
  email: string,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE}/singleEmail:check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const obj = asObj(parsed);
    if (response.status === 429) {
      throw new Error("Mailcheck Tool: rate limited (HTTP 429)");
    }
    if (response.status < 200 || response.status >= 300) {
      const desc = obj.message ? String(obj.message) : `HTTP ${response.status}`;
      throw new Error(`Mailcheck Tool: ${desc}`);
    }
    if (obj.errors) {
      const errors = obj.errors as Array<{ detail?: string }>;
      const desc = errors[0]?.detail ?? "API error";
      throw new Error(`Mailcheck Tool: ${desc}`);
    }
    return obj;
  } finally {
    clearTimeout(timer);
  }
}

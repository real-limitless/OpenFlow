import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

function resolveValue(
  raw: unknown,
  itemJson: Record<string, unknown>,
  fallback: unknown,
): unknown {
  if (raw === "" || raw === undefined || raw === null) return fallback;
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    return undefined;
  }
  return raw;
}

function getParamRaw(
  ctx: Parameters<NodeExecutor>[0],
  itemJson: Record<string, unknown>,
  name: string,
): unknown {
  const raw = ctx.getParam(name);
  if (typeof raw === "string" && (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw))) {
    try {
      return ctx.evaluate(raw, itemJson);
    } catch {
      return raw;
    }
  }
  return raw;
}

export const msg91Executor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("msg91Api");
  if (!cred) throw new Error("MSG91: msg91Api credential is required");
  const authkey = String((cred as Record<string, unknown>).authkey ?? "");
  if (!authkey) throw new Error("MSG91: authkey is missing in credential");

  const operation = String(node.parameters.operation ?? "send");
  if (operation !== "send") {
    throw new Error(`MSG91: unsupported operation "${operation}"`);
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    const from = String(getParamRaw(ctx, itemJson, "from") ?? "");
    const to = String(getParamRaw(ctx, itemJson, "to") ?? "");
    const message = String(getParamRaw(ctx, itemJson, "message") ?? "");

    if (!from) {
      const err = new Error("MSG91: from (sender ID) is required");
      if (!continueOnFail) throw err;
      out.push({ json: { ...itemJson, _error: err.message }, pairedItem });
      continue;
    }
    if (!to) {
      const err = new Error("MSG91: to (recipient) is required");
      if (!continueOnFail) throw err;
      out.push({ json: { ...itemJson, _error: err.message }, pairedItem });
      continue;
    }
    if (!message) {
      const err = new Error("MSG91: message is required");
      if (!continueOnFail) throw err;
      out.push({ json: { ...itemJson, _error: err.message }, pairedItem });
      continue;
    }

    let smsSent: Record<string, unknown> = {};
    try {
      const url = new URL("https://api.msg91.com/api/v5/flow/");
      const body = new URLSearchParams();
      body.set("authkey", authkey);
      body.set("sender", from);
      body.set("mobiles", to);
      body.set("message", message);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* keep text */
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        smsSent = parsed as Record<string, unknown>;
      } else {
        smsSent = { raw: text };
      }

      const type = smsSent.type;
      if (type !== undefined && String(type) !== "success") {
        const errMsg = String(smsSent.message ?? smsSent.type ?? "MSG91 API error");
        throw new Error(errMsg);
      }

      out.push({ json: { ...itemJson, smsSent }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { ...itemJson, smsSent, _error: message }, pairedItem });
    }
  }

  return [out];
};

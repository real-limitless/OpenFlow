import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";

const API_BASE = "https://api.dropcontact.com/v1";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    try {
      return _evalCtx?.evaluate(raw, itemJson) ?? raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

let _evalCtx: ExecutionContext | null = null;

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("dropcontactApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Dropcontact Tool: dropcontactApi credential is not configured");
  }
  return apiKey;
}

export const dropcontactToolExecutor: NodeExecutor = async (ctx, node) => {
  _evalCtx = ctx;
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, itemJson);
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const operation = String(node.parameters.operation ?? "");

  if (operation === "enrich") {
    return enrich(ctx, node, itemJson);
  }
  if (operation === "fetchRequest") {
    return fetchRequest(ctx, node, itemJson);
  }
  throw new Error(`Dropcontact Tool: unsupported operation "${operation}"`);
}

function buildContactPayload(
  node: INode,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(additionalFields)) {
    const resolved = resolveValue(v, itemJson);
    if (resolved !== undefined && resolved !== null && resolved !== "") {
      payload[k] = resolved;
    }
  }

  return payload;
}

async function enrich(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const payload = buildContactPayload(node, itemJson);

  const options = (node.parameters.options ?? {}) as Record<string, unknown>;
  const siren = Boolean(resolveValue(options.siren, itemJson));
  const language = String(resolveValue(options.language, itemJson) ?? "");
  const waitTime = Number(resolveValue(options.waitTime, itemJson) ?? 0);
  const customCallbackUrl = String(resolveValue(options.customCallbackUrl, itemJson) ?? "");
  const simplify = Boolean(resolveValue(node.parameters.simplify, itemJson));

  const body: Record<string, unknown> = { data: [payload] };
  if (siren) body.siren = true;
  if (language) body.language = language;
  if (customCallbackUrl) body.custom_callback_url = customCallbackUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE}/enrich/all`, {
      method: "POST",
      headers: {
        "X-Access-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }

    const obj = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      ? (parsed as Record<string, unknown>)
      : {};

    if (response.status === 429) {
      throw new Error("Dropcontact Tool: rate limited (HTTP 429)");
    }
    if (response.status < 200 || response.status >= 300) {
      const desc = obj.error ? String(obj.error) : `HTTP ${response.status}`;
      throw new Error(`Dropcontact Tool: ${desc}`);
    }

    if (waitTime > 0 && (obj as Record<string, unknown>).request_id) {
      await sleep(waitTime);
      const requestId = String((obj as Record<string, unknown>).request_id);
      return pollResult(apiKey, requestId, simplify);
    }

    if (simplify && obj.data && Array.isArray(obj.data) && obj.data.length > 0) {
      return obj.data[0] as Record<string, unknown>;
    }

    return obj;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRequest(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const requestId = String(resolveValue(node.parameters.requestId, itemJson) ?? "");
  if (!requestId) {
    throw new Error("Dropcontact Tool: requestId is required for fetchRequest operation");
  }

  const apiKey = await getApiKey(ctx);
  const simplify = Boolean(resolveValue(node.parameters.simplify, itemJson));

  return pollResult(apiKey, requestId, simplify);
}

async function pollResult(
  apiKey: string,
  requestId: string,
  simplify: boolean,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_BASE}/enrich/all/${requestId}`, {
      method: "GET",
      headers: {
        "X-Access-Token": apiKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { /* keep text */ }

    const obj = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      ? (parsed as Record<string, unknown>)
      : {};

    if (response.status === 429) {
      throw new Error("Dropcontact Tool: rate limited (HTTP 429)");
    }
    if (response.status < 200 || response.status >= 300) {
      const desc = obj.error ? String(obj.error) : `HTTP ${response.status}`;
      throw new Error(`Dropcontact Tool: ${desc}`);
    }

    if (simplify && obj.data && Array.isArray(obj.data) && obj.data.length > 0) {
      return obj.data[0] as Record<string, unknown>;
    }

    return obj;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

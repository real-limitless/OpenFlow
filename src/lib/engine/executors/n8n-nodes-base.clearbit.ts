import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://api.clearbit.com/v2";

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
  return {};
}

export const clearbitExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
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

async function getApiKey(ctx: ExecutionContext): Promise<string> {
  const cred = await ctx.getCredential("clearbitApi");
  const apiKey = cred ? String(cred.apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Clearbit: clearbitApi credential is not configured");
  }
  return apiKey;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resource = String(node.parameters.resource ?? "");
  const operation = String(node.parameters.operation ?? "");

  if (resource === "company" && operation === "enrich") {
    return companyEnrich(ctx, node, itemJson);
  }
  if (resource === "company" && operation === "autocomplete") {
    return companyAutocomplete(ctx, node, itemJson);
  }
  if (resource === "person" && operation === "enrich") {
    return personEnrich(ctx, node, itemJson);
  }
  throw new Error(`Clearbit: unsupported resource/operation "${resource}/${operation}"`);
}

async function companyEnrich(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const domain = String(resolveValue(node.parameters.domain, itemJson) ?? "");
  if (!domain) throw new Error("Clearbit: domain is required for company enrich");

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;

  const params = new URLSearchParams();
  params.set("domain", domain);
  for (const [k, v] of Object.entries(additionalFields)) {
    const resolved = resolveValue(v, itemJson);
    if (resolved !== undefined && resolved !== null && resolved !== "") {
      params.set(k, String(resolved));
    }
  }

  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const result = await clearbitRequest(`${API_BASE}/combined`, params, auth);
  return result as Record<string, unknown>;
}

async function companyAutocomplete(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const name = String(resolveValue(node.parameters.name, itemJson) ?? "");
  if (!name) throw new Error("Clearbit: name is required for company autocomplete");

  const params = new URLSearchParams();
  params.set("query", name);

  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const result = await clearbitRequest(`${API_BASE}/companies/autocomplete`, params, auth);
  return result as Record<string, unknown>;
}

async function personEnrich(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const email = String(resolveValue(node.parameters.email, itemJson) ?? "");
  if (!email) throw new Error("Clearbit: email is required for person enrich");

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;

  const params = new URLSearchParams();
  params.set("email", email);
  for (const [k, v] of Object.entries(additionalFields)) {
    const resolved = resolveValue(v, itemJson);
    if (resolved !== undefined && resolved !== null && resolved !== "") {
      params.set(k, String(resolved));
    }
  }

  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const result = await clearbitRequest(`${API_BASE}/person`, params, auth);
  return result as Record<string, unknown>;
}

async function clearbitRequest(
  url: string,
  params: URLSearchParams,
  auth: string,
): Promise<unknown> {
  const fullUrl = `${url}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
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
      throw new Error("Clearbit: rate limited (HTTP 429)");
    }
    if (response.status < 200 || response.status >= 300) {
      const desc = obj.error ? String(obj.error) : `HTTP ${response.status}`;
      throw new Error(`Clearbit: ${desc}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

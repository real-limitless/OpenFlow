import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const API_BASE = "https://urlscan.io/api/v1";

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

export const urlScanIoExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const operation = String(node.parameters.operation ?? "Perform");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, operation, itemJson);
      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message, _error: message }, pairedItem });
    }
  }

  return [out];
};

async function getApiKey(ctx: ExecutionContext, node?: INode): Promise<string> {
  if (node?.parameters?.apiKey) {
    return String(node.parameters.apiKey);
  }
  const cred = await ctx.getCredential("urlScanIoApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  if (!apiKey) {
    const alias = await ctx.getCredential("urlScanIo");
    const aliasKey = alias ? String((alias as Record<string, unknown>).apiKey ?? "") : "";
    if (!aliasKey) {
      throw new Error("urlscan.io: urlScanIoApi credential is not configured");
    }
    return aliasKey;
  }
  return apiKey;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation === "Perform") {
    return performScan(ctx, node, itemJson);
  }
  if (operation === "Get") {
    return getScan(ctx, node, itemJson);
  }
  if (operation === "Get All") {
    return getAllScans(ctx, node, itemJson);
  }
  throw new Error(`urlscan.io: unsupported operation "${operation}"`);
}

async function performScan(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx, node);
  const url = String(resolveValue(node.parameters.url, itemJson) ?? "");
  if (!url) throw new Error("urlscan.io: URL is required for Perform operation");

  const additionalFields = (node.parameters.additionalFields ?? {}) as Record<string, unknown>;

  const body: Record<string, unknown> = { url };

  if (additionalFields.customAgent) {
    body.customagent = String(additionalFields.customAgent);
  }
  if (additionalFields.referer) {
    body.referer = String(additionalFields.referer);
  }
  if (additionalFields.visibility) {
    body.visibility = String(additionalFields.visibility);
  }
  if (additionalFields.tags) {
    const tags = String(additionalFields.tags)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (tags.length > 0) body.tags = tags;
  }
  if (additionalFields.overrideSafety) {
    body.overridesafety = String(additionalFields.overrideSafety);
  }

  const result = await urlscanRequest(`${API_BASE}/scan/`, {
    method: "POST",
    body,
    apiKey,
  });

  return result as Record<string, unknown>;
}

async function getScan(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx, node);
  const scanId = String(resolveValue(node.parameters.scanId, itemJson) ?? "");
  if (!scanId) throw new Error("urlscan.io: Scan ID is required for Get operation");

  const result = await urlscanRequest(`${API_BASE}/result/${scanId}/`, {
    method: "GET",
    apiKey,
  });

  return result as Record<string, unknown>;
}

async function getAllScans(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx, node);
  const returnAll = Boolean(node.parameters.returnAll ?? false);
  const limit = Number(node.parameters.limit ?? 50);
  const filters = (node.parameters.filters ?? {}) as Record<string, unknown>;
  const query = String(resolveValue(filters.query, itemJson) ?? "");

  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (!returnAll) params.set("size", String(Math.max(1, Math.floor(limit))));

  const result = await urlscanRequest(`${API_BASE}/search/?${params.toString()}`, {
    method: "GET",
    apiKey,
  });

  if (returnAll) {
    const results = (result as Record<string, unknown>).results as unknown[] ?? [];
    return { results } as Record<string, unknown>;
  }

  const results = (result as Record<string, unknown>).results as unknown[] ?? [];
  return { results: results.slice(0, Math.max(1, Math.floor(limit))) } as Record<string, unknown>;
}

async function urlscanRequest(
  url: string,
  opts: { method: string; body?: unknown; apiKey: string },
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "API-Key": opts.apiKey,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method: opts.method,
      headers,
      signal: controller.signal,
    };
    if (opts.body) {
      init.body = JSON.stringify(opts.body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }

    if (response.status === 429) {
      throw new Error("urlscan.io: rate limited (HTTP 429)");
    }
    if (response.status === 404) {
      throw new Error("urlscan.io: scan not found (HTTP 404)");
    }
    if (response.status < 200 || response.status >= 300) {
      const obj = asObj(parsed);
      const msg = obj.message ? String(obj.message) : `HTTP ${response.status}`;
      const desc = obj.description ? `: ${String(obj.description)}` : "";
      throw new Error(`urlscan.io: ${msg}${desc}`);
    }

    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

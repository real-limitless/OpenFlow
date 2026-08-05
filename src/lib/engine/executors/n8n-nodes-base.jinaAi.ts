import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const READER_BASE = "https://r.jina.ai";
const SEARCH_BASE = "https://s.jina.ai";
const DEEPSEARCH_BASE = "https://deepsearch.jina.ai/v1/chat/completions";

function resolveString(raw: unknown): string {
  return String(raw ?? "");
}

function numParam(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function readOptions(node: INode): Record<string, unknown> {
  return (node.parameters.options as Record<string, unknown>) ?? {};
}

function optString(node: INode, name: string): string {
  const options = readOptions(node);
  const v = name in options ? options[name] : node.parameters[name];
  return resolveString(v);
}

function optNum(node: INode, name: string): number | undefined {
  const options = readOptions(node);
  const v = name in options ? options[name] : node.parameters[name];
  return numParam(v);
}

function optBool(node: INode, name: string): boolean {
  const options = readOptions(node);
  if (name in options) return !!options[name];
  return !!node.parameters[name];
}

export const jinaAiExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "reader");
  const operation = String(node.parameters.operation ?? "read");
  const simplify = node.parameters.simplify !== false;
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson, simplify);
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
  const cred = await ctx.getCredential("jinaAiApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  if (!apiKey) {
    throw new Error("Jina AI: jinaAiApi credential is not configured");
  }
  return apiKey;
}

async function runOperation(
  ctx: ExecutionContext,
  node: INode,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
  simplify: boolean,
): Promise<Record<string, unknown>> {
  if (resource === "reader") {
    if (operation === "read") return readerRead(ctx, node, itemJson, simplify);
    if (operation === "search") return readerSearch(ctx, node, itemJson, simplify);
  }
  if (resource === "research" && operation === "deepResearch") {
    return deepResearch(ctx, node, itemJson, simplify);
  }
  throw new Error(`Jina AI: unsupported resource/operation "${resource}/${operation}"`);
}

async function readerRead(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
  simplify: boolean,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const url = resolveString(node.parameters.url);
  if (!url) {
    throw new Error("Jina AI: URL is required for Reader Read operation");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const outputFormat = optString(node, "outputFormat");
  if (outputFormat && outputFormat !== "json") {
    headers["X-Return-Format"] = outputFormat;
  }
  const targetSelector = optString(node, "targetSelector");
  if (targetSelector) headers["X-Target-Selector"] = targetSelector;
  const excludeSelector = optString(node, "excludeSelector");
  if (excludeSelector) headers["X-Remove-Selector"] = excludeSelector;
  const enableImageCaptioning = optBool(node, "enableImageCaptioning");
  if (enableImageCaptioning) headers["X-With-Generated-Alt"] = "true";
  const waitForSelector = optString(node, "waitForSelector");
  if (waitForSelector) headers["X-Wait-For-Selector"] = waitForSelector;
  const proxy = optString(node, "proxy");
  if (proxy) headers["X-Proxy"] = proxy;

  const fetchUrl = `${READER_BASE}/${encodeURIComponent(url)}`;
  const resp = await fetch(fetchUrl, { method: "GET", headers });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) {
      throw new Error(`Jina AI: Authentication failed (401) — ${text}`);
    }
    if (resp.status === 429) {
      throw new Error(`Jina AI: Rate limit exceeded (429) — ${text}`);
    }
    throw new Error(`Jina AI: Reader Read failed (${resp.status}) — ${text}`);
  }

  const data = await resp.json();
  const d = data as Record<string, unknown>;
  if (simplify) {
    const dataArr = d.data;
    if (Array.isArray(dataArr)) {
      return { data: dataArr };
    }
    return { data: d };
  }
  return d;
}

async function readerSearch(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
  simplify: boolean,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const query = resolveString(node.parameters.searchQuery);
  if (!query) {
    throw new Error("Jina AI: searchQuery is required for Reader Search operation");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const outputFormat = optString(node, "outputFormat");
  if (outputFormat && outputFormat !== "json") {
    headers["X-Return-Format"] = outputFormat;
  }
  const proxy = optString(node, "proxy");
  if (proxy) headers["X-Proxy"] = proxy;
  const siteFilter = optString(node, "siteFilter");
  if (siteFilter) headers["X-Site"] = siteFilter;

  const pageNumber = optNum(node, "pageNumber");
  const searchUrl = pageNumber !== undefined
    ? `${SEARCH_BASE}/?q=${encodeURIComponent(query)}&page=${pageNumber}`
    : `${SEARCH_BASE}/?q=${encodeURIComponent(query)}`;

  const resp = await fetch(searchUrl, { method: "GET", headers });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) {
      throw new Error(`Jina AI: Authentication failed (401) — ${text}`);
    }
    if (resp.status === 429) {
      throw new Error(`Jina AI: Rate limit exceeded (429) — ${text}`);
    }
    throw new Error(`Jina AI: Search failed (${resp.status}) — ${text}`);
  }

  const data = await resp.json();
  const d = data as Record<string, unknown>;
  if (simplify) {
    const dataArr = d.data;
    if (Array.isArray(dataArr)) {
      return { data: dataArr };
    }
    return { data: d };
  }
  return d;
}

async function deepResearch(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
  simplify: boolean,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const query = resolveString(node.parameters.researchQuery);
  if (!query) {
    throw new Error("Jina AI: researchQuery is required for Deep Research operation");
  }

  const body: Record<string, unknown> = {
    messages: [
      { role: "user", content: query },
    ],
  };

  const maxReturnedSources = optNum(node, "maxReturnedSources");
  if (maxReturnedSources !== undefined) body.max_returned_urls = maxReturnedSources;
  const prioritizeSources = optString(node, "prioritizeSources");
  if (prioritizeSources) body.boost_hostnames = prioritizeSources.split(",").map((s) => s.trim()).filter(Boolean);
  const excludeSources = optString(node, "excludeSources");
  if (excludeSources) body.bad_hostnames = excludeSources.split(",").map((s) => s.trim()).filter(Boolean);

  const resp = await fetch(DEEPSEARCH_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) {
      throw new Error(`Jina AI: Authentication failed (401) — ${text}`);
    }
    if (resp.status === 429) {
      throw new Error(`Jina AI: Rate limit exceeded (429) — ${text}`);
    }
    throw new Error(`Jina AI: Deep Research failed (${resp.status}) — ${text}`);
  }

  const data = await resp.json();
  const d = data as Record<string, unknown>;

  if (simplify) {
    const choices = d.choices as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(choices) && choices.length > 0) {
      const message = choices[0].message as Record<string, unknown> | undefined;
      const result: Record<string, unknown> = {};
      if (message) {
        result.content = message.content;
      }
      const annotations = choices[0].annotations;
      if (annotations) result.annotations = annotations;
      const usage = d.usage;
      if (usage) result.usage = usage;
      return result;
    }
    return { content: d };
  }

  return d;
}

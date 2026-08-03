import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "../../expressions/evaluate";

const READER_BASE = "https://r.jina.ai";
const SEARCH_BASE = "https://s.jina.ai";
const DEEPSEARCH_BASE = "https://deepsearch.jina.ai";

function resolveValue(raw: unknown, itemJson: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("=") || /\{\{[\s\S]*?\}\}/.test(raw)) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? result.value : raw;
  }
  return raw;
}

function resolveString(raw: unknown, itemJson: Record<string, unknown>): string {
  return String(resolveValue(raw, itemJson) ?? "");
}

function booleanHeader(val: unknown): string | undefined {
  if (val === true || val === "true") return "true";
  return undefined;
}

export const jinaAiExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String(node.parameters.resource ?? "reader");
  const operation = String(node.parameters.operation ?? "read");
  const continueOnFail = ctx.continueOnFail();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      const result = await runOperation(ctx, node, resource, operation, itemJson);
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
): Promise<Record<string, unknown>> {
  if (resource === "reader") {
    if (operation === "read") return readerRead(ctx, node, itemJson);
    if (operation === "search") return readerSearch(ctx, node, itemJson);
  }
  if (resource === "research" && operation === "deepResearch") {
    return deepResearch(ctx, node, itemJson);
  }
  throw new Error(`Jina AI: unsupported resource/operation "${resource}/${operation}"`);
}

async function readerRead(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const url = resolveString(node.parameters.url, itemJson);
  if (!url) {
    throw new Error("Jina AI: URL is required for Reader Read operation");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  const engine = resolveString(node.parameters.engine, itemJson);
  if (engine) headers["X-Engine"] = engine;
  const targetSelector = resolveString(node.parameters.targetSelector, itemJson);
  if (targetSelector) headers["X-Target-Selector"] = targetSelector;
  const waitForSelector = resolveString(node.parameters.waitForSelector, itemJson);
  if (waitForSelector) headers["X-Wait-For-Selector"] = waitForSelector;
  const removeSelector = resolveString(node.parameters.removeSelector, itemJson);
  if (removeSelector) headers["X-Remove-Selector"] = removeSelector;
  const timeout = resolveString(node.parameters.timeout, itemJson);
  if (timeout) headers["X-Timeout"] = timeout;
  const noCache = booleanHeader(node.parameters.noCache);
  if (noCache) headers["X-No-Cache"] = noCache;
  const retainImages = resolveString(node.parameters.retainImages, itemJson);
  if (retainImages && retainImages !== "all") headers["X-Retain-Images"] = retainImages;
  const retainLinks = resolveString(node.parameters.retainLinks, itemJson);
  if (retainLinks && retainLinks !== "all") headers["X-Retain-Links"] = retainLinks;
  const withLinksSummary = booleanHeader(node.parameters.withLinksSummary);
  if (withLinksSummary) headers["X-With-Links-Summary"] = withLinksSummary;
  const withImagesSummary = booleanHeader(node.parameters.withImagesSummary);
  if (withImagesSummary) headers["X-With-Images-Summary"] = withImagesSummary;
  const withGeneratedAlt = booleanHeader(node.parameters.withGeneratedAlt);
  if (withGeneratedAlt) headers["X-With-Generated-Alt"] = withGeneratedAlt;
  const respondWith = resolveString(node.parameters.respondWith, itemJson);
  if (respondWith) headers["X-Respond-With"] = respondWith;
  const tokenBudget = resolveString(node.parameters.tokenBudget, itemJson);
  if (tokenBudget) headers["X-Token-Budget"] = tokenBudget;
  const maxTokens = resolveString(node.parameters.maxTokens, itemJson);
  if (maxTokens) headers["X-Max-Tokens"] = maxTokens;
  const useReaderLm = booleanHeader(node.parameters.useReaderLm);
  if (useReaderLm) headers["X-Respond-With"] = "readerlm-v2";
  const proxy = resolveString(node.parameters.proxy, itemJson);
  if (proxy) headers["X-Proxy"] = proxy;
  const proxyUrl = resolveString(node.parameters.proxyUrl, itemJson);
  if (proxyUrl) headers["X-Proxy-Url"] = proxyUrl;
  const setCookie = resolveString(node.parameters.setCookie, itemJson);
  if (setCookie) headers["X-Set-Cookie"] = setCookie;
  const locale = resolveString(node.parameters.locale, itemJson);
  if (locale) headers["X-Locale"] = locale;
  const responseFormat = resolveString(node.parameters.responseFormat, itemJson);
  if (responseFormat === "json") {
    headers["Accept"] = "application/json";
  }
  const useFinalUrlAsBase = booleanHeader(node.parameters.useFinalUrlAsBase);
  if (useFinalUrlAsBase) headers["X-Base"] = "final";
  const noGfm = resolveString(node.parameters.noGfm, itemJson);
  if (noGfm) headers["X-No-Gfm"] = noGfm;
  const includeIframeContent = booleanHeader(node.parameters.includeIframeContent);
  if (includeIframeContent) headers["X-With-Iframe"] = includeIframeContent;
  const includeShadowDom = booleanHeader(node.parameters.includeShadowDom);
  if (includeShadowDom) headers["X-With-Shadow-Dom"] = includeShadowDom;
  const respectRobotsTxt = resolveString(node.parameters.respectRobotsTxt, itemJson);
  if (respectRobotsTxt) headers["X-Robots-Txt"] = respectRobotsTxt;
  const respondTiming = resolveString(node.parameters.respondTiming, itemJson);
  if (respondTiming) headers["X-Respond-Timing"] = respondTiming;
  const preserveBase64Images = booleanHeader(node.parameters.preserveBase64Images);
  if (preserveBase64Images) headers["X-Retain-Images"] = "all";

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

  if (responseFormat === "json") {
    const data = await resp.json();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return { content: data };
  }

  const text = await resp.text();
  return { content: text };
}

async function readerSearch(
  ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const apiKey = await getApiKey(ctx);
  const query = resolveString(node.parameters.query, itemJson);
  if (!query) {
    throw new Error("Jina AI: query is required for Reader Search operation");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const site = resolveString(node.parameters.site, itemJson);
  if (site) headers["X-Site"] = site;
  const noCache = booleanHeader(node.parameters.noCache);
  if (noCache) headers["X-No-Cache"] = noCache;
  const withLinksSummary = booleanHeader(node.parameters.withLinksSummary);
  if (withLinksSummary) headers["X-With-Links-Summary"] = withLinksSummary;
  const withImagesSummary = booleanHeader(node.parameters.withImagesSummary);
  if (withImagesSummary) headers["X-With-Images-Summary"] = withImagesSummary;
  const retainImages = resolveString(node.parameters.retainImages, itemJson);
  if (retainImages && retainImages !== "all") headers["X-Retain-Images"] = retainImages;
  const withGeneratedAlt = booleanHeader(node.parameters.withGeneratedAlt);
  if (withGeneratedAlt) headers["X-With-Generated-Alt"] = withGeneratedAlt;
  const excludeContent = booleanHeader(node.parameters.excludeContent);
  if (excludeContent) headers["X-Respond-With"] = "no-content";
  const includeFavicon = booleanHeader(node.parameters.includeFavicon);
  if (includeFavicon) headers["X-With-Favicon"] = includeFavicon;
  const responseFormat = resolveString(node.parameters.responseFormat, itemJson);
  if (responseFormat === "json") {
    headers["Accept"] = "application/json";
  }
  const proxy = resolveString(node.parameters.proxy, itemJson);
  if (proxy) headers["X-Proxy"] = proxy;
  const engine = resolveString(node.parameters.engine, itemJson);
  if (engine) headers["X-Engine"] = engine;
  const setCookie = resolveString(node.parameters.setCookie, itemJson);
  if (setCookie) headers["X-Set-Cookie"] = setCookie;
  const locale = resolveString(node.parameters.locale, itemJson);
  if (locale) headers["X-Locale"] = locale;

  const body: Record<string, unknown> = {
    q: query,
  };
  const topK = resolveString(node.parameters.topK, itemJson);
  if (topK) body.num = parseInt(topK, 10) || 5;
  const country = resolveString(node.parameters.country, itemJson);
  if (country) body.gl = country;
  const language = resolveString(node.parameters.language, itemJson);
  if (language) body.hl = language;
  const location = resolveString(node.parameters.location, itemJson);
  if (location) body.location = location;
  const page = resolveString(node.parameters.page, itemJson);
  if (page) body.page = parseInt(page, 10);

  const resp = await fetch(SEARCH_BASE, {
    method: "POST",
    headers,
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
    throw new Error(`Jina AI: Search failed (${resp.status}) — ${text}`);
  }

  if (responseFormat === "json") {
    const data = await resp.json();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const d = data as Record<string, unknown>;
      const results = d.data ?? d;
      return { results };
    }
    return { results: [data] };
  }

  const text = await resp.text();
  return { content: text };
}

async function deepResearch(
  _ctx: ExecutionContext,
  node: INode,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const topic = resolveString(node.parameters.topic, itemJson);
  if (!topic) {
    throw new Error("Jina AI: topic is required for Deep Research operation");
  }

  const responseFormat = String(node.parameters.responseFormat ?? "markdown");
  const depth = String(node.parameters.depth ?? "standard");

  const body: Record<string, unknown> = {
    topic,
    depth,
    response_format: responseFormat,
  };

  const resp = await fetch(DEEPSEARCH_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Jina AI: Deep Research failed (${resp.status}) — ${text}`);
  }

  const text = await resp.text();
  return { content: text };
}

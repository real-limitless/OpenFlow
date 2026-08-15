import type { NodeExecutor } from "@/sdk";
import { emitMcpBundle, mergeToolArgs } from "../tool-handle";

const SEARCH_PROVIDERS: Record<string, string> = {
  google: "https://www.googleapis.com/customsearch/v1",
  bing: "https://api.bing.microsoft.com/v7.0/search",
  duckduckgo: "https://api.duckduckgo.com",
};

const TYPE = "openflow-node-base.webSearchTool";

export const webSearchToolExecutor: NodeExecutor = async (ctx) => {
  return emitMcpBundle(ctx, {
    type: TYPE,
    tools: [
      {
        name: "web_search",
        description: "Search the web and return titles, URLs, and snippets",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            resultLimit: { type: "number" },
            searchEngine: { type: "string", description: "duckduckgo | google | bing | custom" },
          },
          required: ["query"],
        },
      },
    ],
    async invoke(_toolName, args) {
      const merged = mergeToolArgs(ctx.getParams(), args);
      const query = String(merged.query ?? "");
      if (!query) throw new Error("query is required");
      const resultLimit = Number(merged.resultLimit ?? ctx.getParam("resultLimit", 5)) || 5;
      const searchEngine = String(
        merged.searchEngine ?? ctx.getParam("searchEngine", "duckduckgo"),
      );
      const customEndpoint = String(merged.customEndpoint ?? ctx.getParam("customEndpoint", ""));
      let searchUrl: string;
      const params = new URLSearchParams();
      params.set("q", query);
      if (searchEngine === "custom" && customEndpoint) {
        searchUrl = customEndpoint;
      } else {
        const base = SEARCH_PROVIDERS[searchEngine];
        if (!base) throw new Error(`Unsupported search engine: ${searchEngine}`);
        searchUrl = base;
        if (searchEngine === "duckduckgo") params.set("format", "json");
      }
      const fullUrl = `${searchUrl}?${params.toString()}`;
      const res = await fetch(fullUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(`Search request failed: ${res.status}`);
      }
      const itemsRaw = (raw.items ?? raw.RelatedTopics ?? raw.webPages) as unknown;
      const list = Array.isArray(itemsRaw)
        ? itemsRaw
        : itemsRaw &&
            typeof itemsRaw === "object" &&
            Array.isArray((itemsRaw as { value?: unknown }).value)
          ? (itemsRaw as { value: unknown[] }).value
          : [];
      const results = list.slice(0, resultLimit).map((row) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          title: String(r.title ?? r.Text ?? r.name ?? ""),
          url: String(r.link ?? r.FirstURL ?? r.url ?? ""),
          snippet: String(r.snippet ?? r.Text ?? ""),
        };
      });
      return { content: JSON.stringify(results) };
    },
  });
};

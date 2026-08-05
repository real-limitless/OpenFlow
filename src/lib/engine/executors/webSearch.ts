import type { NodeExecutor } from "@/sdk";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH_PROVIDERS: Record<string, string> = {
  google: "https://www.googleapis.com/customsearch/v1",
  bing: "https://api.bing.microsoft.com/v7.0/search",
  duckduckgo: "https://api.duckduckgo.com",
};

export const webSearchExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items = inputItems.length === 0 ? [{ json: {} }] : inputItems;
  const continueOnFail = ctx.continueOnFail();
  const out = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const query = ctx.getParam<string>("query", "");
      if (!query) {
        throw new Error("Query parameter is required");
      }
      const resultLimit = ctx.getParam<number>("resultLimit", 10);
      const searchEngine = ctx.getParam<string>("searchEngine", "google");
      const customEndpoint = ctx.getParam<string>("customEndpoint", "");
      const apiKey = ctx.getParam<string>("apiKey", "");
      const additionalOptions = ctx.getParam<Record<string, unknown>>(
        "additionalOptions",
        {},
      );

      let searchUrl: string;
      const params = new URLSearchParams();

      if (searchEngine === "custom" && customEndpoint) {
        searchUrl = customEndpoint;
        params.set("q", query);
        if (apiKey) params.set("apiKey", apiKey);
      } else {
        const base = SEARCH_PROVIDERS[searchEngine];
        if (!base) {
          throw new Error(`Unsupported search engine: ${searchEngine}`);
        }
        searchUrl = base;
        params.set("q", query);
        if (apiKey) params.set("key", apiKey);
        if (searchEngine === "google") {
          params.set("cx", "000000000000000000000"); 
        }
      }

      for (const [k, v] of Object.entries(additionalOptions)) {
        if (v !== undefined && v !== null && v !== "") {
          params.set(k, String(v));
        }
      }

      const fullUrl = `${searchUrl}?${params.toString()}`;
      const res = await fetch(fullUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      const raw: Record<string, unknown> = await res.json();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Authentication failed: invalid API key");
        }
        throw new Error(
          `Search request failed: ${res.status} ${JSON.stringify(raw)}`,
        );
      }

      let results: SearchResult[] = [];
      const items_raw = raw.items as Array<Record<string, unknown>> | undefined;
      if (items_raw && Array.isArray(items_raw)) {
        results = items_raw.slice(0, resultLimit).map((r) => ({
          title: String(r.title ?? ""),
          url: String(r.link ?? r.url ?? ""),
          snippet: String(r.snippet ?? r.description ?? ""),
        }));
      }

      out.push({
        json: {
          query,
          results,
          totalResults: results.length,
        },
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: {
            query: ctx.getParam<string>("query", ""),
            results: [],
            totalResults: 0,
            error: err instanceof Error ? err.message : String(err),
          },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

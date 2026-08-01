import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "@/lib/expressions/evaluate";

const SAFESEARCH_MAP: Record<string, number> = {
  none: 0,
  moderate: 1,
  strict: 2,
};

export const toolSearXngExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));

  const numResults = resolveParamNumber(ctx, "numResults", 10);
  const pageno = resolveParamNumber(ctx, "pageno", 1);
  const language = resolveParamString(ctx, "language", "en");
  const safesearchRaw = resolveParamString(ctx, "safesearch", "none");
  const safesearch = SAFESEARCH_MAP[safesearchRaw] ?? 0;

  const cred = await ctx.getCredential("searxngApi");
  if (!cred) {
    throw new Error(
      'SearXNG Tool: "searxngApi" credential is not configured. Provide the API URL of your SearXNG instance.',
    );
  }
  const apiUrl = String(cred.apiUrl ?? "").replace(/\/+$/, "");
  if (!apiUrl) {
    throw new Error(
      'SearXNG Tool: "searxngApi" credential is missing the API URL.',
    );
  }

  const url = new URL(`${apiUrl}/search`);
  url.searchParams.set("format", "json");
  url.searchParams.set("q", "");
  url.searchParams.set("language", language);
  url.searchParams.set("pageno", String(pageno));
  url.searchParams.set("safesearch", String(safesearch));

  const handle = {
    type: "@n8n/n8n-nodes-langchain.toolSearXng",
    name: "searxng_search",
    description:
      "Performs a web search using SearXNG metasearch engine. Returns a list of search results with title, URL, and snippet.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to submit to SearXNG",
        },
      },
      required: ["query"],
    },
    async invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      const query = String(args?.query ?? "");
      if (!query) {
        return { content: "No search query provided." };
      }

      const queryUrl = new URL(url.href);
      queryUrl.searchParams.set("q", query);

      try {
        const res = await fetch(queryUrl.toString(), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        });

        if (res.status === 403) {
          return {
            content:
              "SearXNG returned HTTP 403. The instance likely has JSON output disabled. " +
              "Enable `json` in the instance's `search.formats` setting.",
            isError: true,
          };
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "(no body)");
          return {
            content: `SearXNG search failed (HTTP ${res.status}): ${body}`,
            isError: true,
          };
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("json")) {
          const text = await res.text();
          return {
            content: `SearXNG returned non-JSON response (${contentType}): ${text.slice(0, 500)}`,
            isError: true,
          };
        }

        const data = (await res.json()) as {
          results?: Array<{
            title?: string;
            url?: string;
            content?: string;
            engine?: string;
            publishedDate?: string;
          }>;
        };

        const results = data?.results;
        if (!results || results.length === 0) {
          return { content: "No search results found." };
        }

        const capped = results.slice(0, numResults);
        const lines = capped.map((r, i) => {
          const parts: string[] = [];
          parts.push(`${i + 1}. ${r.title ?? "(no title)"}`);
          if (r.url) parts.push(`   URL: ${r.url}`);
          if (r.content) parts.push(`   Snippet: ${r.content}`);
          if (r.engine) parts.push(`   Engine: ${r.engine}`);
          if (r.publishedDate) parts.push(`   Published: ${r.publishedDate}`);
          return parts.join("\n");
        });

        return { content: lines.join("\n\n") };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `SearXNG search error: ${msg}`, isError: true };
      }
    },
  };

  const pairedItem =
    items.length > 0
      ? (items[0].pairedItem ?? { item: 0, input: 0 })
      : { item: 0, input: 0 };

  const output: INodeExecutionData = {
    json: handle as unknown as Record<string, unknown>,
    pairedItem,
  };

  return [[output]];
};

function resolveParamNumber(ctx: { getParam: (name: string, defaultVal?: unknown) => unknown }, name: string, defaultVal: number): number {
  const raw = ctx.getParam(name, defaultVal);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    if (raw.startsWith("=") || raw.startsWith("{{")) {
      const items = (ctx as unknown as { getInputItems: (i?: number) => INodeExecutionData[] }).getInputItems(0);
      const firstJson = items[0]?.json ?? {};
      const resolved = evaluateExpression(raw, { json: firstJson, itemIndex: 0 });
      if (resolved.ok) {
        const val = Number(resolved.value);
        return isNaN(val) ? defaultVal : val;
      }
      return defaultVal;
    }
    const parsed = Number(raw);
    return isNaN(parsed) ? defaultVal : parsed;
  }
  return defaultVal;
}

function resolveParamString(ctx: { getParam: (name: string, defaultVal?: unknown) => unknown }, name: string, defaultVal: string): string {
  const raw = ctx.getParam(name, defaultVal);
  if (typeof raw === "string") {
    if (raw.startsWith("=") || raw.startsWith("{{")) {
      const items = (ctx as unknown as { getInputItems: (i?: number) => INodeExecutionData[] }).getInputItems(0);
      const firstJson = items[0]?.json ?? {};
      const resolved = evaluateExpression(raw, { json: firstJson, itemIndex: 0 });
      if (resolved.ok) return String(resolved.value);
    }
    return raw;
  }
  if (raw == null) return defaultVal;
  return String(raw);
}

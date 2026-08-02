import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

export const toolSerpApiExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("serpApi");
  if (!cred) {
    const msg = 'SerpApi Tool: "serpApi" credential is not configured. Provide a SerpApi API key.';
    if (continueOnFail) {
      const pairedItem =
        items.length > 0
          ? (items[0].pairedItem ?? { item: 0, input: 0 })
          : { item: 0, input: 0 };
      return [[{ json: { error: msg }, pairedItem }]];
    }
    throw new Error(msg);
  }

  const apiKey = String(cred.apiKey ?? "");
  if (!apiKey) {
    const msg = 'SerpApi Tool: credential is missing the API key.';
    if (continueOnFail) {
      const pairedItem =
        items.length > 0
          ? (items[0].pairedItem ?? { item: 0, input: 0 })
          : { item: 0, input: 0 };
      return [[{ json: { error: msg }, pairedItem }]];
    }
    throw new Error(msg);
  }

  const handle = {
    type: "@n8n/n8n-nodes-langchain.toolSerpApi",
    name: "serpapi_web_search",
    description:
      "Performs a Google web search through the SerpApi service. Returns structured SERP results including organic_results with position, title, link, and snippet.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The Google search query",
        },
      },
      required: ["query"],
    },
    async invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      const query = String(args?.query ?? "");
      if (!query) {
        return { content: "No search query provided." };
      }

      const country = resolveParamString(ctx, "country", "");
      const language = resolveParamString(ctx, "language", "");
      const googleDomain = resolveParamString(ctx, "googleDomain", "google.com");
      const device = resolveParamString(ctx, "device", "desktop");
      const explicitArray = resolveParamBoolean(ctx, "explicitArray", false);

      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", query);
      url.searchParams.set("api_key", apiKey);
      if (country) url.searchParams.set("gl", country);
      if (language) url.searchParams.set("hl", language);
      url.searchParams.set("google_domain", googleDomain);
      url.searchParams.set("device", device);
      if (explicitArray) url.searchParams.set("no_cache", "true");

      try {
        const res = await fetch(url.toString(), {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "(no body)");
          return {
            content: `SerpApi search failed (HTTP ${res.status}): ${body}`,
            isError: true,
          };
        }

        const data = (await res.json()) as Record<string, unknown>;
        return { content: JSON.stringify(data) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `SerpApi search error: ${msg}`, isError: true };
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

function resolveParamString(
  ctx: { getParam: (name: string, defaultVal?: unknown) => unknown },
  name: string,
  defaultVal: string,
): string {
  const raw = ctx.getParam(name, defaultVal);
  if (typeof raw === "string") return raw;
  if (raw == null) return defaultVal;
  return String(raw);
}

function resolveParamBoolean(
  ctx: { getParam: (name: string, defaultVal?: unknown) => unknown },
  name: string,
  defaultVal: boolean,
): boolean {
  const raw = ctx.getParam(name, defaultVal);
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw.toLowerCase() === "true") return true;
    if (raw.toLowerCase() === "false") return false;
  }
  return defaultVal;
}

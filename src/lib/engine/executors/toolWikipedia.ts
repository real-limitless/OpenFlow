import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const TYPE = "@n8n/n8n-nodes-langchain.toolWikipedia";

const DEFAULT_DESCRIPTION =
  "A tool for interacting with and fetching data from the Wikipedia API. The input should always be a string query.";

export const toolWikipediaExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));

  const description = String(ctx.getParam("description", DEFAULT_DESCRIPTION));

  const handle = {
    type: TYPE,
    name: "wikipedia",
    description,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up on Wikipedia",
        },
      },
      required: ["query"],
    },
    async invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      const query = String(args.query ?? "");
      if (!query) {
        return {
          content: "No query provided.",
          isError: true,
        };
      }

      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
        const response = await fetch(url);
        if (!response.ok) {
          return {
            content: `Wikipedia API returned status ${response.status}`,
            isError: true,
          };
        }
        const data = await response.json();
        const results = data?.query?.search ?? [];

        if (results.length === 0) {
          return { content: "No results found." };
        }

        const lines = results.slice(0, 3).map((r: { title: string; snippet: string }) => {
          const cleanSnippet = r.snippet.replace(/<\/?[^>]+(>|$)/g, "");
          return `- ${r.title}: ${cleanSnippet}`;
        });

        return { content: lines.join("\n") };
      } catch (err) {
        return {
          content: `Error querying Wikipedia: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
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

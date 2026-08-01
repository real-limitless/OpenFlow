import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const WOLFRAM_SHORT_ANSWERS_URL = "https://api.wolframalpha.com/v1/result";

export const toolWolframAlphaExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));

  const cred = await ctx.getCredential("wolframAlphaApi");
  if (!cred) {
    throw new Error(
      'Wolfram|Alpha Tool: "wolframAlphaApi" credential is not configured. Provide a valid Wolfram|Alpha App ID.',
    );
  }
  const appId = String(cred.appId ?? "");
  if (!appId) {
    throw new Error(
      'Wolfram|Alpha Tool: "wolframAlphaApi" credential is missing the App ID.',
    );
  }

  const handle = {
    type: "@n8n/n8n-nodes-langchain.toolWolframAlpha",
    name: "wolfram_alpha",
    description:
      "Answers computational, mathematical, scientific, and factual queries using Wolfram|Alpha's knowledge engine. " +
      "Supports math, dates, quantities, units, and general computational knowledge.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The question or computation to submit to Wolfram|Alpha",
        },
      },
      required: ["query"],
    },
    async invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      const query = String(args?.query ?? "");
      if (!query) {
        return { content: "No query provided." };
      }

      const url = new URL(WOLFRAM_SHORT_ANSWERS_URL);
      url.searchParams.set("appid", appId);
      url.searchParams.set("i", query);

      try {
        const res = await fetch(url.toString(), {
          signal: AbortSignal.timeout(30000),
        });

        if (res.status === 400) {
          const body = await res.text().catch(() => "");
          return {
            content: `Wolfram|Alpha returned HTTP 400 (bad input): ${body}`,
            isError: true,
          };
        }
        if (res.status === 501) {
          const body = await res.text().catch(() => "");
          return {
            content: `Wolfram|Alpha could not interpret the query (HTTP 501): ${body}`,
            isError: true,
          };
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "(no body)");
          return {
            content: `Wolfram|Alpha query failed (HTTP ${res.status}): ${body}`,
            isError: true,
          };
        }

        const text = await res.text();
        return { content: text };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Wolfram|Alpha query error: ${msg}`, isError: true };
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

import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { suggestNodes } from "@/lib/catalog";

interface ToolHandle {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }>;
}

export const toolNodeCatalogExecutor: NodeExecutor = async (ctx) => {
  const name = String(ctx.getParam("name", "search_openflow_nodes") || "search_openflow_nodes");
  const description = String(
    ctx.getParam(
      "description",
      "Find the best OpenFlow catalog node for a task. Prefer domain nodes over shell.",
    ),
  );
  const limitRaw = ctx.getParam<unknown>("limit", 6);
  const limit = typeof limitRaw === "number" && limitRaw > 0 ? Math.min(20, limitRaw) : 6;

  const handle: ToolHandle = {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language intent, e.g. clone a git repo or list GitHub issues",
        },
        intent: {
          type: "string",
          description: "Alias for query",
        },
      },
      required: [],
    },
    async invoke(args: Record<string, unknown>) {
      const intent = String(args.query ?? args.intent ?? args.input ?? "").trim();
      if (!intent) {
        return {
          content: "Provide query/intent describing the capability you need.",
          isError: true,
        };
      }
      try {
        const result = await suggestNodes({ intent, limit, includeShell: true });
        const lines = result.items.map(
          (it, i) =>
            `${i + 1}. ${it.type} [${it.rankTier}] score=${it.score.toFixed(3)} — ${it.displayName}: ${it.reason}`,
        );
        const content = [
          `mode=${result.mode} indexed=${result.indexed}`,
          result.note ? `note=${result.note}` : "",
          "Prefer domain/core types over shell-fallback unless the task is truly host shell.",
          ...lines,
        ]
          .filter(Boolean)
          .join("\n");
        return { content };
      } catch (err) {
        return {
          content: err instanceof Error ? err.message : String(err),
          isError: true,
        };
      }
    },
  };

  const output: INodeExecutionData = {
    json: handle as unknown as Record<string, unknown>,
  };
  return [[output]];
};

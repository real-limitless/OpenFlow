import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

export const toolThinkExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));

  const name = String(ctx.getParam("name", "think"));
  const description = String(ctx.getParam("description", ""));

  const handle = {
    type: "@n8n/n8n-nodes-langchain.toolThink",
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    async invoke(_args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      return {
        content:
          "Now, think step by step. Carefully reason through the problem before producing your final answer.",
      };
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

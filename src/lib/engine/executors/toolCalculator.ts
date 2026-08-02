import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

const TYPE = "@n8n/n8n-nodes-langchain.toolCalculator";

function evaluateExpression(expr: string): number {
  const cleaned = expr.replace(/\s+/g, "");
  if (!/^[\d+\-*/().^%]+$/.test(cleaned)) {
    throw new Error(`Unsupported characters in expression: "${expr}"`);
  }
  const tokenized = cleaned.replace(/\^/g, "**");
  const result = Function(`"use strict"; return (${tokenized})`)();
  if (typeof result !== "number" || !isFinite(result)) {
    throw new Error(`Expression evaluated to non-finite result: "${expr}"`);
  }
  return result;
}

export const toolCalculatorExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));

  const description = String(ctx.getParam("description", ""));

  const handle = {
    type: TYPE,
    name: "calculator",
    description,
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The mathematical expression to evaluate, e.g. 2 + 3 * 4",
        },
      },
      required: ["expression"],
    },
    async invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      const expr = String(args.expression ?? "");
      if (!expr) {
        return {
          content: "No expression provided.",
          isError: true,
        };
      }
      try {
        const result = evaluateExpression(expr);
        return { content: String(result) };
      } catch (err) {
        return {
          content: `Error evaluating expression: ${err instanceof Error ? err.message : String(err)}`,
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

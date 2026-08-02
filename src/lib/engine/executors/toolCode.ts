import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface ToolHandle {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }>;
}

export const toolCodeExecutor: NodeExecutor = async (ctx) => {
  const description = String(ctx.getParam("description", ""));
  const language = String(ctx.getParam("language", "JavaScript"));
  const jsCode = String(ctx.getParam("jsCode", ""));
  const pyCode = String(ctx.getParam("pyCode", ""));

  const code = language === "Python" ? pyCode : jsCode;
  const name = ctx.node.name;

  const handle: ToolHandle = {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The input string passed by the model to the tool",
        },
      },
      required: ["query"],
    },
    async invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      const query = args.query !== undefined ? String(args.query) : "";
      try {
        const fn = new Function("query", code);
        const result = await fn(query);
        return { content: String(result) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (ctx.continueOnFail()) {
          return { content: message, isError: true };
        }
        throw err;
      }
    },
  };

  const output: INodeExecutionData = {
    json: handle as unknown as Record<string, unknown>,
  };

  return [[output]];
};

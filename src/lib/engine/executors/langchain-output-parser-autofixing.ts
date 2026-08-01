import type { NodeExecutor, INodeExecutionData, ExecutionContext, INode } from "@/sdk";

export interface OutputParserHandle {
  type: string;
  parse(text: string): unknown | Promise<unknown>;
  [key: string]: unknown;
}

export interface ModelHandle {
  type: string;
  model: string;
  invoke(messages: Array<{ role: string; content: string }>): Promise<{ text: string }>;
  [key: string]: unknown;
}

function resolveParserHandle(
  ctx: ExecutionContext,
  nodeName: string,
  connections: Record<string, unknown>,
): OutputParserHandle | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    const channelsObj = channels as Record<string, unknown>;
    for (const targets of Object.values(channelsObj)) {
      if (!Array.isArray(targets)) continue;
      for (const t of targets) {
        if (!t) continue;
        const targetArr = Array.isArray(t) ? t : [t];
        for (const ti of targetArr) {
          const entry = ti as { node?: string; type?: string; index?: number };
          if (entry?.node === nodeName && entry?.type === "ai_outputParser") {
            const items = ctx.getNodeInputItems(sourceName, 0);
            if (items?.[0]?.json) {
              return items[0].json as unknown as OutputParserHandle;
            }
          }
        }
      }
    }
  }
  return null;
}

function resolveLLMHandle(
  ctx: ExecutionContext,
  nodeName: string,
  connections: Record<string, unknown>,
): ModelHandle | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    const channelsObj = channels as Record<string, unknown>;
    for (const targets of Object.values(channelsObj)) {
      if (!Array.isArray(targets)) continue;
      for (const t of targets) {
        if (!t) continue;
        const targetArr = Array.isArray(t) ? t : [t];
        for (const ti of targetArr) {
          const entry = ti as { node?: string; type?: string; index?: number };
          if (entry?.node === nodeName && entry?.type === "ai_languageModel") {
            const items = ctx.getNodeInputItems(sourceName, 0);
            if (items?.[0]?.json) {
              const json = items[0].json;
              if (json && typeof (json as ModelHandle).invoke === "function") {
                return json as unknown as ModelHandle;
              }
            }
          }
        }
      }
    }
  }
  return null;
}

function getRepairPromptTemplate(ctx: ExecutionContext): string {
  const options = ctx.getParam<Record<string, unknown> | undefined>("options", {});
  const prompt = (options?.prompt as string | undefined) ?? "";
  if (prompt) return prompt;
  return [
    "Instructions:",
    "{instructions}",
    "",
    "Completion:",
    "{completion}",
    "",
    "Above, the Completion did not satisfy the constraints given in the Instructions.",
    "Error:",
    "{error}",
  ].join("\n");
}

function buildRepairPrompt(
  template: string,
  instructions: string,
  completion: string,
  error: string,
): string {
  return template
    .replace(/\{instructions\}/g, instructions)
    .replace(/\{completion\}/g, completion)
    .replace(/\{error\}/g, error);
}

export const langchainOutputParserAutofixingExecutor: NodeExecutor = async (ctx, node) => {
  const connections = ctx.getWorkflow().connections ?? {};
  const nodeName = node.name;

  const innerParser = resolveParserHandle(ctx, nodeName, connections);
  if (!innerParser) {
    throw new Error(
      "Auto-fixing Output Parser: no inner output parser connected on ai_outputParser input",
    );
  }

  const fixerLLM = resolveLLMHandle(ctx, nodeName, connections);
  const promptTemplate = getRepairPromptTemplate(ctx);

  const handle: OutputParserHandle = {
    type: "@n8n/n8n-nodes-langchain.outputParserAutofixing",
    parse: (text: string): unknown | Promise<unknown> => {
      try {
        return innerParser.parse(text);
      } catch (parseError) {
        if (!fixerLLM) {
          throw parseError;
        }
        const instructions =
          typeof (innerParser as Record<string, unknown>).formatInstructions === "string"
            ? (innerParser as Record<string, unknown>).formatInstructions as string
            : "Follow the schema";
        const errorMessage =
          parseError instanceof Error ? parseError.message : String(parseError);
        const repairPrompt = buildRepairPrompt(promptTemplate, instructions, text, errorMessage);

        return fixerLLM.invoke([{ role: "user", content: repairPrompt }]).then((response) => {
          const corrected = response.text;
          try {
            return innerParser.parse(corrected);
          } catch {
            throw parseError instanceof Error && parseError.message
              ? parseError
              : new Error(String(parseError));
          }
        });
      }
    },
  };

  const out: INodeExecutionData[] = [
    { json: handle as unknown as Record<string, unknown> },
  ];
  return [out];
};

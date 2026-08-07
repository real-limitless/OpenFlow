import type { NodeExecutor, INodeExecutionData } from "@/sdk";

export const hubGPTExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const prompt = ctx.getParam<string>("prompt", "");
  const model = ctx.getParam<string>("model", "gpt-3.5-turbo");
  const options = ctx.getParam<Record<string, unknown>>("options", {});

  if (!prompt) {
    return [inputItems];
  }

  const temperature = (options?.temperature as number) ?? 0.7;
  const maxTokens = (options?.maxTokens as number) ?? 2048;

  const outputItems: INodeExecutionData[] = [];

  for (let i = 0; i < inputItems.length; i++) {
    const item = inputItems[i];
    const resolvedPrompt = prompt.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
      const parts = path.trim().split(".");
      let value: unknown = item.json;
      for (const part of parts) {
        if (value && typeof value === "object" && part in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return `{{${path}}}`;
        }
      }
      return value != null ? String(value) : `{{${path}}}`;
    });

    outputItems.push({
      json: {
        ...item.json,
        hubGPT: {
          prompt: resolvedPrompt,
          model,
          temperature,
          maxTokens,
          // TODO: No API call — scraped workflows show empty parameters.
          // Requires an OpenAI API credential and chat completions call.
          response: "[HubGPT requires an OpenAI API key to generate text]",
        },
      },
      pairedItem: { item: i },
      binary: item.binary,
    });
  }

  return [outputItems];
};

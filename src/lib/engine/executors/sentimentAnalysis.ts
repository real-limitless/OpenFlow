import type { NodeExecutor, INodeExecutionData, ExecutionContext, IWorkflow } from "@/sdk";

interface ModelInvokeResult {
  text: string;
  [key: string]: unknown;
}

interface ModelHandle {
  type?: string;
  model?: string;
  invoke(messages: Array<{ role: string; content: string }>): Promise<ModelInvokeResult>;
}

interface SubNodeRef {
  name: string;
  index: number;
}

interface SentimentResult {
  category: string;
  strength?: number;
  confidence?: number;
}

const DEFAULT_CATEGORIES = "Positive, Neutral, Negative";
const DEFAULT_SYSTEM_PROMPT_TEMPLATE =
  "You are a sentiment analysis assistant. Classify the text into one of these categories: {categories}. Respond with a JSON object containing \"category\", \"strength\" (0-1), and \"confidence\" (0-1).";

function findConnectedModel(
  connections: IWorkflow["connections"],
  nodeName: string,
): SubNodeRef | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (!t || t.node !== nodeName) continue;
          if (t.type === "ai_languageModel") {
            return { name: sourceName, index: t.index ?? 0 };
          }
        }
      }
    }
  }
  return null;
}

function getModelHandle(ctx: ExecutionContext, name: string): ModelHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  const json = items[0].json;
  if (json && typeof (json as { invoke?: unknown }).invoke === "function") {
    return json as unknown as ModelHandle;
  }
  return null;
}

function resolveExpression(ctx: ExecutionContext, raw: unknown, itemJson: Record<string, unknown>): string {
  if (typeof raw !== "string") return "";
  if (raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, itemJson);
    return resolved != null ? String(resolved) : "";
  }
  return raw;
}

function parseSentimentResponse(text: string): SentimentResult | null {
  try {
    return JSON.parse(text);
  } catch {
    const trimmed = text.trim().toLowerCase();
    const categories = ["positive", "neutral", "negative"];
    const match = categories.find((c) => trimmed.includes(c));
    if (match) {
      return { category: match.charAt(0).toUpperCase() + match.slice(1) };
    }
    return null;
  }
}

export const sentimentAnalysisExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const workflow = ctx.getWorkflow();

  const modelRef = findConnectedModel(workflow.connections, node.name);
  if (!modelRef) {
    throw new Error("A Language Model sub-node must be connected on ai_languageModel");
  }

  const modelHandle = getModelHandle(ctx, modelRef.name);
  if (!modelHandle) {
    throw new Error("A Language Model sub-node must be connected on ai_languageModel");
  }

  const inputTextRaw = ctx.getParam<unknown>("inputText", "={{ $json.text }}");

  const opt = ctx.getParam<Record<string, unknown>>("options", {});
  const rawCategories = typeof opt.categories === "string" && opt.categories.trim()
    ? opt.categories as string
    : DEFAULT_CATEGORIES;
  const categories = rawCategories;
  const customSystemTemplate = typeof opt.systemPromptTemplate === "string" ? opt.systemPromptTemplate : "";
  const includeDetailed = opt.includeDetailedResults === true;
  const enableAutoFixing = opt.enableAutoFixing !== false;

  const batching = (opt.batching ?? {}) as Record<string, unknown>;
  const batchSize = typeof batching.batchSize === "number" ? batching.batchSize : 5;
  const delayBetweenBatches = typeof batching.delayBetweenBatches === "number" ? batching.delayBetweenBatches : 0;
  const continueOnFail = ctx.continueOnFail();

  const systemPrompt = customSystemTemplate
    ? customSystemTemplate.replace(/\{categories\}/g, categories)
    : DEFAULT_SYSTEM_PROMPT_TEMPLATE.replace(/\{categories\}/g, categories);

  const results: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(async (item, batchIdx) => {
      const idx = i + batchIdx;
      const itemJson = item.json ?? {};
      const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

      try {
        const text = resolveExpression(ctx, inputTextRaw, itemJson);

        const messages = [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: text || "" },
        ];

        let result: ModelInvokeResult;
        try {
          result = await modelHandle.invoke(messages);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          throw new Error(`Model invocation failed: ${detail}`);
        }

        let finalText = result.text ?? "";
        let sentimentResult: SentimentResult | null = parseSentimentResponse(finalText);

        if (!sentimentResult && enableAutoFixing) {
          const fixMessages = [
            {
              role: "system" as const,
              content: `Your previous response could not be parsed. Respond ONLY with valid JSON: {"category": "...", "strength": 0.0, "confidence": 0.0}. Valid categories: ${categories}`,
            },
            { role: "user" as const, content: text || "" },
          ];
          try {
            const fixResult = await modelHandle.invoke(fixMessages);
            finalText = fixResult.text ?? "";
            sentimentResult = parseSentimentResponse(finalText);
          } catch {
            // fall through
          }
        }

        if (!sentimentResult) {
          throw new Error(`Failed to parse sentiment analysis result: "${finalText}"`);
        }

        const output: SentimentResult = { category: sentimentResult.category };
        if (includeDetailed) {
          output.strength =
            typeof sentimentResult.strength === "number"
              ? Math.max(0, Math.min(1, sentimentResult.strength))
              : 0.5;
          output.confidence =
            typeof sentimentResult.confidence === "number"
              ? Math.max(0, Math.min(1, sentimentResult.confidence))
              : 0.5;
        }

        return {
          json: { ...itemJson, sentimentAnalysis: output },
          binary: item.binary,
          pairedItem,
        };
      } catch (err) {
        if (!continueOnFail) throw err;
        const error = err instanceof Error ? err.message : String(err);
        return { json: { ...itemJson, error }, pairedItem };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return [results];
};

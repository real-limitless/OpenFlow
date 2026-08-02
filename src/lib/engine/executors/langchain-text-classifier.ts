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

interface CategoryEntry {
  name: string;
  description?: string;
}

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

function formatCategories(categories: unknown): string {
  if (!Array.isArray(categories)) return "";
  return categories
    .map((c: CategoryEntry) => {
      const name = c.name ?? "unknown";
      const desc = c.description ? ` — ${c.description}` : "";
      return `- ${name}${desc}`;
    })
    .join("\n");
}

function parseCategoryResponse(text: string, categories: string[], allowMultiple: boolean): string | string[] {
  const trimmed = text.trim();
  if (allowMultiple) {
    const found: string[] = [];
    for (const cat of categories) {
      if (trimmed.toLowerCase().includes(cat.toLowerCase())) {
        found.push(cat);
      }
    }
    return found;
  }
  for (const cat of categories) {
    if (trimmed.toLowerCase() === cat.toLowerCase()) {
      return cat;
    }
  }
  return "";
}

function getCategoryNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: CategoryEntry) => c.name ?? "");
}

const DEFAULT_SYSTEM_PROMPT =
  "You are a text classifier. Given a list of categories and a piece of text, choose the best matching category for the text. Return ONLY the exact category name, nothing else.\n\nCategories:\n{categories}";

const DEFAULT_SYSTEM_PROMPT_MULTI =
  "You are a text classifier. Given a list of categories and a piece of text, choose all matching categories for the text. Return ONLY the matching category names, one per line, nothing else.\n\nCategories:\n{categories}";

const AUTO_FIX_MAX_RETRIES = 2;

export const langchainTextClassifierExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const workflow = ctx.getWorkflow();

  const modelRef = findConnectedModel(workflow.connections, node.name);
  if (!modelRef) {
    throw new Error("A Language Model sub-node must be connected");
  }

  const modelHandle = getModelHandle(ctx, modelRef.name);
  if (!modelHandle) {
    throw new Error("A Language Model sub-node must be connected");
  }

  const rawCategories = ctx.getParam<unknown>("categories", {});
  const categoryValues: CategoryEntry[] =
    rawCategories &&
    typeof rawCategories === "object" &&
    Array.isArray((rawCategories as { values?: unknown }).values)
      ? (rawCategories as { values: CategoryEntry[] }).values
      : [];

  if (categoryValues.length === 0) {
    throw new Error("At least one category must be configured");
  }

  const categoryNames = getCategoryNames(categoryValues);

  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const allowMultiple = options.allowMultipleClasses === true;
  const whenNoClearMatch = options.whenNoClearMatch ?? "discardItem";
  const customSystemTemplate = options.systemPromptTemplate as string | undefined;
  const enableAutoFixing = options.enableAutoFixing === true;

  const categoriesText = formatCategories(categoryValues);

  const systemPrompt = customSystemTemplate
    ? customSystemTemplate.replace(/\{categories\}/g, categoriesText)
    : (allowMultiple ? DEFAULT_SYSTEM_PROMPT_MULTI : DEFAULT_SYSTEM_PROMPT).replace(
        /\{categories\}/g,
        categoriesText,
      );

  const continueOnFail = ctx.continueOnFail();
  const output0: INodeExecutionData[] = [];
  const output1: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: itemIndex, input: 0 };

    try {
      const text = resolveExpression(ctx, ctx.getParam<unknown>("inputPrompt", ""), itemJson);
      if (!text) {
        throw new Error("Input text is empty or missing");
      }

      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: text },
      ];

      let result: ModelInvokeResult;
      try {
        result = await modelHandle.invoke(messages);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Model invocation failed: ${detail}`);
      }

      let finalText = result.text ?? "";

      if (enableAutoFixing) {
        let attempts = 0;
        while (attempts < AUTO_FIX_MAX_RETRIES) {
          const parsed = parseCategoryResponse(finalText, categoryNames, allowMultiple);
          const hasMatch = allowMultiple
            ? Array.isArray(parsed) && parsed.length > 0
            : typeof parsed === "string" && parsed.length > 0;

          if (hasMatch) break;

          attempts++;
          const fixMessages = [
            {
              role: "system" as const,
              content:
                "Your previous response could not be parsed into the expected category format. " +
                `Please respond with ${allowMultiple ? "the matching category names, one per line" : "the exact category name only"}.` +
                `\n\nValid categories:\n${categoriesText}`,
            },
            { role: "user" as const, content: text },
          ];
          try {
            const fixResult = await modelHandle.invoke(fixMessages);
            finalText = fixResult.text ?? "";
          } catch {
            break;
          }
        }
      }

      const parsed = parseCategoryResponse(finalText, categoryNames, allowMultiple);

      if (allowMultiple) {
        const matched = Array.isArray(parsed) ? parsed : [];
        if (matched.length === 0) {
          if (whenNoClearMatch === "outputExtraBranch") {
            output1.push({ json: item.json, pairedItem });
          }
          continue;
        }
        const matchedCategories = matched.map((name: string) => {
          const entry = categoryValues.find((c) => c.name === name);
          return { name, description: entry?.description ?? "" };
        });
        output0.push({
          json: {
            output: {
              categories: matchedCategories,
            },
          },
          pairedItem,
        });
      } else {
        const matchedCategory = typeof parsed === "string" ? parsed : "";
        if (!matchedCategory) {
          if (whenNoClearMatch === "outputExtraBranch") {
            output1.push({ json: item.json, pairedItem });
          }
          continue;
        }
        const entry = categoryValues.find((c) => c.name === matchedCategory);
        output0.push({
          json: {
            output: {
              name: matchedCategory,
              description: entry?.description ?? "",
            },
          },
          pairedItem,
        });
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const error = err instanceof Error ? err.message : String(err);
      output0.push({ json: { error }, pairedItem });
    }
  }

  return [output0, output1.length > 0 ? output1 : []];
};

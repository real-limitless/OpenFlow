import type { NodeExecutor, INodeExecutionData, ExecutionContext, IWorkflow } from "@/sdk";

type MessageRole = "system" | "user" | "assistant";

type MessageContent = string | Array<Record<string, unknown>>;

interface ChatMessage {
  role: MessageRole;
  content: MessageContent;
}

interface ModelInvokeResult {
  text: string;
  [key: string]: unknown;
}

interface ModelHandle {
  type?: string;
  model?: string;
  invoke(messages: ChatMessage[], tools?: unknown[]): Promise<ModelInvokeResult>;
}

interface OutputParserHandle {
  parse?(text: string): unknown;
  [key: string]: unknown;
}

interface SubNodeRef {
  name: string;
  index: number;
}

interface ConnectedSubNodes {
  languageModels: SubNodeRef[];
  outputParser: SubNodeRef[];
}

interface MessageValue {
  type?: string;
  message?: unknown;
  image?: {
    binaryPropertyName?: string;
    imageUrl?: string;
    detail?: string;
  };
}

function findConnectedSubNodes(
  connections: IWorkflow["connections"],
  chainName: string,
): ConnectedSubNodes {
  const subs: ConnectedSubNodes = {
    languageModels: [],
    outputParser: [],
  };
  for (const [sourceName, channels] of Object.entries(connections)) {
    for (const outputs of Object.values(channels)) {
      for (const targets of outputs) {
        if (!targets) continue;
        for (const t of targets) {
          if (!t || t.node !== chainName) continue;
          const ref: SubNodeRef = { name: sourceName, index: t.index ?? 0 };
          switch (t.type) {
            case "ai_languageModel":
              subs.languageModels.push(ref);
              break;
            case "ai_outputParser":
              subs.outputParser.push(ref);
              break;
          }
        }
      }
    }
  }
  subs.languageModels.sort((a, b) => a.index - b.index);
  return subs;
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

function getOutputParserHandle(ctx: ExecutionContext, name: string): OutputParserHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as OutputParserHandle;
}

function resolvePromptType(ctx: ExecutionContext, itemJson: Record<string, unknown>): string {
  const raw = ctx.getParam<unknown>("promptType", "auto");
  if (typeof raw === "string" && raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, itemJson);
    return String(resolved ?? "auto");
  }
  return typeof raw === "string" ? raw : "auto";
}

function resolvePromptForItem(ctx: ExecutionContext, itemJson: Record<string, unknown>): string {
  const promptType = resolvePromptType(ctx, itemJson);

  if (promptType === "define") {
    const text = ctx.getParam<unknown>("text", "");
    if (typeof text !== "string") return "";
    const resolved = ctx.evaluate(text, itemJson);
    return resolved != null ? String(resolved) : "";
  }

  const chatInput = (itemJson as { chatInput?: unknown }).chatInput;
  return chatInput != null ? String(chatInput) : "";
}

function resolveMessageText(
  ctx: ExecutionContext,
  raw: unknown,
  itemJson: Record<string, unknown>,
): string {
  if (typeof raw !== "string") return "";
  if (raw.startsWith("=")) {
    const resolved = ctx.evaluate(raw, itemJson);
    return resolved != null ? String(resolved) : "";
  }
  return raw;
}

function buildImageContent(
  text: string,
  image: NonNullable<MessageValue["image"]>,
  item: INodeExecutionData,
): MessageContent {
  const parts: Array<Record<string, unknown>> = [];
  if (text.length > 0) {
    parts.push({ type: "text", text });
  }

  if (image.imageUrl) {
    const detail = image.detail ?? "auto";
    parts.push({
      type: "image_url",
      image_url: { url: image.imageUrl, detail },
    });
  } else if (image.binaryPropertyName) {
    const binary = item.binary?.[image.binaryPropertyName];
    if (binary) {
      const data = typeof binary.data === "string" ? binary.data : String(binary.data ?? "");
      const mimeType =
        typeof binary.mimeType === "string" ? binary.mimeType : "application/octet-stream";
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${data}`,
          detail: image.detail ?? "auto",
        },
      });
    }
  }

  return parts.length === 1 && parts[0].type === "text" ? text : parts;
}

function buildMessages(
  ctx: ExecutionContext,
  messageValues: MessageValue[],
  runtimePrompt: string,
  item: INodeExecutionData,
): ChatMessage[] {
  const itemJson = item.json ?? {};
  const systemMessages: ChatMessage[] = [];
  const fewShotMessages: ChatMessage[] = [];

  for (const mv of messageValues) {
    const rawType = mv.type ?? "user";
    const text = resolveMessageText(ctx, mv.message, itemJson);

    if (rawType === "system") {
      systemMessages.push({ role: "system", content: text });
    } else if (rawType === "ai") {
      fewShotMessages.push({ role: "assistant", content: text });
    } else {
      const content = mv.image ? buildImageContent(text, mv.image, item) : text;
      fewShotMessages.push({ role: "user", content });
    }
  }

  const messages = [...systemMessages, ...fewShotMessages];
  messages.push({ role: "user", content: runtimePrompt });
  return messages;
}

export const chainLlmExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const workflow = ctx.getWorkflow();
  const subs = findConnectedSubNodes(workflow.connections, node.name);

  if (subs.languageModels.length === 0) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  const modelHandle = getModelHandle(ctx, subs.languageModels[0].name);
  if (!modelHandle) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  const requireSpecificOutputFormat = ctx.getParam<boolean>("requireSpecificOutputFormat", false);
  if (requireSpecificOutputFormat && subs.outputParser.length === 0) {
    throw new Error("An Output Parser sub-node must be connected");
  }

  const parserHandle =
    requireSpecificOutputFormat && subs.outputParser.length > 0
      ? getOutputParserHandle(ctx, subs.outputParser[0].name)
      : null;

  const messagesParam = ctx.getParam<unknown>("messages", {});
  const messageValues: MessageValue[] =
    messagesParam &&
    typeof messagesParam === "object" &&
    Array.isArray((messagesParam as { messageValues?: unknown }).messageValues)
      ? (messagesParam as { messageValues: MessageValue[] }).messageValues
      : [];

  const continueOnFail = ctx.continueOnFail();
  const outputItems: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: itemIndex, input: 0 };

    try {
      const prompt = resolvePromptForItem(ctx, itemJson);
      if (!prompt) {
        throw new Error("No prompt specified");
      }

      const messages = buildMessages(ctx, messageValues, prompt, item);

      let result: ModelInvokeResult;
      try {
        result = await modelHandle.invoke(messages);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Model invocation failed: ${detail}`);
      }
      const finalText = result.text ?? "";

      let output: unknown = finalText;
      if (parserHandle && typeof parserHandle.parse === "function") {
        output = parserHandle.parse(finalText);
      }

      outputItems.push({ json: { output }, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const error = err instanceof Error ? err.message : String(err);
      outputItems.push({ json: { error }, pairedItem });
    }
  }

  return [outputItems];
};

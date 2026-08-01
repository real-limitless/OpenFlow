import type { NodeExecutor, INodeExecutionData, ExecutionContext, IWorkflow } from "@/sdk";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
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

interface RetrievedDocument {
  pageContent: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RetrieverHandle {
  getRelevantDocuments?(query: string): Promise<RetrievedDocument[]>;
  invoke?(query: string): Promise<RetrievedDocument[]>;
  [key: string]: unknown;
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
  retrievers: SubNodeRef[];
  outputParser: SubNodeRef[];
}

function findConnectedSubNodes(
  connections: IWorkflow["connections"],
  chainName: string,
): ConnectedSubNodes {
  const subs: ConnectedSubNodes = {
    languageModels: [],
    retrievers: [],
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
            case "ai_retriever":
              subs.retrievers.push(ref);
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
  subs.retrievers.sort((a, b) => a.index - b.index);
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

function getRetrieverHandle(ctx: ExecutionContext, name: string): RetrieverHandle | null {
  const items = ctx.getNodeInputItems(name, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as RetrieverHandle;
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

function resolveQueryForItem(ctx: ExecutionContext, itemJson: Record<string, unknown>): string {
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

async function retrieveDocuments(
  retriever: RetrieverHandle,
  query: string,
): Promise<RetrievedDocument[]> {
  if (typeof retriever.getRelevantDocuments === "function") {
    return retriever.getRelevantDocuments(query);
  }
  if (typeof retriever.invoke === "function") {
    return retriever.invoke(query);
  }
  return [];
}

function buildContextMessage(docs: RetrievedDocument[]): string {
  if (docs.length === 0) return "";
  const chunks = docs.map((d) => d.pageContent ?? "").filter((c) => c.length > 0);
  if (chunks.length === 0) return "";
  return `Use the following context to answer the question.\n\nContext:\n${chunks.join("\n\n")}`;
}

export const langchainChainRetrievalQaExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const workflow = ctx.getWorkflow();
  const subs = findConnectedSubNodes(workflow.connections, node.name);

  if (subs.languageModels.length === 0) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  if (subs.retrievers.length === 0) {
    throw new Error("A Retriever sub-node must be connected");
  }

  const modelHandle = getModelHandle(ctx, subs.languageModels[0].name);
  if (!modelHandle) {
    throw new Error("A Chat Model sub-node must be connected");
  }

  const retrieverHandle = getRetrieverHandle(ctx, subs.retrievers[0].name);
  if (!retrieverHandle) {
    throw new Error("A Retriever sub-node must be connected");
  }

  const hasOutputParser = ctx.getParam<boolean>("hasOutputParser", false);
  const parserHandle =
    hasOutputParser && subs.outputParser.length > 0
      ? getOutputParserHandle(ctx, subs.outputParser[0].name)
      : null;

  const outputItems: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const itemJson = item.json ?? {};

    const query = resolveQueryForItem(ctx, itemJson);
    if (!query) {
      throw new Error("No prompt specified");
    }

    const docs = await retrieveDocuments(retrieverHandle, query);

    const messages: ChatMessage[] = [];
    const contextMessage = buildContextMessage(docs);
    if (contextMessage) {
      messages.push({ role: "system", content: contextMessage });
    }
    messages.push({ role: "user", content: query });

    const result = await modelHandle.invoke(messages);
    const finalText = result.text ?? "";

    let output: unknown = finalText;
    if (parserHandle && typeof parserHandle.parse === "function") {
      output = await parserHandle.parse(finalText);
    }

    const json: Record<string, unknown> = { output };
    if (typeof output === "string") {
      json.text = output;
    }

    const pairedItem = item.pairedItem ?? { item: itemIndex, input: 0 };
    outputItems.push({ json, pairedItem });
  }

  return [outputItems];
};

import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

const TYPE = "@n8n/n8n-nodes-langchain.toolVectorStore";

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}

interface VectorStoreHandle {
  similaritySearch: (query: string, k: number) => Promise<Document[]>;
  [key: string]: unknown;
}

interface ModelHandle {
  type: string;
  model: string;
  invoke: (
    messages: Array<{ role: string; content: string }>,
  ) => Promise<{ text: string }>;
}

function findConnectedVectorStore(
  ctx: ExecutionContext,
  nodeName: string,
): string | null {
  const connections = ctx.getWorkflow().connections;
  for (const [sourceName, channels] of Object.entries(connections)) {
    const outputs = channels["ai_vectorStore"];
    if (!outputs) continue;
    for (const targets of outputs) {
      if (!targets) continue;
      for (const t of targets) {
        if (!t) continue;
        if (t.node === nodeName) {
          return sourceName;
        }
      }
    }
  }
  return null;
}

function findConnectedLanguageModel(
  ctx: ExecutionContext,
  nodeName: string,
): string | null {
  const connections = ctx.getWorkflow().connections;
  for (const [sourceName, channels] of Object.entries(connections)) {
    const outputs = channels["ai_languageModel"];
    if (!outputs) continue;
    for (const targets of outputs) {
      if (!targets) continue;
      for (const t of targets) {
        if (!t) continue;
        if (t.node === nodeName) {
          return sourceName;
        }
      }
    }
  }
  return null;
}

function getVectorStoreHandle(
  ctx: ExecutionContext,
  sourceName: string,
): VectorStoreHandle | null {
  const items = ctx.getNodeInputItems(sourceName, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as VectorStoreHandle;
}

function getModelHandle(
  ctx: ExecutionContext,
  sourceName: string,
): ModelHandle | null {
  const items = ctx.getNodeInputItems(sourceName, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as ModelHandle;
}

function resolveTopK(
  ctx: ExecutionContext,
  inputItems: INodeExecutionData[],
): number {
  const rawTopK = ctx.getParam<unknown>("topK", 4);
  let topK = 4;
  if (typeof rawTopK === "string" && rawTopK.startsWith("=")) {
    const firstItem = inputItems[0]?.json ?? {};
    const resolved = ctx.evaluate(rawTopK, firstItem as Record<string, unknown>);
    topK = typeof resolved === "number" ? resolved : Number(resolved ?? 4);
  } else if (typeof rawTopK === "number") {
    topK = rawTopK;
  }
  if (!Number.isFinite(topK) || topK < 1) topK = 4;
  return Math.floor(topK);
}

export const toolVectorStoreExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const node = ctx.getNode();
  const nodeName = node.name;

  const vectorStoreSourceName = findConnectedVectorStore(ctx, nodeName);
  if (!vectorStoreSourceName) {
    throw new Error("A Vector Store sub-node must be connected via ai_vectorStore");
  }

  const languageModelSourceName = findConnectedLanguageModel(ctx, nodeName);
  if (!languageModelSourceName) {
    throw new Error("A Language Model sub-node must be connected via ai_languageModel");
  }

  const vectorStore = getVectorStoreHandle(ctx, vectorStoreSourceName);
  if (!vectorStore || typeof vectorStore.similaritySearch !== "function") {
    throw new Error("Connected node is not a valid vector store (missing similaritySearch)");
  }

  const languageModel = getModelHandle(ctx, languageModelSourceName);
  if (!languageModel || typeof languageModel.invoke !== "function") {
    throw new Error("Connected node is not a valid language model (missing invoke)");
  }

  const topK = resolveTopK(ctx, inputItems);

  const description = String(ctx.getParam("description", ""));

  const toolName = nodeName.replace(/\s+/g, "_");
  const toolDescription =
    `Useful for when you need to answer questions about ${nodeName}. ` +
    `Whenever you need information about ${description}, you should ALWAYS use this. ` +
    `Input should be a fully formed question.`;

  const handle = {
    type: TYPE,
    name: toolName,
    description: toolDescription,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The fully formed question to answer using the vector store contents",
        },
      },
      required: ["query"],
    },
    async invoke(args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
      const query = String(args.query ?? "");
      if (!query) {
        return {
          content: "No query provided.",
          isError: true,
        };
      }
      try {
        const docs = await vectorStore.similaritySearch(query, topK);
        const context = docs.map((d) => d.pageContent).join("\n\n");
        const messages = [
          {
            role: "system" as const,
            content: `You are a helpful assistant. Answer the user's question based on the following context:\n\n${context}`,
          },
          {
            role: "user" as const,
            content: query,
          },
        ];
        const result = await languageModel.invoke(messages);
        return { content: result.text };
      } catch (err) {
        return {
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };

  const pairedItem =
    inputItems.length > 0
      ? (inputItems[0].pairedItem ?? { item: 0, input: 0 })
      : { item: 0, input: 0 };

  const output: INodeExecutionData = {
    json: handle as unknown as Record<string, unknown>,
    pairedItem,
  };

  return [[output]];
};

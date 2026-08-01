import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";

export interface RetrieverVectorStoreHandle {
  type: "@n8n/n8n-nodes-langchain.retrieverVectorStore";
  topK: number;
  getRelevantDocuments: (query: string) => Promise<Document[]>;
  invoke: (input: { query: string }) => Promise<Document[]>;
}

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}

interface VectorStoreHandle {
  similaritySearch: (query: string, k: number) => Promise<Document[]>;
  [key: string]: unknown;
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

function getVectorStoreHandle(ctx: ExecutionContext, sourceName: string): VectorStoreHandle | null {
  const items = ctx.getNodeInputItems(sourceName, 0);
  if (!items || items.length === 0) return null;
  return items[0].json as unknown as VectorStoreHandle;
}

export const retrieverVectorStoreExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const node = ctx.getNode();
  const nodeName = node.name;

  const vectorStoreSourceName = findConnectedVectorStore(ctx, nodeName);
  if (!vectorStoreSourceName) {
    throw new Error("A Vector Store sub-node must be connected via ai_vectorStore");
  }

  const vectorStore = getVectorStoreHandle(ctx, vectorStoreSourceName);
  if (!vectorStore || typeof vectorStore.similaritySearch !== "function") {
    throw new Error(
      "Connected node is not a valid vector store (missing similaritySearch)",
    );
  }

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
  topK = Math.floor(topK);

  const retrieverHandle: RetrieverVectorStoreHandle = {
    type: "@n8n/n8n-nodes-langchain.retrieverVectorStore",
    topK,
    async getRelevantDocuments(query: string) {
      return vectorStore.similaritySearch(query, topK);
    },
    async invoke(input: { query: string }) {
      return vectorStore.similaritySearch(input.query, topK);
    },
  };

  const retrieverItem: INodeExecutionData = {
    json: retrieverHandle as unknown as Record<string, unknown>,
  };

  const mainOut: INodeExecutionData[] = inputItems.map((item) => ({
    json: { ...item.json },
    binary: item.binary,
    pairedItem: item.pairedItem,
  }));

  return [mainOut, [retrieverItem]];
};

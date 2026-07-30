import type { NodeExecutor, ExecutionContext, INodeExecutionData, IWorkflow } from "@/sdk";

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}

interface EmbeddingHandle {
  embedQuery: (text: string) => Promise<number[]>;
  embedDocuments: (texts: string[]) => Promise<number[][]>;
}

interface DocumentHandle {
  load: () => Promise<Document[]>;
}

interface RerankerHandle {
  rerank: (query: string, documents: Document[]) => Promise<Document[]>;
}

interface VectorStoreHandle {
  similaritySearch: (query: string, k: number) => Promise<Document[]>;
  addDocuments: (documents: Document[], options?: { clearStore?: boolean }) => Promise<void>;
  asRetriever: () => RetrieverHandle;
}

interface RetrieverHandle {
  getRelevantDocuments: (query: string) => Promise<Document[]>;
  invoke?: (input: { query: string }) => Promise<Document[]>;
}

const memoryStore = new Map<string, VectorStoreHandle>();

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function createVectorStore(embeddings: EmbeddingHandle): VectorStoreHandle {
  const documents: Document[] = [];

  async function similaritySearch(query: string, k: number): Promise<Document[]> {
    if (documents.length === 0) return [];
    const queryEmbedding = await embeddings.embedQuery(query);
    const docEmbeddings = await embeddings.embedDocuments(
      documents.map((d) => d.pageContent),
    );
    const scored = documents.map((doc, i) => ({
      doc,
      score: cosineSimilarity(queryEmbedding, docEmbeddings[i]),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map((s) => s.doc);
  }

  async function addDocuments(
    docs: Document[],
    options?: { clearStore?: boolean },
  ): Promise<void> {
    if (options?.clearStore) {
      documents.length = 0;
    }
    documents.push(...docs);
  }

  function asRetriever(): RetrieverHandle {
    return {
      async getRelevantDocuments(query: string) {
        return similaritySearch(query, 4);
      },
      async invoke(input: { query: string }) {
        return similaritySearch(input.query, 4);
      },
    };
  }

  return { similaritySearch, addDocuments, asRetriever };
}

function getOrCreateStore(key: string, embeddings: EmbeddingHandle): VectorStoreHandle {
  let store = memoryStore.get(key);
  if (!store) {
    store = createVectorStore(embeddings);
    memoryStore.set(key, store);
  }
  return store;
}

function findConnectedSubNode(
  connections: IWorkflow["connections"],
  targetName: string,
  channel: string,
): string | null {
  for (const [sourceName, channels] of Object.entries(connections)) {
    const outputs = channels[channel];
    if (!outputs) continue;
    for (const targets of outputs) {
      if (!targets) continue;
      for (const t of targets) {
        if (!t) continue;
        if (t.node === targetName) {
          return sourceName;
        }
      }
    }
  }
  return null;
}

function getHandle(ctx: ExecutionContext, sourceName: string): unknown | null {
  const items = ctx.getNodeInputItems(sourceName, 0);
  if (!items || items.length === 0) return null;
  return items[0].json;
}

function resolveStringParam(
  ctx: ExecutionContext,
  name: string,
  defaultValue: string,
  itemJson: Record<string, unknown>,
): string {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return String(ctx.evaluate(raw, itemJson) ?? defaultValue);
    }
    return raw;
  }
  return defaultValue;
}

function resolveNumberParam(
  ctx: ExecutionContext,
  name: string,
  defaultValue: number,
  itemJson: Record<string, unknown>,
): number {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return Number(ctx.evaluate(raw, itemJson)) || defaultValue;
    }
    return Number(raw) || defaultValue;
  }
  return defaultValue;
}

function resolveBooleanParam(
  ctx: ExecutionContext,
  name: string,
  defaultValue: boolean,
  itemJson: Record<string, unknown>,
): boolean {
  const raw = ctx.getParam<unknown>(name, defaultValue);
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return Boolean(ctx.evaluate(raw, itemJson));
    }
    return raw === "true";
  }
  return defaultValue;
}

function resolveMemoryKey(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
  typeVersion: number,
  workflowId: string,
): string {
  const raw = ctx.getParam<unknown>("memoryKey", "vector_store_key");

  let key: string;
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      key = String(ctx.evaluate(raw, itemJson) ?? "vector_store_key");
    } else {
      key = raw;
    }
  } else if (raw && typeof raw === "object" && "value" in raw) {
    const value = (raw as { value: unknown }).value;
    if (typeof value === "string" && value.startsWith("=")) {
      key = String(ctx.evaluate(value, itemJson) ?? "vector_store_key");
    } else {
      key = String(value ?? "vector_store_key");
    }
  } else {
    key = "vector_store_key";
  }

  if (typeVersion < 1.2) {
    return `${workflowId}__${key}`;
  }
  return key;
}

export const vectorStoreInMemoryExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "insert");
  const typeVersion = node.typeVersion ?? 1;
  const workflowId = ctx.getWorkflow().id ?? "wf";
  const connections = ctx.getWorkflow().connections;

  const embeddingSourceName = findConnectedSubNode(connections, node.name, "ai_embedding");
  if (!embeddingSourceName) {
    throw new Error("An Embedding sub-node must be connected");
  }
  const embeddingHandle = getHandle(ctx, embeddingSourceName) as EmbeddingHandle | null;
  if (!embeddingHandle || typeof embeddingHandle.embedQuery !== "function") {
    throw new Error("An Embedding sub-node must be connected");
  }

  const outputItems: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    const item = inputItems[itemIndex];
    const itemJson = item.json ?? {};
    const memoryKey = resolveMemoryKey(ctx, itemJson, typeVersion, workflowId);

    try {
      if (mode === "insert") {
        const documentSourceName = findConnectedSubNode(connections, node.name, "ai_document");
        if (!documentSourceName) {
          throw new Error("A Document Loader sub-node must be connected");
        }
        const documentHandle = getHandle(ctx, documentSourceName) as DocumentHandle | null;
        if (!documentHandle || typeof documentHandle.load !== "function") {
          throw new Error("A Document Loader sub-node must be connected");
        }

        const clearStore = resolveBooleanParam(ctx, "clearStore", false, itemJson);
        const documents = await documentHandle.load();

        const store = getOrCreateStore(memoryKey, embeddingHandle);
        if (clearStore) {
          memoryStore.delete(memoryKey);
          const freshStore = createVectorStore(embeddingHandle);
          memoryStore.set(memoryKey, freshStore);
          await freshStore.addDocuments(documents);
        } else {
          await store.addDocuments(documents);
        }

        for (const doc of documents) {
          outputItems.push({
            json: { pageContent: doc.pageContent, metadata: doc.metadata ?? {} },
            pairedItem: { item: itemIndex, input: 0 },
          });
        }
      } else if (mode === "retrieve") {
        const store = getOrCreateStore(memoryKey, embeddingHandle);
        let retriever = store.asRetriever();

        const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);
        if (useReranker) {
          const rerankerSourceName = findConnectedSubNode(connections, node.name, "ai_reranker");
          if (!rerankerSourceName) {
            throw new Error("Reranker sub-node must be connected when useReranker is true");
          }
          const rerankerHandle = getHandle(ctx, rerankerSourceName) as RerankerHandle | null;
          if (!rerankerHandle || typeof rerankerHandle.rerank !== "function") {
            throw new Error("Invalid reranker handle from ai_reranker channel");
          }
          const baseGetRelevant = retriever.getRelevantDocuments.bind(retriever);
          retriever = {
            async getRelevantDocuments(query: string) {
              const docs = await baseGetRelevant(query);
              return rerankerHandle.rerank(query, docs);
            },
            async invoke(input: { query: string }) {
              const docs = await baseGetRelevant(input.query);
              return rerankerHandle.rerank(input.query, docs);
            },
          };
        }

        outputItems.push({
          json: retriever as unknown as Record<string, unknown>,
          pairedItem: { item: itemIndex, input: 0 },
        });
      } else if (mode === "load") {
        const store = getOrCreateStore(memoryKey, embeddingHandle);

        const prompt = resolveStringParam(ctx, "prompt", "", itemJson);
        if (!prompt || prompt.trim() === "") {
          continue;
        }

        const topK = resolveNumberParam(ctx, "topK", 4, itemJson);
        const includeMetadata = resolveBooleanParam(ctx, "includeDocumentMetadata", false, itemJson);
        const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);

        let documents = await store.similaritySearch(prompt, topK);

        if (useReranker) {
          const rerankerSourceName = findConnectedSubNode(connections, node.name, "ai_reranker");
          if (!rerankerSourceName) {
            throw new Error("Reranker sub-node must be connected when useReranker is true");
          }
          const rerankerHandle = getHandle(ctx, rerankerSourceName) as RerankerHandle | null;
          if (!rerankerHandle || typeof rerankerHandle.rerank !== "function") {
            throw new Error("Invalid reranker handle from ai_reranker channel");
          }
          documents = await rerankerHandle.rerank(prompt, documents);
        }

        for (const doc of documents) {
          const json: Record<string, unknown> = { pageContent: doc.pageContent };
          if (includeMetadata) {
            json.metadata = doc.metadata ?? {};
          }
          outputItems.push({
            json,
            pairedItem: { item: itemIndex, input: 0 },
          });
        }
      } else {
        throw new Error(`Unknown mode: ${mode}`);
      }
    } catch (error) {
      if (!ctx.continueOnFail()) {
        throw error;
      }
      outputItems.push({
        json: { error: error instanceof Error ? error.message : String(error) },
        pairedItem: { item: itemIndex, input: 0 },
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return [outputItems];
};

export function clearMemoryVectorStore(): void {
  memoryStore.clear();
}
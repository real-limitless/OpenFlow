import type { NodeExecutor, ExecutionContext, INodeExecutionData, IWorkflow } from "@/sdk";
import { requireCredential, sdkHttpRequest } from "@/sdk";

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

interface VectorRetrieverHandle {
  getRelevantDocuments: (query: string) => Promise<Document[]>;
  invoke?: (input: { query: string }) => Promise<Document[]>;
}

interface ToolDescriptor {
  name: string;
  description: string;
  getRelevantDocuments: (query: string) => Promise<Document[]>;
  invoke?: (input: { query: string }) => Promise<Document[]>;
}

interface QdrantCredential {
  apiKey: string;
  qdrantUrl: string;
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

function resolveCollectionId(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
): string {
  const raw = ctx.getParam<unknown>("qdrantCollection", { mode: "list", value: "" });
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    const value = r.value;
    if (typeof value === "string") {
      if (value.startsWith("=")) {
        return String(ctx.evaluate(value, itemJson) ?? "");
      }
      return value;
    }
  }
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return String(ctx.evaluate(raw, itemJson) ?? "");
    }
    return raw;
  }
  return "";
}

function resolveOptionsParam<T>(
  ctx: ExecutionContext,
  key: string,
  defaultValue: T,
  itemJson: Record<string, unknown>,
): T {
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  if (typeof options !== "object" || options === null) return defaultValue;
  const raw = options[key];
  if (raw === undefined || raw === null) return defaultValue;
  if (typeof raw === "string" && (raw as string).startsWith("=")) {
    return ctx.evaluate(raw as string, itemJson) as T;
  }
  return raw as T;
}

function applyReranking(
  ctx: ExecutionContext,
  nodeName: string,
  query: string,
  documents: Document[],
): Promise<Document[]> | Document[] {
  const rerankerSourceName = findConnectedSubNode(
    ctx.getWorkflow().connections,
    nodeName,
    "ai_reranker",
  );
  if (rerankerSourceName) {
    const rerankerHandle = getHandle(ctx, rerankerSourceName) as RerankerHandle | null;
    if (rerankerHandle && typeof rerankerHandle.rerank === "function") {
      return rerankerHandle.rerank(query, documents);
    }
  }
  return documents;
}

async function validateEmbedding(ctx: ExecutionContext, nodeName: string): Promise<EmbeddingHandle> {
  const sourceName = findConnectedSubNode(ctx.getWorkflow().connections, nodeName, "ai_embedding");
  if (!sourceName) {
    throw new Error("An Embedding sub-node must be connected");
  }
  const handle = getHandle(ctx, sourceName) as EmbeddingHandle | null;
  if (!handle || typeof handle.embedQuery !== "function") {
    throw new Error("An Embedding sub-node must be connected");
  }
  return handle;
}

async function validateDocument(ctx: ExecutionContext, nodeName: string): Promise<DocumentHandle> {
  const sourceName = findConnectedSubNode(ctx.getWorkflow().connections, nodeName, "ai_document");
  if (!sourceName) {
    throw new Error("A Document Loader sub-node must be connected");
  }
  const handle = getHandle(ctx, sourceName) as DocumentHandle | null;
  if (!handle || typeof handle.load !== "function") {
    throw new Error("A Document Loader sub-node must be connected");
  }
  return handle;
}

function qdrantHeaders(cred: QdrantCredential): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "api-key": cred.apiKey,
  };
}

function qdrantUrl(cred: QdrantCredential, path: string): string {
  const base = cred.qdrantUrl.replace(/\/+$/, "");
  return `${base}${path}`;
}

async function qdrantGetCollections(cred: QdrantCredential): Promise<string[]> {
  const res = await sdkHttpRequest({
    url: qdrantUrl(cred, "/collections"),
    method: "GET",
    headers: qdrantHeaders(cred),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Qdrant list collections failed: ${res.status}`);
  }
  const body = res.body as { result?: { collections?: Array<{ name: string }> } };
  return body?.result?.collections?.map((c) => c.name) ?? [];
}

async function qdrantCollectionExists(
  cred: QdrantCredential,
  collection: string,
): Promise<boolean> {
  const res = await sdkHttpRequest({
    url: qdrantUrl(cred, `/collections/${encodeURIComponent(collection)}`),
    method: "GET",
    headers: qdrantHeaders(cred),
  });
  return res.status >= 200 && res.status < 300;
}

async function qdrantCreateCollection(
  cred: QdrantCredential,
  collection: string,
  config: Record<string, unknown> | undefined,
  vectorSize: number,
): Promise<void> {
  const body: Record<string, unknown> = {
    name: collection,
    vectors: {
      size: vectorSize,
      distance: "Cosine",
    },
  };
  if (config && typeof config === "object") {
    Object.assign(body, config);
  }
  const res = await sdkHttpRequest({
    url: qdrantUrl(cred, `/collections`),
    method: "PUT",
    headers: qdrantHeaders(cred),
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Qdrant create collection failed: ${res.status}`);
  }
}

async function qdrantUpsertPoints(
  cred: QdrantCredential,
  collection: string,
  points: Array<{
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }>,
): Promise<void> {
  const res = await sdkHttpRequest({
    url: qdrantUrl(cred, `/collections/${encodeURIComponent(collection)}/points`),
    method: "PUT",
    headers: qdrantHeaders(cred),
    body: { points },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Qdrant upsert points failed: ${res.status}`);
  }
}

async function qdrantSearch(
  cred: QdrantCredential,
  collection: string,
  queryVector: number[],
  topK: number,
  filter: Record<string, unknown> | undefined,
): Promise<Array<{
  id: string;
  score: number;
  payload: Record<string, unknown>;
}>> {
  const body: Record<string, unknown> = {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  };
  if (filter) body.filter = filter;

  const res = await sdkHttpRequest({
    url: qdrantUrl(cred, `/collections/${encodeURIComponent(collection)}/points/search`),
    method: "POST",
    headers: qdrantHeaders(cred),
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Qdrant search failed: ${res.status}`);
  }
  const data = res.body as { result?: Array<{ id: string; score: number; payload: Record<string, unknown> }> };
  return data?.result ?? [];
}

export const vectorStoreQdrantExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "retrieve");
  const outputItems: INodeExecutionData[] = [];

  const credential = await requireCredential(ctx, "qdrantApi");
  const apiKey = String(credential.apiKey ?? "");
  const qdrantUrl = String(credential.qdrantUrl ?? "");
  if (!apiKey || !qdrantUrl) {
    throw new Error("Qdrant API key and URL are required");
  }
  const cred: QdrantCredential = { apiKey, qdrantUrl };

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    const item = inputItems[itemIndex];
    const itemJson = item.json ?? {};

    try {
      const collection = resolveCollectionId(ctx, itemJson);
      if (!collection) {
        throw new Error("Collection parameter is required");
      }

      if (mode === "load") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const prompt = resolveStringParam(ctx, "prompt", "", itemJson);
        if (!prompt) {
          continue;
        }
        const topK = resolveNumberParam(ctx, "topK", 10, itemJson);
        const includeMetadata = resolveBooleanParam(ctx, "includeDocumentMetadata", false, itemJson);
        const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);
        const searchFilterJson = resolveOptionsParam(ctx, "searchFilterJson", undefined, itemJson);
        const contentKey = resolveOptionsParam(ctx, "contentPayloadKey", "content", itemJson) as string;
        const metadataKey = resolveOptionsParam(ctx, "metadataPayloadKey", "metadata", itemJson) as string;

        let filterObj: Record<string, unknown> | undefined;
        if (searchFilterJson && typeof searchFilterJson === "object") {
          filterObj = searchFilterJson as Record<string, unknown>;
        }

        const queryVector = await embeddingHandle.embedQuery(prompt);
        let results = await qdrantSearch(cred, collection, queryVector, topK, filterObj);

        let documents: Document[] = results.map((r) => ({
          pageContent: String(r.payload?.[contentKey] ?? ""),
          metadata: includeMetadata ? ((r.payload?.[metadataKey] as Record<string, unknown>) ?? {}) : {},
          ...(includeMetadata ? { score: r.score } : {}),
        }));

        if (useReranker) {
          const rerankerSourceName = findConnectedSubNode(ctx.getWorkflow().connections, node.name, "ai_reranker");
          if (!rerankerSourceName) {
            throw new Error("Reranker sub-node must be connected when useReranker is true");
          }
          documents = (await applyReranking(ctx, node.name, prompt, documents)) as Document[];
        }

        for (const doc of documents) {
          const outputJson: Record<string, unknown> = { pageContent: doc.pageContent };
          if (includeMetadata) {
            outputJson.metadata = doc.metadata ?? {};
            outputJson.score = (doc as Document & { score?: number }).score ?? 0;
          }
          outputItems.push({
            json: outputJson,
            pairedItem: { item: itemIndex, input: 0 },
          });
        }
      } else if (mode === "insert") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const documentHandle = await validateDocument(ctx, node.name);
        const collectionConfig = resolveOptionsParam(ctx, "collectionConfig", undefined, itemJson);
        const embeddingBatchSize = resolveOptionsParam(ctx, "embeddingBatchSize", 50, itemJson) as number;
        const contentKey = resolveOptionsParam(ctx, "contentPayloadKey", "content", itemJson) as string;
        const metadataKey = resolveOptionsParam(ctx, "metadataPayloadKey", "metadata", itemJson) as string;

        const documents = await documentHandle.load();
        const exists = await qdrantCollectionExists(cred, collection);

        if (!exists) {
          const texts = documents.map((d) => d.pageContent);
          const sampleEmbeddings = await embeddingHandle.embedDocuments(
            texts.slice(0, Math.min(texts.length, 1)),
          );
          const vectorSize = sampleEmbeddings[0]?.length ?? 1536;
          const configObj = typeof collectionConfig === "object" && collectionConfig !== null
            ? (collectionConfig as Record<string, unknown>)
            : undefined;
          await qdrantCreateCollection(cred, collection, configObj, vectorSize);
        }

        for (let i = 0; i < documents.length; i += embeddingBatchSize) {
          const batch = documents.slice(i, i + embeddingBatchSize);
          const texts = batch.map((d) => d.pageContent);
          const embeddings = await embeddingHandle.embedDocuments(texts);
          const points = batch.map((doc, batchIdx) => ({
            id: `doc-${itemIndex}-${i + batchIdx}`,
            vector: embeddings[batchIdx],
            payload: {
              [contentKey]: doc.pageContent,
              [metadataKey]: doc.metadata ?? {},
            } as Record<string, unknown>,
          }));
          await qdrantUpsertPoints(cred, collection, points);
        }

        outputItems.push({ ...item });
      } else if (mode === "retrieve") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);
        const searchFilterJson = resolveOptionsParam(ctx, "searchFilterJson", undefined, itemJson);
        const contentKey = resolveOptionsParam(ctx, "contentPayloadKey", "content", itemJson) as string;
        const metadataKey = resolveOptionsParam(ctx, "metadataPayloadKey", "metadata", itemJson) as string;

        let filterObj: Record<string, unknown> | undefined;
        if (searchFilterJson && typeof searchFilterJson === "object") {
          filterObj = searchFilterJson as Record<string, unknown>;
        }

        if (useReranker) {
          const rerankerSourceName = findConnectedSubNode(ctx.getWorkflow().connections, node.name, "ai_reranker");
          if (!rerankerSourceName) {
            throw new Error("Reranker sub-node must be connected when useReranker is true");
          }
        }

        const retriever: VectorRetrieverHandle = {
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            let results = await qdrantSearch(cred, collection, queryVector, 10, filterObj);
            let documents: Document[] = results.map((r) => ({
              pageContent: String(r.payload?.[contentKey] ?? ""),
              metadata: (r.payload?.[metadataKey] as Record<string, unknown>) ?? {},
            }));
            if (useReranker) {
              documents = (await applyReranking(ctx, node.name, query, documents)) as Document[];
            }
            return documents;
          },
          async invoke(input: { query: string }) {
            return this.getRelevantDocuments(input.query);
          },
        };

        outputItems.push({
          json: retriever as unknown as Record<string, unknown>,
          pairedItem: { item: itemIndex, input: 0 },
        });
      } else if (mode === "retrieve-as-tool") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const toolName = resolveStringParam(ctx, "name", "qdrant_vector_store", itemJson);
        const toolDescription = resolveStringParam(ctx, "toolDescription", "Search the Qdrant vector store for relevant documents.", itemJson);
        const topK = resolveNumberParam(ctx, "topK", 10, itemJson);
        const includeMetadata = resolveBooleanParam(ctx, "includeDocumentMetadata", false, itemJson);
        const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);
        const searchFilterJson = resolveOptionsParam(ctx, "searchFilterJson", undefined, itemJson);
        const contentKey = resolveOptionsParam(ctx, "contentPayloadKey", "content", itemJson) as string;
        const metadataKey = resolveOptionsParam(ctx, "metadataPayloadKey", "metadata", itemJson) as string;

        let filterObj: Record<string, unknown> | undefined;
        if (searchFilterJson && typeof searchFilterJson === "object") {
          filterObj = searchFilterJson as Record<string, unknown>;
        }

        if (useReranker) {
          const rerankerSourceName = findConnectedSubNode(ctx.getWorkflow().connections, node.name, "ai_reranker");
          if (!rerankerSourceName) {
            throw new Error("Reranker sub-node must be connected when useReranker is true");
          }
        }

        const tool: ToolDescriptor = {
          name: toolName,
          description: toolDescription,
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            let results = await qdrantSearch(cred, collection, queryVector, topK, filterObj);
            let documents: Document[] = results.map((r) => ({
              pageContent: String(r.payload?.[contentKey] ?? ""),
              metadata: includeMetadata ? ((r.payload?.[metadataKey] as Record<string, unknown>) ?? {}) : {},
            }));
            if (useReranker) {
              documents = (await applyReranking(ctx, node.name, query, documents)) as Document[];
            }
            return documents;
          },
          async invoke(input: { query: string }) {
            return this.getRelevantDocuments(input.query);
          },
        };

        outputItems.push({
          json: tool as unknown as Record<string, unknown>,
          pairedItem: { item: itemIndex, input: 0 },
        });
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
      });
    }
  }

  return [outputItems];
};

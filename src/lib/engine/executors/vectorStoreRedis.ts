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

function buildRestUrl(credential: Record<string, unknown>): string {
  const host = String(credential.host ?? "localhost");
  const port = Number(credential.port ?? 6379);
  const ssl = Boolean(credential.ssl);
  const password = credential.password != null && String(credential.password) !== ""
    ? String(credential.password)
    : undefined;
  const proto = ssl ? "https" : "http";
  const base = `${proto}://${host}:${port}`;
  return password ? base.replace("://", `://:${encodeURIComponent(password)}@`) : base;
}

/** FT.SEARCH via the Redis REST API (Redis Stack). */
async function redisFtSearch(
  baseUrl: string,
  index: string,
  queryVector: number[],
  topK: number,
  returnFields: string[],
): Promise<Document[]> {
  const queryStr = `KNN ${topK} => $vector:[${queryVector.join(",")}]`;
  const body = {
    index,
    query: queryStr,
    return_fields: returnFields,
    num: topK,
  };
  const res = await sdkHttpRequest({
    url: `${baseUrl}/ft.search`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Redis FT.SEARCH failed: ${res.status}`);
  }
  const data = res.body as {
    results?: Array<{
      id?: string;
      score?: number;
      payload?: Record<string, string>;
    }>;
  };
  return (data.results ?? []).map((r) => {
    const payload = r.payload ?? {};
    return {
      pageContent: String(payload.content ?? payload.pageContent ?? ""),
      metadata: payload.metadata ? JSON.parse(String(payload.metadata)) : {},
    };
  });
}

async function redisFtCreate(
  baseUrl: string,
  index: string,
  vectorDim: number,
  prefix: string,
  contentKey: string,
  metadataKey: string,
  vectorKey: string,
): Promise<void> {
  const body = {
    index,
    on: "hash",
    prefix,
    schema: [
      { name: contentKey, type: "text" },
      { name: metadataKey, type: "text" },
      { name: vectorKey, type: "vector", dims: vectorDim, distance_metric: "COSINE" },
    ],
  };
  const res = await sdkHttpRequest({
    url: `${baseUrl}/ft.create`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (res.status < 200 || res.status >= 300 && res.status !== 409) {
    throw new Error(`Redis FT.CREATE failed: ${res.status}`);
  }
}

async function redisFtList(baseUrl: string): Promise<string[]> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}/ft._list`,
    method: "GET",
    headers: { "content-type": "application/json" },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Redis FT._LIST failed: ${res.status}`);
  }
  const data = res.body as { indices?: string[] };
  return data.indices ?? [];
}

async function redisHset(
  baseUrl: string,
  key: string,
  fields: Record<string, string>,
): Promise<void> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}/hset`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { key, fields },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Redis HSET failed: ${res.status}`);
  }
}

async function redisDel(baseUrl: string, key: string): Promise<void> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}/del`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { key },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Redis DEL failed: ${res.status}`);
  }
}

async function redisFtDropIndex(baseUrl: string, index: string): Promise<void> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}/ft.dropindex`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { index },
  });
  if (res.status < 200 || res.status >= 300 && res.status !== 404) {
    throw new Error(`Redis FT.DROPINDEX failed: ${res.status}`);
  }
}

async function redisExpire(baseUrl: string, key: string, ttl: number): Promise<void> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}/expire`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { key, seconds: ttl },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Redis EXPIRE failed: ${res.status}`);
  }
}

async function resolveOrCreateIndex(
  baseUrl: string,
  redisIndex: string,
  vectorDim: number,
  keyPrefix: string,
  contentKey: string,
  metadataKey: string,
  vectorKey: string,
): Promise<void> {
  const indices = await redisFtList(baseUrl);
  if (!indices.includes(redisIndex)) {
    await redisFtCreate(baseUrl, redisIndex, vectorDim, keyPrefix, contentKey, metadataKey, vectorKey);
  }
}

async function loadDocuments(
  documentHandle: DocumentHandle,
  keyPrefix: string,
  contentKey: string,
  metadataKey: string,
  vectorKey: string,
  baseUrl: string,
  ttl: number,
  overwrite: boolean,
  embeddings: number[][],
  documents: Document[],
): Promise<void> {
  for (let i = 0; i < documents.length; i++) {
    const docKey = `${keyPrefix}:${i}`;
    const fields: Record<string, string> = {
      [contentKey]: documents[i].pageContent,
    };
    if (Object.keys(documents[i].metadata).length > 0) {
      fields[metadataKey] = JSON.stringify(documents[i].metadata);
    }
    if (embeddings[i]) {
      fields[vectorKey] = JSON.stringify(embeddings[i]);
    }
    await redisHset(baseUrl, docKey, fields);
    if (ttl > 0) {
      await redisExpire(baseUrl, docKey, ttl);
    }
  }
}

export const vectorStoreRedisExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "retrieve");
  const outputItems: INodeExecutionData[] = [];

  const credential = await requireCredential(ctx, "redis");
  const baseUrl = buildRestUrl(credential);

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    const item = inputItems[itemIndex];
    const itemJson = item.json ?? {};

    try {
      const redisIndex = resolveStringParam(ctx, "redisIndex", "", itemJson);
      if (!redisIndex) {
        throw new Error("redisIndex parameter is required");
      }

      if (mode === "load") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const prompt = resolveStringParam(ctx, "prompt", "", itemJson);
        if (!prompt) {
          continue;
        }
        const topK = resolveNumberParam(ctx, "topK", 4, itemJson);
        const includeDocumentMetadata = resolveBooleanParam(ctx, "includeDocumentMetadata", true, itemJson);
        const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);
        const keyPrefix = resolveStringParam(ctx, "keyPrefix", "doc", itemJson);
        const contentKey = resolveStringParam(ctx, "contentKey", "content", itemJson);
        const metadataKey = resolveStringParam(ctx, "metadataKey", "metadata", itemJson);
        const vectorKey = resolveStringParam(ctx, "vectorKey", "content_vector", itemJson);

        const queryVector = await embeddingHandle.embedQuery(prompt);
        await resolveOrCreateIndex(baseUrl, redisIndex, queryVector.length, keyPrefix, contentKey, metadataKey, vectorKey);

        const returnFields = [contentKey];
        if (includeDocumentMetadata) returnFields.push(metadataKey);

        let documents = await redisFtSearch(baseUrl, redisIndex, queryVector, topK, returnFields);

        if (useReranker) {
          documents = (await applyReranking(ctx, node.name, prompt, documents)) as Document[];
        }

        for (const doc of documents) {
          outputItems.push({
            json: { pageContent: doc.pageContent, metadata: doc.metadata ?? {} },
            pairedItem: { item: itemIndex, input: 0 },
          });
        }
      } else if (mode === "insert") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const documentHandle = await validateDocument(ctx, node.name);
        const overwriteDocuments = resolveBooleanParam(ctx, "overwriteDocuments", false, itemJson);
        const keyPrefix = resolveStringParam(ctx, "keyPrefix", "doc", itemJson);
        const contentKey = resolveStringParam(ctx, "contentKey", "content", itemJson);
        const metadataKey = resolveStringParam(ctx, "metadataKey", "metadata", itemJson);
        const vectorKey = resolveStringParam(ctx, "vectorKey", "content_vector", itemJson);
        const ttl = resolveNumberParam(ctx, "ttl", 0, itemJson);
        const embeddingBatchSize = resolveNumberParam(ctx, "embeddingBatchSize", 200, itemJson);

        const documents = await documentHandle.load();

        if (overwriteDocuments) {
          await redisFtDropIndex(baseUrl, redisIndex);
        }

        const texts = documents.map((d) => d.pageContent);
        const embeddings = await embeddingHandle.embedDocuments(texts);
        const vectorDim = embeddings.length > 0 ? embeddings[0].length : 768;

        await resolveOrCreateIndex(baseUrl, redisIndex, vectorDim, keyPrefix, contentKey, metadataKey, vectorKey);

        for (let batchStart = 0; batchStart < documents.length; batchStart += embeddingBatchSize) {
          const batchEnd = Math.min(batchStart + embeddingBatchSize, documents.length);
          const batchDocs = documents.slice(batchStart, batchEnd);
          const batchEmbs = embeddings.slice(batchStart, batchEnd);
          await loadDocuments(
            documentHandle, keyPrefix, contentKey, metadataKey, vectorKey,
            baseUrl, ttl, overwriteDocuments, batchEmbs, batchDocs,
          );
        }

        outputItems.push({ ...item });
      } else if (mode === "retrieve") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);
        const keyPrefix = resolveStringParam(ctx, "keyPrefix", "doc", itemJson);
        const contentKey = resolveStringParam(ctx, "contentKey", "content", itemJson);
        const metadataKey = resolveStringParam(ctx, "metadataKey", "metadata", itemJson);
        const vectorKey = resolveStringParam(ctx, "vectorKey", "content_vector", itemJson);

        const retriever: VectorRetrieverHandle = {
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            await resolveOrCreateIndex(baseUrl, redisIndex, queryVector.length, keyPrefix, contentKey, metadataKey, vectorKey);
            let results = await redisFtSearch(baseUrl, redisIndex, queryVector, 10, [contentKey, metadataKey]);
            if (useReranker) {
              results = (await applyReranking(ctx, node.name, query, results)) as Document[];
            }
            return results;
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
        const toolName = resolveStringParam(ctx, "toolName", "redis_vector_store", itemJson);
        const toolDescription = resolveStringParam(ctx, "toolDescription", "", itemJson);
        const topK = resolveNumberParam(ctx, "topK", 4, itemJson);
        const includeDocumentMetadata = resolveBooleanParam(ctx, "includeDocumentMetadata", true, itemJson);
        const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);
        const keyPrefix = resolveStringParam(ctx, "keyPrefix", "doc", itemJson);
        const contentKey = resolveStringParam(ctx, "contentKey", "content", itemJson);
        const metadataKey = resolveStringParam(ctx, "metadataKey", "metadata", itemJson);
        const vectorKey = resolveStringParam(ctx, "vectorKey", "content_vector", itemJson);

        const tool: ToolDescriptor = {
          name: toolName,
          description: toolDescription,
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            await resolveOrCreateIndex(baseUrl, redisIndex, queryVector.length, keyPrefix, contentKey, metadataKey, vectorKey);
            const returnFields = [contentKey];
            if (includeDocumentMetadata) returnFields.push(metadataKey);
            let results = await redisFtSearch(baseUrl, redisIndex, queryVector, topK, returnFields);
            if (useReranker) {
              results = (await applyReranking(ctx, node.name, query, results)) as Document[];
            }
            return results;
          },
          async invoke(input: { query: string }) {
            return this.getRelevantDocuments(input.query);
          },
        };

        outputItems.push({
          json: tool as unknown as Record<string, unknown>,
          pairedItem: { item: itemIndex, input: 0 },
        });
      } else if (mode === "update") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const documentHandle = await validateDocument(ctx, node.name);
        const id = resolveStringParam(ctx, "id", "", itemJson);
        if (!id) {
          throw new Error("ID parameter is required for update mode");
        }

        const documents = await documentHandle.load();
        const texts = documents.map((d) => d.pageContent);
        const embeddings = await embeddingHandle.embedDocuments(texts);

        const contentKey = resolveStringParam(ctx, "contentKey", "content", itemJson);
        const metadataKey = resolveStringParam(ctx, "metadataKey", "metadata", itemJson);
        const vectorKey = resolveStringParam(ctx, "vectorKey", "content_vector", itemJson);

        const fields: Record<string, string> = {};
        if (documents.length > 0) {
          fields[contentKey] = documents[0].pageContent;
          if (Object.keys(documents[0].metadata).length > 0) {
            fields[metadataKey] = JSON.stringify(documents[0].metadata);
          }
          if (embeddings.length > 0) {
            fields[vectorKey] = JSON.stringify(embeddings[0]);
          }
        }

        await redisHset(baseUrl, id, fields);

        outputItems.push({ ...item });
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

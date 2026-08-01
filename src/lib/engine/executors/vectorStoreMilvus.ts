import type { NodeExecutor, ExecutionContext, INodeExecutionData } from "@/sdk";
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

interface RetrieverHandle {
  getRelevantDocuments: (query: string) => Promise<Document[]>;
  invoke?: (input: { query: string }) => Promise<Document[]>;
}

interface MilvusCredentials {
  baseUrl: string;
  username: string;
  password: string;
}

function findConnectedSubNode(
  connections: Record<string, Record<string, Array<Array<{ node: string }> | null> | undefined>>,
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

function resolveMetadataFilter(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
): Array<{ field: string; operator: string; value: unknown }> {
  const raw = ctx.getParam<unknown>("metadataFilter", []);
  if (!Array.isArray(raw)) return [];
  return raw.map((entry: Record<string, unknown>) => {
    let value = entry.value;
    if (typeof value === "string" && (value as string).startsWith("=")) {
      value = ctx.evaluate(value as string, itemJson);
    }
    return {
      field: String(entry.field ?? ""),
      operator: String(entry.operator ?? "eq"),
      value,
    };
  });
}

async function buildMilvusClient(
  ctx: ExecutionContext,
): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  const cred = (await requireCredential(ctx, "milvusApi")) as unknown as MilvusCredentials;
  const baseUrl = cred.baseUrl || "http://localhost:19530";
  const username = cred.username || "root";
  const password = cred.password || "Milvus";
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
  };
}

async function listCollections(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}/v1/vector/collections`,
    method: "GET",
    headers,
  });
  if (res.status >= 200 && res.status < 300) {
    const body = res.body as { data?: Array<{ collection_name?: string }> };
    return (body?.data ?? []).map((c) => c.collection_name ?? "");
  }
  return [];
}

async function collectionExists(
  baseUrl: string,
  headers: Record<string, string>,
  name: string,
): Promise<boolean> {
  const collections = await listCollections(baseUrl, headers);
  return collections.includes(name);
}

async function searchVectors(
  baseUrl: string,
  headers: Record<string, string>,
  collectionName: string,
  vector: number[],
  limit: number,
  filter?: string,
): Promise<Document[]> {
  const body: Record<string, unknown> = {
    collectionName,
    vector,
    limit,
    outputFields: ["*"],
  };
  if (filter) {
    body.filter = filter;
  }
  const res = await sdkHttpRequest({
    url: `${baseUrl}/v1/vector/search`,
    method: "POST",
    headers,
    body,
  });
  if (res.status >= 200 && res.status < 300) {
    const data = res.body as {
      data?: Array<{
        id?: string;
        distance?: number;
        pageContent?: string;
        metadata?: Record<string, unknown>;
        [key: string]: unknown;
      }>;
    };
    return (data?.data ?? []).map((item) => ({
      pageContent: String(item.pageContent ?? item.text ?? ""),
      metadata: (item.metadata as Record<string, unknown>) ?? {},
    }));
  }
  return [];
}

async function insertVectors(
  baseUrl: string,
  headers: Record<string, string>,
  collectionName: string,
  documents: Document[],
  vectors: number[][],
): Promise<void> {
  const fieldsData = documents.map((doc, i) => ({
    pageContent: doc.pageContent,
    metadata: JSON.stringify(doc.metadata ?? {}),
    vector: vectors[i],
  }));
  await sdkHttpRequest({
    url: `${baseUrl}/v1/vector/insert`,
    method: "POST",
    headers,
    body: { collectionName, data: fieldsData },
  });
}

async function deleteAllVectors(
  baseUrl: string,
  headers: Record<string, string>,
  collectionName: string,
): Promise<void> {
  await sdkHttpRequest({
    url: `${baseUrl}/v1/vector/delete`,
    method: "POST",
    headers,
    body: { collectionName, filter: "id != ''" },
  });
}

function buildFilterExpression(
  metadataFilter: Array<{ field: string; operator: string; value: unknown }>,
): string {
  if (metadataFilter.length === 0) return "";
  return metadataFilter
    .map((f) => {
      const val = typeof f.value === "string" ? `"${f.value}"` : String(f.value);
      return `${f.field} ${f.operator} ${val}`;
    })
    .join(" and ");
}

export const vectorStoreMilvusExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "getMany");
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

    try {
      const { baseUrl, headers } = await buildMilvusClient(ctx);
      const milvusCollection = resolveStringParam(ctx, "milvusCollection", "", itemJson);
      if (!milvusCollection) {
        throw new Error("milvusCollection is required");
      }

      if (mode === "getMany") {
        const prompt = resolveStringParam(ctx, "prompt", "", itemJson);
        if (!prompt || prompt.trim() === "") {
          continue;
        }
        const limit = resolveNumberParam(ctx, "limit", 10, itemJson);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);
        const metadataFilter = resolveMetadataFilter(ctx, itemJson);

        const queryVector = await embeddingHandle.embedQuery(prompt);
        const filterExpr = buildFilterExpression(metadataFilter);
        let documents = await searchVectors(baseUrl, headers, milvusCollection, queryVector, limit, filterExpr || undefined);

        if (rerankResults && documents.length > 0) {
          const rerankerSourceName = findConnectedSubNode(connections, node.name, "ai_reranker");
          if (rerankerSourceName) {
            const rerankerHandle = getHandle(ctx, rerankerSourceName) as RerankerHandle | null;
            if (rerankerHandle && typeof rerankerHandle.rerank === "function") {
              documents = await rerankerHandle.rerank(prompt, documents);
            }
          }
        }

        for (const doc of documents) {
          outputItems.push({
            json: { pageContent: doc.pageContent, metadata: doc.metadata ?? {} },
            pairedItem: { item: itemIndex, input: 0 },
          });
        }
      } else if (mode === "insert") {
        const documentSourceName = findConnectedSubNode(connections, node.name, "ai_document");
        if (!documentSourceName) {
          throw new Error("A Document Loader sub-node must be connected");
        }
        const documentHandle = getHandle(ctx, documentSourceName) as DocumentHandle | null;
        if (!documentHandle || typeof documentHandle.load !== "function") {
          throw new Error("A Document Loader sub-node must be connected");
        }

        const clearCollection = resolveBooleanParam(ctx, "clearCollection", false, itemJson);
        const documents = await documentHandle.load();

        if (clearCollection) {
          await deleteAllVectors(baseUrl, headers, milvusCollection);
        }

        const texts = documents.map((d) => d.pageContent);
        const vectors = await embeddingHandle.embedDocuments(texts);
        await insertVectors(baseUrl, headers, milvusCollection, documents, vectors);

        outputItems.push({
          json: { ...itemJson, action: "inserted", documentCount: documents.length },
          pairedItem: { item: itemIndex, input: 0 },
        });
      } else if (mode === "retrieve") {
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);

        let retriever: RetrieverHandle = {
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            return searchVectors(baseUrl, headers, milvusCollection, queryVector, 10);
          },
          async invoke(input: { query: string }) {
            return this.getRelevantDocuments(input.query);
          },
        };

        if (rerankResults) {
          const rerankerSourceName = findConnectedSubNode(connections, node.name, "ai_reranker");
          if (rerankerSourceName) {
            const rerankerHandle = getHandle(ctx, rerankerSourceName) as RerankerHandle | null;
            if (rerankerHandle && typeof rerankerHandle.rerank === "function") {
              const baseRetriever = retriever;
              retriever = {
                async getRelevantDocuments(query: string) {
                  const docs = await baseRetriever.getRelevantDocuments(query);
                  return rerankerHandle.rerank(query, docs);
                },
                async invoke(input: { query: string }) {
                  const docs = await baseRetriever.getRelevantDocuments(input.query);
                  return rerankerHandle.rerank(input.query, docs);
                },
              };
            }
          }
        }

        outputItems.push({
          json: retriever as unknown as Record<string, unknown>,
          pairedItem: { item: itemIndex, input: 0 },
        });
      } else if (mode === "retrieveAsTool") {
        const name = resolveStringParam(ctx, "name", "milvus_vector_store", itemJson);
        const description = resolveStringParam(ctx, "description", "Searches the Milvus vector store for relevant documents.", itemJson);
        const limit = resolveNumberParam(ctx, "limit", 10, itemJson);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);

        let retriever: RetrieverHandle = {
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            return searchVectors(baseUrl, headers, milvusCollection, queryVector, limit);
          },
          async invoke(input: { query: string }) {
            return this.getRelevantDocuments(input.query);
          },
        };

        if (rerankResults) {
          const rerankerSourceName = findConnectedSubNode(connections, node.name, "ai_reranker");
          if (rerankerSourceName) {
            const rerankerHandle = getHandle(ctx, rerankerSourceName) as RerankerHandle | null;
            if (rerankerHandle && typeof rerankerHandle.rerank === "function") {
              const baseRetriever = retriever;
              retriever = {
                async getRelevantDocuments(query: string) {
                  const docs = await baseRetriever.getRelevantDocuments(query);
                  return rerankerHandle.rerank(query, docs);
                },
                async invoke(input: { query: string }) {
                  const docs = await baseRetriever.getRelevantDocuments(input.query);
                  return rerankerHandle.rerank(input.query, docs);
                },
              };
            }
          }
        }

        outputItems.push({
          json: {
            name,
            description,
            retriever,
          } as unknown as Record<string, unknown>,
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
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return [outputItems];
};
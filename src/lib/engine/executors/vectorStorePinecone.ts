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

interface MetadataFilter {
  field: string;
  operator: string;
  value: unknown;
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

function resolveMetadataFilters(
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
): MetadataFilter[] {
  const raw = ctx.getParam<Record<string, unknown>>("metadataFilter", {});
  let entries: unknown[] = [];
  if (typeof raw === "object" && raw !== null && "values" in raw) {
    const v = raw.values;
    if (Array.isArray(v)) entries = v;
  } else if (Array.isArray(raw)) {
    entries = raw;
  }
  return entries.map((f: Record<string, unknown>) => {
    let value = f.value;
    if (typeof value === "string" && (value as string).startsWith("=")) {
      value = ctx.evaluate(value as string, itemJson);
    }
    return {
      field: String(f.field ?? ""),
      operator: String(f.operator ?? "eq"),
      value,
    };
  });
}

/**
 * Build a simple Pinecone-compatible metadata filter object from AND-conjunctive filter entries.
 * Maps to Pinecone's `{ field: { operator: value } }` filter syntax.
 */
function buildMetadataFilter(filters: MetadataFilter[]): Record<string, unknown> | undefined {
  if (filters.length === 0) return undefined;
  const result: Record<string, unknown> = {};
  for (const f of filters) {
    if (!f.field) continue;
    result[f.field] = { [`$${f.operator}`]: f.value };
  }
  return Object.keys(result).length > 0 ? result : undefined;
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

async function resolveDataPlaneHost(
  apiKey: string,
  indexName: string,
): Promise<string> {
  const res = await sdkHttpRequest({
    url: `https://api.pinecone.io/indexes/${encodeURIComponent(indexName)}`,
    method: "GET",
    headers: { "Api-Key": apiKey, "content-type": "application/json" },
  });
  if (res.status === 404) {
    throw new Error(`Pinecone index "${indexName}" not found`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Failed to describe Pinecone index "${indexName}": ${res.status}`);
  }
  const body = res.body as { host?: string };
  if (!body.host) {
    throw new Error(`Pinecone index "${indexName}" has no data-plane host`);
  }
  return body.host;
}

async function pineconeQuery(
  apiKey: string,
  host: string,
  namespace: string | undefined,
  queryVector: number[],
  topK: number,
  filter: Record<string, unknown> | undefined,
): Promise<Document[]> {
  const body: Record<string, unknown> = {
    vector: queryVector,
    topK,
    includeMetadata: true,
    includeValues: false,
  };
  if (namespace) body.namespace = namespace;
  if (filter) body.filter = filter;

  const res = await sdkHttpRequest({
    url: `https://${host}/query`,
    method: "POST",
    headers: { "Api-Key": apiKey, "content-type": "application/json" },
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Pinecone query failed: ${res.status}`);
  }
  const data = res.body as {
    matches?: Array<{
      id?: string;
      score?: number;
      metadata?: Record<string, unknown>;
    }>;
  };
  return (data.matches ?? []).map((m) => ({
    pageContent: String(m.metadata?.text ?? m.metadata?.pageContent ?? ""),
    metadata: m.metadata ?? {},
  }));
}

async function pineconeUpsert(
  apiKey: string,
  host: string,
  namespace: string | undefined,
  vectors: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }>,
): Promise<void> {
  const body: Record<string, unknown> = { vectors };
  if (namespace) body.namespace = namespace;

  const res = await sdkHttpRequest({
    url: `https://${host}/vectors/upsert`,
    method: "POST",
    headers: { "Api-Key": apiKey, "content-type": "application/json" },
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Pinecone upsert failed: ${res.status}`);
  }
}

async function pineconeDeleteAll(
  apiKey: string,
  host: string,
  namespace: string | undefined,
): Promise<void> {
  const body: Record<string, unknown> = { deleteAll: true };
  if (namespace) body.namespace = namespace;

  const res = await sdkHttpRequest({
    url: `https://${host}/vectors/delete`,
    method: "POST",
    headers: { "Api-Key": apiKey, "content-type": "application/json" },
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Pinecone deleteAll failed: ${res.status}`);
  }
}

export const vectorStorePineconeExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "getMany");
  const outputItems: INodeExecutionData[] = [];

  const credential = await requireCredential(ctx, "pineconeApi");
  const apiKey = String(credential.apiKey ?? "");
  if (!apiKey) {
    throw new Error("Pinecone API key is required");
  }

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    const item = inputItems[itemIndex];
    const itemJson = item.json ?? {};

    try {
      const index = resolveStringParam(ctx, "index", "", itemJson);
      const namespace = resolveStringParam(ctx, "namespace", "", itemJson);

      if (!index) {
        throw new Error("Index parameter is required");
      }

      const host = await resolveDataPlaneHost(apiKey, index);

      if (mode === "getMany") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const prompt = resolveStringParam(ctx, "prompt", "", itemJson);
        if (!prompt) {
          continue;
        }
        const limit = resolveNumberParam(ctx, "limit", 10, itemJson);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);
        const filters = resolveMetadataFilters(ctx, itemJson);
        const filterObj = buildMetadataFilter(filters);

        const queryVector = await embeddingHandle.embedQuery(prompt);
        let documents = await pineconeQuery(apiKey, host, namespace, queryVector, limit, filterObj);

        if (rerankResults) {
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
        const clearNamespace = resolveBooleanParam(ctx, "clearNamespace", false, itemJson);

        const documents = await documentHandle.load();

        if (clearNamespace) {
          await pineconeDeleteAll(apiKey, host, namespace);
        }

        const texts = documents.map((d) => d.pageContent);
        const embeddings = await embeddingHandle.embedDocuments(texts);
        const vectors = documents.map((doc, i) => ({
          id: `doc-${itemIndex}-${i}`,
          values: embeddings[i],
          metadata: { text: doc.pageContent, ...doc.metadata } as Record<string, unknown>,
        }));

        await pineconeUpsert(apiKey, host, namespace, vectors);

        outputItems.push({ ...item });
      } else if (mode === "retrieve") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);

        const retriever: VectorRetrieverHandle = {
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            let results = await pineconeQuery(apiKey, host, namespace, queryVector, 10, undefined);
            if (rerankResults) {
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
      } else if (mode === "retrieveAsTool") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const toolName = resolveStringParam(ctx, "name", "pinecone_vector_store", itemJson);
        const toolDescription = resolveStringParam(ctx, "description", "Search the Pinecone vector store for relevant documents.", itemJson);
        const limitTool = resolveNumberParam(ctx, "limit", 10, itemJson);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);

        const tool: ToolDescriptor = {
          name: toolName,
          description: toolDescription,
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            let results = await pineconeQuery(apiKey, host, namespace, queryVector, limitTool, undefined);
            if (rerankResults) {
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

        const vectors = documents.map((doc, i) => ({
          id: i === 0 ? id : `${id}-${i}`,
          values: embeddings[i],
          metadata: { text: doc.pageContent, ...doc.metadata } as Record<string, unknown>,
        }));

        await pineconeUpsert(apiKey, host, namespace, vectors);

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

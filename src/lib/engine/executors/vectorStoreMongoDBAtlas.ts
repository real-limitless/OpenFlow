import type { NodeExecutor, ExecutionContext, INodeExecutionData, IWorkflow } from "@/sdk";
import { requireCredential } from "@/sdk";
import { getMongoClientFactory } from "./mongo-db";

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

function resolveJSONParam(
  ctx: ExecutionContext,
  name: string,
  itemJson: Record<string, unknown>,
): unknown {
  const raw = ctx.getParam<unknown>(name, undefined);
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    if (raw.startsWith("=")) {
      return ctx.evaluate(raw, itemJson);
    }
    if (raw === "") return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
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

async function connectMongo(ctx: ExecutionContext) {
  const credential = await requireCredential(ctx, "mongoDb");
  const factory = getMongoClientFactory();
  if (!factory) {
    throw new Error("MongoDB client factory is not configured");
  }
  const client = await factory(credential);
  return client;
}

interface MongoDoc {
  _id?: unknown;
  pageContent?: string;
  text?: string;
  [key: string]: unknown;
}

export const vectorStoreMongoDBAtlasExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "getMany");
  const outputItems: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    const item = inputItems[itemIndex];
    const itemJson = item.json ?? {};

    try {
      const mongoCollection = resolveStringParam(ctx, "mongoCollection", "", itemJson);
      const vectorIndexName = resolveStringParam(ctx, "vectorIndexName", "", itemJson);
      const embeddingField = resolveStringParam(ctx, "embedding", "", itemJson);
      const metadataField = resolveStringParam(ctx, "metadata_field", "", itemJson);

      if (!mongoCollection || !vectorIndexName || !embeddingField || !metadataField) {
        throw new Error("mongoCollection, vectorIndexName, embedding, and metadata_field parameters are required");
      }

      if (mode === "getMany") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const prompt = resolveStringParam(ctx, "prompt", "", itemJson);
        if (!prompt) {
          throw new Error("Prompt is required for getMany mode");
        }
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);
        const preFilter = resolveJSONParam(ctx, "preFilter", itemJson) as Record<string, unknown> | undefined;
        const postFilterPipeline = resolveJSONParam(ctx, "postFilterPipeline", itemJson) as Record<string, unknown>[] | undefined;

        const queryVector = await embeddingHandle.embedQuery(prompt);
        const client = await connectMongo(ctx);

        try {
          const db = client.db();
          const collection = db.collection(mongoCollection);
          const pipeline: Record<string, unknown>[] = [];

          const vectorSearch: Record<string, unknown> = {
            index: vectorIndexName,
            queryVector,
            path: embeddingField,
            numCandidates: 100,
            limit: 10,
          };

          if (preFilter && typeof preFilter === "object" && Object.keys(preFilter).length > 0) {
            vectorSearch.filter = preFilter;
          }

          pipeline.push({ $vectorSearch: vectorSearch });

          if (postFilterPipeline && Array.isArray(postFilterPipeline) && postFilterPipeline.length > 0) {
            for (const stage of postFilterPipeline) {
              pipeline.push(stage as Record<string, unknown>);
            }
          }

          const rawResults = await collection.aggregate(pipeline) as MongoDoc[];

          let documents: Document[] = rawResults.map((doc) => ({
            pageContent: String(doc.pageContent ?? doc.text ?? ""),
            metadata: (doc[metadataField] as Record<string, unknown>) ?? {},
          }));

          if (rerankResults) {
            documents = (await applyReranking(ctx, node.name, prompt, documents)) as Document[];
          }

          for (const doc of documents) {
            outputItems.push({
              json: { pageContent: doc.pageContent, metadata: doc.metadata ?? {} },
              pairedItem: { item: itemIndex, input: 0 },
            });
          }
        } finally {
          await client.close();
        }
      } else if (mode === "insert") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const documentHandle = await validateDocument(ctx, node.name);

        const documents = await documentHandle.load();
        const texts = documents.map((d) => d.pageContent);
        const embeddings = await embeddingHandle.embedDocuments(texts);

        const client = await connectMongo(ctx);

        try {
          const db = client.db();
          const collection = db.collection(mongoCollection);

          const mongoDocs = documents.map((doc, i) => ({
            text: doc.pageContent,
            [embeddingField]: embeddings[i],
            [metadataField]: doc.metadata ?? {},
          }));

          await collection.insertMany(mongoDocs);

          outputItems.push({ ...item });
        } finally {
          await client.close();
        }
      } else if (mode === "retrieve") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);

        const client = await connectMongo(ctx);

        const retriever: VectorRetrieverHandle = {
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            const pipeline: Record<string, unknown>[] = [
              {
                $vectorSearch: {
                  index: vectorIndexName,
                  queryVector,
                  path: embeddingField,
                  numCandidates: 100,
                  limit: 10,
                },
              },
            ];

            const rawResults = await client.db().collection(mongoCollection).aggregate(pipeline) as MongoDoc[];

            let results: Document[] = rawResults.map((doc) => ({
              pageContent: String(doc.pageContent ?? doc.text ?? ""),
              metadata: (doc[metadataField] as Record<string, unknown>) ?? {},
            }));

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
        const toolName = resolveStringParam(ctx, "name", "mongodb_atlas_vector_store", itemJson);
        const toolDescription = resolveStringParam(ctx, "description", "Search the MongoDB Atlas vector store for relevant documents.", itemJson);
        const limitTool = resolveNumberParam(ctx, "limit", 10, itemJson);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);
        const preFilter = resolveJSONParam(ctx, "preFilter", itemJson) as Record<string, unknown> | undefined;
        const postFilterPipeline = resolveJSONParam(ctx, "postFilterPipeline", itemJson) as Record<string, unknown>[] | undefined;

        const client = await connectMongo(ctx);

        const tool: ToolDescriptor = {
          name: toolName,
          description: toolDescription,
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            const pipeline: Record<string, unknown>[] = [];

            const vectorSearch: Record<string, unknown> = {
              index: vectorIndexName,
              queryVector,
              path: embeddingField,
              numCandidates: Math.min(limitTool * 10, 100),
              limit: limitTool,
            };

            if (preFilter && typeof preFilter === "object" && Object.keys(preFilter).length > 0) {
              vectorSearch.filter = preFilter;
            }

            pipeline.push({ $vectorSearch: vectorSearch });

            if (postFilterPipeline && Array.isArray(postFilterPipeline) && postFilterPipeline.length > 0) {
              for (const stage of postFilterPipeline) {
                pipeline.push(stage as Record<string, unknown>);
              }
            }

            const rawResults = await client.db().collection(mongoCollection).aggregate(pipeline) as MongoDoc[];

            let results: Document[] = rawResults.map((doc) => ({
              pageContent: String(doc.pageContent ?? doc.text ?? ""),
              metadata: (doc[metadataField] as Record<string, unknown>) ?? {},
            }));

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

import type { NodeExecutor, ExecutionContext, INodeExecutionData, IWorkflow } from "@/sdk";
import { requireCredential } from "@/sdk";

interface PostgresClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  end(): Promise<void>;
}

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

let clientFactory: ((credentials: Record<string, unknown>) => Promise<PostgresClient>) | null = null;

export function setPgvectorClientFactory(
  factory: ((credentials: Record<string, unknown>) => Promise<PostgresClient>) | null,
): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY = async (credentials: Record<string, unknown>): Promise<PostgresClient> => {
  const { default: pg } = await import("pg");
  const Client = pg.Client;
  const sslMode = String(credentials.ssl ?? "disable");
  const ssl =
    sslMode === "disable" || sslMode === "false"
      ? undefined
      : sslMode === "require" || sslMode === "allow"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true };

  const client = new Client({
    host: String(credentials.host ?? "localhost"),
    port: Number(credentials.port ?? 5432),
    user: String(credentials.user ?? "postgres"),
    password: String(credentials.password ?? ""),
    database: String(credentials.database ?? "postgres"),
    ssl,
  });
  await client.connect();

  return {
    async query(sql, params) {
      const result = await client.query(sql, params);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount };
    },
    async end() {
      await client.end();
    },
  };
};

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
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

function resolveOptionsParam(
  ctx: ExecutionContext,
  name: string,
  defaultValue: Record<string, unknown>,
  itemJson: Record<string, unknown>,
): Record<string, unknown> {
  const raw = ctx.getParam<Record<string, unknown>>(name, defaultValue);
  if (typeof raw === "object" && raw !== null) {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v.startsWith("=")) {
        resolved[k] = ctx.evaluate(v, itemJson);
      } else {
        resolved[k] = v;
      }
    }
    return resolved;
  }
  return defaultValue;
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

function applyReranking(
  ctx: ExecutionContext,
  nodeName: string,
  query: string,
  documents: Document[],
): Promise<Document[]> | Document[] {
  const rerankerSourceName = findConnectedSubNode(ctx.getWorkflow().connections, nodeName, "ai_reranker");
  if (rerankerSourceName) {
    const rerankerHandle = getHandle(ctx, rerankerSourceName) as RerankerHandle | null;
    if (rerankerHandle && typeof rerankerHandle.rerank === "function") {
      return rerankerHandle.rerank(query, documents);
    }
  }
  return documents;
}

async function connectAndGetClient(ctx: ExecutionContext): Promise<PostgresClient> {
  const cred = await requireCredential(ctx, "postgres");
  const factory = clientFactory ?? DEFAULT_FACTORY;
  return factory(cred as Record<string, unknown>);
}

async function ensureExtension(client: PostgresClient): Promise<void> {
  await client.query('CREATE EXTENSION IF NOT EXISTS vector');
}

async function ensureTable(
  client: PostgresClient,
  tableName: string,
  idCol: string,
  vectorCol: string,
  contentCol: string,
  metadataCol: string,
  dimension: number,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (
      ${quoteIdent(idCol)} SERIAL PRIMARY KEY,
      ${quoteIdent(vectorCol)} vector(${dimension}),
      ${quoteIdent(contentCol)} TEXT,
      ${quoteIdent(metadataCol)} JSONB DEFAULT '{}'::jsonb
    )
  `);
}

async function ensureCollectionTable(
  client: PostgresClient,
  tableName: string,
): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (
      id SERIAL PRIMARY KEY,
      collection_id TEXT,
      vector_store_id INTEGER
    )
  `);
}

function parseCollectionOptions(
  options: Record<string, unknown>,
): { useCollection: boolean; collectionName: string; collectionTableName: string } {
  const collectionRaw = (
    options.collection as Record<string, unknown> | undefined
  )?.values as Record<string, unknown> | undefined;
  return {
    useCollection: Boolean(collectionRaw?.useCollection ?? false),
    collectionName: String(collectionRaw?.collectionName ?? "n8n"),
    collectionTableName: String(collectionRaw?.collectionTableName ?? "n8n_vector_collections"),
  };
}

function parseColumnNames(
  options: Record<string, unknown>,
  defaults: { id: string; vector: string; content: string; metadata: string },
): { idColumnName: string; vectorColumnName: string; contentColumnName: string; metadataColumnName: string } {
  const columnNamesRaw = (
    options.columnNames as Record<string, unknown> | undefined
  )?.values as Record<string, unknown> | undefined;
  return {
    idColumnName: String(columnNamesRaw?.idColumnName ?? defaults.id),
    vectorColumnName: String(columnNamesRaw?.vectorColumnName ?? defaults.vector),
    contentColumnName: String(columnNamesRaw?.contentColumnName ?? defaults.content),
    metadataColumnName: String(columnNamesRaw?.metadataColumnName ?? defaults.metadata),
  };
}

function parseMetadataFilter(
  options: Record<string, unknown>,
  itemJson: Record<string, unknown>,
  ctx: ExecutionContext,
): Record<string, unknown> | undefined {
  const metadataRaw = options.metadata as Record<string, unknown> | undefined;
  if (metadataRaw?.metadataValues && Array.isArray(metadataRaw.metadataValues)) {
    const filter: Record<string, unknown> = {};
    for (const f of metadataRaw.metadataValues as Array<Record<string, string>>) {
      const name = f.name;
      const value = f.value?.startsWith("=") ? ctx.evaluate(f.value, itemJson) : f.value;
      if (name) filter[name] = value;
    }
    return Object.keys(filter).length > 0 ? filter : undefined;
  }
  return undefined;
}

const DISTANCE_OP: Record<string, string> = {
  cosine: "<=>",
  innerProduct: "<#>",
  euclidean: "<->",
};

async function similaritySearch(
  client: PostgresClient,
  tableName: string,
  queryVector: number[],
  topK: number,
  distanceStrategy: string,
  col: { vector: string; content: string; metadata: string },
  metadataFilter?: Record<string, unknown>,
  collectionInfo?: { collectionName: string; collectionTableName: string },
): Promise<Array<Record<string, unknown>>> {
  const op = DISTANCE_OP[distanceStrategy] ?? "<=>";
  const vectorLit = `[${queryVector.join(",")}]`;
  const idCol = quoteIdent(col.vector === "embedding" ? "id" : "id");
  const vectorCol = quoteIdent(col.vector);
  const contentCol = quoteIdent(col.content);
  const metadataCol = quoteIdent(col.metadata);
  const table = quoteIdent(tableName);

  let sql = `SELECT ${contentCol} AS text, ${metadataCol} AS metadata, ${vectorCol} ${op} '${vectorLit}'::vector AS distance FROM ${table}`;
  const params: unknown[] = [];

  if (collectionInfo) {
    const ct = quoteIdent(collectionInfo.collectionTableName);
    sql = `SELECT t.${contentCol} AS text, t.${metadataCol} AS metadata, t.${vectorCol} ${op} '${vectorLit}'::vector AS distance FROM ${table} t INNER JOIN ${ct} c ON t.id = c.vector_store_id WHERE c.collection_id = $1`;
    params.push(collectionInfo.collectionName);
  }
  sql += ` ORDER BY ${vectorCol} ${op} '${vectorLit}'::vector`;
  sql += ` LIMIT ${topK}`;

  const result = await client.query(sql, params);

  const rows = result.rows.map((row) => {
    const meta = row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata as string) : row.metadata) as Record<string, unknown> : {};
    return {
      text: String(row.text ?? ""),
      metadata: meta,
      similarity: Number(row.distance ?? 0),
    };
  });

  if (metadataFilter && Object.keys(metadataFilter).length > 0) {
    return rows.filter((row) => {
      for (const [k, v] of Object.entries(metadataFilter)) {
        if (row.metadata[k] !== v) return false;
      }
      return true;
    });
  }

  return rows;
}

export const vectorStorePGVectorExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "retrieve");
  const outputItems: INodeExecutionData[] = [];

  if (mode === "load" || mode === "insert") {
    await validateEmbedding(ctx, node.name);
  }
  if (mode === "insert") {
    await validateDocument(ctx, node.name);
  }

  const client = await connectAndGetClient(ctx);

  try {
    for (let itemIndex = 0; itemIndex < (mode === "retrieve" || mode === "retrieve-as-tool" ? 1 : inputItems.length); itemIndex++) {
      const item = inputItems[Math.min(itemIndex, inputItems.length - 1)] ?? { json: {} };
      const itemJson = item.json ?? {};

      try {
        const tableName = resolveStringParam(ctx, "tableName", "n8n_vectors", itemJson);
        const optionsRaw = resolveOptionsParam(ctx, "options", {}, itemJson);
        const distanceStrategy = String(optionsRaw.distanceStrategy ?? "cosine");

        const { useCollection, collectionName, collectionTableName } = parseCollectionOptions(optionsRaw);
        const { idColumnName, vectorColumnName, contentColumnName, metadataColumnName } = parseColumnNames(optionsRaw, {
          id: "id", vector: "embedding", content: "text", metadata: "metadata",
        });

        if (mode === "load") {
          const embeddingHandle = await validateEmbedding(ctx, node.name);
          const prompt = resolveStringParam(ctx, "prompt", "", itemJson);
          if (!prompt) continue;

          const topK = resolveNumberParam(ctx, "topK", 4, itemJson);
          const includeDocumentMetadata = resolveBooleanParam(ctx, "includeDocumentMetadata", true, itemJson);
          const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);

          await ensureExtension(client);
          const queryVector = await embeddingHandle.embedQuery(prompt);
          const collectionInfo = useCollection ? { collectionName, collectionTableName } : undefined;
          const metadataFilter = parseMetadataFilter(optionsRaw, itemJson, ctx);

          const results = await similaritySearch(
            client, tableName, queryVector, topK, distanceStrategy,
            { vector: vectorColumnName, content: contentColumnName, metadata: metadataColumnName },
            metadataFilter, collectionInfo,
          );

          let documents: Document[] = results.map((row) => ({
            pageContent: row.text,
            metadata: row.metadata,
            similarity: row.similarity,
          }));

          if (useReranker) {
            documents = (await applyReranking(ctx, node.name, prompt, documents)) as Document[];
          }

          for (const doc of documents) {
            const entry: Record<string, unknown> = {
              pageContent: doc.pageContent,
              similarity: (doc as Document & { similarity?: number }).similarity ?? 0,
            };
            if (includeDocumentMetadata) {
              entry.metadata = doc.metadata ?? {};
            }
            outputItems.push({
              json: entry,
              pairedItem: { item: itemIndex, input: 0 },
            });
          }
        } else if (mode === "insert") {
          const embeddingHandle = await validateEmbedding(ctx, node.name);
          const documentHandle = await validateDocument(ctx, node.name);
          const embeddingBatchSize = resolveNumberParam(ctx, "embeddingBatchSize", 200, itemJson);

          const documents = await documentHandle.load();
          const texts = documents.map((d) => d.pageContent);

          await ensureExtension(client);

          if (texts.length > 0) {
            const firstVec = await embeddingHandle.embedDocuments([texts[0]]);
            const dim = firstVec[0].length;
            await ensureTable(client, tableName, idColumnName, vectorColumnName, contentColumnName, metadataColumnName, dim);
          }

          if (useCollection) {
            await ensureCollectionTable(client, collectionTableName);
          }

          for (let i = 0; i < texts.length; i += embeddingBatchSize) {
            const batchTexts = texts.slice(i, i + embeddingBatchSize);
            const batchDocs = documents.slice(i, i + embeddingBatchSize);
            const embeddings = await embeddingHandle.embedDocuments(batchTexts);

            for (let j = 0; j < batchDocs.length; j++) {
              const doc = batchDocs[j];
              const emb = embeddings[j];
              const meta = { ...(doc.metadata ?? {}) };
              const insertResult = await client.query(
                `INSERT INTO ${quoteIdent(tableName)} (${quoteIdent(contentColumnName)}, ${quoteIdent(metadataColumnName)}, ${quoteIdent(vectorColumnName)})
                 VALUES ($1, $2::jsonb, $3::vector)
                 ON CONFLICT (${quoteIdent(idColumnName)}) DO UPDATE SET
                   ${quoteIdent(contentColumnName)} = EXCLUDED.${quoteIdent(contentColumnName)},
                   ${quoteIdent(metadataColumnName)} = EXCLUDED.${quoteIdent(metadataColumnName)},
                   ${quoteIdent(vectorColumnName)} = EXCLUDED.${quoteIdent(vectorColumnName)}
                 RETURNING ${quoteIdent(idColumnName)}`,
                [doc.pageContent, JSON.stringify(meta), `[${emb.join(",")}]`],
              );
              if (useCollection && insertResult.rows.length > 0) {
                const vectorStoreId = insertResult.rows[0][idColumnName] as number;
                await client.query(
                  `INSERT INTO ${quoteIdent(collectionTableName)} (collection_id, vector_store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                  [collectionName, vectorStoreId],
                );
              }
            }
          }

          outputItems.push({ ...item, pairedItem: { item: itemIndex, input: 0 } });
        } else if (mode === "retrieve") {
          const embeddingHandle = await validateEmbedding(ctx, node.name);
          const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);

          const retriever: VectorRetrieverHandle = {
            getRelevantDocuments: async (query: string) => {
              const queryVector = await embeddingHandle.embedQuery(query);
              const results = await similaritySearch(
                client, tableName, queryVector, 10, distanceStrategy,
                { vector: vectorColumnName, content: contentColumnName, metadata: metadataColumnName },
                undefined, useCollection ? { collectionName, collectionTableName } : undefined,
              );
              let documents: Document[] = results.map((row) => ({
                pageContent: row.text,
                metadata: row.metadata,
              }));
              if (useReranker) {
                documents = (await applyReranking(ctx, node.name, query, documents)) as Document[];
              }
              return documents;
            },
            invoke: async (input: { query: string }) => retriever.getRelevantDocuments(input.query),
          };

          outputItems.push({
            json: retriever as unknown as Record<string, unknown>,
            pairedItem: { item: 0, input: 0 },
          });
        } else if (mode === "retrieve-as-tool") {
          const embeddingHandle = await validateEmbedding(ctx, node.name);
          const toolName = resolveStringParam(ctx, "toolName", "pgvector_vector_store", itemJson);
          const toolDescription = resolveStringParam(ctx, "toolDescription", "Search the PGVector store for relevant documents.", itemJson);
          const topK = resolveNumberParam(ctx, "topK", 4, itemJson);
          const includeDocumentMetadata = resolveBooleanParam(ctx, "includeDocumentMetadata", true, itemJson);
          const useReranker = resolveBooleanParam(ctx, "useReranker", false, itemJson);

          const tool: ToolDescriptor = {
            name: toolName,
            description: toolDescription,
            getRelevantDocuments: async (query: string) => {
              const queryVector = await embeddingHandle.embedQuery(query);
              const results = await similaritySearch(
                client, tableName, queryVector, topK, distanceStrategy,
                { vector: vectorColumnName, content: contentColumnName, metadata: metadataColumnName },
                undefined, useCollection ? { collectionName, collectionTableName } : undefined,
              );
              let documents: Document[] = results.map((row) => ({
                pageContent: row.text,
                metadata: includeDocumentMetadata ? row.metadata : {},
              }));
              if (useReranker) {
                documents = (await applyReranking(ctx, node.name, query, documents)) as Document[];
              }
              return documents;
            },
            invoke: async (input: { query: string }) => tool.getRelevantDocuments(input.query),
          };

          outputItems.push({
            json: tool as unknown as Record<string, unknown>,
            pairedItem: { item: 0, input: 0 },
          });
        } else {
          throw new Error(`Unknown mode: ${mode}`);
        }
      } catch (error) {
        if (!ctx.continueOnFail()) throw error;
        outputItems.push({
          json: { error: error instanceof Error ? error.message : String(error) },
          pairedItem: { item: itemIndex, input: 0 },
        });
      }
    }
  } finally {
    await client.end().catch(() => {});
  }

  return [outputItems];
};

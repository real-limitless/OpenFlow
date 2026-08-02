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

interface SupabaseCredential {
  host: string;
  secretKey: string;
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

function buildSupabaseHeaders(cred: SupabaseCredential): Record<string, string> {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "apiKey": cred.secretKey,
    "Authorization": `Bearer ${cred.secretKey}`,
  };
}

async function supabaseRpc(
  cred: SupabaseCredential,
  functionName: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `https://${cred.host}/rest/v1/rpc/${encodeURIComponent(functionName)}`;
  const res = await sdkHttpRequest({
    url,
    method: "POST",
    headers: buildSupabaseHeaders(cred),
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Supabase RPC failed: ${res.status}`);
  }
  return res.body;
}

async function supabaseInsert(
  cred: SupabaseCredential,
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const url = `https://${cred.host}/rest/v1/${encodeURIComponent(tableName)}`;
  const res = await sdkHttpRequest({
    url,
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(cred),
      Prefer: "return=minimal",
    },
    body: rows,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Supabase insert failed: ${res.status}`);
  }
}

async function supabaseUpdate(
  cred: SupabaseCredential,
  tableName: string,
  id: string,
  row: Record<string, unknown>,
): Promise<void> {
  const url = `https://${cred.host}/rest/v1/${encodeURIComponent(tableName)}?id=eq.${encodeURIComponent(id)}`;
  const res = await sdkHttpRequest({
    url,
    method: "PATCH",
    headers: buildSupabaseHeaders(cred),
    body: row,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Supabase update failed: ${res.status}`);
  }
}

async function resolveCredential(ctx: ExecutionContext): Promise<SupabaseCredential> {
  const cred = await requireCredential(ctx, "supabaseApi");
  const host = String(cred.host ?? "");
  const secretKey = String(cred.secretKey ?? "");
  if (!host || !secretKey) {
    throw new Error("Supabase credential missing host or secretKey");
  }
  return { host, secretKey };
}

export const vectorStoreSupabaseExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "getMany");
  const outputItems: INodeExecutionData[] = [];

  const credential = await resolveCredential(ctx);

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    const item = inputItems[itemIndex];
    const itemJson = item.json ?? {};

    try {
      const tableName = resolveStringParam(ctx, "tableName", "", itemJson);
      if (!tableName) {
        throw new Error("tableName parameter is required");
      }
      const queryName = resolveStringParam(ctx, "queryName", "match_documents", itemJson);

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
        const rpcResult = await supabaseRpc(credential, queryName, {
          query_embedding: queryVector,
          match_count: limit,
          filter: filterObj ?? {},
          match_threshold: 0,
        }) as Array<Record<string, unknown>>;

        let documents: Document[] = (Array.isArray(rpcResult) ? rpcResult : []).map((row) => ({
          pageContent: String(row.content ?? row.pageContent ?? ""),
          metadata: (row.metadata as Record<string, unknown>) ?? {},
          similarity: Number(row.similarity ?? row.score ?? 0),
        }));

        if (rerankResults) {
          documents = (await applyReranking(ctx, node.name, prompt, documents)) as Document[];
        }

        for (const doc of documents) {
          outputItems.push({
            json: {
              pageContent: doc.pageContent,
              metadata: doc.metadata ?? {},
              similarity: (doc as Document & { similarity?: number }).similarity ?? 0,
            },
            pairedItem: { item: itemIndex, input: 0 },
          });
        }
      } else if (mode === "insert") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const documentHandle = await validateDocument(ctx, node.name);
        const documents = await documentHandle.load();
        const texts = documents.map((d) => d.pageContent);
        const embeddings = await embeddingHandle.embedDocuments(texts);
        const rows = documents.map((doc, i) => ({
          content: doc.pageContent,
          metadata: doc.metadata ?? {},
          embedding: embeddings[i],
        }));
        await supabaseInsert(credential, tableName, rows);
        outputItems.push({ ...item });
      } else if (mode === "retrieve") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);

        const retriever: VectorRetrieverHandle = {
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            const rpcResult = await supabaseRpc(credential, queryName, {
              query_embedding: queryVector,
              match_count: 10,
              filter: {},
              match_threshold: 0,
            }) as Array<Record<string, unknown>>;
            let results: Document[] = (Array.isArray(rpcResult) ? rpcResult : []).map((row) => ({
              pageContent: String(row.content ?? row.pageContent ?? ""),
              metadata: (row.metadata as Record<string, unknown>) ?? {},
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
        const toolName = resolveStringParam(ctx, "name", "supabase_vector_store", itemJson);
        const toolDescription = resolveStringParam(ctx, "description", "Search the Supabase vector store for relevant documents.", itemJson);
        const limitTool = resolveNumberParam(ctx, "limit", 10, itemJson);
        const rerankResults = resolveBooleanParam(ctx, "rerankResults", false, itemJson);

        const tool: ToolDescriptor = {
          name: toolName,
          description: toolDescription,
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            const rpcResult = await supabaseRpc(credential, queryName, {
              query_embedding: queryVector,
              match_count: limitTool,
              filter: {},
              match_threshold: 0,
            }) as Array<Record<string, unknown>>;
            let results: Document[] = (Array.isArray(rpcResult) ? rpcResult : []).map((row) => ({
              pageContent: String(row.content ?? row.pageContent ?? ""),
              metadata: (row.metadata as Record<string, unknown>) ?? {},
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
        const row = {
          content: documents[0].pageContent,
          metadata: documents[0].metadata ?? {},
          embedding: embeddings[0],
        };
        await supabaseUpdate(credential, tableName, id, row);
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

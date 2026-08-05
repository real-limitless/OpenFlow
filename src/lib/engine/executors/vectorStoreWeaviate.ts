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

interface WeaviateCredential {
  connection_type?: string;
  weaviate_cloud_endpoint?: string;
  weaviate_api_key?: string;
  custom_connection_http_host?: string;
  custom_connection_http_port?: number;
  custom_connection_http_secure?: boolean;
  custom_connection_grpc_host?: string;
  custom_connection_grpc_port?: number;
  custom_connection_grpc_secure?: boolean;
}

function getWeaviateHttpEndpoint(cred: WeaviateCredential): string {
  if (cred.connection_type === "custom_connection" || !cred.connection_type) {
    const host = cred.custom_connection_http_host ?? "weaviate";
    const port = cred.custom_connection_http_port ?? 8080;
    const secure = cred.custom_connection_http_secure ?? false;
    const protocol = secure ? "https" : "http";
    return `${protocol}://${host}:${port}`;
  }
  const endpoint = cred.weaviate_cloud_endpoint ?? "";
  return endpoint.replace(/\/+$/, "");
}

function weaviateHeaders(cred: WeaviateCredential): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cred.weaviate_api_key ?? ""}`,
  };
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

function resolveOptionsParam<T>(
  ctx: ExecutionContext,
  key: string,
  defaultValue: T,
  itemJson: Record<string, unknown>,
): T {
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  if (typeof options !== "object" || options === null) return defaultValue;
  const raw = options[key];
  if (raw === undefined || raw === null) {
    const topLevel = ctx.getParam<unknown>(key, defaultValue);
    return topLevel as T;
  }
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

async function weaviateGraphQLQuery(
  baseUrl: string,
  headers: Record<string, string>,
  query: string,
): Promise<unknown> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}/v1/graphql`,
    method: "POST",
    headers,
    body: { query },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Weaviate GraphQL query failed: ${res.status}`);
  }
  const data = res.body as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };
  if (data.errors && data.errors.length > 0) {
    throw new Error(`Weaviate query error: ${data.errors[0].message}`);
  }
  return data.data;
}

async function weaviateGet(
  baseUrl: string,
  headers: Record<string, string>,
  path: string,
): Promise<unknown> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}${path}`,
    method: "GET",
    headers,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Weaviate GET ${path} failed: ${res.status}`);
  }
  return res.body;
}

async function weaviateDeleteAll(
  baseUrl: string,
  headers: Record<string, string>,
  collection: string,
  tenantName?: string,
): Promise<void> {
  if (tenantName) {
    const res = await sdkHttpRequest({
      url: `${baseUrl}/v1/schema/${encodeURIComponent(collection)}/tenants/${encodeURIComponent(tenantName)}/objects`,
      method: "DELETE",
      headers,
      body: { where: { path: ["id"], operator: "Like", valueString: "*" } },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Weaviate delete tenant objects failed: ${res.status}`);
    }
  } else {
    const res = await sdkHttpRequest({
      url: `${baseUrl}/v1/objects/${encodeURIComponent(collection)}`,
      method: "DELETE",
      headers,
      body: { where: { path: ["id"], operator: "Like", valueString: "*" } },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Weaviate delete all objects failed: ${res.status}`);
    }
  }
}

async function weaviateBatchCreate(
  baseUrl: string,
  headers: Record<string, string>,
  objects: Array<Record<string, unknown>>,
): Promise<void> {
  const res = await sdkHttpRequest({
    url: `${baseUrl}/v1/batch/objects`,
    method: "POST",
    headers,
    body: { objects },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Weaviate batch create failed: ${res.status}`);
  }
}

function buildSearchQuery(
  collection: string,
  queryVector: number[],
  topK: number,
  textKey: string,
  metadataKeys: string[],
  filterObj: Record<string, unknown> | undefined,
  hybrid: Record<string, unknown> | undefined,
  tenantName: string | undefined,
): string {
  const fields = [...metadataKeys];
  if (!fields.includes(textKey)) {
    fields.unshift(textKey);
  }

  let whereClause = "";
  if (filterObj && typeof filterObj === "object") {
    whereClause = `where: ${JSON.stringify(filterObj).replace(/"([^"]+)":/g, "$1:")}`;
  }

  let nearVectorClause = `nearVector: { vector: [${queryVector.join(",")}] }`;
  let limitClause = `limit: ${topK}`;

  let hybridClause = "";
  if (hybrid) {
    const hybridParts: string[] = [];
    const queryText = hybrid.hybridQueryText;
    if (queryText) {
      hybridParts.push(`query: ${JSON.stringify(queryText)}`);
    }
    const alpha = hybrid.hybridAlpha;
    if (alpha !== undefined && alpha !== null) {
      hybridParts.push(`alpha: ${alpha}`);
    }
    const fusionType = hybrid.hybridFusionType;
    if (fusionType) {
      hybridParts.push(`fusionType: ${fusionType}`);
    }
    const autocut = hybrid.hybridAutocut;
    if (autocut !== undefined && autocut !== null) {
      hybridParts.push(`autocut: ${autocut}`);
    }
    const properties = hybrid.hybridQueryProperties;
    if (properties) {
      hybridParts.push(`properties: ${JSON.stringify(properties)}`);
    }
    const maxVectorDistance = hybrid.hybridMaxVectorDistance;
    if (maxVectorDistance !== undefined && maxVectorDistance !== null) {
      hybridParts.push(`maxVectorDistance: ${maxVectorDistance}`);
    }
    const explainScore = hybrid.hybridExplainScore;
    if (explainScore) {
      hybridParts.push("explainScore: true");
    }
    if (hybridParts.length > 0) {
      hybridClause = `hybrid: { ${hybridParts.join(", ")} }`;
    }
  }

  const tenantClause = tenantName ? `tenant: ${JSON.stringify(tenantName)}` : "";

  const clauses = [
    hybridClause || nearVectorClause,
    limitClause,
    whereClause,
    tenantClause,
  ].filter(Boolean).join(", ");

  return `{ Get { ${collection}( ${clauses} ) { ${fields.join(" ")} } } }`;
}

function buildInsertObjects(
  documents: Document[],
  vectors: number[][],
  collection: string,
  textKey: string,
  tenantName?: string,
): Array<Record<string, unknown>> {
  return documents.map((doc, i) => {
    const obj: Record<string, unknown> = {
      class: collection,
      vector: vectors[i],
      properties: {
        [textKey]: doc.pageContent,
        ...doc.metadata,
      },
    };
    if (tenantName) {
      obj.tenant = tenantName;
    }
    return obj;
  });
}

export const vectorStoreWeaviateExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getInputItems(0);
  const mode = ctx.getParam<string>("mode", "retrieve");
  const outputItems: INodeExecutionData[] = [];

  const credential = await requireCredential(ctx, "weaviateApi");
  const weaviateCred = credential as unknown as WeaviateCredential;
  const baseUrl = getWeaviateHttpEndpoint(weaviateCred);
  const headers = weaviateHeaders(weaviateCred);

  for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
    const item = inputItems[itemIndex];
    const itemJson = item.json ?? {};

    try {
      const weaviateCollection = resolveStringParam(ctx, "weaviateCollection", "", itemJson);
      if (!weaviateCollection) {
        throw new Error("Weaviate Collection Name is required");
      }

      const textKey = resolveOptionsParam(ctx, "textKey", "text", itemJson) as string;
      const metadataKeys = resolveOptionsParam(ctx, "metadataKeys", "source,page", itemJson) as string;
      const metadataKeyList = metadataKeys.split(",").map((s) => s.trim()).filter(Boolean);
      const tenantName = resolveOptionsParam(ctx, "tenantName", "", itemJson) as string || undefined;
      const useReranker = resolveOptionsParam(ctx, "useReranker", false, itemJson) as boolean;
      const clearData = resolveOptionsParam(ctx, "clearData", false, itemJson) as boolean;
      const embeddingBatchSize = resolveOptionsParam(ctx, "embeddingBatchSize", 200, itemJson) as number;
      const searchFilterRaw = resolveOptionsParam(ctx, "searchFilterJson", undefined, itemJson);
      const searchFilterObj = searchFilterRaw && typeof searchFilterRaw === "object"
        ? (searchFilterRaw as Record<string, unknown>)
        : undefined;
      const hybridRaw = resolveOptionsParam(ctx, "hybrid", undefined, itemJson);
      const hybridObj = hybridRaw && typeof hybridRaw === "object"
        ? (hybridRaw as Record<string, unknown>)
        : undefined;
      const includeMetadata = resolveOptionsParam(ctx, "includeDocumentMetadata", true, itemJson) as boolean;

      if (mode === "load") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);
        const prompt = resolveStringParam(ctx, "prompt", "", itemJson);
        if (!prompt) {
          continue;
        }
        const topK = resolveNumberParam(ctx, "topK", 4, itemJson);
        const queryVector = await embeddingHandle.embedQuery(prompt);
        const gqlQuery = buildSearchQuery(
          weaviateCollection,
          queryVector,
          topK,
          textKey,
          includeMetadata ? metadataKeyList : [],
          searchFilterObj,
          hybridObj,
          tenantName,
        );
        const resultData = await weaviateGraphQLQuery(baseUrl, headers, gqlQuery) as Record<string, unknown>;
        const getResult = resultData?.Get as Record<string, unknown> | undefined;
        const items = getResult?.[weaviateCollection] as Array<Record<string, unknown>> | undefined ?? [];

        let documents: Document[] = items.map((obj: Record<string, unknown>) => {
          const meta: Record<string, unknown> = {};
          for (const key of includeMetadata ? metadataKeyList : []) {
            if (key in obj) {
              meta[key] = obj[key];
            }
          }
          return {
            pageContent: String(obj[textKey] ?? ""),
            metadata: meta,
          };
        });

        if (useReranker) {
          documents = await applyReranking(ctx, node.name, prompt, documents) as Document[];
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

        const documents = await documentHandle.load();

        if (clearData) {
          await weaviateDeleteAll(baseUrl, headers, weaviateCollection, tenantName);
        }

        for (let i = 0; i < documents.length; i += embeddingBatchSize) {
          const batch = documents.slice(i, i + embeddingBatchSize);
          const texts = batch.map((d) => d.pageContent);
          const embeddings = await embeddingHandle.embedDocuments(texts);
          const objects = buildInsertObjects(batch, embeddings, weaviateCollection, textKey, tenantName);
          await weaviateBatchCreate(baseUrl, headers, objects);
        }

        outputItems.push({ ...item });
      } else if (mode === "retrieve") {
        const embeddingHandle = await validateEmbedding(ctx, node.name);

        const retriever: VectorRetrieverHandle = {
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            const gqlQuery = buildSearchQuery(
              weaviateCollection,
              queryVector,
              10,
              textKey,
              includeMetadata ? metadataKeyList : [],
              searchFilterObj,
              hybridObj,
              tenantName,
            );
            const resultData = await weaviateGraphQLQuery(baseUrl, headers, gqlQuery) as Record<string, unknown>;
            const getResult = resultData?.Get as Record<string, unknown> | undefined;
            const rawItems = getResult?.[weaviateCollection] as Array<Record<string, unknown>> | undefined ?? [];

            let documents: Document[] = rawItems.map((obj: Record<string, unknown>) => {
              const meta: Record<string, unknown> = {};
              for (const key of includeMetadata ? metadataKeyList : []) {
                if (key in obj) {
                  meta[key] = obj[key];
                }
              }
              return {
                pageContent: String(obj[textKey] ?? ""),
                metadata: meta,
              };
            });

            if (useReranker) {
              documents = await applyReranking(ctx, node.name, query, documents) as Document[];
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
        const toolDescription = resolveStringParam(ctx, "toolDescription", "", itemJson);
        const topK = resolveNumberParam(ctx, "topK", 4, itemJson);

        const tool: ToolDescriptor = {
          name: node.name,
          description: toolDescription,
          async getRelevantDocuments(query: string) {
            const queryVector = await embeddingHandle.embedQuery(query);
            const gqlQuery = buildSearchQuery(
              weaviateCollection,
              queryVector,
              topK,
              textKey,
              includeMetadata ? metadataKeyList : [],
              searchFilterObj,
              hybridObj,
              tenantName,
            );
            const resultData = await weaviateGraphQLQuery(baseUrl, headers, gqlQuery) as Record<string, unknown>;
            const getResult = resultData?.Get as Record<string, unknown> | undefined;
            const rawItems = getResult?.[weaviateCollection] as Array<Record<string, unknown>> | undefined ?? [];

            let documents: Document[] = rawItems.map((obj: Record<string, unknown>) => {
              const meta: Record<string, unknown> = {};
              for (const key of includeMetadata ? metadataKeyList : []) {
                if (key in obj) {
                  meta[key] = obj[key];
                }
              }
              return {
                pageContent: String(obj[textKey] ?? ""),
                metadata: meta,
              };
            });

            if (useReranker) {
              documents = await applyReranking(ctx, node.name, query, documents) as Document[];
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

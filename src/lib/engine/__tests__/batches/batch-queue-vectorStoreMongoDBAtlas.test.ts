import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setMongoClientFactory, type MongoClient, type MongoDatabase, type MongoCollection, type MongoDocument } from "@/lib/engine/executors/mongo-db";

seedBuiltinExecutors();
seedBuiltinDescriptions();

interface MockEmbeddingHandle {
  embedQuery: (text: string) => Promise<number[]>;
  embedDocuments: (texts: string[]) => Promise<number[][]>;
}

interface MockDocument {
  pageContent: string;
  metadata: Record<string, unknown>;
}

interface MockDocumentHandle {
  load: () => Promise<MockDocument[]>;
}

interface MockRerankerHandle {
  rerank: (query: string, documents: MockDocument[]) => Promise<MockDocument[]>;
}

function makeEmbeddingHandle(
  overrides: Partial<MockEmbeddingHandle> = {},
): MockEmbeddingHandle {
  return {
    embedQuery: async () => [0.1, 0.2, 0.3],
    embedDocuments: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]),
    ...overrides,
  };
}

function makeDocumentHandle(
  docs: MockDocument[] = [{ pageContent: "Hello world", metadata: {} }],
): MockDocumentHandle {
  return {
    load: async () => docs,
  };
}

function makeRerankerHandle(
  fn?: (query: string, docs: MockDocument[]) => MockDocument[],
): MockRerankerHandle {
  return {
    rerank: fn
      ? async (q, d) => fn(q, d)
      : async (_q, d) => d,
  };
}

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeClusterConnections(
  vectorStoreName: string,
  opts: {
    embeddingName?: string;
    documentName?: string | null;
    rerankerName?: string | null;
  } = {},
): IConnections {
  const embeddingName = opts.embeddingName ?? "Embedding";
  const documentName = opts.documentName ?? "Document";
  const rerankerName = opts.rerankerName ?? null;
  const connections: IConnections = {};
  connections[embeddingName] = {
    ai_embedding: [[{ node: vectorStoreName, type: "ai_embedding", index: 0 }]],
  };
  if (documentName) {
    connections[documentName] = {
      ai_document: [[{ node: vectorStoreName, type: "ai_document", index: 0 }]],
    };
  }
  if (rerankerName) {
    connections[rerankerName] = {
      ai_reranker: [[{ node: vectorStoreName, type: "ai_reranker", index: 0 }]],
    };
  }
  return connections;
}

function makeSubOutputs(
  embeddingHandle: MockEmbeddingHandle,
  documentHandle?: MockDocumentHandle | null,
  rerankerHandle?: MockRerankerHandle | null,
): Record<string, INodeExecutionData[]> {
  const out: Record<string, INodeExecutionData[]> = {
    Embedding: [{ json: embeddingHandle as unknown as Record<string, unknown> }],
  };
  if (documentHandle) {
    out.Document = [{ json: documentHandle as unknown as Record<string, unknown> }];
  }
  if (rerankerHandle) {
    out.Reranker = [{ json: rerankerHandle as unknown as Record<string, unknown> }];
  }
  return out;
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  subNodeOutputs: Record<string, INodeExecutionData[]>,
  connections: IConnections,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections,
      settings: {},
    },
    getNodeInputItems: (name: string) => {
      if (name === node.name) return items;
      return subNodeOutputs[name] ?? [];
    },
    continueOnFail,
    getCredential: async (_name: string) => ({
      configurationType: "connectionString",
      connectionString: "mongodb://localhost:27017",
      database: "test_db",
    }),
  });
}

interface MockInsertResult {
  insertedIds: unknown[];
  insertedId?: unknown;
}

describe("batch-queue vectorStoreMongoDBAtlas — @n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas", () => {
  let mockDocuments: MongoDocument[];
  let mockInsertedDocs: MongoDocument[];
  let insertCallCount: number;

  const mockCollection: MongoCollection = {
    find: vi.fn() as unknown as MongoCollection["find"],
    aggregate: vi.fn(async (pipeline: Record<string, unknown>[]) => {
      return mockDocuments;
    }) as unknown as MongoCollection["aggregate"],
    insertOne: vi.fn(async (doc: Record<string, unknown>) => {
      mockInsertedDocs.push(doc as MongoDocument);
      return { insertedId: "mock-id" };
    }) as unknown as MongoCollection["insertOne"],
    insertMany: vi.fn(async (docs: Record<string, unknown>[]) => {
      insertCallCount++;
      mockInsertedDocs.push(...(docs as MongoDocument[]));
      return { insertedIds: docs.map(() => "mock-id") };
    }) as unknown as MongoCollection["insertMany"],
    updateOne: vi.fn() as unknown as MongoCollection["updateOne"],
    updateMany: vi.fn() as unknown as MongoCollection["updateMany"],
    deleteOne: vi.fn() as unknown as MongoCollection["deleteOne"],
    deleteMany: vi.fn() as unknown as MongoCollection["deleteMany"],
    findOneAndUpdate: vi.fn() as unknown as MongoCollection["findOneAndUpdate"],
    findOneAndReplace: vi.fn() as unknown as MongoCollection["findOneAndReplace"],
    createSearchIndex: vi.fn() as unknown as MongoCollection["createSearchIndex"],
    dropSearchIndex: vi.fn() as unknown as MongoCollection["dropSearchIndex"],
    listSearchIndexes: vi.fn() as unknown as MongoCollection["listSearchIndexes"],
    updateSearchIndex: vi.fn() as unknown as MongoCollection["updateSearchIndex"],
  };

  const mockDatabase: MongoDatabase = {
    collection: vi.fn((name: string) => mockCollection),
  };

  const mockClient: MongoClient = {
    db: vi.fn(() => mockDatabase),
    close: vi.fn(async () => {}),
  };

  beforeEach(() => {
    mockDocuments = [
      { pageContent: "Machine learning basics", text: "Machine learning basics", metadata: { source: "wiki" } },
    ];
    mockInsertedDocs = [];
    insertCallCount = 0;
    vi.clearAllMocks();
    setMongoClientFactory(async () => mockClient);
  });

  const TYPE = "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas";

  async function runVectorStore(
    parameters: Record<string, unknown>,
    inputItems: Array<Record<string, unknown> | INodeExecutionData>,
    opts: {
      embeddingHandle?: MockEmbeddingHandle;
      documentHandle?: MockDocumentHandle | null;
      rerankerHandle?: MockRerankerHandle | null;
      connections?: IConnections;
      subNodeOutputs?: Record<string, INodeExecutionData[]>;
      continueOnFail?: boolean;
    } = {},
  ): Promise<INodeExecutionData[][]> {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters,
    });
    const items = toItems(inputItems);
    const embeddingHandle = opts.embeddingHandle ?? makeEmbeddingHandle();
    const documentHandle =
      opts.documentHandle === undefined ? makeDocumentHandle() : opts.documentHandle;
    const rerankerHandle = opts.rerankerHandle ?? null;
    const subNodeOutputs =
      opts.subNodeOutputs ?? makeSubOutputs(embeddingHandle, documentHandle, rerankerHandle);
    const connections =
      opts.connections ?? makeClusterConnections("VS", {
        documentName: documentHandle ? "Document" : null,
        rerankerName: rerankerHandle ? "Reranker" : null,
      });
    const ctx = makeCtx(items, node, subNodeOutputs, connections, opts.continueOnFail);
    const executor = getExecutor(TYPE)!;
    return executor(ctx, node);
  }

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MongoDB Atlas Vector Store");
  });

  it("getMany — basic similarity search", async () => {
    const out = await runVectorStore(
      {
        mode: "getMany",
        mongoCollection: "my_docs",
        vectorIndexName: "vector_index",
        embedding: "embedding",
        metadata_field: "metadata",
        prompt: "={{ $json.query }}",
      },
      [{ query: "what is machine learning" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0].length).toBeGreaterThan(0);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
    expect(out[0][0].json.metadata).toEqual({ source: "wiki" });

    const pipeline = (mockCollection.aggregate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pipeline[0]).toHaveProperty("$vectorSearch");
    expect(pipeline[0].$vectorSearch.index).toBe("vector_index");
    expect(pipeline[0].$vectorSearch.path).toBe("embedding");
  });

  it("getMany — missing embedding throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", mongoCollection: "my_docs", vectorIndexName: "vi", embedding: "emb", metadata_field: "md", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections: IConnections = {};
    const ctx = makeCtx(items, node, {}, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Embedding sub-node must be connected/i);
  });

  it("insert — passthrough input items", async () => {
    const docs = [{ pageContent: "Introduction to AI", metadata: { source: "wiki" } }];
    const out = await runVectorStore(
      { mode: "insert", mongoCollection: "my_docs", vectorIndexName: "vi", embedding: "embedding", metadata_field: "metadata" },
      [{ text: "Introduction to AI" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.text).toBe("Introduction to AI");
    expect(insertCallCount).toBe(1);
    expect(mockInsertedDocs.length).toBe(1);
    expect(mockInsertedDocs[0].text).toBe("Introduction to AI");
    expect(mockInsertedDocs[0].embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("insert — missing document loader throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "insert", mongoCollection: "my_docs", vectorIndexName: "vi", embedding: "emb", metadata_field: "md" },
    });
    const items = toItems([{}]);
    const connections: IConnections = {
      Embedding: {
        ai_embedding: [[{ node: "VS", type: "ai_embedding", index: 0 }]],
      },
    };
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Embedding: [{ json: makeEmbeddingHandle() as unknown as Record<string, unknown> }],
    };
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Document Loader sub-node must be connected/i);
  });

  it("getMany — missing prompt throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", mongoCollection: "my_docs", vectorIndexName: "vi", embedding: "emb", metadata_field: "md", prompt: "" },
    });
    const items = toItems([{ query: "test" }]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Prompt is required/i);
  });

  it("retrieve — returns a retriever handle with getRelevantDocuments", async () => {
    const out = await runVectorStore(
      { mode: "retrieve", mongoCollection: "my_docs", vectorIndexName: "vi", embedding: "emb", metadata_field: "md" },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const handle = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(typeof handle.getRelevantDocuments).toBe("function");
  });

  it("retrieveAsTool — returns a tool descriptor with name and description", async () => {
    const out = await runVectorStore(
      { mode: "retrieveAsTool", mongoCollection: "my_docs", vectorIndexName: "vi", embedding: "emb", metadata_field: "md", name: "search_docs", description: "Search my docs" },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const tool = out[0][0].json as unknown as {
      name: string;
      description: string;
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(tool.name).toBe("search_docs");
    expect(tool.description).toBe("Search my docs");
    expect(typeof tool.getRelevantDocuments).toBe("function");
  });

  it("getMany — with reranker: applies reranking", async () => {
    const rerankerCalls: { query: string; count: number }[] = [];
    const rerankerHandle = makeRerankerHandle((query, docs) => {
      rerankerCalls.push({ query, count: docs.length });
      return [...docs].reverse();
    });

    const out = await runVectorStore(
      { mode: "getMany", mongoCollection: "my_docs", vectorIndexName: "vi", embedding: "emb", metadata_field: "md", prompt: "={{ $json.query }}", rerankResults: true },
      [{ query: "machine learning" }],
      { documentHandle: null, rerankerHandle },
    );

    expect(rerankerCalls).toHaveLength(1);
    expect(rerankerCalls[0].query).toBe("machine learning");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
  });

  it("getMany — with preFilter: includes filter in $vectorSearch", async () => {
    const preFilter = { category: { $eq: "deep-learning" } };
    const out = await runVectorStore(
      {
        mode: "getMany",
        mongoCollection: "my_docs",
        vectorIndexName: "vi",
        embedding: "emb",
        metadata_field: "md",
        prompt: "={{ $json.query }}",
        preFilter,
      },
      [{ query: "test" }],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const pipeline = (mockCollection.aggregate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pipeline[0].$vectorSearch.filter).toEqual(preFilter);
  });

  it("getMany — with postFilterPipeline: appends stages after $vectorSearch", async () => {
    const postFilterPipeline = [{ $match: { category: "deep-learning" } }, { $limit: 5 }];
    const out = await runVectorStore(
      {
        mode: "getMany",
        mongoCollection: "my_docs",
        vectorIndexName: "vi",
        embedding: "emb",
        metadata_field: "md",
        prompt: "={{ $json.query }}",
        postFilterPipeline,
      },
      [{ query: "test" }],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const pipeline = (mockCollection.aggregate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pipeline[0]).toHaveProperty("$vectorSearch");
    expect(pipeline[1]).toEqual({ $match: { category: "deep-learning" } });
    expect(pipeline[2]).toEqual({ $limit: 5 });
  });

  it("getMany — with preFilter and postFilterPipeline combined", async () => {
    const preFilter = { status: "published" };
    const postFilterPipeline = [{ $project: { pageContent: 1, metadata: 1 } }];
    const out = await runVectorStore(
      {
        mode: "getMany",
        mongoCollection: "my_docs",
        vectorIndexName: "vi",
        embedding: "emb",
        metadata_field: "md",
        prompt: "={{ $json.query }}",
        preFilter,
        postFilterPipeline,
      },
      [{ query: "test" }],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const pipeline = (mockCollection.aggregate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pipeline[0].$vectorSearch.filter).toEqual(preFilter);
    expect(pipeline[1]).toEqual({ $project: { pageContent: 1, metadata: 1 } });
  });

  it("missing mongoCollection: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", mongoCollection: "", vectorIndexName: "vi", embedding: "emb", metadata_field: "md", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/mongoCollection/);
  });

  it("continueOnFail: emits error item instead of throwing", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", mongoCollection: "", vectorIndexName: "vi", embedding: "emb", metadata_field: "md", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections, true);
    const executor = getExecutor(TYPE)!;

    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("mongoCollection");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

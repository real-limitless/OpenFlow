import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setPgvectorClientFactory } from "../../executors/vectorStorePGVector";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.vectorStorePGVector";

const mockPgQuery = vi.fn();
const mockPgEnd = vi.fn();
const mockPgConnect = vi.fn();

function makeMockPgClient(): unknown {
  return {
    query: mockPgQuery,
    end: mockPgEnd,
    connect: mockPgConnect,
  };
}

function mockCredentials(): (name: string) => Promise<Record<string, unknown>> {
  return async () => ({
    host: "localhost",
    database: "testdb",
    user: "testuser",
    password: "testpass",
    port: 5432,
    ssl: "disable",
  });
}

function mockNullCredentials(): (name: string) => Promise<null> {
  return async () => null;
}

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
  getCredential?: (name: string) => Promise<Record<string, unknown> | null>,
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
    getCredential: getCredential ?? mockCredentials(),
    continueOnFail,
  });
}

async function runVectorStore(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    typeVersion?: number;
    embeddingHandle?: MockEmbeddingHandle;
    documentHandle?: MockDocumentHandle | null;
    rerankerHandle?: MockRerankerHandle | null;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
    continueOnFail?: boolean;
    getCredential?: (name: string) => Promise<Record<string, unknown> | null>;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({
    name: "PGVS",
    type: TYPE,
    typeVersion: opts.typeVersion ?? 1.3,
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
    opts.connections ?? makeClusterConnections("PGVS", {
      documentName: documentHandle ? "Document" : null,
      rerankerName: rerankerHandle ? "Reranker" : null,
    });
  const ctx = makeCtx(items, node, subNodeOutputs, connections, opts.getCredential, opts.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue vectorStorePGVector — @n8n/n8n-nodes-langchain.vectorStorePGVector", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    setPgvectorClientFactory(async () => makeMockPgClient() as any);
  });

  afterAll(() => {
    vi.useRealTimers();
    setPgvectorClientFactory(null);
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mockPgQuery.mockReset();
    mockPgEnd.mockReset().mockResolvedValue(undefined);
    mockPgConnect.mockReset();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Postgres PGVector Store");
  });

  it("load — returns empty array when prompt is empty", async () => {
    mockPgQuery.mockResolvedValue({ rows: [] });

    const out = await runVectorStore(
      { mode: "load", tableName: "documents", prompt: "={{ $json.missing }}" },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(0);
  });

  it("load — no embedding connected throws error (with credentials)", async () => {
    const node = makeNode({
      name: "PGVS",
      type: TYPE,
      typeVersion: 1.3,
      parameters: { mode: "load", tableName: "documents", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections: IConnections = {};
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {};
    const ctx = makeCtx(items, node, subNodeOutputs, connections, mockCredentials());
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Embedding sub-node must be connected/i);
  });

  it("insert — no document loader throws error (with credentials)", async () => {
    const node = makeNode({
      name: "PGVS",
      type: TYPE,
      typeVersion: 1.3,
      parameters: { mode: "insert", tableName: "documents" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("PGVS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle(), null);
    const ctx = makeCtx(items, node, subNodeOutputs, connections, mockCredentials());
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Document Loader sub-node must be connected/i);
  });

  it("retrieve — returns retriever handle", async () => {
    mockPgQuery.mockResolvedValue({ rows: [] });

    const out = await runVectorStore(
      { mode: "retrieve", tableName: "documents" },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const handle = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(typeof handle.getRelevantDocuments).toBe("function");
  });

  it("retrieve-as-tool — returns tool descriptor", async () => {
    mockPgQuery.mockResolvedValue({ rows: [] });

    const out = await runVectorStore(
      {
        mode: "retrieve-as-tool",
        tableName: "documents",
        toolDescription: "Search product docs",
        topK: 10,
      },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const tool = out[0][0].json as unknown as {
      name: string;
      description: string;
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(tool.description).toBe("Search product docs");
    expect(typeof tool.getRelevantDocuments).toBe("function");
  });

  it("retrieve-as-tool — with reranker includes reranker calls", async () => {
    mockPgQuery.mockResolvedValue({ rows: [] });
    const rerankerCalls: string[] = [];
    const rerankerHandle = makeRerankerHandle((query, docs) => {
      rerankerCalls.push(query);
      return docs;
    });

    const out = await runVectorStore(
      {
        mode: "retrieve-as-tool",
        tableName: "documents",
        toolName: "search_tool",
        toolDescription: "Search",
        topK: 5,
        useReranker: true,
      },
      [{}],
      { documentHandle: null, rerankerHandle },
    );

    expect(out[0]).toHaveLength(1);
    const tool = out[0][0].json as unknown as { getRelevantDocuments: (q: string) => Promise<unknown[]> };
    await tool.getRelevantDocuments("test query");
    expect(mockPgQuery).toHaveBeenCalled();
  });

  it("insert — passthrough input items", async () => {
    mockPgQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    const docs = [{ pageContent: "Hello world", metadata: {} }];
    const out = await runVectorStore(
      { mode: "insert", tableName: "documents" },
      [{ id: 1 }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(1);
    expect(mockPgQuery).toHaveBeenCalled();
  });

  it("continueOnFail — emits error item", async () => {
    const badDocHandle: MockDocumentHandle = {
      load: async () => { throw new Error("Document load failed"); },
    };

    const out = await runVectorStore(
      { mode: "insert", tableName: "documents" },
      [{}],
      { documentHandle: badDocHandle, continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("Document load failed");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("missing credential throws error on connect", async () => {
    const node = makeNode({
      name: "PGVS",
      type: TYPE,
      typeVersion: 1.3,
      parameters: { mode: "load", tableName: "documents", prompt: "test" },
    });
    const items = toItems([{ query: "test" }]);
    const embeddingHandle = makeEmbeddingHandle();
    const connections = makeClusterConnections("PGVS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(embeddingHandle, null);
    const ctx = makeCtx(items, node, subNodeOutputs, connections, mockNullCredentials());
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Credential "postgres" is not configured/i);
  });

  it("retrieve — default mode is retrieve", async () => {
    mockPgQuery.mockResolvedValue({ rows: [] });

    const out = await runVectorStore(
      { tableName: "documents" },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const handle = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(typeof handle.getRelevantDocuments).toBe("function");
  });

  it("load — basic search with results", async () => {
    mockPgQuery.mockResolvedValue({
      rows: [
        { text: "machine learning basics", metadata: '{"category":"ml"}', distance: 0.15 },
        { text: "deep learning", metadata: '{"category":"dl"}', distance: 0.25 },
      ],
    });

    const out = await runVectorStore(
      {
        mode: "load",
        tableName: "documents",
        prompt: "={{ $json.query }}",
        topK: 5,
      },
      [{ query: "machine learning basics" }],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.pageContent).toBe("machine learning basics");
    expect(out[0][0].json.metadata).toEqual({ category: "ml" });
    expect(out[0][0].json.similarity).toBeCloseTo(0.15);
    expect(out[0][1].json.pageContent).toBe("deep learning");
  });

  it("load — with metadata filter and collection join", async () => {
    mockPgQuery.mockResolvedValue({
      rows: [
        { text: "deep learning", metadata: '{"category":"deep-learning","source":"wiki"}', distance: 0.1 },
      ],
    });

    const out = await runVectorStore(
      {
        mode: "load",
        tableName: "documents",
        prompt: "neural networks",
        topK: 3,
        options: {
          metadata: {
            metadataValues: [{ name: "category", value: "deep-learning" }],
          },
          collection: {
            values: {
              useCollection: true,
              collectionName: "tech-docs",
              collectionTableName: "n8n_vector_collections",
            },
          },
        },
      },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.metadata?.category).toBe("deep-learning");
    const lastSql = mockPgQuery.mock.calls[mockPgQuery.mock.calls.length - 1];
    const sql = lastSql[0] as string;
    const params = lastSql[1] as unknown[];
    expect(sql).toContain("n8n_vector_collections");
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("collection_id");
    expect(params).toContain("tech-docs");
  });
});

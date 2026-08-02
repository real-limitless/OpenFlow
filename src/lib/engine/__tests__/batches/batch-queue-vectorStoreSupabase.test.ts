import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const httpMock = { calls: [] as Array<{ url: string; method?: string; body?: unknown }> };

vi.mock("@/sdk/helpers/http", () => {
  return {
    sdkHttpRequest: vi.fn(async (opts: { url: string; method?: string; body?: unknown }) => {
      httpMock.calls.push({ url: opts.url, method: opts.method, body: opts.body });
      if (opts.url.includes("/rest/v1/rpc/")) {
        return {
          status: 200,
          headers: {},
          body: [
            { content: "Machine learning basics", metadata: { source: "wiki" }, similarity: 0.95 },
          ],
        };
      }
      if (opts.url.includes("/rest/v1/")) {
        return { status: 201, headers: {}, body: {} };
      }
      return { status: 404, headers: {}, body: {} };
    }),
  };
});

beforeEach(() => {
  httpMock.calls = [];
});

const TYPE = "@n8n/n8n-nodes-langchain.vectorStoreSupabase";

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
    getCredential: async (_name: string) => ({ host: "test-project.supabase.co", secretKey: "test-secret-key" }),
  });
}

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

describe("batch-queue vectorStoreSupabase — @n8n/n8n-nodes-langchain.vectorStoreSupabase", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Supabase Vector Store");
  });

  it("getMany — basic similarity search", async () => {
    const out = await runVectorStore(
      { mode: "getMany", tableName: "documents", prompt: "={{ $json.query }}", limit: 5 },
      [{ query: "machine learning basics" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0].length).toBeGreaterThan(0);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
    expect(out[0][0].json.metadata).toEqual({ source: "wiki" });
    expect(out[0][0].json.similarity).toBe(0.95);

    const rpcCalls = httpMock.calls.filter((c) => c.url.includes("/rest/v1/rpc/"));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].url).toContain("match_documents");
  });

  it("getMany — missing embedding throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", tableName: "documents", prompt: "test" },
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
      { mode: "insert", tableName: "documents" },
      [{ text: "Introduction to AI" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.text).toBe("Introduction to AI");
  });

  it("insert — missing document loader throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "insert", tableName: "documents" },
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

  it("getMany — missing prompt: skips item", async () => {
    const out = await runVectorStore(
      { mode: "getMany", tableName: "documents", prompt: "" },
      [{ query: "test" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("update — returns passthrough input items", async () => {
    const docs = [{ pageContent: "Replacement content", metadata: {} }];
    const out = await runVectorStore(
      { mode: "update", tableName: "documents", id: "={{ $json.id }}" },
      [{ id: "doc-42" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("doc-42");
  });

  it("update — missing id throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "update", tableName: "documents", id: "" },
    });
    const items = toItems([{}]);
    const connections: IConnections = {
      Embedding: {
        ai_embedding: [[{ node: "VS", type: "ai_embedding", index: 0 }]],
      },
      Document: {
        ai_document: [[{ node: "VS", type: "ai_document", index: 0 }]],
      },
    };
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Embedding: [{ json: makeEmbeddingHandle() as unknown as Record<string, unknown> }],
      Document: [{ json: makeDocumentHandle() as unknown as Record<string, unknown> }],
    };
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/ID parameter is required/i);
  });

  it("retrieve — returns a retriever handle with getRelevantDocuments", async () => {
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

  it("retrieveAsTool — returns a tool descriptor with name and description", async () => {
    const out = await runVectorStore(
      { mode: "retrieveAsTool", tableName: "documents", name: "search_docs", description: "Search my docs" },
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
      { mode: "getMany", tableName: "documents", prompt: "={{ $json.query }}", limit: 5, rerankResults: true },
      [{ query: "machine learning" }],
      { documentHandle: null, rerankerHandle },
    );

    expect(rerankerCalls).toHaveLength(1);
    expect(rerankerCalls[0].query).toBe("machine learning");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
  });

  it("missing tableName: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", tableName: "", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/tableName parameter is required/i);
  });

  it("continueOnFail: emits error item instead of throwing", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", tableName: "", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections, true);
    const executor = getExecutor(TYPE)!;

    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("tableName parameter is required");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("getMany — calls RPC with queryName option", async () => {
    const out = await runVectorStore(
      { mode: "getMany", tableName: "documents", prompt: "test", limit: 5, queryName: "search_vectors" },
      [{}],
      { documentHandle: null },
    );

    const rpcCalls = httpMock.calls.filter((c) => c.url.includes("/rest/v1/rpc/"));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].url).toContain("search_vectors");
    expect(out[0].length).toBeGreaterThan(0);
  });

  it("getMany — insert writes to table via POST", async () => {
    const docs = [{ pageContent: "Test doc", metadata: { category: "test" } }];
    httpMock.calls = [];
    const out = await runVectorStore(
      { mode: "insert", tableName: "my_table" },
      [{}],
      { documentHandle: makeDocumentHandle(docs) },
    );

    const insertCalls = httpMock.calls.filter((c) => c.url.includes("/rest/v1/my_table") && c.method === "POST");
    expect(insertCalls).toHaveLength(1);
    const body = insertCalls[0].body as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].content).toBe("Test doc");

    expect(out[0][0].json).toBeDefined();
  });

  it("getMany — with metadataFilter calls RPC with filter", async () => {
    const out = await runVectorStore(
      {
        mode: "getMany",
        tableName: "documents",
        prompt: "={{ $json.topic }}",
        limit: 3,
        metadataFilter: { values: [{ field: "category", operator: "eq", value: "deep-learning" }] },
      },
      [{ topic: "neural networks" }],
      { documentHandle: null },
    );

    const rpcCalls = httpMock.calls.filter((c) => c.url.includes("/rest/v1/rpc/"));
    expect(rpcCalls).toHaveLength(1);
    const body = rpcCalls[0].body as Record<string, unknown>;
    expect(body.filter).toBeDefined();
    expect(body.filter).toEqual({ category: { $eq: "deep-learning" } });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
  });
});

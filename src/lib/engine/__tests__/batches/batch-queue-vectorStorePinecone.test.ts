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
let mockHost = "my-index-abc123.svc.example.pinecone.io";

vi.mock("@/sdk/helpers/http", () => {
  return {
    sdkHttpRequest: vi.fn(async (opts: { url: string; method?: string; body?: unknown }) => {
      httpMock.calls.push({ url: opts.url, method: opts.method, body: opts.body });
      if (opts.url.includes("api.pinecone.io/indexes/")) {
        return { status: 200, headers: {}, body: { host: mockHost } };
      }
      if (opts.url.includes("/query")) {
        return {
          status: 200,
          headers: {},
          body: {
            matches: [
              { id: "1", score: 0.95, metadata: { text: "Machine learning basics", pageContent: "Machine learning basics", source: "wiki" } },
            ],
          },
        };
      }
      if (opts.url.includes("/vectors/upsert") || opts.url.includes("/vectors/delete")) {
        return { status: 200, headers: {}, body: {} };
      }
      return { status: 404, headers: {}, body: {} };
    }),
    setMockHost: (h: string) => { mockHost = h; },
  };
});

beforeEach(() => {
  httpMock.calls = [];
  mockHost = "my-index-abc123.svc.example.pinecone.io";
});

const TYPE = "@n8n/n8n-nodes-langchain.vectorStorePinecone";

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
    getCredential: async (_name: string) => ({ apiKey: "test-api-key" }),
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

describe("batch-queue vectorStorePinecone — @n8n/n8n-nodes-langchain.vectorStorePinecone", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Pinecone Vector Store");
  });

  it("insert — returns passthrough input items", async () => {
    const docs = [{ pageContent: "Introduction to AI", metadata: { source: "wiki" } }];
    const out = await runVectorStore(
      { mode: "insert", index: "my-index" },
      [{ text: "Introduction to AI" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.text).toBe("Introduction to AI");
  });

  it("getMany — missing embedding throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", index: "my-index", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections: IConnections = {};
    const ctx = makeCtx(items, node, {}, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Embedding sub-node must be connected/i);
  });

  it("insert — missing document loader throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "insert", index: "my-index" },
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
      { mode: "getMany", index: "my-index", prompt: "" },
      [{ query: "test" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("update — returns passthrough input items", async () => {
    const docs = [{ pageContent: "Replacement content", metadata: {} }];
    const out = await runVectorStore(
      { mode: "update", index: "my-index", id: "={{ $json.id }}" },
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
      parameters: { mode: "update", index: "my-index", id: "" },
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
      { mode: "retrieve", index: "my-index" },
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
      { mode: "retrieveAsTool", index: "my-index", name: "search_docs", description: "Search my docs" },
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
      { mode: "getMany", index: "my-index", prompt: "={{ $json.query }}", limit: 5, rerankResults: true },
      [{ query: "machine learning" }],
      { documentHandle: null, rerankerHandle },
    );

    expect(rerankerCalls).toHaveLength(1);
    expect(rerankerCalls[0].query).toBe("machine learning");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
  });

  it("retrieve — with reranker: wraps retriever", async () => {
    const rerankerCalls: { query: string; count: number }[] = [];
    const rerankerHandle = makeRerankerHandle((query, docs) => {
      rerankerCalls.push({ query, count: docs.length });
      return docs;
    });

    const out = await runVectorStore(
      { mode: "retrieve", index: "my-index", rerankResults: true },
      [{}],
      { documentHandle: null, rerankerHandle },
    );

    expect(out[0]).toHaveLength(1);
    const handle = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    await handle.getRelevantDocuments("test");
    expect(rerankerCalls).toHaveLength(1);
    expect(rerankerCalls[0].query).toBe("test");
  });

  it("missing index: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", index: "", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Index parameter is required/i);
  });

  it("continueOnFail: emits error item instead of throwing", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "getMany", index: "", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections, true);
    const executor = getExecutor(TYPE)!;

    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("Index parameter is required");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("insert — clearNamespace: deletes before upsert", async () => {
    const docs = [{ pageContent: "Introduction to AI", metadata: { source: "wiki" } }];
    httpMock.calls = [];
    const out = await runVectorStore(
      { mode: "insert", index: "my-index", namespace: "training", clearNamespace: true },
      [{ text: "Introduction to AI" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    const deleteCalls = httpMock.calls.filter((c) => c.url.includes("/vectors/delete"));
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].body).toHaveProperty("deleteAll", true);
    expect(deleteCalls[0].body).toHaveProperty("namespace", "training");

    const upsertCalls = httpMock.calls.filter((c) => c.url.includes("/vectors/upsert"));
    expect(upsertCalls.length).toBeGreaterThanOrEqual(1);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.text).toBe("Introduction to AI");
  });

  it("getMany — metadataFilter applied to query body", async () => {
    const out = await runVectorStore(
      {
        mode: "getMany",
        index: "my-index",
        prompt: "={{ $json.topic }}",
        limit: 3,
        metadataFilter: { values: [{ field: "category", operator: "eq", value: "deep-learning" }] },
      },
      [{ topic: "neural networks" }],
      { documentHandle: null },
    );

    const queryCalls = httpMock.calls.filter((c) => c.url.includes("/query"));
    expect(queryCalls).toHaveLength(1);
    const filter = (queryCalls[0].body as Record<string, unknown>).filter;
    expect(filter).toBeDefined();
    expect(filter).toEqual({ category: { $eq: "deep-learning" } });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
  });

  it("insert — data-plane host resolved before upsert", async () => {
    const docs = [{ pageContent: "Test doc", metadata: {} }];
    httpMock.calls = [];
    const out = await runVectorStore(
      { mode: "insert", index: "my-index", namespace: "training" },
      [{}],
      { documentHandle: makeDocumentHandle(docs) },
    );

    const describeCalls = httpMock.calls.filter((c) => c.url.includes("api.pinecone.io/indexes/"));
    expect(describeCalls).toHaveLength(1);
    expect(describeCalls[0].url).toContain("my-index");

    const upsertCalls = httpMock.calls.filter((c) => c.url.includes("/vectors/upsert"));
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].url).toBe("https://my-index-abc123.svc.example.pinecone.io/vectors/upsert");

    expect(out[0]).toHaveLength(1);
  });

  it("update — upserts vector with given id", async () => {
    const docs = [{ pageContent: "Replacement content", metadata: {} }];
    httpMock.calls = [];
    const out = await runVectorStore(
      { mode: "update", index: "my-index", id: "={{ $json.id }}" },
      [{ id: "doc-42" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    const upsertCalls = httpMock.calls.filter((c) => c.url.includes("/vectors/upsert"));
    expect(upsertCalls).toHaveLength(1);
    const vectors = (upsertCalls[0].body as Record<string, unknown>).vectors as Array<{ id: string; values: number[]; metadata: Record<string, unknown> }>;
    expect(vectors[0].id).toBe("doc-42");

    expect(out[0][0].json.id).toBe("doc-42");
  });

  it("getMany — with metadataFilter expression evaluation", async () => {
    const out = await runVectorStore(
      {
        mode: "getMany",
        index: "my-index",
        prompt: "test",
        limit: 5,
        metadataFilter: { values: [{ field: "category", operator: "eq", value: "={{ $json.filterValue }}" }] },
      },
      [{ filterValue: "deep-learning" }],
      { documentHandle: null },
    );

    const queryCalls = httpMock.calls.filter((c) => c.url.includes("/query"));
    expect(queryCalls).toHaveLength(1);
    const filter = (queryCalls[0].body as Record<string, unknown>).filter;
    expect(filter).toEqual({ category: { $eq: "deep-learning" } });

    expect(out[0]).toHaveLength(1);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext, type SdkHttpResponse } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.vectorStoreMilvus";

const MILVUS_CRED = {
  baseUrl: "http://localhost:19530",
  username: "root",
  password: "Milvus",
};

let mockHttpResponses: Array<{ status: number; body: unknown }>;
let httpCalls: Array<{ method: string; url: string; body?: unknown }>;

vi.mock("@/sdk", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    sdkHttpRequest: vi.fn(async (opts: { method?: string; url: string; body?: unknown }) => {
      httpCalls.push({ method: opts.method ?? "GET", url: opts.url, body: opts.body });
      const resp = mockHttpResponses.shift() ?? { status: 200, body: { data: [] } };
      return resp as SdkHttpResponse;
    }),
  };
});

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
    getCredential: async (name: string) => {
      if (name === "milvusApi") return MILVUS_CRED;
      return null;
    },
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

describe("batch-queue vectorStoreMilvus — @n8n/n8n-nodes-langchain.vectorStoreMilvus", () => {
  beforeEach(() => {
    mockHttpResponses = [];
    httpCalls = [];
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Milvus Vector Store");
  });

  it("getMany — basic similarity search", async () => {
    mockHttpResponses = [
      { status: 200, body: { data: [{ pageContent: "ML basics", metadata: { source: "wiki" } }] } },
    ];

    const out = await runVectorStore(
      { mode: "getMany", milvusCollection: "my_docs", prompt: "={{ $json.query }}", limit: 5 },
      [{ query: "machine learning basics" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("ML basics");
    expect(out[0][0].json.metadata).toEqual({ source: "wiki" });
    expect(httpCalls.length).toBeGreaterThan(0);
    const searchCall = httpCalls.find((c) => c.url.includes("/v1/vector/search"));
    expect(searchCall).toBeDefined();
  });

  it("insert — with clearCollection", async () => {
    mockHttpResponses = [
      { status: 200, body: { data: [] } },
      { status: 200, body: { data: { insert_count: 1 } } },
    ];

    const out = await runVectorStore(
      { mode: "insert", milvusCollection: "my_docs", clearCollection: true },
      [{ json: { text: "Introduction to AI" } }],
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.action).toBe("inserted");
    const deleteCall = httpCalls.find((c) => c.url.includes("/v1/vector/delete"));
    expect(deleteCall).toBeDefined();
  });

  it("insert — passthrough", async () => {
    mockHttpResponses = [
      { status: 200, body: { data: { insert_count: 1 } } },
    ];

    const out = await runVectorStore(
      { mode: "insert", milvusCollection: "my_docs", clearCollection: false },
      [{ json: { id: 1, content: "doc1" } }],
    );

    expect(out).toHaveLength(1);
    expect(out[0][0].json.id).toBe(1);
    expect(out[0][0].json.action).toBe("inserted");
  });

  it("retrieve — returns retriever handle", async () => {
    mockHttpResponses = [
      { status: 200, body: { data: [{ pageContent: "test", metadata: {} }] } },
    ];

    const out = await runVectorStore(
      { mode: "retrieve", milvusCollection: "my_docs" },
      [{}],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    const handle = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(typeof handle.getRelevantDocuments).toBe("function");
    const results = await handle.getRelevantDocuments("test query");
    expect(results).toHaveLength(1);
  });

  it("retrieveAsTool — returns tool descriptor", async () => {
    mockHttpResponses = [
      { status: 200, body: { data: [{ pageContent: "result", metadata: {} }] } },
    ];

    const out = await runVectorStore(
      { mode: "retrieveAsTool", milvusCollection: "my_docs", name: "search_tool", description: "Searches docs", limit: 5 },
      [{}],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0][0].json.name).toBe("search_tool");
    expect(out[0][0].json.description).toBe("Searches docs");
    expect(out[0][0].json.retriever).toBeDefined();
  });

  it("missing embedding: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      parameters: { mode: "getMany", milvusCollection: "my_docs", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections: IConnections = {};
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {};
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Embedding sub-node must be connected/i);
  });

  it("insert missing document loader: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      parameters: { mode: "insert", milvusCollection: "my_docs" },
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

  it("continueOnFail: emits error item instead of throwing", async () => {
    const badDocHandle: MockDocumentHandle = {
      load: async () => {
        throw new Error("Document load failed");
      },
    };

    const out = await runVectorStore(
      { mode: "insert", milvusCollection: "my_docs", clearCollection: false },
      [{}],
      {
        documentHandle: badDocHandle,
        continueOnFail: true,
      },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("Document load failed");
  });

  it("getMany — with metadata filter", async () => {
    mockHttpResponses = [
      { status: 200, body: { data: [{ pageContent: "deep learning", metadata: { category: "deep-learning" } }] } },
    ];

    const out = await runVectorStore(
      {
        mode: "getMany",
        milvusCollection: "my_docs",
        prompt: "={{ $json.topic }}",
        limit: 3,
        metadataFilter: [{ field: "category", operator: "eq", value: "deep-learning" }],
      },
      [{ topic: "neural networks" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("deep learning");
    const searchCall = httpCalls.find((c) => c.url.includes("/v1/vector/search"));
    expect(searchCall).toBeDefined();
  });
});
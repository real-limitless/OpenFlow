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
      if (opts.url.includes("/ft._list")) {
        return { status: 200, body: { indices: ["my-redis-index"] } };
      }
      if (opts.url.includes("/ft.create")) {
        return { status: 200, body: {} };
      }
      if (opts.url.includes("/ft.search")) {
        return {
          status: 200,
          body: {
            results: [
              { id: "doc:0", score: 0.95, payload: { content: "Machine learning basics", metadata: '{"source":"wiki"}' } },
            ],
          },
        };
      }
      if (opts.url.includes("/ft.dropindex")) {
        return { status: 200, body: {} };
      }
      if (opts.url.includes("/hset")) {
        return { status: 200, body: {} };
      }
      if (opts.url.includes("/del")) {
        return { status: 200, body: {} };
      }
      if (opts.url.includes("/expire")) {
        return { status: 200, body: {} };
      }
      return { status: 404, body: {} };
    }),
  };
});

beforeEach(() => {
  httpMock.calls = [];
});

const TYPE = "@n8n/n8n-nodes-langchain.vectorStoreRedis";

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
    embedQuery: async () => [0.1, 0.2, 0.3, 0.4],
    embedDocuments: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3, 0.4]),
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
      host: "localhost",
      port: 6379,
      password: "test-pw",
      database: 0,
    }),
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

describe("batch-queue vectorStoreRedis — @n8n/n8n-nodes-langchain.vectorStoreRedis", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Redis Vector Store");
  });

  it("load — basic similarity search", async () => {
    const out = await runVectorStore(
      { mode: "load", redisIndex: "my-redis-index", prompt: "={{ $json.query }}", topK: 5 },
      [{ query: "machine learning basics" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0].length).toBeGreaterThanOrEqual(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
    expect(out[0][0].json.metadata).toEqual({ source: "wiki" });
  });

  it("insert — with overwrite, returns passthrough", async () => {
    const docs = [{ pageContent: "Introduction to AI", metadata: {} }];
    const out = await runVectorStore(
      { mode: "insert", redisIndex: "my-redis-index", overwriteDocuments: true, keyPrefix: "doc:", contentKey: "content", metadataKey: "metadata", vectorKey: "content_vector" },
      [{ text: "Introduction to AI" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    const dropIndexCalls = httpMock.calls.filter((c) => c.url.includes("/ft.dropindex"));
    expect(dropIndexCalls.length).toBeGreaterThanOrEqual(1);

    const hsetCalls = httpMock.calls.filter((c) => c.url.includes("/hset"));
    expect(hsetCalls.length).toBeGreaterThanOrEqual(1);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.text).toBe("Introduction to AI");
  });

  it("insert — missing document loader throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "insert", redisIndex: "my-redis-index" },
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

  it("load — missing embedding throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "load", redisIndex: "my-redis-index", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections: IConnections = {};
    const ctx = makeCtx(items, node, {}, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Embedding sub-node must be connected/i);
  });

  it("retrieve — returns a retriever handle", async () => {
    const out = await runVectorStore(
      { mode: "retrieve", redisIndex: "my-redis-index" },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const handle = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(typeof handle.getRelevantDocuments).toBe("function");
  });

  it("retrieve-as-tool — returns a tool descriptor", async () => {
    const out = await runVectorStore(
      { mode: "retrieve-as-tool", toolName: "product_kb", toolDescription: "Search the product knowledge base", redisIndex: "my-redis-index", topK: 10 },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const tool = out[0][0].json as unknown as {
      name: string;
      description: string;
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(tool.name).toBe("product_kb");
    expect(tool.description).toBe("Search the product knowledge base");
    expect(typeof tool.getRelevantDocuments).toBe("function");
  });

  it("update — returns passthrough input items", async () => {
    const docs = [{ pageContent: "Replacement content", metadata: {} }];
    const out = await runVectorStore(
      { mode: "update", redisIndex: "my-redis-index", id: "={{ $json.id }}" },
      [{ id: "doc:42" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    const hsetCalls = httpMock.calls.filter((c) => c.url.includes("/hset"));
    expect(hsetCalls.length).toBeGreaterThanOrEqual(1);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("doc:42");
  });

  it("update — missing id throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "update", redisIndex: "my-redis-index", id: "" },
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

  it("missing index: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "load", redisIndex: "", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/redisIndex parameter is required/i);
  });

  it("continueOnFail: emits error item instead of throwing", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "load", redisIndex: "", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections, true);
    const executor = getExecutor(TYPE)!;

    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("redisIndex parameter is required");
  });

  it("load — with useReranker: applies reranking", async () => {
    const rerankerCalls: { query: string; count: number }[] = [];
    const rerankerHandle = makeRerankerHandle((query, docs) => {
      rerankerCalls.push({ query, count: docs.length });
      return [...docs].reverse();
    });

    const out = await runVectorStore(
      { mode: "load", redisIndex: "my-redis-index", prompt: "={{ $json.query }}", topK: 5, useReranker: true },
      [{ query: "machine learning" }],
      { documentHandle: null, rerankerHandle },
    );

    expect(rerankerCalls).toHaveLength(1);
    expect(rerankerCalls[0].query).toBe("machine learning");
    expect(out[0]).toHaveLength(1);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

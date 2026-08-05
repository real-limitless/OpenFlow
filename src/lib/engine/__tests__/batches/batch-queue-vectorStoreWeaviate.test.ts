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
      if (opts.url.includes("/v1/graphql")) {
        const body = opts.body as { query?: string } | undefined;
        const query = body?.query ?? "";
        if (query.includes("Get")) {
          return {
            status: 200,
            headers: {},
            body: {
              data: {
                Get: {
                  Documents: [
                    { text: "Machine learning basics", source: "wiki", page: "1" },
                  ],
                },
              },
            },
          };
        }
        return { status: 200, headers: {}, body: { data: {} } };
      }
      if (opts.url.includes("/v1/batch/objects")) {
        return { status: 200, headers: {}, body: {} };
      }
      if (opts.url.includes("/v1/objects/")) {
        return { status: 200, headers: {}, body: {} };
      }
      if (opts.url.includes("/v1/schema/")) {
        return { status: 200, headers: {}, body: {} };
      }
      return { status: 404, headers: {}, body: {} };
    }),
  };
});

beforeEach(() => {
  httpMock.calls = [];
});

const TYPE = "@n8n/n8n-nodes-langchain.vectorStoreWeaviate";

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
  docs: MockDocument[] = [{ pageContent: "Introduction to AI", metadata: { source: "wiki" } }],
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
      connection_type: "weaviate_cloud",
      weaviate_cloud_endpoint: "https://test-cluster.weaviate.cloud",
      weaviate_api_key: "test-api-key",
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

describe("batch-queue vectorStoreWeaviate — @n8n/n8n-nodes-langchain.vectorStoreWeaviate", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Weaviate Vector Store");
  });

  it("load — basic similarity search", async () => {
    const out = await runVectorStore(
      { mode: "load", weaviateCollection: "Documents", prompt: "={{ $json.query }}", topK: 5 },
      [{ query: "machine learning basics" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0].length).toBeGreaterThanOrEqual(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
    expect(out[0][0].json.metadata).toEqual({ source: "wiki", page: "1" });
  });

  it("insert — returns passthrough input items", async () => {
    const docs = [{ pageContent: "Introduction to AI", metadata: { source: "wiki" } }];
    const out = await runVectorStore(
      { mode: "insert", weaviateCollection: "Documents" },
      [{ text: "Introduction to AI" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.text).toBe("Introduction to AI");
  });

  it("insert — with clearData: deletes before upsert", async () => {
    const docs = [{ pageContent: "Introduction to AI", metadata: { source: "wiki" } }];
    httpMock.calls = [];
    const out = await runVectorStore(
      { mode: "insert", weaviateCollection: "Documents", clearData: true },
      [{ text: "Introduction to AI" }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    const deleteCalls = httpMock.calls.filter((c) => c.url.includes("/v1/objects/"));
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);

    const batchCalls = httpMock.calls.filter((c) => c.url.includes("/v1/batch/objects"));
    expect(batchCalls.length).toBeGreaterThanOrEqual(1);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.text).toBe("Introduction to AI");
  });

  it("load — missing embedding throws", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "load", weaviateCollection: "Documents", prompt: "test" },
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
      parameters: { mode: "insert", weaviateCollection: "Documents" },
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

  it("load — missing prompt: skips item", async () => {
    const out = await runVectorStore(
      { mode: "load", weaviateCollection: "Documents", prompt: "" },
      [{ query: "test" }],
      { documentHandle: null },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("retrieve — returns a retriever handle with getRelevantDocuments", async () => {
    const out = await runVectorStore(
      { mode: "retrieve", weaviateCollection: "Documents" },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const handle = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(typeof handle.getRelevantDocuments).toBe("function");
  });

  it("retrieve-as-tool — returns a tool descriptor with name and description", async () => {
    const out = await runVectorStore(
      { mode: "retrieve-as-tool", weaviateCollection: "Documents", toolDescription: "Search my docs" },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const tool = out[0][0].json as unknown as {
      name: string;
      description: string;
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(tool.name).toBe("VS");
    expect(tool.description).toBe("Search my docs");
    expect(typeof tool.getRelevantDocuments).toBe("function");
  });

  it("load — with reranker: applies reranking", async () => {
    const rerankerCalls: { query: string; count: number }[] = [];
    const rerankerHandle = makeRerankerHandle((query, docs) => {
      rerankerCalls.push({ query, count: docs.length });
      return [...docs].reverse();
    });

    const out = await runVectorStore(
      { mode: "load", weaviateCollection: "Documents", prompt: "={{ $json.query }}", topK: 5, useReranker: true },
      [{ query: "machine learning" }],
      { documentHandle: null, rerankerHandle },
    );

    expect(rerankerCalls).toHaveLength(1);
    expect(rerankerCalls[0].query).toBe("machine learning");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
  });

  it("insert — with multi-tenancy", async () => {
    const docs = [{ pageContent: "Tenant-specific doc", metadata: { source: "acme" } }];
    httpMock.calls = [];
    const out = await runVectorStore(
      { mode: "insert", weaviateCollection: "Documents", tenantName: "acme-corp" },
      [{}],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out[0]).toHaveLength(1);

    const batchCalls = httpMock.calls.filter((c) => c.url.includes("/v1/batch/objects"));
    expect(batchCalls.length).toBeGreaterThanOrEqual(1);
    const batchBody = batchCalls[0].body as { objects?: Array<Record<string, unknown>> };
    expect(batchBody.objects).toBeDefined();
  });

  it("missing collection: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "load", weaviateCollection: "", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Weaviate Collection Name is required/i);
  });

  it("continueOnFail: emits error item instead of throwing", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { mode: "load", weaviateCollection: "", prompt: "test" },
    });
    const items = toItems([{}]);
    const connections = makeClusterConnections("VS", { documentName: null });
    const subNodeOutputs = makeSubOutputs(makeEmbeddingHandle());
    const ctx = makeCtx(items, node, subNodeOutputs, connections, true);
    const executor = getExecutor(TYPE)!;

    const out = await executor(ctx, node);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("Weaviate Collection Name is required");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("load — hybrid+filter: asserts GraphQL body has hybrid and where clauses", async () => {
    httpMock.calls = [];
    const hybrid = {
      hybridQueryText: "deep learning",
      hybridAlpha: 0.7,
      hybridFusionType: "Ranked",
    };
    const searchFilterJson = {
      AND: [
        { path: ["category"], operator: "Equal", valueString: "deep-learning" },
      ],
    };
    const out = await runVectorStore(
      {
        mode: "load",
        weaviateCollection: "Documents",
        prompt: "={{ $json.topic }}",
        topK: 3,
        options: {
          includeDocumentMetadata: true,
          hybrid,
          searchFilterJson,
        },
      },
      [{ topic: "neural networks" }],
      { documentHandle: null },
    );

    const graphqlCalls = httpMock.calls.filter((c) => c.url.includes("/v1/graphql"));
    expect(graphqlCalls.length).toBeGreaterThanOrEqual(1);
    const body = graphqlCalls[0].body as { query?: string };
    expect(body.query).toContain("hybrid:");
    expect(body.query).toContain('"deep learning"');
    expect(body.query).toContain("where:");
    expect(body.query).toContain("Equal");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Machine learning basics");
  });

  it("insert — multi-tenancy: batch objects carry tenant", async () => {
    const docs = [{ pageContent: "Tenant-specific doc", metadata: { source: "acme" } }];
    httpMock.calls = [];
    const out = await runVectorStore(
      { mode: "insert", weaviateCollection: "Documents", tenantName: "acme-corp" },
      [{}],
      { documentHandle: makeDocumentHandle(docs) },
    );

    const batchCalls = httpMock.calls.filter((c) => c.url.includes("/v1/batch/objects"));
    expect(batchCalls.length).toBeGreaterThanOrEqual(1);
    const batchBody = batchCalls[0].body as { objects?: Array<Record<string, unknown>> };
    expect(batchBody.objects).toBeDefined();
    expect(batchBody.objects!.length).toBeGreaterThanOrEqual(1);
    expect(batchBody.objects![0].tenant).toBe("acme-corp");
    expect(out[0]).toHaveLength(1);
  });

  it("retrieve-as-tool — uses options-nested searchFilter and hybrid", async () => {
    httpMock.calls = [];
    const out = await runVectorStore(
      {
        mode: "retrieve-as-tool",
        weaviateCollection: "Documents",
        toolDescription: "Search engine",
        options: {
          includeDocumentMetadata: false,
          searchFilterJson: { path: ["status"], operator: "Equal", valueString: "published" },
        },
      },
      [{}],
      { documentHandle: null },
    );

    expect(out[0]).toHaveLength(1);
    const tool = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(typeof tool.getRelevantDocuments).toBe("function");
  });
});

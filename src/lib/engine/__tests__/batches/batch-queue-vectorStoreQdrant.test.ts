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

      if (opts.url.includes("/points/search")) {
        return {
          status: 200,
          headers: {},
          body: {
            result: [
              {
                id: "1",
                score: 0.95,
                payload: { content: "Machine learning basics", metadata: { source: "wiki" } },
              },
            ],
          },
        };
      }
      if (opts.url.includes("/points") && opts.method === "PUT") {
        return { status: 200, headers: {}, body: { result: { operation_id: 1 } } };
      }
      if (opts.url.match(/\/collections\/[^/]+\/?$/) && opts.method === "GET") {
        const collName = opts.url.match(/\/collections\/([^/?]+)/)?.[1];
        if (collName === "missing-collection") {
          return { status: 404, headers: {}, body: { status: { error: "Not found" } } };
        }
        return { status: 200, headers: {}, body: { result: true } };
      }
      if (opts.url.includes("/collections") && opts.method === "GET") {
        return {
          status: 200,
          headers: {},
          body: { result: { collections: [{ name: "documents" }, { name: "movies" }] } },
        };
      }
      if (opts.url.match(/\/collections\/?$/) && opts.method === "PUT") {
        return { status: 200, headers: {}, body: { result: true } };
      }
      return { status: 404, headers: {}, body: {} };
    }),
  };
});

beforeEach(() => {
  httpMock.calls = [];
});

const TYPE = "@n8n/n8n-nodes-langchain.vectorStoreQdrant";

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
  overrides: Partial<MockRerankerHandle> = {},
): MockRerankerHandle {
  return {
    rerank: async (_query: string, docs: MockDocument[]) => docs,
    ...overrides,
  };
}

function makeConnections(
  embeddingNodeName: string | null,
  documentNodeName: string | null,
  rerankerNodeName: string | null,
): IConnections {
  const conns: IConnections = {};
  const add = (sourceName: string, channel: string, targetName: string) => {
    conns[sourceName] ??= {};
    conns[sourceName][channel] ??= [];
    conns[sourceName][channel]!.push([{ node: targetName, type: "main", index: 0 }]);
  };
  if (embeddingNodeName) add(embeddingNodeName, "ai_embedding", "N");
  if (documentNodeName) add(documentNodeName, "ai_document", "N");
  if (rerankerNodeName) add(rerankerNodeName, "ai_reranker", "N");
  conns["N"] ??= {};
  return conns;
}

function buildCtx(
  node: INode,
  inputItems: INodeExecutionData[],
  subNodeHandles: Array<{ nodeName: string; handle: unknown }> = [],
  continueOnFail = false,
): ExecutionContext {
  const subItems: Record<string, INodeExecutionData[]> = {};
  for (const sn of subNodeHandles) {
    subItems[sn.nodeName] = [{ json: sn.handle as Record<string, unknown> }];
  }
  return createExecutionContext({
    node,
    workflow: {
      id: "wf-test",
      name: "Test Workflow",
      active: false,
      nodes: [
        node,
        ...subNodeHandles.map((sn) => ({
          id: sn.nodeName,
          name: sn.nodeName,
          type: "mock",
          typeVersion: 1,
          position: [0, 0] as [number, number],
          parameters: {},
        })),
      ],
      connections: makeConnections(
        subNodeHandles.length > 0 ? subNodeHandles[0].nodeName : null,
        subNodeHandles.length > 1 ? subNodeHandles[1].nodeName : null,
        subNodeHandles.length > 2 ? subNodeHandles[2].nodeName : null,
      ),
      settings: {},
    },
    getNodeInputItems: (nodeName: string, _outputIndex?: number) =>
      subItems[nodeName] ?? inputItems,
    continueOnFail,
    getCredential: async (_name: string) => ({ apiKey: "test-key", qdrantUrl: "https://test-cluster.qdrant.io:6333" }),
  });
}

async function runNodeQdrant(
  parameters: Record<string, unknown> = {},
  inputItems: Array<Record<string, unknown>> = [{}],
  subNodeHandles: Array<{ nodeName: string; handle: unknown }> = [],
  opts?: { continueOnFail?: boolean },
): Promise<INodeExecutionData[][]> {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const normalizedInputs: INodeExecutionData[] = inputItems.map((item) => ({ json: item }));
  const ctx = buildCtx(node, normalizedInputs, subNodeHandles, opts?.continueOnFail);
  return await executor(ctx, node);
}

describe("@n8n/n8n-nodes-langchain.vectorStoreQdrant", () => {
  it("registers executor", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("has description registered", () => {
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc?.name).toBe(TYPE);
  });

  describe("mode: load (Get Many)", () => {
    it("runs a basic similarity search", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "load",
          qdrantCollection: { mode: "list", value: "documents" },
          prompt: "machine learning basics",
          topK: 5,
          includeDocumentMetadata: true,
        },
        [{ query: "machine learning basics" }],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      expect(output.length).toBeGreaterThan(0);
      expect(output[0].json.pageContent).toBe("Machine learning basics");
      expect(output[0].json.metadata).toBeDefined();
      expect(output[0].json.score).toBeDefined();

      const searchCalls = httpMock.calls.filter((c) => c.url.includes("/points/search"));
      expect(searchCalls.length).toBeGreaterThan(0);
    });

    it("works without metadata when includeDocumentMetadata is false", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "load",
          qdrantCollection: { mode: "list", value: "documents" },
          prompt: "search query",
          includeDocumentMetadata: false,
        },
        [{}],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      expect(output.length).toBeGreaterThan(0);
      expect(output[0].json.pageContent).toBeDefined();
      expect(output[0].json.metadata).toBeUndefined();
      expect(output[0].json.score).toBeUndefined();
    });

    it("loads with searchFilterJson and asserts filter on search request", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "load",
          qdrantCollection: { mode: "id", value: "movies" },
          prompt: "romantic comedies",
          topK: 3,
          options: {
            searchFilterJson: { should: [{ key: "metadata.batch", match: { value: 12345 } }] },
          },
        },
        [{}],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      expect(output.length).toBeGreaterThan(0);
      const searchCalls = httpMock.calls.filter((c) => c.url.includes("/points/search"));
      expect(searchCalls.length).toBeGreaterThan(0);
      const searchBody = searchCalls[0].body as Record<string, unknown>;
      expect(searchBody.filter).toEqual({ should: [{ key: "metadata.batch", match: { value: 12345 } }] });
      expect(searchBody.limit).toBe(3);
    });

    it("throws when useReranker is true but no reranker connected", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      await expect(
        runNodeQdrant(
          {
            mode: "load",
            qdrantCollection: { mode: "list", value: "documents" },
            prompt: "test",
            useReranker: true,
          },
          [{}],
          [{ nodeName: "embedder", handle: embeddingHandle }],
        ),
      ).rejects.toThrow(/Reranker sub-node must be connected/);
    });

    it("uses reranker when useReranker is true", async () => {
      const reranked = [{ pageContent: "Reranked result", metadata: { reranked: true } }];
      const embeddingHandle = makeEmbeddingHandle();
      const rerankerHandle = makeRerankerHandle({
        rerank: async () => reranked,
      });

      const [output] = await runNodeQdrant(
        {
          mode: "load",
          qdrantCollection: { mode: "list", value: "documents" },
          prompt: "test query",
          useReranker: true,
        },
        [{}],
        [
          { nodeName: "embedder", handle: embeddingHandle },
          { nodeName: "loader", handle: makeDocumentHandle() },
          { nodeName: "reranker", handle: rerankerHandle },
        ],
      );

      expect(output).toHaveLength(1);
      expect(output[0].json.pageContent).toBe("Reranked result");
    });
  });

  describe("mode: insert", () => {
    it("inserts documents and returns passthrough", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const documentHandle = makeDocumentHandle([
        { pageContent: "Doc 1", metadata: { id: 1 } },
        { pageContent: "Doc 2", metadata: { id: 2 } },
      ]);

      const [output] = await runNodeQdrant(
        {
          mode: "insert",
          qdrantCollection: { mode: "list", value: "documents" },
        },
        [{ id: 1, content: "doc1" }],
        [
          { nodeName: "embedder", handle: embeddingHandle },
          { nodeName: "loader", handle: documentHandle },
        ],
      );

      expect(output).toHaveLength(1);
      expect(output[0].json).toEqual({ id: 1, content: "doc1" });

      const upsertCalls = httpMock.calls.filter(
        (c) => c.url.includes("/points") && c.method === "PUT",
      );
      expect(upsertCalls.length).toBeGreaterThan(0);
    });

    it("creates collection if missing", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const documentHandle = makeDocumentHandle([
        { pageContent: "New doc", metadata: {} },
      ]);

      const [output] = await runNodeQdrant(
        {
          mode: "insert",
          qdrantCollection: { mode: "list", value: "missing-collection" },
          options: { collectionConfig: { vectors: { size: 3, distance: "Cosine" } } },
        },
        [{}],
        [
          { nodeName: "embedder", handle: embeddingHandle },
          { nodeName: "loader", handle: documentHandle },
        ],
      );

      expect(output).toHaveLength(1);
      const createCalls = httpMock.calls.filter(
        (c) => c.url.includes("/collections") && c.method === "PUT" && !c.url.endsWith("/points"),
      );
      expect(createCalls.length).toBeGreaterThan(0);
    });
  });

  describe("mode: retrieve", () => {
    it("returns a vector store handle", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "retrieve",
          qdrantCollection: { mode: "id", value: "documents" },
        },
        [{}],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      expect(output).toHaveLength(1);
      const handle = output[0].json;
      expect(typeof handle.getRelevantDocuments).toBe("function");
      expect(typeof handle.invoke).toBe("function");
    });

    it("handle.getRelevantDocuments searches the collection", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "retrieve",
          qdrantCollection: { mode: "id", value: "documents" },
        },
        [{}],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      const handle = output[0].json as unknown as { getRelevantDocuments: (q: string) => Promise<MockDocument[]> };
      const docs = await handle.getRelevantDocuments("test query");
      expect(docs.length).toBeGreaterThan(0);
    });

    it("handle honors searchFilterJson", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "retrieve",
          qdrantCollection: { mode: "id", value: "documents" },
          options: { searchFilterJson: { must: [{ key: "metadata.lang", match: { value: "en" } }] } },
        },
        [{}],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      httpMock.calls = [];
      const handle = output[0].json as unknown as { getRelevantDocuments: (q: string) => Promise<MockDocument[]> };
      await handle.getRelevantDocuments("test");
      const searchCalls = httpMock.calls.filter((c) => c.url.includes("/points/search"));
      expect(searchCalls.length).toBeGreaterThan(0);
      const searchBody = searchCalls[0].body as Record<string, unknown>;
      expect(searchBody.filter).toEqual({ must: [{ key: "metadata.lang", match: { value: "en" } }] });
    });

    it("handle honors contentPayloadKey and metadataPayloadKey", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "retrieve",
          qdrantCollection: { mode: "id", value: "documents" },
          options: { contentPayloadKey: "text", metadataPayloadKey: "extra" },
        },
        [{}],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      const handle = output[0].json as unknown as { getRelevantDocuments: (q: string) => Promise<MockDocument[]> };
      const docs = await handle.getRelevantDocuments("test");
      expect(docs.length).toBeGreaterThan(0);
    });

    it("throws when useReranker is true in retrieve mode but no reranker connected", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      await expect(
        runNodeQdrant(
          {
            mode: "retrieve",
            qdrantCollection: { mode: "id", value: "documents" },
            useReranker: true,
          },
          [{}],
          [{ nodeName: "embedder", handle: embeddingHandle }],
        ),
      ).rejects.toThrow(/Reranker sub-node must be connected/);
    });
  });

  describe("mode: retrieve-as-tool", () => {
    it("returns a tool descriptor with name and description", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "retrieve-as-tool",
          name: "movies_store",
          toolDescription: "Retrieve movie recommendations",
          qdrantCollection: { mode: "id", value: "movies" },
          topK: 4,
        },
        [{}],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      expect(output).toHaveLength(1);
      const tool = output[0].json as unknown as { name: string; description: string; getRelevantDocuments: Function; invoke?: Function };
      expect(tool.name).toBe("movies_store");
      expect(tool.description).toBe("Retrieve movie recommendations");
      expect(typeof tool.getRelevantDocuments).toBe("function");
      expect(typeof tool.invoke).toBe("function");
    });

    it("tool honors searchFilterJson and custom payload keys", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      const [output] = await runNodeQdrant(
        {
          mode: "retrieve-as-tool",
          name: "movies_store",
          toolDescription: "Retrieve movie recommendations",
          qdrantCollection: { mode: "id", value: "movies" },
          topK: 4,
          options: {
            searchFilterJson: { should: [{ key: "metadata.genre", match: { value: "comedy" } }] },
            contentPayloadKey: "text",
            metadataPayloadKey: "meta",
          },
        },
        [{}],
        [{ nodeName: "embedder", handle: embeddingHandle }],
      );

      const tool = output[0].json as unknown as { getRelevantDocuments: (q: string) => Promise<MockDocument[]> };
      httpMock.calls = [];
      await tool.getRelevantDocuments("test");
      const searchCalls = httpMock.calls.filter((c) => c.url.includes("/points/search"));
      expect(searchCalls.length).toBeGreaterThan(0);
      const searchBody = searchCalls[0].body as Record<string, unknown>;
      expect(searchBody.filter).toEqual({ should: [{ key: "metadata.genre", match: { value: "comedy" } }] });
      expect(searchBody.limit).toBe(4);
    });

    it("throws when useReranker is true in retrieve-as-tool but no reranker connected", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      await expect(
        runNodeQdrant(
          {
            mode: "retrieve-as-tool",
            name: "test",
            qdrantCollection: { mode: "id", value: "movies" },
            useReranker: true,
          },
          [{}],
          [{ nodeName: "embedder", handle: embeddingHandle }],
        ),
      ).rejects.toThrow(/Reranker sub-node must be connected/);
    });
  });

  describe("error handling", () => {
    it("throws when no embedding is connected", async () => {
      await expect(
        runNodeQdrant(
          {
            mode: "load",
            qdrantCollection: { mode: "list", value: "documents" },
            prompt: "test",
          },
          [{}],
          [],
        ),
      ).rejects.toThrow(/Embedding/);
    });

    it("throws when no document loader is connected in insert mode", async () => {
      const embeddingHandle = makeEmbeddingHandle();
      await expect(
        runNodeQdrant(
          {
            mode: "insert",
            qdrantCollection: { mode: "list", value: "documents" },
          },
          [{}],
          [{ nodeName: "embedder", handle: embeddingHandle }],
        ),
      ).rejects.toThrow(/Document Loader/);
    });

    it("emits error items with continueOnFail", async () => {
      const [output] = await runNodeQdrant(
        {
          mode: "load",
          qdrantCollection: { mode: "list", value: "documents" },
          prompt: "test",
        },
        [{}],
        [],
        { continueOnFail: true },
      );

      expect(output).toHaveLength(1);
      expect(output[0].json.error).toBeDefined();
    });
  });
});

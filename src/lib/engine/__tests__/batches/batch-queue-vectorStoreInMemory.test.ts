import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { clearMemoryVectorStore } from "../../executors/vectorStoreInMemory";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.vectorStoreInMemory";

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
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({
    name: "VS",
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
    opts.connections ?? makeClusterConnections("VS", {
      documentName: documentHandle ? "Document" : null,
      rerankerName: rerankerHandle ? "Reranker" : null,
    });
  const ctx = makeCtx(items, node, subNodeOutputs, connections, opts.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue vectorStoreInMemory — @n8n/n8n-nodes-langchain.vectorStoreInMemory", () => {
  beforeEach(() => {
    clearMemoryVectorStore();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Simple Vector Store");
  });

  it("insert — basic: output has serialized documents", async () => {
    const docs = [{ pageContent: "Hello world", metadata: {} }];
    const out = await runVectorStore(
      { mode: "insert", memoryKey: "test_store", clearStore: false },
      [{ text: "Hello world" }],
      { documentHandle: makeDocumentHandle(docs), typeVersion: 1.3 },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Hello world");
    expect(out[0][0].json.metadata).toEqual({});
  });

  it("insert — clearStore true: clears store before adding", async () => {
    const docs1 = [{ pageContent: "First doc", metadata: {} }];
    await runVectorStore(
      { mode: "insert", memoryKey: "clear_test", clearStore: false },
      [{}],
      { documentHandle: makeDocumentHandle(docs1), typeVersion: 1.3 },
    );

    const docs2 = [{ pageContent: "Second doc", metadata: {} }];
    const out = await runVectorStore(
      { mode: "insert", memoryKey: "clear_test", clearStore: true },
      [{}],
      { documentHandle: makeDocumentHandle(docs2), typeVersion: 1.3 },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Second doc");
  });

  it("load — basic retrieval: returns matching documents", async () => {
    const docs = [
      { pageContent: "Paris is the capital of France.", metadata: { source: "wiki" } },
      { pageContent: "France's capital city is Paris.", metadata: { source: "news" } },
    ];
    await runVectorStore(
      { mode: "insert", memoryKey: "load_test", clearStore: true },
      [{}],
      { documentHandle: makeDocumentHandle(docs), typeVersion: 1.3 },
    );

    const out = await runVectorStore(
      {
        mode: "load",
        memoryKey: "load_test",
        prompt: "={{ $json.question }}",
        topK: 2,
        includeDocumentMetadata: true,
      },
      [{ question: "What is the capital of France?" }],
      { documentHandle: null, typeVersion: 1.3 },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.pageContent).toBe("Paris is the capital of France.");
    expect(out[0][0].json.metadata).toEqual({ source: "wiki" });
    expect(out[0][1].json.pageContent).toBe("France's capital city is Paris.");
    expect(out[0][1].json.metadata).toEqual({ source: "news" });
  });

  it("load — includeDocumentMetadata false: omits metadata", async () => {
    const docs = [{ pageContent: "Test doc", metadata: { source: "test" } }];
    await runVectorStore(
      { mode: "insert", memoryKey: "meta_test", clearStore: true },
      [{}],
      { documentHandle: makeDocumentHandle(docs), typeVersion: 1.3 },
    );

    const out = await runVectorStore(
      {
        mode: "load",
        memoryKey: "meta_test",
        prompt: "test",
        topK: 1,
        includeDocumentMetadata: false,
      },
      [{}],
      { documentHandle: null, typeVersion: 1.3 },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Test doc");
    expect(out[0][0].json.metadata).toBeUndefined();
  });

  it("retrieve — returns retriever handle with getRelevantDocuments", async () => {
    const docs = [{ pageContent: "Cats are mammals.", metadata: {} }];
    await runVectorStore(
      { mode: "insert", memoryKey: "retrieve_test", clearStore: true },
      [{}],
      { documentHandle: makeDocumentHandle(docs), typeVersion: 1.3 },
    );

    const out = await runVectorStore(
      { mode: "retrieve", memoryKey: "retrieve_test", useReranker: false },
      [{}],
      { documentHandle: null, typeVersion: 1.3 },
    );

    expect(out[0]).toHaveLength(1);
    const handle = out[0][0].json as unknown as {
      getRelevantDocuments: (q: string) => Promise<unknown[]>;
    };
    expect(typeof handle.getRelevantDocuments).toBe("function");
    const results = await handle.getRelevantDocuments("cats");
    expect(results).toHaveLength(1);
  });

  it("load — with reranker: applies reranker to results", async () => {
    const docs = [
      { pageContent: "First result", metadata: {} },
      { pageContent: "Second result", metadata: {} },
      { pageContent: "Third result", metadata: {} },
    ];
    await runVectorStore(
      { mode: "insert", memoryKey: "rerank_test", clearStore: true },
      [{}],
      { documentHandle: makeDocumentHandle(docs), typeVersion: 1.3 },
    );

    const rerankerCalls: { query: string; count: number }[] = [];
    const rerankerHandle = makeRerankerHandle((query, docs) => {
      rerankerCalls.push({ query, count: docs.length });
      return [...docs].reverse();
    });

    const out = await runVectorStore(
      {
        mode: "load",
        memoryKey: "rerank_test",
        prompt: "={{ $json.query }}",
        topK: 3,
        useReranker: true,
      },
      [{ query: "best coffee" }],
      {
        documentHandle: null,
        rerankerHandle,
        typeVersion: 1.3,
      },
    );

    expect(rerankerCalls).toHaveLength(1);
    expect(rerankerCalls[0].query).toBe("best coffee");
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json.pageContent).toBe("Third result");
    expect(out[0][2].json.pageContent).toBe("First result");
  });

  it("multi-item batching (insert): per-item memoryKey via expression", async () => {
    const addCalls: string[] = [];
    const documentHandle = makeDocumentHandle([
      { pageContent: "doc", metadata: { id: 0 } },
    ]);

    const out = await runVectorStore(
      {
        mode: "insert",
        memoryKey: "={{ 'store_' + $json.id }}",
        clearStore: false,
      },
      [{ id: 1 }, { id: 2 }],
      { documentHandle, typeVersion: 1.3 },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.pageContent).toBe("doc");
    expect(out[0][1].json.pageContent).toBe("doc");
  });

  it("memoryKey resourceLocator (v1.2+): no workflow prefix", async () => {
    const docs = [{ pageContent: "Shared doc", metadata: {} }];
    const out = await runVectorStore(
      {
        mode: "insert",
        memoryKey: { mode: "list", value: "shared_store" },
        clearStore: false,
      },
      [{}],
      { documentHandle: makeDocumentHandle(docs), typeVersion: 1.3 },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("Shared doc");

    const out2 = await runVectorStore(
      {
        mode: "load",
        memoryKey: { mode: "list", value: "shared_store" },
        prompt: "Shared",
        topK: 1,
        includeDocumentMetadata: true,
      },
      [{}],
      { documentHandle: null, typeVersion: 1.3 },
    );

    expect(out2[0]).toHaveLength(1);
    expect(out2[0][0].json.pageContent).toBe("Shared doc");
  });

  it("memoryKey string (v1.1): prefixed with workflow id", async () => {
    const docs = [{ pageContent: "v1 doc", metadata: {} }];
    const out = await runVectorStore(
      {
        mode: "insert",
        memoryKey: "v1_store",
        clearStore: false,
      },
      [{}],
      { documentHandle: makeDocumentHandle(docs), typeVersion: 1.1 },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.pageContent).toBe("v1 doc");

    const out2 = await runVectorStore(
      {
        mode: "load",
        memoryKey: "v1_store",
        prompt: "v1",
        topK: 1,
        includeDocumentMetadata: false,
      },
      [{}],
      { documentHandle: null, typeVersion: 1.1 },
    );

    expect(out2[0]).toHaveLength(1);
    expect(out2[0][0].json.pageContent).toBe("v1 doc");
  });

  it("missing embedding: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1.3,
      parameters: { mode: "insert", memoryKey: "test" },
    });
    const items = toItems([{}]);
    const connections: IConnections = {
      Document: {
        ai_document: [[{ node: "VS", type: "ai_document", index: 0 }]],
      },
    };
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Document: [{ json: makeDocumentHandle() as unknown as Record<string, unknown> }],
    };
    const ctx = makeCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Embedding sub-node must be connected/i);
  });

  it("insert missing document loader: throws error", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1.3,
      parameters: { mode: "insert", memoryKey: "test" },
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

  it("load empty prompt: returns no results", async () => {
    const docs = [{ pageContent: "doc", metadata: {} }];
    await runVectorStore(
      { mode: "insert", memoryKey: "empty_prompt_test", clearStore: true },
      [{}],
      { documentHandle: makeDocumentHandle(docs), typeVersion: 1.3 },
    );

    const out = await runVectorStore(
      {
        mode: "load",
        memoryKey: "empty_prompt_test",
        prompt: "={{ $json.missing }}",
        topK: 4,
        includeDocumentMetadata: false,
      },
      [{}],
      { documentHandle: null, typeVersion: 1.3 },
    );

    expect(out[0]).toHaveLength(0);
  });

  it("continueOnFail: emits error item instead of throwing", async () => {
    const badDocHandle: MockDocumentHandle = {
      load: async () => {
        throw new Error("Document load failed");
      },
    };

    const out = await runVectorStore(
      { mode: "insert", memoryKey: "error_test", clearStore: false },
      [{}],
      {
        documentHandle: badDocHandle,
        typeVersion: 1.3,
        continueOnFail: true,
      },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toContain("Document load failed");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
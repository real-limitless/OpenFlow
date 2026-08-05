import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.vectorStoreSupabaseInsert";

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

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  const headers: Record<string, string> = { "content-type": "application/json" };
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: {
      get: (k: string) => headers[k] ?? null,
      forEach: (fn: (v: string, k: string) => void) => {
        for (const [k, v] of Object.entries(headers)) fn(v, k);
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

function installFetch() {
  vi.stubGlobal("fetch", vi.fn(async () => mockResponse({})));
}

function uninstallFetch() {
  vi.unstubAllGlobals();
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
  docs: MockDocument[] = [{ pageContent: "test content", metadata: { source: "test" } }],
): MockDocumentHandle {
  return {
    load: async () => docs,
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
  } = {},
): IConnections {
  const embeddingName = opts.embeddingName ?? "Embedding";
  const documentName = opts.documentName ?? "Document";
  const connections: IConnections = {};
  connections[embeddingName] = {
    ai_embedding: [[{ node: vectorStoreName, type: "ai_embedding", index: 0 }]],
  };
  if (documentName) {
    connections[documentName] = {
      ai_document: [[{ node: vectorStoreName, type: "ai_document", index: 0 }]],
    };
  }
  return connections;
}

function makeSubOutputs(
  embeddingHandle: MockEmbeddingHandle,
  documentHandle?: MockDocumentHandle | null,
): Record<string, INodeExecutionData[]> {
  const out: Record<string, INodeExecutionData[]> = {
    Embedding: [{ json: embeddingHandle as unknown as Record<string, unknown> }],
  };
  if (documentHandle) {
    out.Document = [{ json: documentHandle as unknown as Record<string, unknown> }];
  }
  return out;
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  subNodeOutputs: Record<string, INodeExecutionData[]>,
  connections: IConnections,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
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
    getCredential: async (name: string) => credentials?.[name] ?? null,
  });
}

async function runVectorStoreInsert(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    embeddingHandle?: MockEmbeddingHandle;
    documentHandle?: MockDocumentHandle | null;
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
  const subNodeOutputs =
    opts.subNodeOutputs ?? makeSubOutputs(embeddingHandle, documentHandle);
  const connections =
    opts.connections ?? makeClusterConnections("VS", {
      documentName: documentHandle ? "Document" : null,
    });
  const ctx = makeCtx(items, node, subNodeOutputs, connections, opts.continueOnFail, {
    supabaseApi: { host: "project.supabase.co", secretKey: "test-key" },
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue vectorStoreSupabaseInsert — @n8n/n8n-nodes-langchain.vectorStoreSupabaseInsert", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Supabase: Insert");
  });

  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    uninstallFetch();
  });

  it("insert single document — passthrough", async () => {
    const inputItems = [{ json: { id: 1, source: "doc1" } }];
    const docs = [{ pageContent: "test content", metadata: { source: "test" } }];
    const out = await runVectorStoreInsert(
      { tableName: "documents", queryName: "match_documents" },
      inputItems,
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(1);
    expect(out[0][0].json.source).toBe("doc1");
  });

  it("insert with tableName expression", async () => {
    const docs = [{ pageContent: "test content", metadata: {} }];
    const out = await runVectorStoreInsert(
      { tableName: "={{ $json.table }}" },
      [{ json: { table: "my_vectors" } }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.table).toBe("my_vectors");
  });

  it("insert multiple documents from loader", async () => {
    const docs = [
      { pageContent: "doc one", metadata: { idx: 1 } },
      { pageContent: "doc two", metadata: { idx: 2 } },
    ];
    const out = await runVectorStoreInsert(
      { tableName: "documents" },
      [{ json: { batch: "a" } }],
      { documentHandle: makeDocumentHandle(docs) },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.batch).toBe("a");
  });

  it("missing sub-node error — no embedding", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { tableName: "documents" },
    });
    const items = toItems([{ json: {} }]);
    const connections: IConnections = {
      Document: {
        ai_document: [[{ node: "VS", type: "ai_document", index: 0 }]],
      },
    };
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Document: [{ json: makeDocumentHandle() as unknown as Record<string, unknown> }],
    };
    const ctx = makeCtx(items, node, subNodeOutputs, connections, false, {
      supabaseApi: { host: "project.supabase.co", secretKey: "test-key" },
    });
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Embedding sub-node must be connected/i);
  });

  it("missing sub-node error — no document", async () => {
    const node = makeNode({
      name: "VS",
      type: TYPE,
      typeVersion: 1,
      parameters: { tableName: "documents" },
    });
    const items = toItems([{ json: {} }]);
    const connections: IConnections = {
      Embedding: {
        ai_embedding: [[{ node: "VS", type: "ai_embedding", index: 0 }]],
      },
    };
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Embedding: [{ json: makeEmbeddingHandle() as unknown as Record<string, unknown> }],
    };
    const ctx = makeCtx(items, node, subNodeOutputs, connections, false, {
      supabaseApi: { host: "project.supabase.co", secretKey: "test-key" },
    });
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Document Loader sub-node must be connected/i);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

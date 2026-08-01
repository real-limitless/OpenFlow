import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { ExecutionContext, INodeExecutionData } from "@/sdk";
import type { INode, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { RetrieverVectorStoreHandle } from "../../executors/retrieverVectorStore";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.retrieverVectorStore";

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}

function makeVectorStoreHandle(docs: Document[] = []): Record<string, unknown> {
  return {
    type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
    similaritySearch: async (query: string, k: number): Promise<Document[]> => {
      return docs.slice(0, k);
    },
  } as unknown as Record<string, unknown>;
}

function makeCtx(
  items: Array<Record<string, unknown> | INodeExecutionData>,
  node: INode,
  subNodeOutputs: Record<string, INodeExecutionData[]>,
  connections: IConnections,
): ExecutionContext {
  const normalized: INodeExecutionData[] = items.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
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
      if (name === node.name) return normalized;
      return subNodeOutputs[name] ?? [];
    },
    continueOnFail: false,
  });
}

async function runRetriever(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>>,
  vectorStoreDocs?: Document[],
): Promise<{ out: INodeExecutionData[][]; ctx: ExecutionContext }> {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);

  const vectorStoreNodeName = "VectorStore";
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const connections: IConnections = {
    [vectorStoreNodeName]: {
      ai_vectorStore: [[{ node: node.name, type: "ai_vectorStore", index: 0 }]],
    },
  };
  const subNodeOutputs: Record<string, INodeExecutionData[]> = {
    [vectorStoreNodeName]: [
      {
        json: makeVectorStoreHandle(vectorStoreDocs ?? []),
      },
    ],
  };

  const ctx = makeCtx(inputItems, node, subNodeOutputs, connections);
  const out = await executor(ctx, node);
  return { out, ctx };
}

describe("batch-queue retrieverVectorStore — @n8n/n8n-nodes-langchain.retrieverVectorStore", () => {
  beforeEach(() => seedBuiltinExecutors());

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Vector Store Retriever");
  });

  it("static topK=5 with passthrough and handle assertions", async () => {
    const { out } = await runRetriever({ topK: 5 }, [{ json: { limit: 5 } }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ limit: 5 });
    const handle = out[1][0].json as unknown as RetrieverVectorStoreHandle;
    expect(handle.topK).toBe(5);
    expect(handle.type).toBe("@n8n/n8n-nodes-langchain.retrieverVectorStore");
  });

  it("default topK is 4 when param absent", async () => {
    const { out } = await runRetriever({}, [{}]);
    expect(out[0]).toHaveLength(1);
    const handle = out[1][0].json as unknown as RetrieverVectorStoreHandle;
    expect(handle.topK).toBe(4);
  });

  it("expression-driven topK resolves against first item", async () => {
    const { out } = await runRetriever(
      { topK: "={{ $json.desiredCount }}" },
      [{ json: { desiredCount: 3 } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ desiredCount: 3 });
    const handle = out[1][0].json as unknown as RetrieverVectorStoreHandle;
    expect(handle.topK).toBe(3);
  });

  it("sub-node expression resolves first item only with two input items", async () => {
    const { out } = await runRetriever(
      { topK: "={{ $json.limit }}" },
      [{ json: { limit: 10 } }, { json: { limit: 1 } }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ limit: 10 });
    expect(out[0][1].json).toEqual({ limit: 1 });
    const handle = out[1][0].json as unknown as RetrieverVectorStoreHandle;
    expect(handle.topK).toBe(10);
  });

  it("multiple items pass through unmodified", async () => {
    const items = [{ json: { a: 1 } }, { json: { a: 2 } }, { json: { a: 3 } }];
    const { out } = await runRetriever({ topK: 4 }, items);
    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toEqual({ a: 1 });
    expect(out[0][1].json).toEqual({ a: 2 });
    expect(out[0][2].json).toEqual({ a: 3 });
    const handle = out[1][0].json as unknown as RetrieverVectorStoreHandle;
    expect(handle.topK).toBe(4);
  });

  it("throws error when no ai_vectorStore is connected", async () => {
    const node = makeNode({ name: "N", type: TYPE, parameters: { topK: 4 } });
    const ctx = makeCtx([{}], node, {}, {});
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(
      /Vector Store.*must be connected/i,
    );
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("handle.getRelevantDocuments and invoke respect topK limit", async () => {
    const docs: Document[] = [
      { pageContent: "doc1", metadata: {} },
      { pageContent: "doc2", metadata: {} },
      { pageContent: "doc3", metadata: {} },
      { pageContent: "doc4", metadata: {} },
      { pageContent: "doc5", metadata: {} },
    ];
    const { out } = await runRetriever({ topK: 3 }, [{}], docs);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    const handle = out[1][0].json as unknown as RetrieverVectorStoreHandle;
    expect(handle.topK).toBe(3);
    const relevantResult = await handle.getRelevantDocuments("q");
    expect(relevantResult).toHaveLength(3);
    expect(relevantResult[0].pageContent).toBe("doc1");
    const invokeResult = await handle.invoke({ query: "q" });
    expect(invokeResult).toHaveLength(3);
    expect(invokeResult[0].pageContent).toBe("doc1");
  });
});

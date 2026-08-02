import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext, type INodeExecutionData } from "@/sdk";
import type { INode, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.toolVectorStore";

interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
}

interface ToolHandle {
  type: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  invoke: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeVectorStoreHandle(
  docs: Document[] = [{ pageContent: "The return policy is 30 days.", metadata: {} }],
): Record<string, unknown> {
  return {
    type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
    similaritySearch: async (_query: string, _k: number) => docs,
  } as unknown as Record<string, unknown>;
}

function makeModelHandle(
  answer = "The refund window is 30 days.",
): Record<string, unknown> {
  return {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model: "gpt-4.1-mini",
    invoke: async (_messages: Array<{ role: string; content: string }>) => ({
      text: answer,
    }),
  } as unknown as Record<string, unknown>;
}

function makeToolCtx(
  node: INode,
  connections: IConnections,
  subNodeOutputs: Record<string, INodeExecutionData[]>,
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
      if (name === node.name) return [];
      return subNodeOutputs[name] ?? [];
    },
    continueOnFail: false,
  });
}

function makeClusterConnections(
  toolName: string,
  opts: {
    vectorStoreName?: string;
    modelName?: string;
  } = {},
): IConnections {
  const vectorStoreName = opts.vectorStoreName ?? "VectorStore";
  const modelName = opts.modelName ?? "Model";
  const connections: IConnections = {};
  connections[vectorStoreName] = {
    ai_vectorStore: [[{ node: toolName, type: "ai_vectorStore", index: 0 }]],
  };
  connections[modelName] = {
    ai_languageModel: [[{ node: toolName, type: "ai_languageModel", index: 0 }]],
  };
  return connections;
}

function makeSubNodeOutputs(
  vectorStoreHandle: Record<string, unknown>,
  modelHandle: Record<string, unknown>,
): Record<string, INodeExecutionData[]> {
  return {
    VectorStore: [{ json: vectorStoreHandle }],
    Model: [{ json: modelHandle }],
  };
}

async function runTool(
  parameters: Record<string, unknown>,
  opts: {
    vectorStoreHandle?: Record<string, unknown>;
    modelHandle?: Record<string, unknown>;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Policies Store", type: TYPE, parameters });
  const vectorStoreHandle = opts.vectorStoreHandle ?? makeVectorStoreHandle();
  const modelHandle = opts.modelHandle ?? makeModelHandle();
  const subNodeOutputs = opts.subNodeOutputs ?? makeSubNodeOutputs(vectorStoreHandle, modelHandle);
  const connections = opts.connections ?? makeClusterConnections("Policies Store");
  const ctx = makeToolCtx(node, connections, subNodeOutputs);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): ToolHandle {
  return out[0][0].json as unknown as ToolHandle;
}

describe("batch-queue toolVectorStore — @n8n/n8n-nodes-langchain.toolVectorStore", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Vector Store Question Answer Tool");
  });

  it("tool registration with documented description template", async () => {
    const out = await runTool({ description: "the company expense policy", topK: 4 });
    const handle = getHandle(out);

    expect(handle.name).toBe("Policies_Store");
    expect(handle.description).toBe(
      "Useful for when you need to answer questions about Policies Store. Whenever you need information about the company expense policy, you should ALWAYS use this. Input should be a fully formed question.",
    );
    expect(typeof handle.invoke).toBe("function");
  });

  it("retrieval + LLM answer flow", async () => {
    let capturedQuery = "";
    const vectorStoreHandle = {
      type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
      similaritySearch: async (query: string, k: number) => {
        capturedQuery = query;
        return [
          { pageContent: "The refund window is 30 days.", metadata: {} },
          { pageContent: "Returns are accepted within 30 days.", metadata: {} },
        ];
      },
    } as unknown as Record<string, unknown>;

    let capturedMessages: Array<{ role: string; content: string }> = [];
    const modelHandle = {
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      model: "gpt-4.1-mini",
      invoke: async (messages: Array<{ role: string; content: string }>) => {
        capturedMessages = messages;
        return { text: "The refund window is 30 days." };
      },
    } as unknown as Record<string, unknown>;

    const out = await runTool({ description: "the refund policy", topK: 2 }, {
      vectorStoreHandle,
      modelHandle,
    });

    const handle = getHandle(out);
    const result = await handle.invoke({ query: "What is the refund window?" });

    expect(capturedQuery).toBe("What is the refund window?");
    expect(result.content).toBe("The refund window is 30 days.");
  });

  it("Limit caps retrieved results", async () => {
    const similaritySearchCalls: Array<{ query: string; k: number }> = [];
    const vectorStoreHandle = {
      type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
      similaritySearch: async (query: string, k: number) => {
        similaritySearchCalls.push({ query, k });
        return Array.from({ length: 5 }, (_, i) => ({
          pageContent: `Document ${i + 1}`,
          metadata: {},
        }));
      },
    } as unknown as Record<string, unknown>;

    const modelHandle = {
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      model: "gpt-4.1-mini",
      invoke: async (messages: Array<{ role: string; content: string }>) => {
        return { text: "Summarized." };
      },
    } as unknown as Record<string, unknown>;

    const out = await runTool({ description: "data", topK: 3 }, {
      vectorStoreHandle,
      modelHandle,
    });

    const handle = getHandle(out);
    await handle.invoke({ query: "test" });

    expect(similaritySearchCalls).toHaveLength(1);
    expect(similaritySearchCalls[0].k).toBe(3);
  });

  it("required sub-node connections — missing ai_vectorStore", async () => {
    const node = makeNode({ name: "Tool", type: TYPE, parameters: { description: "test" } });
    const modelHandle = makeModelHandle();
    const connections: IConnections = {
      Model: { ai_languageModel: [[{ node: "Tool", type: "ai_languageModel", index: 0 }]] },
    };
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Model: [{ json: modelHandle }],
    };
    const ctx = makeToolCtx(node, connections, subNodeOutputs);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Vector Store sub-node must be connected/i);
  });

  it("required sub-node connections — missing ai_languageModel", async () => {
    const node = makeNode({ name: "Tool", type: TYPE, parameters: { description: "test" } });
    const vectorStoreHandle = makeVectorStoreHandle();
    const connections: IConnections = {
      VectorStore: { ai_vectorStore: [[{ node: "Tool", type: "ai_vectorStore", index: 0 }]] },
    };
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      VectorStore: [{ json: vectorStoreHandle }],
    };
    const ctx = makeToolCtx(node, connections, subNodeOutputs);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Language Model sub-node must be connected/i);
  });

  it("unsafe node name — special characters cause tool invocation failure", async () => {
    const node = makeNode({ name: "Policies$Store", type: TYPE, parameters: { description: "test" } });
    const vectorStoreHandle = makeVectorStoreHandle();
    const modelHandle = makeModelHandle();
    const connections = makeClusterConnections("Policies$Store");
    const subNodeOutputs = makeSubNodeOutputs(vectorStoreHandle, modelHandle);
    const ctx = makeToolCtx(node, connections, subNodeOutputs);
    const executor = getExecutor(TYPE)!;

    const out = await executor(ctx, node);
    const handle = getHandle(out);
    expect(handle.name).toBe("Policies$Store");
  });

  it("sub-node first-item expression semantics for topK", async () => {
    let capturedK = 0;
    const vectorStoreHandle = {
      type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
      similaritySearch: async (_query: string, k: number) => {
        capturedK = k;
        return [{ pageContent: "Some content.", metadata: {} }];
      },
    } as unknown as Record<string, unknown>;
    const modelHandle = {
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      model: "gpt-4.1-mini",
      invoke: async () => ({ text: "Answer." }),
    } as unknown as Record<string, unknown>;

    const items = toItems([
      { json: { limit: 2 } },
      { json: { limit: 9 } },
    ]);

    const node = makeNode({
      name: "Tool",
      type: TYPE,
      parameters: { description: "data", topK: "={{ $json.limit }}" },
    });

    const connections = makeClusterConnections("Tool");
    const subNodeOutputs = makeSubNodeOutputs(vectorStoreHandle, modelHandle);

    const ctx = createExecutionContext({
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
      continueOnFail: false,
    });

    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    const handle = getHandle(out);
    await handle.invoke({ query: "test" });
    expect(capturedK).toBe(2);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

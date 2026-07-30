import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.chainRetrievalQa";

interface MockModelInvokeResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface MockModelHandle {
  type: string;
  model: string;
  invoke: (
    messages: Array<{ role: string; content: string }>,
    tools?: unknown[],
  ) => Promise<MockModelInvokeResult>;
}

interface MockRetrieverHandle {
  type: string;
  getRelevantDocuments: (query: string) => Promise<Array<{ pageContent: string }>>;
}

function makeModelHandle(overrides: Partial<MockModelHandle> = {}): MockModelHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model: "gpt-4.1-mini",
    invoke: async () => ({
      text: "Cats are mammals.",
      model: "gpt-4.1-mini",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    }),
    ...overrides,
  };
}

function makeRetrieverHandle(
  docs: Array<{ pageContent: string }> = [{ pageContent: "Cats are mammals." }],
  overrides: Partial<MockRetrieverHandle> = {},
): MockRetrieverHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
    getRelevantDocuments: async () => docs,
    ...overrides,
  };
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeChainCtx(
  items: INodeExecutionData[],
  node: INode,
  subNodeOutputs: Record<string, INodeExecutionData[]>,
  connections: IConnections,
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
    continueOnFail: false,
  });
}

function makeClusterConnections(
  chainName: string,
  opts: {
    modelName?: string;
    retrieverName?: string;
    parserName?: string;
  } = {},
): IConnections {
  const modelName = opts.modelName ?? "Model";
  const retrieverName = opts.retrieverName ?? "Retriever";
  const connections: IConnections = {};
  connections[modelName] = {
    ai_languageModel: [[{ node: chainName, type: "ai_languageModel", index: 0 }]],
  };
  connections[retrieverName] = {
    ai_retriever: [[{ node: chainName, type: "ai_retriever", index: 0 }]],
  };
  if (opts.parserName) {
    connections[opts.parserName] = {
      ai_outputParser: [[{ node: chainName, type: "ai_outputParser", index: 0 }]],
    };
  }
  return connections;
}

function makeClusterSubOutputs(
  modelHandle: MockModelHandle,
  retrieverHandle: MockRetrieverHandle,
): Record<string, INodeExecutionData[]> {
  return {
    Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
    Retriever: [{ json: retrieverHandle as unknown as Record<string, unknown> }],
  };
}

async function runChain(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    modelHandle?: MockModelHandle;
    retrieverHandle?: MockRetrieverHandle;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "QA", type: TYPE, parameters });
  const items = toItems(inputItems);
  const modelHandle = opts.modelHandle ?? makeModelHandle();
  const retrieverHandle = opts.retrieverHandle ?? makeRetrieverHandle();
  const subNodeOutputs = opts.subNodeOutputs ?? makeClusterSubOutputs(modelHandle, retrieverHandle);
  const connections = opts.connections ?? makeClusterConnections("QA");
  const ctx = makeChainCtx(items, node, subNodeOutputs, connections);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue chainRetrievalQa — @n8n/n8n-nodes-langchain.chainRetrievalQa", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Question and Answer Chain");
  });

  it("auto query from chatInput — happy path: output is a non-empty string", async () => {
    const out = await runChain({}, [{ chatInput: "What is in the documents?" }]);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
  });

  it("define query — happy path: output is a non-empty string", async () => {
    const out = await runChain({ promptType: "define", text: "={{ $json.question }}" }, [
      { question: "Summarize the policy." },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
  });

  it("missing retriever: throws error about Retriever sub-node", async () => {
    const node = makeNode({ name: "QA", type: TYPE, parameters: {} });
    const items = toItems([{ chatInput: "Hi" }]);
    const connections: IConnections = {
      Model: { ai_languageModel: [[{ node: "QA", type: "ai_languageModel", index: 0 }]] },
    };
    const modelHandle = makeModelHandle();
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
    };
    const ctx = makeChainCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Retriever sub-node must be connected/i);
  });

  it("missing chat model: throws error about Chat Model sub-node", async () => {
    const node = makeNode({ name: "QA", type: TYPE, parameters: {} });
    const items = toItems([{ chatInput: "Hi" }]);
    const connections: IConnections = {
      Retriever: { ai_retriever: [[{ node: "QA", type: "ai_retriever", index: 0 }]] },
    };
    const retrieverHandle = makeRetrieverHandle();
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Retriever: [{ json: retrieverHandle as unknown as Record<string, unknown> }],
    };
    const ctx = makeChainCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Chat Model sub-node must be connected/i);
  });

  it("null query: throws error about no prompt", async () => {
    await expect(
      runChain({ promptType: "define", text: "={{ $json.missing }}" }, [{}]),
    ).rejects.toThrow(/No prompt specified/i);
  });

  it("retrieved context passed to model: context chunk before query in invoke", async () => {
    let captured: Array<{ role: string; content: string }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "The sky is blue.",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });
    const retrieverHandle = makeRetrieverHandle([{ pageContent: "The sky is blue." }]);

    await runChain({}, [{ chatInput: "What color is the sky?" }], { modelHandle, retrieverHandle });

    const systemIdx = captured.findIndex((m) => m.role === "system");
    const userIdx = captured.findIndex((m) => m.role === "user");
    expect(systemIdx).toBeGreaterThanOrEqual(0);
    expect(userIdx).toBeGreaterThan(systemIdx);
    expect(captured[systemIdx].content).toContain("The sky is blue.");
    expect(captured[userIdx].content).toBe("What color is the sky?");
  });

  it("multi-item batching: one retrieve + call per item, order preserved", async () => {
    const retrieverCalls: string[] = [];
    const modelCalls: string[] = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        modelCalls.push(lastUser?.content ?? "");
        return {
          text: lastUser?.content ?? "",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });
    const retrieverHandle = makeRetrieverHandle([], {
      getRelevantDocuments: async (query: string) => {
        retrieverCalls.push(query);
        return [];
      },
    });

    const out = await runChain({}, [{ chatInput: "first" }, { chatInput: "second" }], {
      modelHandle,
      retrieverHandle,
    });

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.output).toBe("first");
    expect(out[0][1].json.output).toBe("second");
    expect(retrieverCalls).toEqual(["first", "second"]);
    expect(modelCalls).toEqual(["first", "second"]);
  });

  it("output parser flag: applies parser to final text", async () => {
    const modelHandle = makeModelHandle({
      invoke: async () => ({
        text: "raw",
        model: "gpt-4.1-mini",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
    });
    const parser = {
      name: "structuredParser",
      schema: {},
      parse: (text: string) => ({ ok: text === "raw" }),
    };

    const out = await runChain(
      { promptType: "define", text: "Return structured data.", hasOutputParser: true },
      [{}],
      {
        modelHandle,
        connections: makeClusterConnections("QA", { parserName: "Parser" }),
        subNodeOutputs: {
          Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
          Retriever: [{ json: makeRetrieverHandle() as unknown as Record<string, unknown> }],
          Parser: [{ json: parser as unknown as Record<string, unknown> }],
        },
      },
    );

    expect(out[0][0].json.output).toEqual({ ok: true });
  });

  it("text field mirrors output for Chat Trigger compatibility", async () => {
    const out = await runChain({}, [{ chatInput: "Hello" }]);

    expect(out[0][0].json.output).toBe(out[0][0].json.text);
  });

  it("retriever invoke fallback: supports invoke() when getRelevantDocuments absent", async () => {
    const retrieverHandle = {
      type: "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
      invoke: async () => [{ pageContent: "via invoke" }],
    };

    const out = await runChain({}, [{ chatInput: "What?" }], {
      retrieverHandle: retrieverHandle as unknown as MockRetrieverHandle,
    });

    expect(typeof out[0][0].json.output).toBe("string");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

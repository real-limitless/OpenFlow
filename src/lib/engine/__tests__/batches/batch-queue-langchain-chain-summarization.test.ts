import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.chainSummarization";

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

interface MockDocumentLoaderHandle {
  type: string;
  load: () => Promise<Array<{ pageContent: string; metadata?: Record<string, unknown> }>>;
}

interface MockTextSplitterHandle {
  type: string;
  splitDocuments: (
    docs: Array<{ pageContent: string; metadata?: Record<string, unknown> }>,
  ) => Promise<Array<{ pageContent: string; metadata?: Record<string, unknown> }>>;
}

function makeModelHandle(overrides: Partial<MockModelHandle> = {}): MockModelHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model: "gpt-4.1-mini",
    invoke: async () => ({
      text: "A concise summary.",
      model: "gpt-4.1-mini",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    }),
    ...overrides,
  };
}

function makeDocumentLoaderHandle(
  docs: Array<{ pageContent: string; metadata?: Record<string, unknown> }> = [
    { pageContent: "Document one." },
    { pageContent: "Document two." },
  ],
): MockDocumentLoaderHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
    load: async () => docs,
  };
}

function makeTextSplitterHandle(
  chunks: Array<{ pageContent: string; metadata?: Record<string, unknown> }> = [
    { pageContent: "Split chunk one." },
    { pageContent: "Split chunk two." },
  ],
): MockTextSplitterHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
    splitDocuments: async () => chunks,
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
    loaderName?: string;
    splitterName?: string;
  } = {},
): IConnections {
  const modelName = opts.modelName ?? "Model";
  const connections: IConnections = {};
  connections[modelName] = {
    ai_languageModel: [[{ node: chainName, type: "ai_languageModel", index: 0 }]],
  };
  if (opts.loaderName) {
    connections[opts.loaderName] = {
      ai_documentLoader: [[{ node: chainName, type: "ai_documentLoader", index: 0 }]],
    };
  }
  if (opts.splitterName) {
    connections[opts.splitterName] = {
      ai_textSplitter: [[{ node: chainName, type: "ai_textSplitter", index: 0 }]],
    };
  }
  return connections;
}

function makeSubOutputs(
  modelHandle: MockModelHandle,
  extras: Record<string, INodeExecutionData[]> = {},
): Record<string, INodeExecutionData[]> {
  return {
    Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
    ...extras,
  };
}

async function runChain(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    modelHandle?: MockModelHandle;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Sum", type: TYPE, parameters });
  const items = toItems(inputItems);
  const modelHandle = opts.modelHandle ?? makeModelHandle();
  const subNodeOutputs = opts.subNodeOutputs ?? makeSubOutputs(modelHandle);
  const connections = opts.connections ?? makeClusterConnections("Sum");
  const ctx = makeChainCtx(items, node, subNodeOutputs, connections);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue chainSummarization — @n8n/n8n-nodes-langchain.chainSummarization", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Summarization Chain");
  });

  it("stuff method — small document set: output is a non-empty string", async () => {
    const out = await runChain(
      { dataType: "json", summarizationMethod: "stuff" },
      [{ text: "Document one. Document two." }],
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
  });

  it("map_reduce — chunked documents: model invoked for map and reduce steps", async () => {
    const invokeCalls: string[] = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        const userMsg = messages.find((m) => m.role === "user");
        invokeCalls.push(userMsg?.content ?? "");
        return {
          text: `summary-${invokeCalls.length}`,
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const out = await runChain(
      {
        dataType: "json",
        chunking: "simple",
        charactersPerChunk: 100,
        chunkOverlap: 10,
        summarizationMethod: "map_reduce",
      },
      [{ text: "Chunk A content." }, { text: "Chunk B content." }],
      { modelHandle },
    );

    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
    expect(invokeCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("refine — sequential refinement: model invoked once per chunk", async () => {
    const invokeCalls: string[] = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        const userMsg = messages.find((m) => m.role === "user");
        invokeCalls.push(userMsg?.content ?? "");
        return {
          text: `refined-${invokeCalls.length}`,
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const out = await runChain(
      { dataType: "json", summarizationMethod: "refine" },
      [{ text: "First passage." }, { text: "Second passage." }],
      { modelHandle },
    );

    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
    expect(invokeCalls).toHaveLength(2);
  });

  it("document loader data source — loads docs from sub-node", async () => {
    const loaderHandle = makeDocumentLoaderHandle([
      { pageContent: "Doc one from loader." },
      { pageContent: "Doc two from loader." },
    ]);

    const out = await runChain(
      { dataType: "documentLoader", summarizationMethod: "stuff" },
      [{}],
      {
        connections: makeClusterConnections("Sum", { loaderName: "Loader" }),
        subNodeOutputs: makeSubOutputs(makeModelHandle(), {
          Loader: [{ json: loaderHandle as unknown as Record<string, unknown> }],
        }),
      },
    );

    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
  });

  it("advanced chunking — splits via text splitter sub-node", async () => {
    const splitterHandle = makeTextSplitterHandle([
      { pageContent: "Split chunk one." },
      { pageContent: "Split chunk two." },
    ]);

    const out = await runChain(
      { dataType: "json", chunking: "advanced", summarizationMethod: "map_reduce" },
      [{ text: "Long text that needs splitting." }],
      {
        connections: makeClusterConnections("Sum", { splitterName: "Splitter" }),
        subNodeOutputs: makeSubOutputs(makeModelHandle(), {
          Splitter: [{ json: splitterHandle as unknown as Record<string, unknown> }],
        }),
      },
    );

    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
  });

  it("missing chat model — throws error about Chat Model sub-node", async () => {
    const node = makeNode({ name: "Sum", type: TYPE, parameters: { dataType: "json" } });
    const items = toItems([{ text: "Hello" }]);
    const connections: IConnections = {};
    const ctx = makeChainCtx(items, node, {}, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Chat Model sub-node must be connected/i);
  });

  it("custom prompt missing {text} placeholder — throws error", async () => {
    await expect(
      runChain(
        {
          dataType: "json",
          summarizationMethod: "map_reduce",
          individualSummaryPrompt: "Summarize this without placeholder.",
        },
        [{ text: "Some text." }],
      ),
    ).rejects.toThrow(/\{text\}/i);
  });

  it("text field mirrors output for Chat Trigger compatibility", async () => {
    const out = await runChain(
      { dataType: "json", summarizationMethod: "stuff" },
      [{ text: "Some content." }],
    );

    expect(out[0][0].json.output).toBe(out[0][0].json.text);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.agent";

interface MockToolCall {
  name: string;
  args: Record<string, unknown>;
}

interface MockModelInvokeResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  toolCalls?: MockToolCall[];
}

interface MockModelHandle {
  type: string;
  model: string;
  invoke: (
    messages: Array<{ role: string; content: string }>,
    tools?: unknown[],
  ) => Promise<MockModelInvokeResult>;
}

function makeModelHandle(overrides: Partial<MockModelHandle> = {}): MockModelHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model: "gpt-4.1-mini",
    invoke: async () => ({
      text: "The answer is 4.",
      model: "gpt-4.1-mini",
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    }),
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

function makeAgentCtx(
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
  agentName: string,
  opts: {
    modelName?: string;
    fallbackModelName?: string;
    toolNames?: string[];
    memoryName?: string;
    parserName?: string;
  } = {},
): IConnections {
  const modelName = opts.modelName ?? "Model";
  const connections: IConnections = {};
  connections[modelName] = {
    ai_languageModel: [[{ node: agentName, type: "ai_languageModel", index: 0 }]],
  };
  if (opts.fallbackModelName) {
    connections[opts.fallbackModelName] = {
      ai_languageModel: [[{ node: agentName, type: "ai_languageModel", index: 1 }]],
    };
  }
  for (const toolName of opts.toolNames ?? ["Tool"]) {
    connections[toolName] = {
      ai_tool: [[{ node: agentName, type: "ai_tool", index: 0 }]],
    };
  }
  if (opts.memoryName) {
    connections[opts.memoryName] = {
      ai_memory: [[{ node: agentName, type: "ai_memory", index: 0 }]],
    };
  }
  if (opts.parserName) {
    connections[opts.parserName] = {
      ai_outputParser: [[{ node: agentName, type: "ai_outputParser", index: 0 }]],
    };
  }
  return connections;
}

function makeClusterSubOutputs(
  modelHandle: MockModelHandle,
  opts: {
    fallbackModelHandle?: MockModelHandle;
    toolCount?: number;
  } = {},
): Record<string, INodeExecutionData[]> {
  const subs: Record<string, INodeExecutionData[]> = {
    Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
    Tool: [{ json: { name: "calculator", description: "Performs arithmetic" } }],
  };
  if (opts.fallbackModelHandle) {
    subs["FallbackModel"] = [
      { json: opts.fallbackModelHandle as unknown as Record<string, unknown> },
    ];
  }
  return subs;
}

async function runAgent(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    modelHandle?: MockModelHandle;
    fallbackModelHandle?: MockModelHandle;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Agent", type: TYPE, parameters });
  const items = toItems(inputItems);
  const modelHandle = opts.modelHandle ?? makeModelHandle();
  const subNodeOutputs = opts.subNodeOutputs ?? makeClusterSubOutputs(modelHandle, opts);
  const connections =
    opts.connections ??
    makeClusterConnections("Agent", {
      fallbackModelName: opts.fallbackModelHandle ? "FallbackModel" : undefined,
    });
  const ctx = makeAgentCtx(items, node, subNodeOutputs, connections);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue langchainAgent — @n8n/n8n-nodes-langchain.agent", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AI Agent");
  });

  it("define prompt — happy path shape: output[0].json.output is a non-empty string", async () => {
    const out = await runAgent(
      {
        promptType: "define",
        text: "={{ $json.query }}",
        options: {
          systemMessage: "You are a concise math assistant.",
          maxIterations: 10,
          returnIntermediateSteps: false,
          enableStreaming: false,
        },
      },
      [{ query: "What is 2+2?" }],
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
  });

  it("passes system message and user prompt to the model invoke", async () => {
    let captured: Array<{ role: string; content: string }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "4",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    await runAgent(
      {
        promptType: "define",
        text: "What is 2+2?",
        options: { systemMessage: "You are a math assistant." },
      },
      [{}],
      { modelHandle },
    );

    expect(captured).toEqual([
      { role: "system", content: "You are a math assistant." },
      { role: "user", content: "What is 2+2?" },
    ]);
  });

  it("auto prompt from chatInput: output includes output string", async () => {
    const out = await runAgent({ options: {} }, [{ chatInput: "Hello" }]);

    expect(typeof out[0][0].json.output).toBe("string");
    expect((out[0][0].json.output as string).length).toBeGreaterThan(0);
  });

  it("missing chat model: throws error about Chat Model sub-node", async () => {
    const node = makeNode({ name: "Agent", type: TYPE, parameters: { options: {} } });
    const items = toItems([{ chatInput: "Hi" }]);
    const connections: IConnections = {
      Tool: { ai_tool: [[{ node: "Agent", type: "ai_tool", index: 0 }]] },
    };
    const ctx = makeAgentCtx(items, node, { Tool: [{ json: { name: "t" } }] }, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Chat Model sub-node must be connected/i);
  });

  it("null define prompt: throws error about no prompt", async () => {
    await expect(
      runAgent({ promptType: "define", text: "={{ $json.missing }}" }, [{}]),
    ).rejects.toThrow(/No prompt specified/i);
  });

  it("missing tools: throws error about at least one tool", async () => {
    const node = makeNode({ name: "Agent", type: TYPE, parameters: { options: {} } });
    const items = toItems([{ chatInput: "Hi" }]);
    const connections: IConnections = {
      Model: { ai_languageModel: [[{ node: "Agent", type: "ai_languageModel", index: 0 }]] },
    };
    const modelHandle = makeModelHandle();
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
    };
    const ctx = makeAgentCtx(items, node, subNodeOutputs, connections);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(
      /At least one Tool sub-node must be connected/i,
    );
  });

  it("intermediate steps flag: output includes intermediateSteps array", async () => {
    const out = await runAgent(
      {
        promptType: "define",
        text: "Use a tool if needed, then answer.",
        options: { returnIntermediateSteps: true, maxIterations: 5 },
      },
      [{}],
    );

    expect(out[0][0].json.output).toBeDefined();
    expect(Array.isArray(out[0][0].json.intermediateSteps)).toBe(true);
  });

  it("intermediate steps off by default: no intermediateSteps field", async () => {
    const out = await runAgent({ promptType: "define", text: "Hello", options: {} }, [{}]);

    expect(out[0][0].json.output).toBeDefined();
    expect(out[0][0].json.intermediateSteps).toBeUndefined();
  });

  it("fallback model wiring: uses fallback when primary fails", async () => {
    const primaryModel = makeModelHandle({
      invoke: async () => {
        throw new Error("Primary model unavailable");
      },
    });
    const fallbackModel = makeModelHandle({
      model: "gpt-4o",
      invoke: async () => ({
        text: "Fallback answer.",
        model: "gpt-4o",
        usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 },
      }),
    });

    const out = await runAgent(
      {
        promptType: "define",
        text: "Hello",
        needsFallback: true,
        options: {},
      },
      [{}],
      { modelHandle: primaryModel, fallbackModelHandle: fallbackModel },
    );

    expect(out[0][0].json.output).toBe("Fallback answer.");
  });

  it("fallback model wiring: fails when primary fails and no fallback", async () => {
    const primaryModel = makeModelHandle({
      invoke: async () => {
        throw new Error("Primary model unavailable");
      },
    });

    await expect(
      runAgent({ promptType: "define", text: "Hello", needsFallback: true, options: {} }, [{}], {
        modelHandle: primaryModel,
      }),
    ).rejects.toThrow(/Primary model unavailable/);
  });

  it("output parser flag: executor accepts hasOutputParser and still returns output", async () => {
    const out = await runAgent(
      {
        promptType: "define",
        text: "Return structured data.",
        hasOutputParser: true,
        options: {},
      },
      [{}],
      {
        connections: makeClusterConnections("Agent", { parserName: "Parser" }),
        subNodeOutputs: {
          ...makeClusterSubOutputs(makeModelHandle()),
          Parser: [{ json: { name: "structuredParser", schema: {} } }],
        },
      },
    );

    expect(out[0][0].json.output).toBeDefined();
  });

  it("tool-loop + intermediateSteps: model calls tool then finalizes", async () => {
    let callCount = 0;
    const modelHandle = makeModelHandle({
      invoke: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: "",
            toolCalls: [{ name: "calc", args: { expr: "2+2" } }],
            model: "gpt-4.1-mini",
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          };
        }
        return {
          text: "4",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 },
        };
      },
    });

    const calcTool = {
      name: "calc",
      description: "Performs arithmetic",
      invoke: async () => "4",
    };

    const out = await runAgent(
      {
        promptType: "define",
        text: "What is 2+2? Use tools.",
        options: {
          systemMessage: "={{ 'Be precise.' }}",
          maxIterations: 5,
          returnIntermediateSteps: true,
          enableStreaming: false,
        },
      },
      [{}],
      {
        modelHandle,
        connections: makeClusterConnections("Agent", { toolNames: ["Calc"] }),
        subNodeOutputs: {
          Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
          Calc: [{ json: calcTool as unknown as Record<string, unknown> }],
        },
      },
    );

    expect(out[0][0].json.output).toBe("4");
    expect(out[0][0].json.intermediateSteps).toEqual([
      {
        action: { tool: "calc", toolInput: { expr: "2+2" } },
        observation: "4",
      },
    ]);
    expect(callCount).toBe(2);
  });

  it("maxIterations=3 always-tool: throws after 3 iterations", async () => {
    let modelCalls = 0;
    let toolInvocations = 0;
    const modelHandle = makeModelHandle({
      invoke: async () => {
        modelCalls++;
        return {
          text: "",
          toolCalls: [{ name: "calc", args: {} }],
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const calcTool = {
      name: "calc",
      description: "Always loops",
      invoke: async () => {
        toolInvocations++;
        return "loop";
      },
    };

    await expect(
      runAgent(
        {
          promptType: "define",
          text: "loop forever",
          options: {
            maxIterations: 3,
            returnIntermediateSteps: true,
            enableStreaming: false,
          },
        },
        [{}],
        {
          modelHandle,
          connections: makeClusterConnections("Agent", { toolNames: ["Calc"] }),
          subNodeOutputs: {
            Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
            Calc: [{ json: calcTool as unknown as Record<string, unknown> }],
          },
        },
      ),
    ).rejects.toThrow(/did not produce a final answer within 3 iterations/i);

    expect(modelCalls).toBe(3);
    expect(toolInvocations).toBe(3);
  });

  it("multi-item batching: one run per item, order preserved", async () => {
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        return {
          text: lastUser?.content ?? "",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const out = await runAgent(
      { options: { enableStreaming: false } },
      [{ chatInput: "first" }, { chatInput: "second" }],
      { modelHandle },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.output).toBe("first");
    expect(out[0][1].json.output).toBe("second");
  });

  it("memory turns: prepended before user prompt on first invoke", async () => {
    let captured: Array<{ role: string; content: string }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "ok",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const memoryHandle = {
      loadMessages: () => [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    };

    await runAgent({ options: { enableStreaming: false } }, [{ chatInput: "follow up" }], {
      modelHandle,
      connections: makeClusterConnections("Agent", { memoryName: "Memory" }),
      subNodeOutputs: {
        Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
        Tool: [{ json: { name: "stub", description: "stub" } }],
        Memory: [{ json: memoryHandle as unknown as Record<string, unknown> }],
      },
    });

    const userPromptIdx = captured.findIndex((m) => m.role === "user" && m.content === "follow up");
    expect(userPromptIdx).toBeGreaterThan(0);
    expect(captured[userPromptIdx - 1]).toEqual({
      role: "assistant",
      content: "hello",
    });
    expect(captured[0]).toEqual({ role: "user", content: "hi" });
  });

  it("systemMessage expression eval: evaluated before first model call", async () => {
    let captured: Array<{ role: string; content: string }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "ok",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    await runAgent(
      {
        promptType: "define",
        text: "hi",
        options: { systemMessage: "={{ 'Role: ' + $json.role }}" },
      },
      [{ chatInput: "hi", role: "tutor" }],
      { modelHandle },
    );

    expect(captured[0]).toEqual({ role: "system", content: "Role: tutor" });
  });

  it("parser applied to output: maps final text to structured result", async () => {
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

    const out = await runAgent(
      {
        promptType: "define",
        text: "Return structured data.",
        hasOutputParser: true,
        options: { enableStreaming: false },
      },
      [{}],
      {
        modelHandle,
        connections: makeClusterConnections("Agent", { parserName: "Parser" }),
        subNodeOutputs: {
          Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
          Tool: [{ json: { name: "stub", description: "stub" } }],
          Parser: [{ json: parser as unknown as Record<string, unknown> }],
        },
      },
    );

    expect(out[0][0].json.output).toEqual({ ok: true });
  });

  it("deferred options accepted: streaming + binary passthrough do not throw", async () => {
    const out = await runAgent(
      {
        promptType: "define",
        text: "Hello",
        options: { passthroughBinaryImages: false, enableStreaming: true },
      },
      [{}],
    );

    expect(out[0][0].json.output).toBeDefined();
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

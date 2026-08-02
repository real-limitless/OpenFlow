import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { AgentToolHandle } from "../../executors/langchain-agent-tool";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.agentTool";

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
      text: "42",
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

function makeAgentToolCtx(
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

function makeToolConnections(
  toolName: string,
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
    ai_languageModel: [[{ node: toolName, type: "ai_languageModel", index: 0 }]],
  };
  if (opts.fallbackModelName) {
    connections[opts.fallbackModelName] = {
      ai_languageModel: [[{ node: toolName, type: "ai_languageModel", index: 1 }]],
    };
  }
  for (const n of opts.toolNames ?? []) {
    connections[n] = {
      ai_tool: [[{ node: toolName, type: "ai_tool", index: 0 }]],
    };
  }
  if (opts.memoryName) {
    connections[opts.memoryName] = {
      ai_memory: [[{ node: toolName, type: "ai_memory", index: 0 }]],
    };
  }
  if (opts.parserName) {
    connections[opts.parserName] = {
      ai_outputParser: [[{ node: toolName, type: "ai_outputParser", index: 0 }]],
    };
  }
  return connections;
}

function makeSubOutputs(
  modelHandle: MockModelHandle,
  opts: {
    fallbackModelHandle?: MockModelHandle;
    toolHandles?: Array<Record<string, unknown>>;
    memoryHandle?: Record<string, unknown>;
    parserHandle?: Record<string, unknown>;
  } = {},
): Record<string, INodeExecutionData[]> {
  const subs: Record<string, INodeExecutionData[]> = {
    Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
  };
  if (opts.fallbackModelHandle) {
    subs["FallbackModel"] = [
      { json: opts.fallbackModelHandle as unknown as Record<string, unknown> },
    ];
  }
  if (opts.toolHandles) {
    for (const th of opts.toolHandles) {
      subs[(th as { name?: string }).name ?? "Tool"] = [{ json: th }];
    }
  }
  if (opts.memoryHandle) {
    subs["Memory"] = [{ json: opts.memoryHandle }];
  }
  if (opts.parserHandle) {
    subs["Parser"] = [{ json: opts.parserHandle }];
  }
  return subs;
}

async function runAgentTool(
  parameters: Record<string, unknown>,
  opts: {
    modelHandle?: MockModelHandle;
    fallbackModelHandle?: MockModelHandle;
    toolHandles?: Array<Record<string, unknown>>;
    memoryHandle?: Record<string, unknown>;
    parserHandle?: Record<string, unknown>;
    nodeName?: string;
    inputItems?: INodeExecutionData[];
  } = {},
): Promise<INodeExecutionData[][]> {
  const nodeName = opts.nodeName ?? "SubAgent";
  const node = makeNode({ name: nodeName, type: TYPE, parameters });
  const modelHandle = opts.modelHandle ?? makeModelHandle();
  const toolNames = (opts.toolHandles ?? []).map((t) => (t as { name: string }).name);
  const subs = makeSubOutputs(modelHandle, {
    fallbackModelHandle: opts.fallbackModelHandle,
    toolHandles: opts.toolHandles,
    memoryHandle: opts.memoryHandle,
    parserHandle: opts.parserHandle,
  });
  const connections = makeToolConnections(nodeName, {
    modelName: "Model",
    fallbackModelName: opts.fallbackModelHandle ? "FallbackModel" : undefined,
    toolNames: toolNames.length > 0 ? toolNames : undefined,
    memoryName: opts.memoryHandle ? "Memory" : undefined,
    parserName: opts.parserHandle ? "Parser" : undefined,
  });
  const ctx = makeAgentToolCtx(opts.inputItems ?? [], node, subs, connections);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): AgentToolHandle {
  return out[0][0].json as unknown as AgentToolHandle;
}

describe("batch-queue langchainAgentTool — @n8n/n8n-nodes-langchain.agentTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("AI Agent Tool");
  });

  it("exposes a callable tool with description", async () => {
    const out = await runAgentTool({
      toolDescription: "Delegate math and coding questions to this specialist agent.",
      text: "Solve the user's problem and explain the result.",
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.name).toBe("SubAgent");
    expect(handle.description).toBe("Delegate math and coding questions to this specialist agent.");
    expect(typeof handle.invoke).toBe("function");
  });

  it("invocation runs nested agent and returns its answer", async () => {
    const out = await runAgentTool({
      toolDescription: "Math helper agent.",
      text: "What is 6*7?",
      options: { maxIterations: 3 },
    });

    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(result).toBe("42");
  });

  it("uses the invocation prompt from text parameter", async () => {
    let capturedPrompt = "";
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        const userMsg = messages.find((m) => m.role === "user");
        if (userMsg) capturedPrompt = userMsg.content;
        return {
          text: `Answered: ${userMsg?.content ?? ""}`,
          model: "gpt-4.1-mini",
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        };
      },
    });

    const out = await runAgentTool({
      toolDescription: "Helper.",
      text: "Calculate the sum of 1 through 10",
    }, { modelHandle });

    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(capturedPrompt).toBe("Calculate the sum of 1 through 10");
    expect(result).toBe("Answered: Calculate the sum of 1 through 10");
  });

  it("missing chat model throws", async () => {
    const node = makeNode({ name: "SubAgent", type: TYPE, parameters: { text: "hi" } });
    const ctx = makeAgentToolCtx([], node, {}, {});
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    const handle = getHandle(out);
    await expect(handle.invoke({})).rejects.toThrow(/Chat Model sub-node must be connected/);
  });

  it("invocation with tool calls works end-to-end", async () => {
    let toolInvoked = false;
    let callCount = 0;
    const modelHandle = makeModelHandle({
      invoke: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: "",
            model: "gpt-4.1-mini",
            usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
            toolCalls: [{ name: "my_tool", args: { input: "test" } }],
          };
        }
        return {
          text: "Final result from tool",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
        };
      },
    });

    const out = await runAgentTool({
      toolDescription: "Helper.",
      text: "Do something",
      options: { maxIterations: 5 },
    }, {
      modelHandle,
      toolHandles: [{
        name: "my_tool",
        description: "A test tool",
        invoke(args: Record<string, unknown>) {
          toolInvoked = true;
          expect(args.input).toBe("test");
          return "tool observed";
        },
      }],
    });

    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(toolInvoked).toBe(true);
    expect(result).toBe("Final result from tool");
  });

  it("output parser transforms the final text", async () => {
    const modelHandle = makeModelHandle({
      invoke: async () => ({
        text: '{"ok":true}',
        model: "gpt-4.1-mini",
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
      }),
    });

    const out = await runAgentTool({
      toolDescription: "Parser test agent.",
      text: "Return structured data",
      hasOutputParser: true,
    }, {
      modelHandle,
      parserHandle: {
        parse(text: string) {
          const parsed = JSON.parse(text);
          return parsed;
        },
      },
    });

    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(result).toBe('{"ok":true}');
  });

  it("fallback model on primary failure", async () => {
    let fallbackCalled = false;
    const primaryModel = makeModelHandle({
      invoke: async () => { throw new Error("Primary failed"); },
    });
    const fallbackModel = makeModelHandle({
      invoke: async () => {
        fallbackCalled = true;
        return {
          text: "ok",
          model: "fallback",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const out = await runAgentTool({
      toolDescription: "Fallback test.",
      text: "Do it",
      needsFallback: true,
    }, {
      modelHandle: primaryModel,
      fallbackModelHandle: fallbackModel,
    });

    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(fallbackCalled).toBe(true);
    expect(result).toBe("ok");
  });

  it("passes system message to model when configured", async () => {
    let capturedSystem = "";
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        const sysMsg = messages.find((m) => m.role === "system");
        if (sysMsg) capturedSystem = sysMsg.content;
        return {
          text: "done",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 },
        };
      },
    });

    const out = await runAgentTool({
      toolDescription: "System test.",
      text: "Process this",
      options: { systemMessage: "You are a helpful specialist." },
    }, { modelHandle });

    const handle = getHandle(out);
    await handle.invoke({});
    expect(capturedSystem).toBe("You are a helpful specialist.");
  });

  it("uses default description when none provided", async () => {
    const out = await runAgentTool({ text: "hi" });
    const handle = getHandle(out);
    expect(handle.description).toBe("AI Agent that can call other tools");
  });

  it("evaluates text expression from input items", async () => {
    let capturedPrompt = "";
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        const userMsg = messages.find((m) => m.role === "user");
        if (userMsg) capturedPrompt = userMsg.content;
        return {
          text: "42",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        };
      },
    });

    const inputItems: INodeExecutionData[] = [
      { json: { chatInput: "What is 6*7?" } },
    ];

    const out = await runAgentTool({
      toolDescription: "Math helper agent.",
      text: "={{ $json.chatInput }}",
      options: { maxIterations: 3 },
    }, { modelHandle, inputItems });

    const handle = getHandle(out);
    const result = await handle.invoke({});
    expect(capturedPrompt).toBe("What is 6*7?");
    expect(result).toBe("42");
  });
});

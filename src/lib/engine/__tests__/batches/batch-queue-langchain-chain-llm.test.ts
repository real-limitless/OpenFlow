import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.chainLlm";

interface MockModelInvokeResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface MockModelHandle {
  type: string;
  model: string;
  invoke: (
    messages: Array<{ role: string; content: unknown }>,
    tools?: unknown[],
  ) => Promise<MockModelInvokeResult>;
}

function makeModelHandle(overrides: Partial<MockModelHandle> = {}): MockModelHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model: "gpt-4.1-mini",
    invoke: async () => ({
      text: "I'm doing well, thank you for asking! How can I help you today?",
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

function makeChainCtx(
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

function makeClusterConnections(
  chainName: string,
  opts: { modelName?: string; parserName?: string } = {},
): IConnections {
  const modelName = opts.modelName ?? "Model";
  const connections: IConnections = {};
  connections[modelName] = {
    ai_languageModel: [[{ node: chainName, type: "ai_languageModel", index: 0 }]],
  };
  if (opts.parserName) {
    connections[opts.parserName] = {
      ai_outputParser: [[{ node: chainName, type: "ai_outputParser", index: 0 }]],
    };
  }
  return connections;
}

function makeModelSubOutputs(modelHandle: MockModelHandle): Record<string, INodeExecutionData[]> {
  return { Model: [{ json: modelHandle as unknown as Record<string, unknown> }] };
}

async function runChain(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: {
    modelHandle?: MockModelHandle;
    connections?: IConnections;
    subNodeOutputs?: Record<string, INodeExecutionData[]>;
    continueOnFail?: boolean;
  } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Chain", type: TYPE, parameters });
  const items = toItems(inputItems);
  const modelHandle = opts.modelHandle ?? makeModelHandle();
  const subNodeOutputs = opts.subNodeOutputs ?? makeModelSubOutputs(modelHandle);
  const connections = opts.connections ?? makeClusterConnections("Chain");
  const ctx = makeChainCtx(items, node, subNodeOutputs, connections, opts.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue chainLlm — @n8n/n8n-nodes-langchain.chainLlm", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Basic LLM Chain");
  });

  it("basic-auto-prompt: chatInput becomes the runtime user prompt", async () => {
    let captured: Array<{ role: string; content: unknown }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "I'm doing well, thank you for asking! How can I help you today?",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
        };
      },
    });

    const out = await runChain(
      { promptType: "auto", requireSpecificOutputFormat: false, messages: { messageValues: [] } },
      [{ chatInput: "Hello, how are you?" }],
      { modelHandle },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.output).toBe(
      "I'm doing well, thank you for asking! How can I help you today?",
    );
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });

    const last = captured[captured.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("Hello, how are you?");
  });

  it("define-prompt: uses text param as runtime prompt", async () => {
    let captured: Array<{ role: string; content: unknown }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "¡Hola!",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
        };
      },
    });

    const out = await runChain(
      {
        promptType: "define",
        text: "Say hello in Spanish",
        requireSpecificOutputFormat: false,
        messages: {
          messageValues: [{ type: "system", message: "You are a helpful translator." }],
        },
      },
      [{}],
      { modelHandle },
    );

    expect(out[0][0].json.output).toBe("¡Hola!");
    expect(captured[0].role).toBe("system");
    expect(captured[0].content).toBe("You are a helpful translator.");
    const last = captured[captured.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("Say hello in Spanish");
  });

  it("few-shot: preserves user/ai alternation, runtime prompt last", async () => {
    let captured: Array<{ role: string; content: unknown }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "4",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
        };
      },
    });

    const out = await runChain(
      {
        promptType: "auto",
        requireSpecificOutputFormat: false,
        messages: {
          messageValues: [
            { type: "user", message: "What is 1+1?" },
            { type: "ai", message: "2" },
            { type: "user", message: "What is 3+3?" },
            { type: "ai", message: "6" },
          ],
        },
      },
      [{ chatInput: "What is 2+2?" }],
      { modelHandle },
    );

    expect(out[0][0].json.output).toBe("4");

    const roles = captured.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(captured[0].content).toBe("What is 1+1?");
    expect(captured[1].content).toBe("2");
    expect(captured[2].content).toBe("What is 3+3?");
    expect(captured[3].content).toBe("6");
    expect(captured[4].content).toBe("What is 2+2?");
  });

  it("system messages are pulled to the front", async () => {
    let captured: Array<{ role: string; content: unknown }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "ok",
          model: "m",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    await runChain(
      {
        promptType: "define",
        text: "go",
        messages: {
          messageValues: [
            { type: "user", message: "first" },
            { type: "system", message: "be brief" },
            { type: "ai", message: "ok" },
          ],
        },
      },
      [{}],
      { modelHandle },
    );

    expect(captured[0].role).toBe("system");
    expect(captured[0].content).toBe("be brief");
    expect(captured[1].content).toBe("first");
    expect(captured[2].content).toBe("ok");
    expect(captured[3].content).toBe("go");
  });

  it("output parser: applies parser to final text when requireSpecificOutputFormat", async () => {
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
      parse: (text: string) => ({ name: "John", age: 30, echoed: text }),
    };

    const out = await runChain(
      { promptType: "auto", requireSpecificOutputFormat: true, messages: { messageValues: [] } },
      [{ chatInput: "Give me a JSON with name and age" }],
      {
        modelHandle,
        connections: makeClusterConnections("Chain", { parserName: "Parser" }),
        subNodeOutputs: {
          Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
          Parser: [{ json: parser as unknown as Record<string, unknown> }],
        },
      },
    );

    expect(out[0][0].json.output).toEqual({ name: "John", age: 30, echoed: "raw" });
  });

  it("multimodal image url: user message becomes multimodal content", async () => {
    let captured: Array<{ role: string; content: unknown }> = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        captured = messages;
        return {
          text: "A description of the image.",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const out = await runChain(
      {
        promptType: "auto",
        requireSpecificOutputFormat: false,
        messages: {
          messageValues: [
            {
              type: "user",
              message: "Describe this image",
              image: { imageUrl: "https://example.com/image.png", detail: "high" },
            },
          ],
        },
      },
      [{ chatInput: "Describe this image" }],
      { modelHandle },
    );

    expect(typeof out[0][0].json.output).toBe("string");

    const fewShot = captured[0];
    expect(fewShot.role).toBe("user");
    const parts = fewShot.content as Array<Record<string, unknown>>;
    expect(Array.isArray(parts)).toBe(true);
    expect(parts[0]).toEqual({ type: "text", text: "Describe this image" });
    expect(parts[1].type).toBe("image_url");
    const imgUrl = parts[1].image_url as Record<string, unknown>;
    expect(imgUrl.url).toBe("https://example.com/image.png");
    expect(imgUrl.detail).toBe("high");

    const last = captured[captured.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("Describe this image");
  });

  it("no-prompt-specified error: throws when auto and chatInput missing", async () => {
    await expect(
      runChain(
        { promptType: "auto", requireSpecificOutputFormat: false, messages: { messageValues: [] } },
        [{ otherField: "no chatInput here" }],
      ),
    ).rejects.toThrow(/No prompt specified/i);
  });

  it("no-prompt-specified error: throws when define and text empty", async () => {
    await expect(
      runChain(
        {
          promptType: "define",
          text: "",
          requireSpecificOutputFormat: false,
          messages: { messageValues: [] },
        },
        [{}],
      ),
    ).rejects.toThrow(/No prompt specified/i);
  });

  it("missing model: throws about Chat Model sub-node", async () => {
    const node = makeNode({ name: "Chain", type: TYPE, parameters: {} });
    const items = toItems([{ chatInput: "Hi" }]);
    const ctx = makeChainCtx(items, node, {}, {});
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/Chat Model sub-node must be connected/i);
  });

  it("output parser required but missing: throws", async () => {
    await expect(
      runChain(
        { promptType: "auto", requireSpecificOutputFormat: true, messages: { messageValues: [] } },
        [{ chatInput: "test" }],
      ),
    ).rejects.toThrow(/An Output Parser sub-node must be connected/i);
  });

  it("continue-on-fail: first item error emits error item, second succeeds", async () => {
    let call = 0;
    const modelHandle = makeModelHandle({
      invoke: async () => {
        call += 1;
        if (call === 1) throw new Error("boom");
        return {
          text: "Response for test2",
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const out = await runChain(
      { promptType: "auto", requireSpecificOutputFormat: false, messages: { messageValues: [] } },
      [{ chatInput: "test" }, { chatInput: "test2" }],
      { modelHandle, continueOnFail: true },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.error).toMatch(/Model invocation failed: boom/i);
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(out[0][1].json.output).toBe("Response for test2");
    expect(out[0][1].pairedItem).toEqual({ item: 1, input: 0 });
  });

  it("continue-on-fail: no-prompt error emits error item with bare message", async () => {
    const out = await runChain(
      { promptType: "auto", requireSpecificOutputFormat: false, messages: { messageValues: [] } },
      [{ otherField: "no chatInput" }],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBe("No prompt specified");
  });

  it("multi-item batching: one model call per item, order preserved", async () => {
    const calls: string[] = [];
    const modelHandle = makeModelHandle({
      invoke: async (messages) => {
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const content = String(lastUser?.content ?? "");
        calls.push(content);
        return {
          text: content,
          model: "gpt-4.1-mini",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });

    const out = await runChain(
      { promptType: "auto", requireSpecificOutputFormat: false, messages: { messageValues: [] } },
      [{ chatInput: "first" }, { chatInput: "second" }],
      { modelHandle },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.output).toBe("first");
    expect(out[0][1].json.output).toBe("second");
    expect(calls).toEqual(["first", "second"]);
  });

  it("define prompt with expression: resolves via $json", async () => {
    const out = await runChain(
      {
        promptType: "define",
        text: "={{ $json.question }}",
        requireSpecificOutputFormat: false,
        messages: { messageValues: [] },
      },
      [{ question: "What is the meaning of life?" }],
    );

    expect(typeof out[0][0].json.output).toBe("string");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

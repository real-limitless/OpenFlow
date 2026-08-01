import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { OutputParserHandle, ModelHandle } from "../../executors/langchain-output-parser-autofixing";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.outputParserAutofixing";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(items: INodeExecutionData[], node: INode): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

function makeInnerParserHandle(
  parseFn: (text: string) => unknown,
  formatInstructions?: string,
): OutputParserHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.outputParserStructured",
    parse: parseFn,
    formatInstructions,
  } as unknown as OutputParserHandle;
}

function makeModelHandle(invokeFn: (msgs: Array<{ role: string; content: string }>) => Promise<{ text: string }>): ModelHandle {
  return {
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    model: "gpt-4",
    invoke: invokeFn,
  } as unknown as ModelHandle;
}

function makeConnections(
  innerParserName: string,
  modelName?: string,
): IConnections {
  const conns: IConnections = {
    [innerParserName]: {
      ai_outputParser: [[{ node: "Parser", type: "ai_outputParser", index: 0 }]],
    },
  };
  if (modelName) {
    conns[modelName] = {
      ai_languageModel: [[{ node: "Parser", type: "ai_languageModel", index: 0 }]],
    };
  }
  return conns;
}

async function runAutofixingParser(
  parameters: Record<string, unknown>,
  subNodeOutputs: Record<string, INodeExecutionData[]>,
  connections: IConnections,
): Promise<INodeExecutionData[][]> {
  const node = makeNode({
    name: "Parser",
    type: TYPE,
    parameters,
    connections,
  });
  const items = toItems([{}]);
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
    getNodeInputItems: (name: string) => subNodeOutputs[name] ?? [],
    continueOnFail: false,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): OutputParserHandle {
  return out[0][0].json as unknown as OutputParserHandle;
}

describe("batch-queue outputParserAutofixing — @n8n/n8n-nodes-langchain.outputParserAutofixing", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Auto-fixing Output Parser");
  });

  it("wire shape — happy path: parse succeeds without repair", async () => {
    const innerHandle = makeInnerParserHandle((text) => JSON.parse(text));
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      InnerParser: [{ json: innerHandle as unknown as Record<string, unknown> }],
      FixerLLM: [{ json: makeModelHandle(async () => ({ text: "" })) as unknown as Record<string, unknown> }],
    };
    const connections = makeConnections("InnerParser", "FixerLLM");
    const out = await runAutofixingParser({}, subNodeOutputs, connections);
    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(typeof handle.parse).toBe("function");
    const result = handle.parse('{"name":"Bob","age":25}');
    expect(result).toEqual({ name: "Bob", age: 25 });
  });

  it("repair on invalid output: fixer LLM receives repair prompt", async () => {
    let receivedMessages: Array<{ role: string; content: string }> = [];
    const innerHandle = makeInnerParserHandle((text) => {
      const parsed = JSON.parse(text as string);
      if (typeof parsed.name !== "string") {
        throw new Error("name must be a string");
      }
      return parsed;
    }, '{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}');
    const modelHandle = makeModelHandle(async (msgs) => {
      receivedMessages = msgs;
      return { text: '{"name":"Bob"}' };
    });
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      InnerParser: [{ json: innerHandle as unknown as Record<string, unknown> }],
      FixerLLM: [{ json: modelHandle as unknown as Record<string, unknown> }],
    };
    const connections = makeConnections("InnerParser", "FixerLLM");
    const out = await runAutofixingParser({}, subNodeOutputs, connections);
    const handle = getHandle(out);

    const result = await (handle.parse('{"name":123}') as Promise<unknown>);
    expect(result).toEqual({ name: "Bob" });

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].content).toContain("Instructions:");
    expect(receivedMessages[0].content).toContain('{"name":123}');
    expect(receivedMessages[0].content).toContain("name must be a string");
  });

  it("default repair prompt substitution", async () => {
    let receivedMessages: Array<{ role: string; content: string }> = [];
    const innerHandle = makeInnerParserHandle((text) => {
      throw new Error("parse error");
    }, "format instructions text");
    const modelHandle = makeModelHandle(async (msgs) => {
      receivedMessages = msgs;
      return { text: "corrected" };
    });
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      InnerParser: [{ json: innerHandle as unknown as Record<string, unknown> }],
      FixerLLM: [{ json: modelHandle as unknown as Record<string, unknown> }],
    };
    const connections = makeConnections("InnerParser", "FixerLLM");
    const out = await runAutofixingParser(
      {
        options: {
          prompt: "Instructions:\n{instructions}\n\nCompletion:\n{completion}\n\nAbove, the Completion did not satisfy the constraints given in the Instructions.\nError:\n{error}",
        },
      },
      subNodeOutputs,
      connections,
    );
    const handle = getHandle(out);

    await expect(handle.parse("bad output") as Promise<unknown>).rejects.toThrow();
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].content).toContain("format instructions text");
    expect(receivedMessages[0].content).toContain("bad output");
    expect(receivedMessages[0].content).toContain("parse error");
  });

  it("repair exhausted: throws final error on second failure", async () => {
    let attemptCount = 0;
    const innerHandle = makeInnerParserHandle((text) => {
      attemptCount++;
      throw new Error("inner parser rejection");
    });
    const modelHandle = makeModelHandle(async () => ({ text: "still bad" }));
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      InnerParser: [{ json: innerHandle as unknown as Record<string, unknown> }],
      FixerLLM: [{ json: modelHandle as unknown as Record<string, unknown> }],
    };
    const connections = makeConnections("InnerParser", "FixerLLM");
    const out = await runAutofixingParser({}, subNodeOutputs, connections);
    const handle = getHandle(out);

    await expect(handle.parse("bad") as Promise<unknown>).rejects.toThrow("inner parser rejection");
    expect(attemptCount).toBe(2);
  });

  it("no fixer LLM connected: parse succeeds on valid, throws on invalid", async () => {
    const innerHandle = makeInnerParserHandle((text) => {
      if (text === "valid") return { ok: true };
      throw new Error("parse failed");
    });
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      InnerParser: [{ json: innerHandle as unknown as Record<string, unknown> }],
    };
    const connections = makeConnections("InnerParser");
    const out = await runAutofixingParser({}, subNodeOutputs, connections);
    const handle = getHandle(out);

    expect(handle.parse("valid")).toEqual({ ok: true });
    expect(() => handle.parse("invalid")).toThrow("parse failed");
  });

  it("no inner parser connected: configuration error", async () => {
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {};
    const connections: IConnections = {};
    await expect(
      runAutofixingParser({}, subNodeOutputs, connections),
    ).rejects.toThrow(/no inner output parser/i);
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});

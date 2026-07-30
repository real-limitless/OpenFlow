import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData, IConnections } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { OutputParserHandle } from "../../executors/langchain-output-parser-structured";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.outputParserStructured";

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

async function runParser(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Parser", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): OutputParserHandle {
  return out[0][0].json as unknown as OutputParserHandle;
}

describe("batch-queue outputParserStructured — @n8n/n8n-nodes-langchain.outputParserStructured", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Structured Output Parser");
  });

  it("wire shape — JSON example mode: handle exposes parse function", async () => {
    const out = await runParser({
      jsonSchemaExample: '{\n  "name": "Alice",\n  "age": 30\n}',
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.schemaType).toBe("example");
    expect(typeof handle.parse).toBe("function");
  });

  it("JSON example mode: parse returns conforming object", async () => {
    const out = await runParser({
      jsonSchemaExample: '{\n  "name": "Alice",\n  "age": 30\n}',
    });

    const handle = getHandle(out);
    const result = handle.parse('{"name":"Bob","age":25}');
    expect(result).toEqual({ name: "Bob", age: 25 });
  });

  it("JSON example mode: all fields required — missing field fails", async () => {
    const out = await runParser({
      jsonSchemaExample: '{\n  "name": "Alice",\n  "age": 30\n}',
    });

    const handle = getHandle(out);
    expect(() => handle.parse('{"name":"Bob"}')).toThrow(/missing required property/i);
  });

  it("JSON example mode: wrong type fails", async () => {
    const out = await runParser({
      jsonSchemaExample: '{\n  "name": "Alice",\n  "age": 30\n}',
    });

    const handle = getHandle(out);
    expect(() => handle.parse('{"name":"Bob","age":"twenty"}')).toThrow(/expected number/i);
  });

  it("JSON example mode: example values ignored, only names + types used", async () => {
    const out = await runParser({
      jsonSchemaExample:
        '{\n  "city": "Tokyo",\n  "population": 13960000,\n  "isCapital": true\n}',
    });

    const handle = getHandle(out);
    const result = handle.parse(
      '{"city":"Osaka","population":2691000,"isCapital":false}',
    );
    expect(result).toEqual({ city: "Osaka", population: 2691000, isCapital: false });
  });

  it("JSON Schema mode: parse returns conforming object", async () => {
    const out = await runParser({
      schemaType: "manual",
      inputSchema:
        '{\n  "type": "object",\n  "properties": {\n    "sentiment": { "type": "string", "enum": ["pos","neg","neu"] }\n  },\n  "required": ["sentiment"]\n}',
    });

    const handle = getHandle(out);
    expect(handle.schemaType).toBe("manual");
    const result = handle.parse('{"sentiment":"pos"}');
    expect(result).toEqual({ sentiment: "pos" });
  });

  it("JSON Schema mode: enum violation fails", async () => {
    const out = await runParser({
      schemaType: "manual",
      inputSchema:
        '{\n  "type": "object",\n  "properties": {\n    "sentiment": { "type": "string", "enum": ["pos","neg","neu"] }\n  },\n  "required": ["sentiment"]\n}',
    });

    const handle = getHandle(out);
    expect(() => handle.parse('{"sentiment":"bad"}')).toThrow(/not in enum/i);
  });

  it("$ref unsupported: configuration error", async () => {
    await expect(
      runParser({
        schemaType: "manual",
        inputSchema:
          '{\n  "$ref": "#/definitions/Foo",\n  "definitions": { "Foo": { "type": "object" } }\n}',
      }),
    ).rejects.toThrow(/\$ref is not supported/i);
  });

  it("invalid jsonSchemaExample: configuration error", async () => {
    await expect(
      runParser({ jsonSchemaExample: "{not valid json" }),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("invalid inputSchema: configuration error", async () => {
    await expect(
      runParser({ schemaType: "manual", inputSchema: "{not valid json" }),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("missing jsonSchemaExample in example mode: configuration error", async () => {
    await expect(runParser({})).rejects.toThrow(/jsonSchemaExample is required/i);
  });

  it("missing inputSchema in manual mode: configuration error", async () => {
    await expect(runParser({ schemaType: "manual" })).rejects.toThrow(/inputSchema is required/i);
  });

  it("autoFix: repairs missing required field", async () => {
    const out = await runParser({
      autoFix: true,
      jsonSchemaExample: '{\n  "caption": "x",\n  "textospeech": "y"\n}',
    });

    const handle = getHandle(out);
    expect(handle.autoFix).toBe(true);
    const result = handle.parse('{"caption":"hello"}') as Record<string, unknown>;
    expect(result.caption).toBe("hello");
    expect(result.textospeech).toBe("");
  });

  it("autoFix: extracts JSON from surrounding prose", async () => {
    const out = await runParser({
      autoFix: true,
      jsonSchemaExample: '{\n  "name": "x",\n  "age": 0\n}',
    });

    const handle = getHandle(out);
    const result = handle.parse('Here is the result: {"name":"Bob","age":25} hope that helps!');
    expect(result).toEqual({ name: "Bob", age: 25 });
  });

  it("autoFix off: JSON in prose fails without extraction", async () => {
    const out = await runParser({
      jsonSchemaExample: '{\n  "name": "x",\n  "age": 0\n}',
    });

    const handle = getHandle(out);
    expect(() =>
      handle.parse('Here is the result: {"name":"Bob","age":25} hope that helps!'),
    ).toThrow();
  });

  it("autoFix: still fails when repair cannot fix type mismatch", async () => {
    const out = await runParser({
      autoFix: true,
      jsonSchemaExample: '{\n  "name": "x",\n  "age": 0\n}',
    });

    const handle = getHandle(out);
    expect(() => handle.parse('{"name":"Bob","age":"not-a-number"}')).toThrow();
  });

  it("non-JSON output: parse fails", async () => {
    const out = await runParser({
      jsonSchemaExample: '{\n  "name": "x"\n}',
    });

    const handle = getHandle(out);
    expect(() => handle.parse("just plain text")).toThrow(/failed to parse/i);
  });

  it("expression in jsonSchemaExample: resolved against first item", async () => {
    const out = await runParser(
      { jsonSchemaExample: "={{ $json.schema }}" },
      [{ schema: '{"name":"x","age":0}' }],
    );

    const handle = getHandle(out);
    const result = handle.parse('{"name":"Bob","age":25}');
    expect(result).toEqual({ name: "Bob", age: 25 });
  });

  it("expression in inputSchema: resolved against first item", async () => {
    const out = await runParser(
      {
        schemaType: "manual",
        inputSchema: "={{ $json.schema }}",
      },
      [
        {
          schema:
            '{"type":"object","properties":{"val":{"type":"number"}},"required":["val"]}',
        },
      ],
    );

    const handle = getHandle(out);
    const result = handle.parse('{"val":42}');
    expect(result).toEqual({ val: 42 });
  });

  it("handle is consumable by AI Agent: parse result becomes agent output", async () => {
    const parserNode = makeNode({
      name: "Parser",
      type: TYPE,
      parameters: { jsonSchemaExample: '{"ok": true}' },
    });
    const parserItems = toItems([{}]);
    const parserCtx = makeCtx(parserItems, parserNode);
    const parserExecutor = getExecutor(TYPE)!;
    const parserOut = await parserExecutor(parserCtx, parserNode);
    const parserHandle = parserOut[0][0].json as unknown as OutputParserHandle;

    const agentType = "@n8n/n8n-nodes-langchain.agent";
    const agentNode = makeNode({
      name: "Agent",
      type: agentType,
      parameters: {
        promptType: "define",
        text: "Return structured data.",
        hasOutputParser: true,
        options: { enableStreaming: false },
      },
    });
    const agentItems = toItems([{}]);
    const connections: IConnections = {
      Model: { ai_languageModel: [[{ node: "Agent", type: "ai_languageModel", index: 0 }]] },
      Tool: { ai_tool: [[{ node: "Agent", type: "ai_tool", index: 0 }]] },
      Parser: { ai_outputParser: [[{ node: "Agent", type: "ai_outputParser", index: 0 }]] },
    };
    const modelHandle = {
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      model: "gpt-4.1-mini",
      invoke: async () => ({
        text: '{"ok": true}',
        model: "gpt-4.1-mini",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
    };
    const subNodeOutputs: Record<string, INodeExecutionData[]> = {
      Model: [{ json: modelHandle as unknown as Record<string, unknown> }],
      Tool: [{ json: { name: "stub", description: "stub" } }],
      Parser: [{ json: parserHandle as unknown as Record<string, unknown> }],
    };
    const agentCtx = createExecutionContext({
      node: agentNode,
      workflow: {
        id: "wf",
        name: "Test",
        active: false,
        nodes: [agentNode],
        connections,
        settings: {},
      },
      getNodeInputItems: (name: string) => {
        if (name === "Agent") return agentItems;
        return subNodeOutputs[name] ?? [];
      },
      continueOnFail: false,
    });
    const agentExecutor = getExecutor(agentType)!;
    const agentOut = await agentExecutor(agentCtx, agentNode);

    expect(agentOut[0][0].json.output).toEqual({ ok: true });
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });
});
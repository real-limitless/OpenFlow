import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  getMcpTriggerTools,
  shapeMcpToolResult,
} from "../../executors/mcp-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.mcpTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
): ExecutionContext {
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
    continueOnFail,
  });
}

async function runTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [],
  opts: { continueOnFail?: boolean } = {},
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const TOOLS_PARAM = {
  values: [
    { name: "greet", description: "Greet someone", schema: '{"type":"object"}' },
    { name: "calculate", description: "Do math", schema: '{"type":"object","properties":{"x":{"type":"number"}}}' },
  ],
};

describe("batch-queue mcpTrigger — @n8n/n8n-nodes-langchain.mcpTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MCP Server Trigger");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("tools/call maps to output item with toolName and arguments", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: TOOLS_PARAM },
      [
        {
          method: "tools/call",
          params: { name: "greet", arguments: { name: "World" } },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      toolName: "greet",
      arguments: { name: "World" },
      method: "tools/call",
    });
  });

  it("preserves binary data from input item", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: TOOLS_PARAM },
      [
        {
          json: {
            method: "tools/call",
            params: { name: "greet", arguments: {} },
          },
          binary: { data: { data: "aGVsbG8=", mimeType: "text/plain" } },
        },
      ],
    );

    expect(out[0][0].binary).toEqual({
      data: { data: "aGVsbG8=", mimeType: "text/plain" },
    });
  });

  it("empty input emits single empty item", async () => {
    const out = await runTrigger({ path: "my-mcp", tools: TOOLS_PARAM }, []);

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("unknown tool name throws", async () => {
    await expect(
      runTrigger(
        { path: "my-mcp", tools: TOOLS_PARAM },
        [
          {
            method: "tools/call",
            params: { name: "nope", arguments: {} },
          },
        ],
      ),
    ).rejects.toThrow(/unknown tool 'nope'/);
  });

  it("unknown tool name emits error item when continueOnFail", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: TOOLS_PARAM },
      [
        {
          method: "tools/call",
          params: { name: "nope", arguments: {} },
        },
      ],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(String(out[0][0].json.error)).toMatch(/unknown tool 'nope'/);
  });

  it("missing tool name throws", async () => {
    await expect(
      runTrigger(
        { path: "my-mcp", tools: TOOLS_PARAM },
        [
          {
            method: "tools/call",
            params: { arguments: {} },
          },
        ],
      ),
    ).rejects.toThrow(/missing tool name/);
  });

  it("missing tool name emits error item when continueOnFail", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: TOOLS_PARAM },
      [
        {
          method: "tools/call",
          params: { arguments: {} },
        },
      ],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toHaveProperty("error");
    expect(String(out[0][0].json.error)).toMatch(/missing tool name/);
  });

  it("falls back to top-level name/arguments when params missing", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: TOOLS_PARAM },
      [
        {
          method: "tools/call",
          name: "greet",
          arguments: { q: 1 },
        },
      ],
    );

    expect(out[0][0].json).toEqual({
      toolName: "greet",
      arguments: { q: 1 },
      method: "tools/call",
    });
  });

  it("defaults arguments to empty object when absent", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: TOOLS_PARAM },
      [
        {
          method: "tools/call",
          params: { name: "greet" },
        },
      ],
    );

    expect(out[0][0].json).toEqual({
      toolName: "greet",
      arguments: {},
      method: "tools/call",
    });
  });

  it("defaults method to tools/call when absent", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: TOOLS_PARAM },
      [
        {
          params: { name: "greet", arguments: {} },
        },
      ],
    );

    expect(out[0][0].json).toEqual({
      toolName: "greet",
      arguments: {},
      method: "tools/call",
    });
  });

  it("processes multiple tool calls in one batch", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: TOOLS_PARAM },
      [
        { method: "tools/call", params: { name: "greet", arguments: { a: 1 } } },
        { method: "tools/call", params: { name: "calculate", arguments: { x: 2 } } },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.toolName).toBe("greet");
    expect(out[0][1].json.toolName).toBe("calculate");
  });

  it("skips tool validation when no tools configured", async () => {
    const out = await runTrigger(
      { path: "my-mcp", tools: { values: [] } },
      [
        { method: "tools/call", params: { name: "any_tool", arguments: {} } },
      ],
    );

    expect(out[0][0].json.toolName).toBe("any_tool");
  });
});

describe("getMcpTriggerTools", () => {
  it("returns configured tools with parsed schemas", () => {
    const tools = getMcpTriggerTools({ tools: TOOLS_PARAM });
    expect(tools).toHaveLength(2);
    expect(tools[0]).toEqual({
      name: "greet",
      description: "Greet someone",
      inputSchema: { type: "object" },
    });
    expect(tools[1].inputSchema).toEqual({
      type: "object",
      properties: { x: { type: "number" } },
    });
  });

  it("skips entries without a name", () => {
    const tools = getMcpTriggerTools({
      tools: {
        values: [
          { name: "alpha", description: "a", schema: '{"type":"object"}' },
          { name: "", description: "no name" },
          { description: "also no name" },
        ],
      },
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("alpha");
  });

  it("handles array-form tools parameter", () => {
    const tools = getMcpTriggerTools({
      tools: [
        { name: "x", description: "x tool", schema: '{"type":"object"}' },
      ],
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("x");
  });

  it("returns empty array when tools missing", () => {
    expect(getMcpTriggerTools({})).toEqual([]);
    expect(getMcpTriggerTools({ tools: undefined })).toEqual([]);
  });

  it("handles empty/invalid schema strings", () => {
    const tools = getMcpTriggerTools({
      tools: {
        values: [
          { name: "a", schema: "" },
          { name: "b", schema: "not json" },
          { name: "c", schema: '{"type":"object"}' },
        ],
      },
    });
    expect(tools[0].inputSchema).toBeUndefined();
    expect(tools[1].inputSchema).toBeUndefined();
    expect(tools[2].inputSchema).toEqual({ type: "object" });
  });

  it("accepts inputSchema key as alternative to schema", () => {
    const tools = getMcpTriggerTools({
      tools: {
        values: [
          { name: "a", inputSchema: { type: "object" } },
        ],
      },
    });
    expect(tools[0].inputSchema).toEqual({ type: "object" });
  });
});

describe("shapeMcpToolResult", () => {
  it("wraps plain JSON as text content", () => {
    const result = shapeMcpToolResult([{ json: { result: 42 } }]);
    expect(result.content).toEqual([{ type: "text", text: '{"result":42}' }]);
    expect(result.isError).toBe(false);
  });

  it("passes through MCP content array shape", () => {
    const content = [{ type: "text", text: "hello" }];
    const result = shapeMcpToolResult([
      { json: { content, isError: false } },
    ]);
    expect(result.content).toBe(content);
    expect(result.isError).toBe(false);
  });

  it("detects isError from json.isError", () => {
    const result = shapeMcpToolResult([
      { json: { content: [{ type: "text", text: "fail" }], isError: true } },
    ]);
    expect(result.isError).toBe(true);
  });

  it("detects error from json.error field", () => {
    const result = shapeMcpToolResult([{ json: { error: "something broke" } }]);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("something broke");
  });

  it("uses output field when present", () => {
    const result = shapeMcpToolResult([{ json: { output: "done" } }]);
    expect(result.content[0].text).toBe("done");
  });

  it("uses text field when present", () => {
    const result = shapeMcpToolResult([{ json: { text: "hello" } }]);
    expect(result.content[0].text).toBe("hello");
  });

  it("returns empty text for empty items", () => {
    const result = shapeMcpToolResult([]);
    expect(result.content).toEqual([{ type: "text", text: "" }]);
    expect(result.isError).toBe(false);
  });
});
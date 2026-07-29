import { describe, it, expect } from "vitest";
import { manualTriggerExecutor } from "../executors/manual-trigger";
import { setExecutor } from "../executors/set";
import { noopExecutor } from "../executors/noop";
import { ifExecutor } from "../executors/if";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode } from "../../workflow/types";

function makeNode(overrides: Partial<INode> = {}): INode {
  return {
    id: "1",
    name: "TestNode",
    type: "test",
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
    ...overrides,
  };
}

function makeCtx(items: unknown[] = [], node: INode = makeNode()): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "w",
      name: "t",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () =>
      items.map((json) => ({ json: json as Record<string, unknown> })),
    continueOnFail: false,
  });
}

describe("Manual Trigger Executor", () => {
  it("returns single empty item", async () => {
    const node = makeNode();
    const result = await manualTriggerExecutor(makeCtx([], node), node);
    expect(result).toEqual([[{ json: {} }]]);
  });
});

describe("Set Executor", () => {
  it("sets fields on input items", async () => {
    const node = makeNode({
      parameters: {
        fields: [{ name: "greeting", value: "={{ $json.name }}", type: "stringValue" }],
      },
    });
    const result = await setExecutor(makeCtx([{ name: "Alice" }], node), node);
    expect(result[0][0].json.greeting).toBe("Alice");
  });

  it("handles empty input", async () => {
    const node = makeNode({ parameters: { fields: [] } });
    const result = await setExecutor(makeCtx([], node), node);
    expect(result[0]).toEqual([{ json: {}, pairedItem: { item: 0, input: 0 } }]);
  });

  it("handles fields as object with values array", async () => {
    const node = makeNode({
      parameters: {
        fields: { values: [{ name: "doubled", value: "={{ $json.x * 2 }}", type: "numberValue" }] },
      },
    });
    const result = await setExecutor(makeCtx([{ x: 10 }], node), node);
    expect(result[0][0].json.doubled).toBe(20);
  });

  it("coerces types", async () => {
    const node = makeNode({
      parameters: {
        fields: [{ name: "num", value: "={{ $json.val }}", type: "numberValue" }],
      },
    });
    const result = await setExecutor(makeCtx([{ val: "42" }], node), node);
    expect(result[0][0].json.num).toBe(42);
  });
});

describe("NoOp Executor", () => {
  it("passes input through", async () => {
    const items = [{ a: 1 }, { b: 2 }];
    const node = makeNode();
    const result = await noopExecutor(makeCtx(items, node), node);
    expect(result[0]).toEqual([
      { json: { a: 1 }, pairedItem: { item: 0, input: 0 } },
      { json: { b: 2 }, pairedItem: { item: 1, input: 0 } },
    ]);
  });

  it("returns empty item when no input", async () => {
    const node = makeNode();
    const result = await noopExecutor(makeCtx([], node), node);
    expect(result).toEqual([[{ json: {} }]]);
  });
});

describe("IF Executor", () => {
  it("routes to true branch when condition matches", async () => {
    const node = makeNode({
      parameters: {
        conditions: [{ leftValue: "={{ $json.value }}", rightValue: "5", operator: "gt" }],
        combinator: "and",
      },
    });
    const result = await ifExecutor(makeCtx([{ value: 10 }], node), node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("routes to false branch when condition fails", async () => {
    const node = makeNode({
      parameters: {
        conditions: [{ leftValue: "={{ $json.value }}", rightValue: "5", operator: "gt" }],
        combinator: "and",
      },
    });
    const result = await ifExecutor(makeCtx([{ value: 3 }], node), node);
    expect(result[0]).toHaveLength(0);
    expect(result[1]).toHaveLength(1);
  });

  it("handles equals operator", async () => {
    const node = makeNode({
      parameters: {
        conditions: [{ leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" }],
        combinator: "and",
      },
    });
    const result = await ifExecutor(makeCtx([{ status: "ok" }], node), node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("handles contains operator", async () => {
    const node = makeNode({
      parameters: {
        conditions: [{ leftValue: "={{ $json.text }}", rightValue: "world", operator: "contains" }],
        combinator: "and",
      },
    });
    const result = await ifExecutor(makeCtx([{ text: "hello world" }], node), node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("handles multiple conditions with AND combinator", async () => {
    const node = makeNode({
      parameters: {
        conditions: [
          { leftValue: "={{ $json.a }}", rightValue: "5", operator: "gt" },
          { leftValue: "={{ $json.b }}", rightValue: "15", operator: "gt" },
        ],
        combinator: "and",
      },
    });
    const result = await ifExecutor(makeCtx([{ a: 10, b: 20 }], node), node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("handles multiple conditions with OR combinator", async () => {
    const node = makeNode({
      parameters: {
        conditions: [
          { leftValue: "={{ $json.a }}", rightValue: "5", operator: "gt" },
          { leftValue: "={{ $json.b }}", rightValue: "15", operator: "gt" },
        ],
        combinator: "or",
      },
    });
    const result = await ifExecutor(makeCtx([{ a: 3, b: 20 }], node), node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("handles conditions as object with conditions array", async () => {
    const node = makeNode({
      parameters: {
        conditions: {
          conditions: [{ leftValue: "={{ $json.x }}", rightValue: "5", operator: "gt" }],
        },
        combinator: "and",
      },
    });
    const result = await ifExecutor(makeCtx([{ x: 10 }], node), node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });
});

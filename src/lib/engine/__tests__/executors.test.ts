import { describe, it, expect } from "vitest";
import { manualTriggerExecutor } from "../executors/manual-trigger";
import { setExecutor } from "../executors/set";
import { noopExecutor } from "../executors/noop";
import { ifExecutor } from "../executors/if";
import type { IExecuteFunctions } from "../types";
import type { INode } from "../../workflow/types";

function makeCtx(items: unknown[] = []): IExecuteFunctions {
  return {
    getNodeInputItems: (_nodeName: string, _inputIndex: number) =>
      items.map((json) => ({ json: json as Record<string, unknown> })),
    getWorkflow: () => ({} as any),
    continueOnFail: () => false,
  };
}

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

describe("Manual Trigger Executor", () => {
  it("returns single empty item", async () => {
    const result = await manualTriggerExecutor(makeCtx(), makeNode());
    expect(result).toEqual([[{ json: {} }]]);
  });
});

describe("Set Executor", () => {
  it("sets fields on input items", async () => {
    const ctx = makeCtx([{ name: "Alice" }]);
    const node = makeNode({
      parameters: {
        fields: [{ name: "greeting", value: "={{ $json.name }}", type: "stringValue" }],
      },
    });

    const result = await setExecutor(ctx, node);
    expect(result[0][0].json.greeting).toBe("Alice");
  });

  it("handles empty input", async () => {
    const result = await setExecutor(makeCtx(), makeNode({ parameters: { fields: [] } }));
    expect(result[0]).toEqual([{ json: {}, pairedItem: { item: 0, input: 0 } }]);
  });

  it("handles fields as object with values array", async () => {
    const ctx = makeCtx([{ x: 10 }]);
    const node = makeNode({
      parameters: {
        fields: { values: [{ name: "doubled", value: "={{ $json.x * 2 }}", type: "numberValue" }] },
      },
    });

    const result = await setExecutor(ctx, node);
    expect(result[0][0].json.doubled).toBe(20);
  });

  it("coerces types", async () => {
    const ctx = makeCtx([{ val: "42" }]);
    const node = makeNode({
      parameters: {
        fields: [{ name: "num", value: "={{ $json.val }}", type: "numberValue" }],
      },
    });

    const result = await setExecutor(ctx, node);
    expect(result[0][0].json.num).toBe(42);
  });
});

describe("NoOp Executor", () => {
  it("passes input through", async () => {
    const items = [{ a: 1 }, { b: 2 }];
    const result = await noopExecutor(makeCtx(items), makeNode());
    expect(result[0]).toEqual([
      { json: { a: 1 }, pairedItem: { item: 0, input: 0 } },
      { json: { b: 2 }, pairedItem: { item: 1, input: 0 } },
    ]);
  });

  it("returns empty item when no input", async () => {
    const result = await noopExecutor(makeCtx(), makeNode());
    expect(result).toEqual([[{ json: {} }]]);
  });
});

describe("IF Executor", () => {
  it("routes to true branch when condition matches", async () => {
    const ctx = makeCtx([{ value: 10 }]);
    const node = makeNode({
      parameters: {
        conditions: [{ leftValue: "={{ $json.value }}", rightValue: "5", operator: "gt" }],
        combinator: "and",
      },
    });

    const result = await ifExecutor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("routes to false branch when condition fails", async () => {
    const ctx = makeCtx([{ value: 3 }]);
    const node = makeNode({
      parameters: {
        conditions: [{ leftValue: "={{ $json.value }}", rightValue: "5", operator: "gt" }],
        combinator: "and",
      },
    });

    const result = await ifExecutor(ctx, node);
    expect(result[0]).toHaveLength(0);
    expect(result[1]).toHaveLength(1);
  });

  it("handles equals operator", async () => {
    const ctx = makeCtx([{ status: "ok" }]);
    const node = makeNode({
      parameters: {
        conditions: [{ leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" }],
        combinator: "and",
      },
    });

    const result = await ifExecutor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("handles contains operator", async () => {
    const ctx = makeCtx([{ text: "hello world" }]);
    const node = makeNode({
      parameters: {
        conditions: [{ leftValue: "={{ $json.text }}", rightValue: "world", operator: "contains" }],
        combinator: "and",
      },
    });

    const result = await ifExecutor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("handles multiple conditions with AND combinator", async () => {
    const ctx = makeCtx([{ a: 10, b: 20 }]);
    const node = makeNode({
      parameters: {
        conditions: [
          { leftValue: "={{ $json.a }}", rightValue: "5", operator: "gt" },
          { leftValue: "={{ $json.b }}", rightValue: "15", operator: "gt" },
        ],
        combinator: "and",
      },
    });

    const result = await ifExecutor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("handles multiple conditions with OR combinator", async () => {
    const ctx = makeCtx([{ a: 3, b: 20 }]);
    const node = makeNode({
      parameters: {
        conditions: [
          { leftValue: "={{ $json.a }}", rightValue: "5", operator: "gt" },
          { leftValue: "={{ $json.b }}", rightValue: "15", operator: "gt" },
        ],
        combinator: "or",
      },
    });

    const result = await ifExecutor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });

  it("handles conditions as object with conditions array", async () => {
    const ctx = makeCtx([{ x: 10 }]);
    const node = makeNode({
      parameters: {
        conditions: { conditions: [{ leftValue: "={{ $json.x }}", rightValue: "5", operator: "gt" }] },
        combinator: "and",
      },
    });

    const result = await ifExecutor(ctx, node);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
  });
});

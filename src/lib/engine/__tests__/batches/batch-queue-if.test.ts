import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.if";

describe("batch-queue if — n8n-nodes-base.if", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("IF");
  });

  it("number greater-than → true (nested operator object)", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [
            {
              leftValue: "={{ $json.value }}",
              rightValue: 5,
              operator: { type: "number", operation: "gt" },
            },
          ],
        },
        options: { ignoreCase: true },
      },
      [{ value: 10 }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ value: 10 });
    expect(out[1]).toHaveLength(0);
  });

  it("number greater-than → false", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [
            {
              leftValue: "={{ $json.value }}",
              rightValue: 5,
              operator: { type: "number", operation: "gt" },
            },
          ],
        },
        options: { ignoreCase: true },
      },
      [{ value: 3 }],
    );
    expect(out[0]).toHaveLength(0);
    expect(out[1]).toHaveLength(1);
    expect(out[1][0].json).toEqual({ value: 3 });
  });

  it("string equals — ignoreCase true routes to true branch", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" }],
        },
        options: { ignoreCase: true },
      },
      [{ status: "OK" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[1]).toHaveLength(0);
  });

  it("string equals — ignoreCase false routes to false branch", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" }],
        },
        options: { ignoreCase: false },
      },
      [{ status: "OK" }],
    );
    expect(out[0]).toHaveLength(0);
    expect(out[1]).toHaveLength(1);
  });

  it("AND combinator routes to true only when all pass", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [
            { leftValue: "={{ $json.a }}", rightValue: 5, operator: "gt" },
            { leftValue: "={{ $json.b }}", rightValue: 15, operator: "gt" },
          ],
        },
      },
      [{ a: 10, b: 20 }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[1]).toHaveLength(0);
  });

  it("OR combinator routes to true when at least one passes", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "or",
          conditions: [
            { leftValue: "={{ $json.a }}", rightValue: 5, operator: "gt" },
            { leftValue: "={{ $json.b }}", rightValue: 15, operator: "gt" },
          ],
        },
      },
      [{ a: 3, b: 20 }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[1]).toHaveLength(0);
  });

  it("AND combinator routes to false when one fails", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [
            { leftValue: "={{ $json.a }}", rightValue: 5, operator: "gt" },
            { leftValue: "={{ $json.b }}", rightValue: 15, operator: "gt" },
          ],
        },
      },
      [{ a: 10, b: 5 }],
    );
    expect(out[0]).toHaveLength(0);
    expect(out[1]).toHaveLength(1);
  });

  it("legacy v1 number + combineOperation all → false branch", async () => {
    const out = await runNode(
      TYPE,
      {
        typeVersion: 1,
        conditions: {
          number: [{ value1: "={{ $json.n }}", operation: "larger", value2: 5 }],
        },
        combineOperation: "all",
      },
      [{ n: 3 }],
    );
    expect(out[0]).toHaveLength(0);
    expect(out[1]).toHaveLength(1);
    expect(out[1][0].json).toEqual({ n: 3 });
  });

  it("legacy v1 combineOperation any → true branch", async () => {
    const out = await runNode(
      TYPE,
      {
        typeVersion: 1,
        conditions: {
          number: [{ value1: "={{ $json.n }}", operation: "larger", value2: 5 }],
        },
        combineOperation: "any",
      },
      [{ n: 10 }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[1]).toHaveLength(0);
  });

  it("multi-item split preserves order across both branches", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.value }}", rightValue: 5, operator: "gt" }],
        },
      },
      [{ value: 1 }, { value: 10 }, { value: 5 }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ value: 10 });
    expect(out[1]).toHaveLength(2);
    expect(out[1][0].json).toEqual({ value: 1 });
    expect(out[1][1].json).toEqual({ value: 5 });
  });

  it("empty/missing conditions routes all items to false branch", async () => {
    const out = await runNode(TYPE, {}, [{ a: 1 }, { a: 2 }]);
    expect(out[0]).toEqual([]);
    expect(out[1]).toHaveLength(2);
  });

  it("empty input → empty true and false outputs", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.value }}", rightValue: 5, operator: "gt" }],
        },
      },
      [],
    );
    expect(out[0]).toEqual([]);
    expect(out[1]).toEqual([]);
  });

  it("default ignoreCase is true (no options)", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" }],
        },
      },
      [{ status: "OK" }],
    );
    expect(out[0]).toHaveLength(1);
  });

  it("top-level combinator honored with flat conditions list", async () => {
    const out = await runNode(
      TYPE,
      {
        combinator: "or",
        conditions: [
          { leftValue: "={{ $json.a }}", rightValue: 5, operator: "lt" },
          { leftValue: "={{ $json.a }}", rightValue: 100, operator: "gt" },
        ],
      },
      [{ a: 3 }, { a: 50 }, { a: 150 }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ a: 3 });
    expect(out[0][1].json).toEqual({ a: 150 });
    expect(out[1]).toHaveLength(1);
    expect(out[1][0].json).toEqual({ a: 50 });
  });

  it("runs end-to-end in a workflow and preserves pairedItem", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger" }),
        makeNode({
          id: "2",
          name: "Set",
          type: "n8n-nodes-base.set",
          parameters: {
            mode: "manual",
            include: "none",
            fields: {
              values: [{ name: "value", type: "numberValue", numberValue: 10 }],
            },
          },
        }),
        makeNode({
          id: "3",
          name: "If",
          type: TYPE,
          typeVersion: 2.3,
          parameters: {
            conditions: {
              combinator: "and",
              conditions: [{ leftValue: "={{ $json.value }}", rightValue: 5, operator: "gt" }],
            },
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        Set: { main: [[{ node: "If", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.If?.status).toBe("success");
    expect(result.runData.If?.items?.[0]).toHaveLength(1);
    expect(result.runData.If?.items?.[1]).toHaveLength(0);
    expect(result.runData.If?.items?.[0][0].json).toEqual({ value: 10 });
    expect(result.runData.If?.items?.[0][0].pairedItem).toBeDefined();
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.if")).toBe(canonical);
  });
});

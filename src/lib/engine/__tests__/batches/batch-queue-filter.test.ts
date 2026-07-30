import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.filter";

describe("batch-queue filter — n8n-nodes-base.filter", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Filter");
  });

  it("keeps only matching items (equals + expression leftValue)", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" }],
        },
      },
      [{ status: "ok" }, { status: "fail" }, { status: "ok" }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ status: "ok" });
    expect(out[0][1].json).toEqual({ status: "ok" });
  });

  it("drops everything when none match → empty output", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" }],
        },
      },
      [{ status: "fail" }, { status: "fail" }],
    );
    expect(out[0]).toEqual([]);
  });

  it("AND requires all conditions to pass", async () => {
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
    expect(out[0]).toEqual([]);
  });

  it("OR keeps an item when either condition passes", async () => {
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
    expect(out[0][0].json).toEqual({ a: 3, b: 20 });
  });

  it("ignoreCase true keeps case-insensitive string equals", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.name }}", rightValue: "alice", operator: "equals" }],
        },
        options: { ignoreCase: true },
      },
      [{ name: "Alice" }],
    );
    expect(out[0]).toHaveLength(1);
  });

  it("ignoreCase false omits case-mismatched string equals", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.name }}", rightValue: "alice", operator: "equals" }],
        },
        options: { ignoreCase: false },
      },
      [{ name: "Alice" }],
    );
    expect(out[0]).toEqual([]);
  });

  it("default ignoreCase is true (no options)", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.name }}", rightValue: "alice", operator: "equals" }],
        },
      },
      [{ name: "Alice" }],
    );
    expect(out[0]).toHaveLength(1);
  });

  it("v1 combineConditions wire + v1 operation tokens (equal/larger)", async () => {
    const out = await runNode(
      TYPE,
      {
        typeVersion: 1,
        conditions: {
          conditions: [
            { value1: "={{ $json.status }}", operation: "equal", value2: "ok" },
            { value1: "={{ $json.score }}", operation: "larger", value2: 50 },
          ],
        },
        combineConditions: "OR",
      },
      [
        { status: "ok", score: 10 },
        { status: "fail", score: 80 },
        { status: "fail", score: 10 },
      ],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ status: "ok", score: 10 });
    expect(out[0][1].json).toEqual({ status: "fail", score: 80 });
  });

  it("empty input → empty output (not an error)", async () => {
    const out = await runNode(
      TYPE,
      {
        conditions: {
          combinator: "and",
          conditions: [{ leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" }],
        },
      },
      [],
    );
    expect(out[0]).toEqual([]);
  });

  it("top-level combinator is honored when conditions is a flat list", async () => {
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
  });

  it("expression mode keeps items where the expression is truthy", async () => {
    const out = await runNode(
      TYPE,
      { mode: "expression", expression: "={{ $json.active === true }}" },
      [{ active: true }, { active: false }, { active: true }],
    );
    expect(out[0]).toHaveLength(2);
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
              values: [{ name: "status", type: "stringValue", stringValue: "ok" }],
            },
          },
        }),
        makeNode({
          id: "3",
          name: "Filter",
          type: TYPE,
          typeVersion: 2.3,
          parameters: {
            conditions: {
              combinator: "and",
              conditions: [
                { leftValue: "={{ $json.status }}", rightValue: "ok", operator: "equals" },
              ],
            },
          },
        }),
      ],
      {
        Start: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        Set: { main: [[{ node: "Filter", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Filter?.status).toBe("success");
    expect(result.runData.Filter?.items?.[0]).toHaveLength(1);
    expect(result.runData.Filter?.items?.[0][0].json).toEqual({ status: "ok" });
    expect(result.runData.Filter?.items?.[0][0].pairedItem).toBeDefined();
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.filter")).toBe(canonical);
  });
});

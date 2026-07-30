import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.limit";

describe("batch-queue limit — n8n-nodes-base.limit", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Limit");
  });

  it("keeps first N items (acceptance: firstItems)", async () => {
    const out = await runNode(TYPE, { maxItems: 2, keep: "firstItems" }, [
      { i: 1 },
      { i: 2 },
      { i: 3 },
      { i: 4 },
    ]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ i: 1 });
    expect(out[0][1].json).toEqual({ i: 2 });
  });

  it("keeps last N items (acceptance: lastItems)", async () => {
    const out = await runNode(TYPE, { maxItems: 2, keep: "lastItems" }, [
      { i: 1 },
      { i: 2 },
      { i: 3 },
      { i: 4 },
    ]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ i: 3 });
    expect(out[0][1].json).toEqual({ i: 4 });
  });

  it("passes all items through when under the limit (acceptance: under limit)", async () => {
    const out = await runNode(TYPE, { maxItems: 5, keep: "firstItems" }, [{ i: 1 }, { i: 2 }]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ i: 1 });
    expect(out[0][1].json).toEqual({ i: 2 });
  });

  it("defaults to firstItems when keep is omitted", async () => {
    const out = await runNode(TYPE, { maxItems: 1 }, [{ a: 1 }, { a: 2 }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ a: 1 });
  });

  it("clamps negative maxItems to 0 → empty output", async () => {
    const out = await runNode(TYPE, { maxItems: -3, keep: "firstItems" }, [{ a: 1 }, { a: 2 }]);
    expect(out[0]).toEqual([]);
  });

  it("treats NaN maxItems as 0 → empty output", async () => {
    const out = await runNode(TYPE, { maxItems: NaN, keep: "firstItems" }, [{ a: 1 }, { a: 2 }]);
    expect(out[0]).toEqual([]);
  });

  it("empty input → empty output (not an error)", async () => {
    const out = await runNode(TYPE, { maxItems: 5, keep: "firstItems" }, []);
    expect(out[0]).toEqual([]);
  });

  it("maxItems equal to input length passes all through", async () => {
    const out = await runNode(TYPE, { maxItems: 3, keep: "lastItems" }, [
      { i: 1 },
      { i: 2 },
      { i: 3 },
    ]);
    expect(out[0]).toHaveLength(3);
    expect(out[0][2].json).toEqual({ i: 3 });
  });

  it("runs end-to-end in a workflow", async () => {
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
              values: [{ name: "n", type: "numberValue", numberValue: 0 }],
            },
          },
        }),
        makeNode({
          id: "3",
          name: "Limit",
          type: TYPE,
          parameters: { maxItems: 2, keep: "firstItems" },
        }),
      ],
      {
        Start: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        Set: { main: [[{ node: "Limit", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.Limit?.status).toBe("success");
    expect(result.runData.Limit?.items?.[0]).toHaveLength(1);
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.limit")).toBe(canonical);
  });
});

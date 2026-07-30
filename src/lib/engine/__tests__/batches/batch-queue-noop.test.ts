import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runWorkflowFixture, makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.noOp";

describe("batch-queue noop — n8n-nodes-base.noOp", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("No Operation");
  });

  it("passes items through unchanged with pairedItem (acceptance: pass-through)", async () => {
    const out = await runNode(TYPE, {}, [{ a: 1 }, { b: 2 }]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ a: 1 });
    expect(out[0][0].pairedItem).toEqual({ item: 0, input: 0 });
    expect(out[0][1].json).toEqual({ b: 2 });
    expect(out[0][1].pairedItem).toEqual({ item: 1, input: 0 });
  });

  it("emits a single empty item on empty input (acceptance: empty input)", async () => {
    const out = await runNode(TYPE, {}, []);
    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("does not throw with no parameters", async () => {
    const out = await runNode(TYPE, {}, [{ x: 1 }]);
    expect(out[0][0].json).toEqual({ x: 1 });
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
        makeNode({ id: "3", name: "NoOp", type: TYPE, parameters: {} }),
      ],
      {
        Start: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        Set: { main: [[{ node: "NoOp", type: "main", index: 0 }]] },
      },
    );

    const result = await runWorkflowFixture(wf, {});
    expect(result.success).toBe(true);
    expect(result.runData.NoOp?.status).toBe("success");
    expect(result.runData.NoOp?.items?.[0]).toHaveLength(1);
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.noOp")).toBe(canonical);
  });
});
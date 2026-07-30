import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.manualTrigger";

describe("batch-queue manualTrigger — n8n-nodes-base.manualTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Manual Trigger");
  });

  it("emits a single empty item on output[0] (happy path)", async () => {
    const out = await runNode(TYPE, {}, []);
    expect(out).toEqual([[{ json: {} }]]);
  });

  it("starts a downstream chain and feeds NoOp the empty item", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "When clicking 'Execute workflow'",
          type: TYPE,
          typeVersion: 1,
          parameters: {},
        }),
        makeNode({
          id: "n1",
          name: "No Operation",
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
          parameters: {},
        }),
      ],
      {
        "When clicking 'Execute workflow'": {
          main: [[{ node: "No Operation", type: "main", index: 0 }]],
        },
      },
    );

    const result = await runWorkflowFixture(wf);
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
    expect(result.runData["When clicking 'Execute workflow'"]?.items?.[0][0].json).toEqual({});
    expect(result.runData["No Operation"]?.items?.[0][0].json).toEqual({});
  });

  it("uses pin data instead of the empty default when pinned (edge)", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "Start",
          type: TYPE,
          typeVersion: 1,
          parameters: {},
        }),
        makeNode({ id: "n1", name: "Pass", type: "n8n-nodes-base.noOp" }),
      ],
      {
        Start: { main: [[{ node: "Pass", type: "main", index: 0 }]] },
      },
    );

    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: {
        Start: [{ json: { hello: "pinned" } }],
      },
    });

    expect(result.success).toBe(true);
    expect(result.runData.Start?.items?.[0]).toEqual([{ json: { hello: "pinned" } }]);
    expect(result.runData.Pass?.items?.[0][0].json).toEqual({ hello: "pinned" });
  });

  it("resolves legacy alias type strings to the same executor", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("n8n-nodes-base.start")).toBe(canonical);
    expect(getExecutor("n8n-nodes-base.manualWorkflowTrigger")).toBe(canonical);
    expect(hasExecutor("n8n-nodes-base.start")).toBe(true);
    expect(hasExecutor("n8n-nodes-base.manualWorkflowTrigger")).toBe(true);
  });
});

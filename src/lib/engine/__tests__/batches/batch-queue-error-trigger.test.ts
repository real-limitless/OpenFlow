import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.errorTrigger";

const SHAPE_A = {
  execution: {
    id: "231",
    url: "https://n8n.example.com/execution/231",
    error: { message: "Example Error Message", stack: "Stacktrace" },
    lastNodeExecuted: "Node With Error",
    mode: "manual",
  },
  workflow: { id: "1", name: "Example Workflow" },
};

const SHAPE_A_RETRY = {
  execution: {
    id: "232",
    url: "https://n8n.example.com/execution/232",
    retryOf: "34",
    error: { message: "Example Error Message", stack: "Stacktrace" },
    lastNodeExecuted: "Node With Error",
    mode: "manual",
  },
  workflow: { id: "1", name: "Example Workflow" },
};

const SHAPE_B = {
  trigger: {
    error: {
      name: "WorkflowActivationError",
      message: "",
      cause: { message: "", stack: "" },
      timestamp: 1654609328787,
      context: {},
    },
    mode: "trigger",
  },
  workflow: { id: "", name: "" },
};

describe("batch-queue errorTrigger — n8n-nodes-base.errorTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Error Trigger");
  });

  it("passes through platform-injected error data (Shape A — non-trigger failure)", async () => {
    const out = await runNode(TYPE, {}, [SHAPE_A]);
    expect(out).toEqual([[{ json: SHAPE_A }]]);
  });

  it("includes retryOf when the failed execution is a retry (edge)", async () => {
    const out = await runNode(TYPE, {}, [SHAPE_A_RETRY]);
    expect((out[0][0].json.execution as Record<string, unknown>).retryOf).toBe("34");
  });

  it("omits retryOf when the execution is not a retry", async () => {
    const out = await runNode(TYPE, {}, [SHAPE_A]);
    expect((out[0][0].json.execution as Record<string, unknown>)?.retryOf).toBeUndefined();
  });

  it("passes through trigger-node failure data (Shape B)", async () => {
    const out = await runNode(TYPE, {}, [SHAPE_B]);
    expect(out).toEqual([[{ json: SHAPE_B }]]);
    expect(out[0][0].json.trigger).toBeDefined();
    expect(out[0][0].json.execution).toBeUndefined();
  });

  it("does not fire on manual run (no error context — emits nothing)", async () => {
    const out = await runNode(TYPE, {}, []);
    expect(out).toEqual([[]]);
  });

  it("uses pin data instead of generating error data when pinned (edge)", async () => {
    const pinned = [{ json: { execution: { id: "99", error: { message: "pinned" } }, workflow: { id: "1", name: "W" } } }];
    const wf = makeWorkflow(
      [
        makeNode({ id: "t1", name: "Start", type: TYPE, typeVersion: 1, parameters: {} }),
        makeNode({ id: "n1", name: "Pass", type: "n8n-nodes-base.noOp" }),
      ],
      { Start: { main: [[{ node: "Pass", type: "main", index: 0 }]] } },
    );
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: { Start: pinned },
    });
    expect(result.success).toBe(true);
    expect(result.runData.Start?.items?.[0]).toEqual(pinned);
    expect(result.runData.Pass?.items?.[0][0].json).toEqual(pinned[0].json);
  });

  it("feeds NoOp downstream when error context is injected via input items", async () => {
    const wf = makeWorkflow(
      [
        makeNode({ id: "t1", name: "Error Trigger", type: TYPE, typeVersion: 1, parameters: {} }),
        makeNode({ id: "n1", name: "No Operation", type: "n8n-nodes-base.noOp", typeVersion: 1 }),
      ],
      { "Error Trigger": { main: [[{ node: "No Operation", type: "main", index: 0 }]] } },
    );
    const result = await runWorkflowFixture(wf, {
      pinData: { "Error Trigger": [{ json: SHAPE_A }] },
    });
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
    expect(result.runData["No Operation"]?.items?.[0][0].json).toEqual(SHAPE_A);
  });
});
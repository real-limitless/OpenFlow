import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.workflowTrigger";

const STARTED_EVENT = {
  workflow: { id: "1", name: "Producer" },
  execution: { id: "100", mode: "trigger" },
  startedAt: "2026-01-01T00:00:00.000Z",
};

const FINISHED_EVENT = {
  workflow: { id: "2", name: "Producer" },
  execution: { id: "200", mode: "trigger" },
  finishedAt: "2026-01-01T00:05:00.000Z",
  status: "success",
};

describe("batch-queue workflowTrigger — n8n-nodes-base.workflowTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Workflow Trigger");
  });

  it("passes through platform-injected workflowStarted event", async () => {
    const out = await runNode(TYPE, { workflowTrigger: "workflowStarted" }, [
      STARTED_EVENT,
    ]);
    expect(out).toEqual([[{ json: STARTED_EVENT }]]);
  });

  it("passes through platform-injected workflowFinished event", async () => {
    const out = await runNode(TYPE, { workflowTrigger: "workflowFinished" }, [
      FINISHED_EVENT,
    ]);
    expect(out).toEqual([[{ json: FINISHED_EVENT }]]);
    expect(out[0][0].json.status).toBe("success");
  });

  it("emits a single empty item on manual run with no event (edge)", async () => {
    const out = await runNode(TYPE, { workflowTrigger: "workflowStarted" }, []);
    expect(out).toEqual([[{ json: {} }]]);
  });

  it("uses pin data instead of generating event data when pinned", async () => {
    const pinned = [
      { json: { workflow: { id: "9" }, pinned: true } },
    ];
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "Start",
          type: TYPE,
          typeVersion: 1.1,
          parameters: { workflowTrigger: "workflowStarted" },
        }),
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

  it("feeds NoOp downstream when event context is injected via input items", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "Workflow Trigger",
          type: TYPE,
          typeVersion: 1.1,
          parameters: { workflowTrigger: "workflowFinished" },
        }),
        makeNode({
          id: "n1",
          name: "No Operation",
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
        }),
      ],
      {
        "Workflow Trigger": {
          main: [[{ node: "No Operation", type: "main", index: 0 }]],
        },
      },
    );
    const result = await runWorkflowFixture(wf);
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
  });
});
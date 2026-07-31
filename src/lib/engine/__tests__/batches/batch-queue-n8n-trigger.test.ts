import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.n8nTrigger";

const WORKFLOW_UPDATED_EVENT = {
  workflow: { id: "wf-1", name: "My Workflow", updatedAt: "2026-01-01T00:00:00.000Z" },
};

const INSTANCE_STARTED_EVENT = {
  instance: { version: "2.15.0", startedAt: "2026-01-01T00:00:00.000Z" },
  workflow: { id: "wf-1", name: "My Workflow" },
};

const WORKFLOW_PUBLISHED_EVENT = {
  workflow: { id: "wf-1", name: "My Workflow", publishedAt: "2026-01-01T00:00:00.000Z" },
};

describe("batch-queue n8nTrigger — n8n-nodes-base.n8nTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("n8n Trigger");
  });

  it("passes through platform-injected workflowUpdated event", async () => {
    const out = await runNode(TYPE, { events: ["workflowUpdated"] }, [
      WORKFLOW_UPDATED_EVENT,
    ]);
    expect(out).toEqual([[{ json: WORKFLOW_UPDATED_EVENT }]]);
  });

  it("passes through platform-injected instanceStarted event", async () => {
    const out = await runNode(TYPE, { events: ["instanceStarted"] }, [
      INSTANCE_STARTED_EVENT,
    ]);
    expect(out).toEqual([[{ json: INSTANCE_STARTED_EVENT }]]);
  });

  it("passes through platform-injected workflowPublished event when multiple events selected", async () => {
    const out = await runNode(
      TYPE,
      { events: ["workflowUpdated", "instanceStarted", "workflowPublished"] },
      [WORKFLOW_PUBLISHED_EVENT],
    );
    expect(out).toEqual([[{ json: WORKFLOW_PUBLISHED_EVENT }]]);
  });

  it("emits a single empty item on manual run with no event (edge)", async () => {
    const out = await runNode(TYPE, { events: ["workflowUpdated"] }, []);
    expect(out).toEqual([[{ json: {} }]]);
  });

  it("uses pin data instead of generating event data when pinned", async () => {
    const pinned = [
      { json: { workflow: { id: "wf-1" }, pinned: true } },
    ];
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "Start",
          type: TYPE,
          typeVersion: 1,
          parameters: { events: ["workflowUpdated"] },
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

  it("feeds NoOp downstream when event context is injected", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "n8n Trigger",
          type: TYPE,
          typeVersion: 1,
          parameters: { events: ["workflowPublished"] },
        }),
        makeNode({
          id: "n1",
          name: "No Operation",
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
        }),
      ],
      {
        "n8n Trigger": {
          main: [[{ node: "No Operation", type: "main", index: 0 }]],
        },
      },
    );
    const result = await runWorkflowFixture(wf);
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
  });
});
import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode, runWorkflowFixture } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.activationTrigger";

const ACTIVATION_EVENT = {
  workflow: { id: "1", name: "My Workflow" },
  execution: { id: "100", mode: "trigger" },
  event: "activation",
  timestamp: "2026-01-01T00:00:00.000Z",
};

const START_EVENT = {
  workflow: { id: "1", name: "My Workflow" },
  execution: { id: "101", mode: "trigger" },
  event: "start",
  timestamp: "2026-01-01T00:00:00.000Z",
};

const UPDATE_EVENT = {
  workflow: { id: "1", name: "My Workflow" },
  execution: { id: "102", mode: "trigger" },
  event: "update",
  timestamp: "2026-01-01T01:00:00.000Z",
};

describe("batch-queue activationTrigger — n8n-nodes-base.activationTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Activation Trigger");
  });

  it("passes through platform-injected activation event", async () => {
    const out = await runNode(TYPE, { events: ["activation"] }, [ACTIVATION_EVENT]);
    expect(out).toEqual([[{ json: ACTIVATION_EVENT }]]);
  });

  it("passes through platform-injected start event", async () => {
    const out = await runNode(TYPE, { events: ["start"] }, [START_EVENT]);
    expect(out).toEqual([[{ json: START_EVENT }]]);
  });

  it("passes through platform-injected update event", async () => {
    const out = await runNode(TYPE, { events: ["update"] }, [UPDATE_EVENT]);
    expect(out).toEqual([[{ json: UPDATE_EVENT }]]);
  });

  it("emits a single empty item on manual run with no event", async () => {
    const out = await runNode(TYPE, { events: ["activation"] }, []);
    expect(out).toEqual([[{ json: {} }]]);
  });

  it("uses pin data instead of generating event data when pinned", async () => {
    const pinned = [{ json: { workflow: { id: "1" }, pinned: true } }];
    const wf = makeWorkflow(
      [
        makeNode({ id: "t1", name: "Start", type: TYPE, typeVersion: 1, parameters: { events: ["activation"] } }),
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
        makeNode({ id: "t1", name: "Activation Trigger", type: TYPE, typeVersion: 1, parameters: { events: ["activation"] } }),
        makeNode({ id: "n1", name: "No Operation", type: "n8n-nodes-base.noOp", typeVersion: 1 }),
      ],
      { "Activation Trigger": { main: [[{ node: "No Operation", type: "main", index: 0 }]] } },
    );
    const result = await runWorkflowFixture(wf);
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
  });
});
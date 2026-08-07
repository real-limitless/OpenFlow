import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors, getExecutorMap } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { executeWorkflow } from "../../runner";
import { makeNode, makeWorkflow, runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.theHiveTrigger";

const CASE_CREATE_PAYLOAD = {
  eventType: "case.create",
  objectType: "case",
  object: { title: "Test", severity: 2 },
  organisation: "test-org",
};

const ALERT_CREATE_PAYLOAD = {
  eventType: "alert.create",
  objectType: "alert",
  object: { title: "Alert Test", type: "internal" },
  organisation: "test-org",
};

const CASE_UPDATE_PAYLOAD = {
  eventType: "case.update",
  objectType: "case",
  object: { title: "Test Updated", severity: 3 },
  organisation: "test-org",
};

describe("batch-queue theHiveTrigger — n8n-nodes-base.theHiveTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("TheHive Trigger");
  });

  it("all events receive: empty events list produces output for any event", async () => {
    const out = await runNode(TYPE, { events: [] }, [CASE_CREATE_PAYLOAD]);
    expect(out).toEqual([[{ json: CASE_CREATE_PAYLOAD }]]);
  });

  it("filtered event type: only configured events produce output", async () => {
    const out = await runNode(TYPE, { events: ["alert.create"] }, [CASE_UPDATE_PAYLOAD]);
    expect(out).toEqual([[]]);
  });

  it("selected event does produce output", async () => {
    const out = await runNode(TYPE, { events: ["alert.create"] }, [ALERT_CREATE_PAYLOAD]);
    expect(out).toEqual([[{ json: ALERT_CREATE_PAYLOAD }]]);
  });

  it("non-JSON payload: missing eventType/objectType silently dropped", async () => {
    const out = await runNode(TYPE, { events: [] }, [{ some: "garbage" }]);
    expect(out).toEqual([[]]);
  });

  it("multiple items with mixed events filter correctly", async () => {
    const out = await runNode(
      TYPE,
      { events: ["case.create"] },
      [CASE_CREATE_PAYLOAD, ALERT_CREATE_PAYLOAD],
    );
    expect(out).toEqual([[{ json: CASE_CREATE_PAYLOAD }]]);
  });

  it("manual execution with no input returns empty arrays", async () => {
    const out = await runNode(TYPE, { events: [] }, []);
    expect(out).toEqual([[]]);
  });

  it("feeds NoOp downstream when webhook payload is injected via input items", async () => {
    const wf = makeWorkflow(
      [
        makeNode({
          id: "t1",
          name: "TheHive Trigger",
          type: TYPE,
          typeVersion: 1,
          parameters: { events: ["case.create"] },
        }),
        makeNode({ id: "n1", name: "No Operation", type: "n8n-nodes-base.noOp", typeVersion: 1 }),
      ],
      { "TheHive Trigger": { main: [[{ node: "No Operation", type: "main", index: 0 }]] } },
    );
    const result = await executeWorkflow({
      workflow: wf,
      nodeExecutors: getExecutorMap(),
      pinData: {
        "TheHive Trigger": [{ json: CASE_CREATE_PAYLOAD }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.runData["No Operation"]?.status).toBe("success");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { createExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.stravaTrigger";

async function runStravaTrigger(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
): Promise<INodeExecutionData[][]> {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  const node: INode = {
    id: "1",
    name: "Strava Trigger",
    type: TYPE,
    typeVersion: 1,
    position: [0, 0],
    parameters: params,
  };
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => inputItems.map((j) => ({ json: j })),
    continueOnFail: false,
    getCredential: async () => null,
  });
  return executor(ctx, node);
}

describe("n8n-nodes-base.stravaTrigger", () => {
  it("has executor and description registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE)).toBeTruthy();
  });

  it("basic activity created event", async () => {
    const payload = {
      aspect_type: "create",
      event_time: 1516126040,
      object_id: 1360128428,
      object_type: "activity",
      owner_id: 134815,
      subscription_id: 120475,
      updates: {},
    };
    const [out] = await runStravaTrigger(
      { filter: "Activity", triggerOn: "Created" },
      [payload],
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(payload);
  });

  it("athlete event filtered out", async () => {
    const payload = {
      aspect_type: "update",
      event_time: 1516126041,
      object_id: 134815,
      object_type: "athlete",
      owner_id: 134815,
      subscription_id: 120475,
      updates: { authorized: "false" },
    };
    const [out] = await runStravaTrigger(
      { filter: "Activity", triggerOn: "[All]" },
      [payload],
    );
    expect(out).toHaveLength(0);
  });

  it("all events pass-through", async () => {
    const payload = {
      aspect_type: "delete",
      event_time: 1516126042,
      object_id: 1360128429,
      object_type: "activity",
      owner_id: 134815,
      subscription_id: 120475,
      updates: {},
    };
    const [out] = await runStravaTrigger(
      { filter: "[All]", triggerOn: "[All]" },
      [payload],
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(payload);
  });

  it("discards malformed items", async () => {
    const [out] = await runStravaTrigger(
      { filter: "[All]", triggerOn: "[All]" },
      [{ notAWebhook: true }],
    );
    expect(out).toHaveLength(0);
  });

  it("multiple events pass through filter", async () => {
    const activityCreate = {
      aspect_type: "create",
      event_time: 100,
      object_id: 1,
      object_type: "activity",
      owner_id: 1,
      subscription_id: 1,
      updates: {},
    };
    const athleteUpdate = {
      aspect_type: "update",
      event_time: 200,
      object_id: 2,
      object_type: "athlete",
      owner_id: 2,
      subscription_id: 1,
      updates: { authorized: "true" },
    };
    const athleteDelete = {
      aspect_type: "delete",
      event_time: 300,
      object_id: 3,
      object_type: "athlete",
      owner_id: 3,
      subscription_id: 1,
      updates: {},
    };
    const [out] = await runStravaTrigger(
      { filter: "[All]", triggerOn: "[All]" },
      [activityCreate, athleteUpdate, athleteDelete],
    );
    expect(out).toHaveLength(3);
  });
});

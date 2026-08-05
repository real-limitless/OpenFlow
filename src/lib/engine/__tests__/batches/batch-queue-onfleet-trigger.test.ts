import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext, type INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.onfleetTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INodeExecutionData["json"] extends never ? never : Parameters<typeof createExecutionContext>[0]["node"],
): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
  };
  return createExecutionContext({
    node,
    workflow: workflow as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runOnfleetTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
) {
  const node = makeNode({
    name: "Onfleet Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue onfleetTrigger — n8n-nodes-base.onfleetTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Onfleet Trigger");
  });

  it("passes through a single webhook payload (happy path)", async () => {
    const { out } = await runOnfleetTrigger(
      { events: ["taskCreated"] },
      [
        {
          action: "taskCreated",
          entity: { id: "abc123", type: "task" },
          context: {},
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      action: "taskCreated",
      entity: { id: "abc123", type: "task" },
      context: {},
    });
  });

  it("passes through worker duty payload", async () => {
    const { out } = await runOnfleetTrigger(
      { events: ["workerDuty"] },
      [
        {
          action: "workerDuty",
          entity: { id: "worker1", name: "Jane", duty: "on" },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.action).toBe("workerDuty");
    expect(out[0][0].json.entity.id).toBe("worker1");
  });

  it("handles multiple webhook payloads", async () => {
    const { out } = await runOnfleetTrigger(
      { events: ["taskCreated", "taskCompleted"] },
      [
        { action: "taskCreated", entity: { id: "1" } },
        { action: "taskCompleted", entity: { id: "2" } },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.action).toBe("taskCreated");
    expect(out[0][1].json.action).toBe("taskCompleted");
  });

  it("handles empty input by emitting single empty item (edge)", async () => {
    const { out } = await runOnfleetTrigger(
      { events: ["taskCreated"] },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("preserves binary data from input item", async () => {
    const { out } = await runOnfleetTrigger(
      { events: ["taskCreated"] },
      [
        {
          json: { action: "taskCreated", entity: { id: "1" } },
          binary: { attachment: { data: "Zm9v", mimeType: "text/plain" } },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].binary).toEqual({
      attachment: { data: "Zm9v", mimeType: "text/plain" },
    });
  });
});

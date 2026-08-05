import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mqttTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  executionId = "exec-mqtt",
): ExecutionContext {
  const workflow = {
    id: "wf",
    name: "Test",
    active: false,
    nodes: [node],
    connections: {},
    settings: {},
    __executionId: executionId,
  };
  return createExecutionContext({
    node,
    workflow: workflow as unknown as Parameters<typeof createExecutionContext>[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runMqttTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string } = {},
) {
  const node = makeNode({
    name: "MQTT Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-mqtt");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue mqttTrigger — n8n-nodes-base.mqttTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MQTT Trigger");
  });

  it("emits item with topic and message fields (happy path)", async () => {
    const { out } = await runMqttTrigger(
      { topics: "sensors/#" },
      [{ json: { topic: "sensors/temperature", message: "22.5" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      topic: "sensors/temperature",
      message: "22.5",
    });
  });

  it("JSON-parses message body when jsonParseBody is enabled", async () => {
    const { out } = await runMqttTrigger(
      {
        topics: "data/json",
        options: { jsonParseBody: true },
      },
      [{ json: { topic: "data/json", message: '{"temp":22.5,"unit":"C"}' } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      topic: "data/json",
      message: { temp: 22.5, unit: "C" },
    });
  });

  it("emits only message value when onlyMessage is enabled", async () => {
    const { out } = await runMqttTrigger(
      {
        topics: "test/hello",
        options: { onlyMessage: true },
      },
      [{ json: { topic: "test/hello", message: "hello world" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toBe("hello world");
  });

  it("handles multiple messages in one firing", async () => {
    const { out } = await runMqttTrigger(
      { topics: "events/#" },
      [
        { json: { topic: "events/1", message: "a" } },
        { json: { topic: "events/2", message: "b" } },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ topic: "events/1", message: "a" });
    expect(out[0][1].json).toEqual({ topic: "events/2", message: "b" });
  });

  it("handles empty input by emitting single empty item (edge)", async () => {
    const { out } = await runMqttTrigger(
      { topics: "test/#" },
      [],
    );

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("preserves raw string when JSON parse fails", async () => {
    const { out } = await runMqttTrigger(
      {
        topics: "data/json",
        options: { jsonParseBody: true },
      },
      [{ json: { topic: "data/json", message: "not-valid-json" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      topic: "data/json",
      message: "not-valid-json",
    });
  });
});

import { describe, it, expect } from "vitest";
import type { INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.rabbitmqTrigger";

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: import("@/sdk").INode,
  executionId = "exec-rabbitmq-trigger",
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

async function runTrigger(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  opts: { executionId?: string } = {},
) {
  const node = makeNode({
    name: "RabbitMQ Trigger",
    type: TYPE,
    parameters,
  });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-rabbitmq-trigger");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe("batch-queue rabbitmqTrigger — n8n-nodes-base.rabbitmqTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("RabbitMQ Trigger");
  });

  it("emits item with full envelope including body and delivery metadata (happy path)", async () => {
    const { out } = await runTrigger(
      { queue: "test-q", options: { acknowledge: "immediately" } },
      [
        {
          message: '{"hello":"world"}',
          fields: { consumerTag: "tag-1", deliveryTag: 1, redelivered: false, exchange: "", routingKey: "test-q" },
          properties: { contentType: "text/plain" },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      message: '{"hello":"world"}',
      fields: { consumerTag: "tag-1", deliveryTag: 1, redelivered: false, exchange: "", routingKey: "test-q" },
      properties: { contentType: "text/plain" },
    });
  });

  it("JSON-parses message body when jsonParseBody is enabled", async () => {
    const { out } = await runTrigger(
      { queue: "test-q", options: { acknowledge: "immediately", jsonParseBody: true } },
      [{ message: '{"temp": 22.5}' }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.message).toEqual({ temp: 22.5 });
  });

  it("emits only message value when onlyContent is enabled", async () => {
    const { out } = await runTrigger(
      { queue: "test-q", options: { acknowledge: "immediately", onlyContent: true } },
      [{ message: "hello" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ message: "hello" });
  });

  it("preserves raw string when JSON parse fails", async () => {
    const { out } = await runTrigger(
      { queue: "test-q", options: { jsonParseBody: true, onlyContent: true } },
      [{ message: "not-json" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ message: "not-json" });
  });

  it("includes delivery metadata for deferred ack (laterMessageNode)", async () => {
    const { out } = await runTrigger(
      { queue: "test-q", options: { acknowledge: "laterMessageNode" } },
      [
        {
          message: "test",
          fields: { consumerTag: "ct-1", deliveryTag: 42, redelivered: false, exchange: "", routingKey: "test-q" },
        },
      ],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.fields.deliveryTag).toBe(42);
    expect(out[0][0].json.fields.consumerTag).toBe("ct-1");
  });

  it("handles multiple messages in one firing", async () => {
    const { out } = await runTrigger(
      { queue: "test-q" },
      [
        { message: "msg1", fields: { deliveryTag: 1 } },
        { message: "msg2", fields: { deliveryTag: 2 } },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.message).toBe("msg1");
    expect(out[0][1].json.message).toBe("msg2");
  });

  it("handles empty input by emitting single empty item", async () => {
    const { out } = await runTrigger({ queue: "test-q" }, []);

    expect(out[0]).toEqual([{ json: {} }]);
  });

  it("throws when queue parameter is empty", async () => {
    const node = makeNode({
      name: "RabbitMQ Trigger",
      type: TYPE,
      parameters: {},
    });
    const ctx = makeCtx([], node);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow("Queue parameter is required");
  });
});

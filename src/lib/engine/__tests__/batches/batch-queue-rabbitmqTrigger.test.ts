import { describe, it, expect } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.rabbitmqTrigger";

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  executionId = "exec-rabbitmq",
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
    workflow: workflow as unknown as Parameters<
      typeof createExecutionContext
    >[0]["workflow"],
    getNodeInputItems: () => items,
    continueOnFail: false,
  });
}

async function runRabbitmqTrigger(
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
  const ctx = makeCtx(items, node, opts.executionId ?? "exec-rabbitmq");
  const executor = getExecutor(TYPE)!;
  return { node, ctx, out: await executor(ctx, node) };
}

describe(
  "batch-queue rabbitmqTrigger — n8n-nodes-base.rabbitmqTrigger",
  () => {
    it("is registered as executor + description", () => {
      expect(hasExecutor(TYPE)).toBe(true);
      expect(getNodeType(TYPE).placeholder).not.toBe(true);
      expect(getNodeType(TYPE).displayName).toBe("RabbitMQ Trigger");
    });

    it("emit full envelope from message (default, onlyMessage=false)", async () => {
      const { out } = await runRabbitmqTrigger(
        { queue: "my-input-queue" },
        [
            {
              message: "hello",
              fields: {
                deliveryTag: 1,
                consumerTag: "tag-abc",
                exchange: "",
                routingKey: "my-input-queue",
                redelivered: false,
              },
              properties: { contentType: "text/plain" },
            },
        ],
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({
        message: "hello",
        fields: {
          deliveryTag: 1,
          consumerTag: "tag-abc",
          exchange: "",
          routingKey: "my-input-queue",
          redelivered: false,
        },
        properties: { contentType: "text/plain" },
      });
    });

    it("JSON parse body when jsonParseBody=true", async () => {
      const { out } = await runRabbitmqTrigger(
        { queue: "events", options: { jsonParseBody: true } },
        [
            {
              message: '{"temp":22.5,"unit":"C"}',
            fields: { deliveryTag: 1, consumerTag: "tag-x", exchange: "", routingKey: "events" },
            properties: {},
          },
        ],
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({
        message: { temp: 22.5, unit: "C" },
        fields: { deliveryTag: 1, consumerTag: "tag-x", exchange: "", routingKey: "events" },
        properties: {},
      });
    });

    it("onlyMessage mode emits message value directly", async () => {
      const { out } = await runRabbitmqTrigger(
        { queue: "notifications", options: { onlyMessage: true } },
        [{ message: "alert", fields: { deliveryTag: 1 }, properties: {} }],
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({ message: "alert" });
    });

    it("deferred acknowledgment — passes delivery metadata through", async () => {
      const { out } = await runRabbitmqTrigger(
        { queue: "orders", options: { acknowledge: "laterMessageNode" } },
        [
            {
              message: "order-123",
              fields: { deliveryTag: 42, consumerTag: "tag-42", exchange: "", routingKey: "orders" },
              properties: {},
            },
        ],
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        fields: { deliveryTag: 42 },
      });
    });

    it("multiple messages in one firing", async () => {
      const { out } = await runRabbitmqTrigger(
        { queue: "telemetry" },
        [
          { message: "msg1", fields: { deliveryTag: 1 }, properties: {} },
          { message: "msg2", fields: { deliveryTag: 2 }, properties: {} },
          { message: "msg3", fields: { deliveryTag: 3 }, properties: {} },
        ],
      );

      expect(out[0]).toHaveLength(3);
      expect(out[0][0].json).toMatchObject({ message: "msg1" });
      expect(out[0][1].json).toMatchObject({ message: "msg2" });
      expect(out[0][2].json).toMatchObject({ message: "msg3" });
    });

    it("handles empty input by emitting empty item", async () => {
      const { out } = await runRabbitmqTrigger(
        { queue: "test" },
        [],
      );

      expect(out[0]).toEqual([{ json: {} }]);
    });

    it("preserves binary data from input item", async () => {
      const { out } = await runRabbitmqTrigger(
        { queue: "test" },
        [
          {
            json: {
              message: "binary-test",
              fields: {},
              properties: {},
            },
            binary: { file: { data: "dGVzdA==", mimeType: "text/plain" } },
          },
        ],
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].binary).toEqual({
        file: { data: "dGVzdA==", mimeType: "text/plain" },
      });
    });
  },
);

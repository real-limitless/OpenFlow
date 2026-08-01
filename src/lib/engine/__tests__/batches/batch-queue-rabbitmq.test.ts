import { describe, it, expect, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import {
  setRabbitMqClientFactory,
  type RabbitMqClient,
} from "../../executors/rabbitmq";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.rabbitmq";
const CREDS: Record<string, Record<string, unknown>> = {
  rabbitmq: {
    hostname: "localhost",
    port: 5672,
    user: "guest",
    password: "guest",
    vhost: "/",
    ssl: false,
  },
};

function makeCtxWithCred(
  items: INodeExecutionData[],
  node: INode,
  credentials: Record<string, Record<string, unknown>> = CREDS,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials[name] ?? null,
  });
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function mockRabbitMqClient(): {
  client: RabbitMqClient;
  sent: Array<{ exchange: string; routingKey: string; content: Buffer; options: Record<string, unknown> }>;
  acked: number[];
} {
  const sent: Array<{ exchange: string; routingKey: string; content: Buffer; options: Record<string, unknown> }> = [];
  const acked: number[] = [];
  const client: RabbitMqClient = {
    async send(exchange, routingKey, content, options) {
      sent.push({ exchange, routingKey, content, options });
    },
    async ack(deliveryTag) {
      acked.push(deliveryTag);
    },
    async quit() {},
  };
  return { client, sent, acked };
}

async function runRabbitMq(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  credentials: Record<string, Record<string, unknown>> = CREDS,
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, opts?.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

afterEach(() => setRabbitMqClientFactory(null));

describe("batch-queue rabbitmq — n8n-nodes-base.rabbitmq", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const nodeType = getNodeType(TYPE);
    expect(nodeType.placeholder).not.toBe(true);
    expect(nodeType.displayName).toBe("RabbitMQ");
  });

  it("sends to default queue with sendInputData (acceptance: send to default queue)", async () => {
    const mock = mockRabbitMqClient();
    setRabbitMqClientFactory(async () => mock.client);

    const input = [{ json: { sensor: "temp-01", value: 22.5 } }];
    const out = await runRabbitMq(
      {
        operation: "sendMessage",
        mode: "queue",
        queue: "test-queue",
        sendInputData: true,
      },
      input,
    );

    expect(out[0]).toEqual([{ json: { sensor: "temp-01", value: 22.5 }, pairedItem: { item: 0, input: 0 } }]);
    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0]!.exchange).toBe("");
    expect(mock.sent[0]!.routingKey).toBe("test-queue");
    expect(mock.sent[0]!.content.toString()).toBe(JSON.stringify({ sensor: "temp-01", value: 22.5 }));
  });

  it("sends to exchange with routing key and custom message (acceptance: send to exchange with routing key)", async () => {
    const mock = mockRabbitMqClient();
    setRabbitMqClientFactory(async () => mock.client);

    const out = await runRabbitMq(
      {
        operation: "sendMessage",
        mode: "exchange",
        exchange: "events",
        exchangeType: "topic",
        routingKey: "sensor.temperature",
        sendInputData: false,
        message: "alert: high temperature",
      },
      [{ json: {} }],
    );

    expect(out[0]).toHaveLength(1);
    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0]!.exchange).toBe("events");
    expect(mock.sent[0]!.routingKey).toBe("sensor.temperature");
    expect(mock.sent[0]!.content.toString()).toBe("alert: high temperature");
  });

  it("sends with options (durable, headers) (acceptance: send with options)", async () => {
    const mock = mockRabbitMqClient();
    setRabbitMqClientFactory(async () => mock.client);

    const out = await runRabbitMq(
      {
        operation: "sendMessage",
        mode: "queue",
        queue: "opts-queue",
        sendInputData: false,
        message: "test",
        options: {
          durable: true,
          autoDelete: false,
          headers: [
            { key: "source", value: "openflow" },
          ],
        },
      },
      [{ json: { id: 1 } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0]!.options!.persistent).toBe(true);
    expect((mock.sent[0]!.options!.headers as Record<string, string>)?.source).toBe("openflow");
  });

  it("deletes from queue via ack (acceptance: delete message)", async () => {
    const mock = mockRabbitMqClient();
    setRabbitMqClientFactory(async () => mock.client);

    const out = await runRabbitMq(
      { operation: "deleteMessage" },
      [{ json: { fields: { consumerTag: "tag-1", deliveryTag: 42 } } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0]![0]!.json).toEqual({ fields: { consumerTag: "tag-1", deliveryTag: 42 } });
    expect(mock.acked).toEqual([42]);
  });

  it("throws when required credential is missing", async () => {
    const mock = mockRabbitMqClient();
    setRabbitMqClientFactory(async () => mock.client);
    await expect(
      runRabbitMq({ operation: "sendMessage", mode: "queue", queue: "test", message: "hi" }, [{}], {}),
    ).rejects.toThrow(/credential "rabbitmq"/);
  });

  it("throws on connection failure", async () => {
    setRabbitMqClientFactory(async () => {
      throw new Error("Connection refused");
    });
    await expect(
      runRabbitMq({ operation: "sendMessage", mode: "queue", queue: "test", message: "hi" }),
    ).rejects.toThrow("Connection refused");
  });

  it("continueOnFail yields error item on send failure (acceptance: publish failure with continueOnFail)", async () => {
    const mock = mockRabbitMqClient();
    let callCount = 0;
    mock.client.send = async () => {
      callCount++;
      if (callCount <= 1) throw new Error("Queue not found");
    };
    setRabbitMqClientFactory(async () => mock.client);

    const out = await runRabbitMq(
      {
        operation: "sendMessage",
        mode: "queue",
        queue: "test/fail",
        sendInputData: false,
        message: "fail",
        continueOnFail: true,
      },
      [{ json: { id: 1 } }, { json: { id: 2 } }],
      CREDS,
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0]!.json).toEqual({ id: 1, error: "Queue not found" });
    expect(out[0][0]!.pairedItem).toEqual({ item: 0, input: 0 });
    expect(out[0][1]!.json).toEqual({ id: 2 });
    expect(out[0][1]!.pairedItem).toEqual({ item: 1, input: 0 });
  });
});

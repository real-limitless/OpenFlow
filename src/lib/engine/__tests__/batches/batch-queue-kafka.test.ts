import { describe, it, expect, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import {
  setKafkaClientFactory,
  type KafkaClient,
} from "../../executors/kafkaNode";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.kafka";
const CREDS = {
  kafka: {
    clientId: "test-client",
    brokers: "localhost:9092",
    ssl: false,
    authentication: false,
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

function mockKafka(): {
  client: KafkaClient;
  sends: Array<{
    topic: string;
    messages: Array<{ key?: string; value: string; headers?: Record<string, string> }>;
  }>;
} {
  const sends: Array<{
    topic: string;
    messages: Array<{ key?: string; value: string; headers?: Record<string, string> }>;
  }> = [];
  const client: KafkaClient = {
    async send(topic, messages) {
      sends.push({ topic, messages });
    },
    async disconnect() {},
  };
  return { client, sends };
}

async function runKafka(
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

afterEach(() => setKafkaClientFactory(null));

describe("batch-queue kafka — n8n-nodes-base.kafka", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const nodeType = getNodeType(TYPE);
    expect(nodeType.placeholder).not.toBe(true);
    expect(nodeType.displayName).toBe("Kafka");
  });

  it("publishes input data as JSON (acceptance: publish input data as JSON)", async () => {
    const mock = mockKafka();
    setKafkaClientFactory(async () => mock.client);

    const out = await runKafka(
      {
        topic: "sensors/temperature",
        sendInputData: true,
      },
      [{ json: { sensor: "temp-01", value: 23.4 } }],
    );
    expect(out[0]).toEqual([
      { json: { sensor: "temp-01", value: 23.4 }, pairedItem: { item: 0, input: 0 } },
    ]);
    expect(mock.sends).toHaveLength(1);
    expect(mock.sends[0]!.topic).toBe("sensors/temperature");
    expect(mock.sends[0]!.messages).toEqual([
      { value: JSON.stringify({ sensor: "temp-01", value: 23.4 }) },
    ]);
  });

  it("publishes static message (acceptance: publish static message)", async () => {
    const mock = mockKafka();
    setKafkaClientFactory(async () => mock.client);

    const out = await runKafka(
      {
        topic: "alerts/system",
        sendInputData: false,
        message: "System health check passed",
      },
      [{ json: {} }],
    );
    expect(out[0]).toEqual([
      { json: {}, pairedItem: { item: 0, input: 0 } },
    ]);
    expect(mock.sends[0]!.messages).toEqual([
      { value: "System health check passed" },
    ]);
  });

  it("publishes message with key and headers (acceptance: message with key and headers)", async () => {
    const mock = mockKafka();
    setKafkaClientFactory(async () => mock.client);

    const out = await runKafka(
      {
        topic: "orders/new",
        sendInputData: false,
        message: "Order created",
        useKey: true,
        key: "={{ $json.orderId }}",
        headersUi: {
          headerValues: [
            { key: "event-type", value: "order.created" },
            { key: "version", value: "1.0" },
          ],
        },
      },
      [{ json: { orderId: "ord-42" } }],
    );
    expect(out[0]).toEqual([
      { json: { orderId: "ord-42" }, pairedItem: { item: 0, input: 0 } },
    ]);
    expect(mock.sends[0]!.messages).toEqual([
      {
        key: "ord-42",
        value: "Order created",
        headers: { "event-type": "order.created", version: "1.0" },
      },
    ]);
  });

  it("throws on Schema Registry (not yet implemented)", async () => {
    const mock = mockKafka();
    setKafkaClientFactory(async () => mock.client);

    await expect(
      runKafka(
        {
          topic: "users/created",
          sendInputData: true,
          useSchemaRegistry: true,
          schemaRegistryUrl: "https://sr.example.com:8081",
          eventName: "com.example.User",
        },
        [{ json: { userId: 1, name: "Alice" } }],
      ),
    ).rejects.toThrow(/not yet implemented/);
  });

  it("throws when the required credential is missing", async () => {
    const mock = mockKafka();
    setKafkaClientFactory(async () => mock.client);
    await expect(runKafka({ topic: "test" }, [{}], {})).rejects.toThrow(
      /credential "kafka"/,
    );
  });

  it("throws on credential failure", async () => {
    setKafkaClientFactory(async () => {
      throw new Error("Broker connection refused");
    });
    await expect(runKafka({ topic: "test" }, [{}])).rejects.toThrow(
      "Broker connection refused",
    );
  });

  it("continueOnFail yields error item on publish failure, passes through successful (acceptance: publish failure with continueOnFail)", async () => {
    const mock = mockKafka();
    let callCount = 0;
    mock.client.send = async () => {
      callCount++;
      if (callCount <= 1) throw new Error("Topic not found");
    };
    setKafkaClientFactory(async () => mock.client);

    const out = await runKafka(
      {
        topic: "test/error",
        sendInputData: false,
        message: "fail",
      },
      [{ json: { id: 1 } }, { json: { id: 2 } }],
      CREDS,
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0]!.json).toEqual({ id: 1, error: "Topic not found" });
    expect(out[0][0]!.pairedItem).toEqual({ item: 0, input: 0 });
    expect(out[0][1]!.json).toEqual({ id: 2 });
    expect(out[0][1]!.pairedItem).toEqual({ item: 1, input: 0 });
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.kafka")).toBe(canonical);
  });
});

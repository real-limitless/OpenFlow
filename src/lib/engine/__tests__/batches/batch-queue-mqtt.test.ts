import { describe, it, expect, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import {
  setMqttClientFactory,
  type MqttClient,
} from "../../executors/mqtt";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mqtt";
const CREDS = {
  mqtt: {
    protocol: "mqtt",
    host: "localhost",
    port: 1883,
    clean: true,
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

function mockMqtt(): {
  client: MqttClient;
  publishes: Array<{ topic: string; payload: string; qos: number; retain: boolean }>;
} {
  const publishes: Array<{ topic: string; payload: string; qos: number; retain: boolean }> = [];
  const client: MqttClient = {
    async publish(topic, payload, qos, retain) {
      publishes.push({ topic, payload, qos, retain });
    },
    async quit() {},
  };
  return { client, publishes };
}

async function runMqtt(
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

afterEach(() => setMqttClientFactory(null));

describe("batch-queue mqtt — n8n-nodes-base.mqtt", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const nodeType = getNodeType(TYPE);
    expect(nodeType.placeholder).not.toBe(true);
    expect(nodeType.displayName).toBe("MQTT");
  });

  it("publishes static message (acceptance: publish static message)", async () => {
    const mock = mockMqtt();
    setMqttClientFactory(async () => mock.client);

    const out = await runMqtt(
      {
        topic: "sensors/temperature",
        sendInputData: false,
        message: "22.5",
        options: { qos: 1, retain: false },
      },
      [{ json: {} }],
    );
    expect(out[0]).toEqual([{ json: {}, pairedItem: { item: 0, input: 0 } }]);
    expect(mock.publishes).toEqual([
      { topic: "sensors/temperature", payload: "22.5", qos: 1, retain: false },
    ]);
  });

  it("publishes input data as JSON (acceptance: publish input data as JSON)", async () => {
    const mock = mockMqtt();
    setMqttClientFactory(async () => mock.client);

    const out = await runMqtt(
      {
        topic: "sensors/temperature",
        sendInputData: true,
      },
      [{ json: { device: "thermo-01", temp: 22.5 } }],
    );
    expect(out[0]).toEqual([
      { json: { device: "thermo-01", temp: 22.5 }, pairedItem: { item: 0, input: 0 } },
    ]);
    expect(mock.publishes).toEqual([
      {
        topic: "sensors/temperature",
        payload: JSON.stringify({ device: "thermo-01", temp: 22.5 }),
        qos: 0,
        retain: false,
      },
    ]);
  });

  it("resolves expression topic per item (acceptance: expression topic)", async () => {
    const mock = mockMqtt();
    setMqttClientFactory(async () => mock.client);

    const out = await runMqtt(
      {
        topic: "={{ $json.device }}/reading",
      },
      [{ json: { device: "sensor-01" } }],
    );
    expect(out[0]).toEqual([
      { json: { device: "sensor-01" }, pairedItem: { item: 0, input: 0 } },
    ]);
    expect(mock.publishes[0]!.topic).toBe("sensor-01/reading");
  });

  it("handles QoS and retain flags (acceptance: QoS and retain flags)", async () => {
    const mock = mockMqtt();
    setMqttClientFactory(async () => mock.client);

    const out = await runMqtt(
      {
        topic: "test/retain",
        sendInputData: false,
        message: "hello",
        options: { qos: 2, retain: true },
      },
      [{ json: {} }],
    );
    expect(out[0]).toEqual([{ json: {}, pairedItem: { item: 0, input: 0 } }]);
    expect(mock.publishes).toEqual([
      { topic: "test/retain", payload: "hello", qos: 2, retain: true },
    ]);
  });

  it("throws when the required credential is missing", async () => {
    const mock = mockMqtt();
    setMqttClientFactory(async () => mock.client);
    await expect(runMqtt({ topic: "test" }, [{}], {})).rejects.toThrow(
      /credential "mqtt"/,
    );
  });

  it("throws on credential failure (acceptance: credential failure)", async () => {
    setMqttClientFactory(async () => {
      throw new Error("Connection refused");
    });
    await expect(runMqtt({ topic: "test" }, [{}])).rejects.toThrow("Connection refused");
  });

  it("continueOnFail yields error items on publish failure (acceptance: publish failure with continueOnFail)", async () => {
    const mock = mockMqtt();
    mock.client.publish = async () => {
      throw new Error("Broker unreachable");
    };
    setMqttClientFactory(async () => mock.client);

    const out = await runMqtt(
      { topic: "test" },
      [{ json: { id: 1 } }, { json: { id: 2 } }],
      CREDS,
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0]!.json).toEqual({ id: 1, error: "Broker unreachable" });
    expect(out[0][0]!.pairedItem).toEqual({ item: 0, input: 0 });
    expect(out[0][1]!.json).toEqual({ id: 2, error: "Broker unreachable" });
    expect(out[0][1]!.pairedItem).toEqual({ item: 1, input: 0 });
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import {
  setAmqpClientFactory,
  type AmqpClient,
} from "../../executors/amqp";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.amqp";
const CREDS = {
  amqp: {
    hostname: "localhost",
    port: 5672,
    user: "guest",
    password: "guest",
    transportType: "tcp",
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

function mockAmqp(): {
  client: AmqpClient;
  publishes: Array<{ exchange: string; routingKey: string; body: string }>;
} {
  const publishes: Array<{ exchange: string; routingKey: string; body: string }> = [];
  const client: AmqpClient = {
    async publish(exchange, routingKey, body) {
      publishes.push({ exchange, routingKey, body });
    },
    async quit() {},
  };
  return { client, publishes };
}

async function runAmqp(
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

afterEach(() => setAmqpClientFactory(null));

describe("batch-queue amqp — n8n-nodes-base.amqp", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const nodeType = getNodeType(TYPE);
    expect(nodeType.placeholder).not.toBe(true);
    expect(nodeType.displayName).toBe("AMQP Sender");
  });

  it("publishes input data as payload (acceptance: send with input data as payload)", async () => {
    const mock = mockAmqp();
    setAmqpClientFactory(async () => mock.client);

    const out = await runAmqp(
      {
        exchange: "",
        routingKey: "sensor.data",
        sendInputData: true,
      },
      [{ json: { sensor: "temp-01", value: 22.5 } }],
    );
    expect(out[0]).toEqual([
      { json: { sensor: "temp-01", value: 22.5 }, pairedItem: { item: 0, input: 0 } },
    ]);
    expect(mock.publishes).toEqual([
      {
        exchange: "",
        routingKey: "sensor.data",
        body: JSON.stringify({ sensor: "temp-01", value: 22.5 }),
      },
    ]);
  });

  it("publishes custom message (acceptance: send with custom message)", async () => {
    const mock = mockAmqp();
    setAmqpClientFactory(async () => mock.client);

    const out = await runAmqp(
      {
        exchange: "alerts",
        routingKey: "system.critical",
        sendInputData: false,
        message: "CRITICAL: system load exceeded threshold",
      },
      [{ json: {} }],
    );
    expect(out[0]).toEqual([{ json: {}, pairedItem: { item: 0, input: 0 } }]);
    expect(mock.publishes).toEqual([
      {
        exchange: "alerts",
        routingKey: "system.critical",
        body: "CRITICAL: system load exceeded threshold",
      },
    ]);
  });

  it("throws when the required credential is missing", async () => {
    const mock = mockAmqp();
    setAmqpClientFactory(async () => mock.client);
    await expect(runAmqp({ routingKey: "test" }, [{}], {})).rejects.toThrow(
      /credential "amqp"/,
    );
  });

  it("throws on credential / connection failure", async () => {
    setAmqpClientFactory(async () => {
      throw new Error("Connection refused");
    });
    await expect(runAmqp({ routingKey: "test" }, [{}])).rejects.toThrow("Connection refused");
  });

  it("continueOnFail yields error items on publish failure (acceptance: publish failure with continueOnFail)", async () => {
    const mock = mockAmqp();
    mock.client.publish = async () => {
      throw new Error("Broker unreachable");
    };
    setAmqpClientFactory(async () => mock.client);

    const out = await runAmqp(
      { routingKey: "test.fail", sendInputData: false, message: "fail" },
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

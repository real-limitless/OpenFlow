import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setRedisToolClientFactory,
  type RedisClient,
} from "../../executors/n8n-nodes-base.redisTool";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.redisTool";
const CREDS = {
  redis: {
    host: "localhost",
    port: 6379,
    database: 0,
    password: "",
    user: "",
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

async function runRedisTool(
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

function mockRedis(): {
  client: RedisClient;
  store: Map<string, { type: string; value: unknown }>;
  publishes: Array<{ channel: string; message: string }>;
} {
  const store = new Map<string, { type: string; value: unknown }>();
  const publishes: Array<{ channel: string; message: string }> = [];

  const client: RedisClient = {
    async get(key) {
      const e = store.get(key);
      if (!e || e.type !== "string") return null;
      return String(e.value);
    },
    async set(key, value) {
      store.set(key, { type: "string", value });
      return "OK";
    },
    async del(key) {
      const had = store.delete(key);
      return had ? 1 : 0;
    },
    async incr(key) {
      const e = store.get(key);
      let n = 0;
      if (e && e.type === "string") {
        n = Number(e.value);
        if (!Number.isFinite(n)) throw new Error("ERR value is not an integer");
      }
      n += 1;
      store.set(key, { type: "string", value: String(n) });
      return n;
    },
    async expire() {
      return 0;
    },
    async info() {
      return "# Server\r\nredis_version:7.0.0\r\n";
    },
    async keys(pattern) {
      const re = new RegExp(
        "^" +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".") +
          "$",
      );
      return [...store.keys()].filter((k) => re.test(k));
    },
    async type() {
      return "none";
    },
    async hgetall() {
      return {};
    },
    async hset() {
      return 0;
    },
    async lrange() {
      return [];
    },
    async smembers() {
      return [];
    },
    async llen() {
      return 0;
    },
    async lpush() {
      return 0;
    },
    async rpush() {
      return 0;
    },
    async lpop() {
      return null;
    },
    async rpop() {
      return null;
    },
    async publish(channel, message) {
      publishes.push({ channel, message });
      return 0;
    },
    async quit() {},
  };

  return { client, store, publishes };
}

afterEach(() => setRedisToolClientFactory(null));

describe("batch-queue redisTool — n8n-nodes-base.redisTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("throws when the required credential is missing", async () => {
    setRedisToolClientFactory(async () => mockRedis().client);
    await expect(runRedisTool({ operation: "info" }, [{}], {})).rejects.toThrow(
      /credential "redis"/,
    );
  });

  it("set then get a value", async () => {
    const mock = mockRedis();
    setRedisToolClientFactory(async () => mock.client);

    const setOut = await runRedisTool({
      operation: "set",
      key: "test:spec",
      value: "hello-spec",
    });
    expect(setOut[0]).toHaveLength(1);
    expect(setOut[0]![0]!.json).toEqual({ status: "OK" });

    const getOut = await runRedisTool({
      operation: "get",
      key: "test:spec",
    });
    expect(getOut[0]![0]!.json).toEqual({ value: "hello-spec" });
  });

  it("get returns null for missing key", async () => {
    const mock = mockRedis();
    setRedisToolClientFactory(async () => mock.client);

    const out = await runRedisTool({
      operation: "get",
      key: "nonexistent",
    });
    expect(out[0]![0]!.json).toEqual({ value: null });
  });

  it("increment a key", async () => {
    const mock = mockRedis();
    setRedisToolClientFactory(async () => mock.client);

    const out1 = await runRedisTool({
      operation: "increment",
      key: "test:counter",
    });
    expect(out1[0]![0]!.json).toEqual({ value: 1 });

    const out2 = await runRedisTool({
      operation: "increment",
      key: "test:counter",
    });
    expect(out2[0]![0]!.json).toEqual({ value: 2 });
  });

  it("keys pattern matching", async () => {
    const mock = mockRedis();
    setRedisToolClientFactory(async () => mock.client);
    await mock.client.set("user:1", "a");
    await mock.client.set("user:2", "b");
    await mock.client.set("admin:1", "x");

    const out = await runRedisTool({
      operation: "keys",
      pattern: "user:*",
    });
    const keys = (out[0]![0]!.json.keys as string[]).sort();
    expect(keys).toEqual(["user:1", "user:2"]);
  });

  it("delete a key", async () => {
    const mock = mockRedis();
    setRedisToolClientFactory(async () => mock.client);
    await mock.client.set("test:spec", "value");

    const out = await runRedisTool({
      operation: "delete",
      key: "test:spec",
    });
    expect(out[0]![0]!.json).toEqual({ deleted: 1 });
    expect(mock.store.has("test:spec")).toBe(false);
  });

  it("delete returns 0 for missing key", async () => {
    const mock = mockRedis();
    setRedisToolClientFactory(async () => mock.client);

    const out = await runRedisTool({
      operation: "delete",
      key: "nonexistent",
    });
    expect(out[0]![0]!.json).toEqual({ deleted: 0 });
  });

  it("info returns server info string", async () => {
    const mock = mockRedis();
    setRedisToolClientFactory(async () => mock.client);

    const out = await runRedisTool({
      operation: "info",
    });
    expect(out[0]![0]!.json.info).toContain("redis_version");
  });

  it("publish message", async () => {
    const mock = mockRedis();
    setRedisToolClientFactory(async () => mock.client);

    const out = await runRedisTool({
      operation: "publish",
      channel: "test-channel",
      message: "hello from spec",
    });
    expect(out[0]![0]!.json).toEqual({ subscribers: 0 });
    expect(mock.publishes).toEqual([
      { channel: "test-channel", message: "hello from spec" },
    ]);
  });

  it("fails on missing required parameters", async () => {
    setRedisToolClientFactory(async () => mockRedis().client);
    await expect(
      runRedisTool({ operation: "set", key: "k" }),
    ).rejects.toThrow(/required parameter "value"/);

    await expect(
      runRedisTool({ operation: "get" }),
    ).rejects.toThrow(/required parameter "key"/);

    await expect(
      runRedisTool({ operation: "publish", channel: "c" }),
    ).rejects.toThrow(/required parameter "message"/);
  });

  it("continueOnFail yields error shape", async () => {
    setRedisToolClientFactory(async () => mockRedis().client);
    const out = await runRedisTool(
      { operation: "get" },
      [{}],
      CREDS,
      { continueOnFail: true },
    );
    expect(out[0]![0]!.json.error).toMatch(/required parameter "key"/);
  });
});

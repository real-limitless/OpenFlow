import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setRedisClientFactory,
  type RedisClient,
} from "../../executors/redis";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.redis";
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

async function runRedis(
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

/** In-memory Redis stand-in covering the ops exercised by the executor. */
function mockRedis(): {
  client: RedisClient;
  store: Map<string, { type: string; value: unknown }>;
  expires: Map<string, number>;
  publishes: Array<{ channel: string; message: string }>;
} {
  const store = new Map<string, { type: string; value: unknown }>();
  const expires = new Map<string, number>();
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
      expires.delete(key);
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
    async expire(key, seconds) {
      if (!store.has(key)) return 0;
      expires.set(key, seconds);
      return 1;
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
    async type(key) {
      const e = store.get(key);
      return e ? e.type : "none";
    },
    async hgetall(key) {
      const e = store.get(key);
      if (!e || e.type !== "hash") return {};
      return { ...(e.value as Record<string, string>) };
    },
    async hset(key, data) {
      const prev = store.get(key);
      const base =
        prev && prev.type === "hash"
          ? { ...(prev.value as Record<string, string>) }
          : {};
      let added = 0;
      for (const [k, v] of Object.entries(data)) {
        if (!(k in base)) added++;
        base[k] = v;
      }
      store.set(key, { type: "hash", value: base });
      return added;
    },
    async lrange(key, start, stop) {
      const e = store.get(key);
      if (!e || e.type !== "list") return [];
      const list = e.value as string[];
      const end = stop < 0 ? list.length + stop + 1 : stop + 1;
      return list.slice(start, end);
    },
    async smembers(key) {
      const e = store.get(key);
      if (!e || e.type !== "set") return [];
      return [...(e.value as Set<string>)];
    },
    async llen(key) {
      const e = store.get(key);
      if (!e) return 0;
      if (e.type !== "list") throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
      return (e.value as string[]).length;
    },
    async lpush(key, ...values) {
      const e = store.get(key);
      const list = e && e.type === "list" ? (e.value as string[]) : [];
      list.unshift(...values);
      store.set(key, { type: "list", value: list });
      return list.length;
    },
    async rpush(key, ...values) {
      const e = store.get(key);
      const list = e && e.type === "list" ? (e.value as string[]) : [];
      list.push(...values);
      store.set(key, { type: "list", value: list });
      return list.length;
    },
    async lpop(key) {
      const e = store.get(key);
      if (!e || e.type !== "list") return null;
      const list = e.value as string[];
      const v = list.shift() ?? null;
      if (list.length === 0) store.delete(key);
      else store.set(key, { type: "list", value: list });
      return v;
    },
    async rpop(key) {
      const e = store.get(key);
      if (!e || e.type !== "list") return null;
      const list = e.value as string[];
      const v = list.pop() ?? null;
      if (list.length === 0) store.delete(key);
      else store.set(key, { type: "list", value: list });
      return v;
    },
    async publish(channel, message) {
      publishes.push({ channel, message });
      return 0;
    },
    async quit() {},
  };

  return { client, store, expires, publishes };
}

afterEach(() => setRedisClientFactory(null));

describe("batch-queue redis — n8n-nodes-base.redis", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Redis");
  });

  it("throws when the required credential is missing", async () => {
    setRedisClientFactory(async () => mockRedis().client);
    await expect(runRedis({ operation: "info" }, [{}], {})).rejects.toThrow(
      /credential "redis"/,
    );
  });

  it("set then get string value", async () => {
    const mock = mockRedis();
    setRedisClientFactory(async () => mock.client);

    const setOut = await runRedis({
      operation: "set",
      key: "test:hello",
      value: "world",
    });
    expect(setOut[0]).toHaveLength(1);
    expect(mock.store.get("test:hello")?.value).toBe("world");

    const getOut = await runRedis({
      operation: "get",
      key: "test:hello",
      propertyName: "myValue",
    });
    expect(getOut[0]![0]!.json.myValue).toBe("world");
  });

  it("increment with TTL", async () => {
    const mock = mockRedis();
    setRedisClientFactory(async () => mock.client);

    const out = await runRedis({
      operation: "incr",
      key: "test:counter",
      expire: true,
      ttl: 30,
    });
    expect(out[0]![0]!.json["test:counter"]).toBe(1);
    expect(mock.expires.get("test:counter")).toBe(30);

    const out2 = await runRedis({
      operation: "incr",
      key: "test:counter",
      expire: true,
      ttl: 30,
    });
    expect(out2[0]![0]!.json["test:counter"]).toBe(2);
  });

  it("publish to channel", async () => {
    const mock = mockRedis();
    setRedisClientFactory(async () => mock.client);

    const out = await runRedis({
      operation: "publish",
      channel: "test:events",
      messageData: '{"event":"completed"}',
    });
    expect(out[0]![0]!.json.count).toBe(0);
    expect(mock.publishes).toEqual([
      { channel: "test:events", message: '{"event":"completed"}' },
    ]);
  });

  it("list push and pop", async () => {
    const mock = mockRedis();
    setRedisClientFactory(async () => mock.client);

    const pushOut = await runRedis({
      operation: "push",
      list: "test:mylist",
      messageData: "item1",
      tail: true,
    });
    expect(pushOut[0]![0]!.json.listLength).toBe(1);

    const popOut = await runRedis({
      operation: "pop",
      list: "test:mylist",
      tail: false,
      propertyName: "popped",
    });
    expect(popOut[0]![0]!.json.popped).toBe("item1");
  });

  it("keys with pattern", async () => {
    const mock = mockRedis();
    setRedisClientFactory(async () => mock.client);
    await mock.client.set("user:1", "a");
    await mock.client.set("user:2", "b");
    await mock.client.set("user:3", "c");
    await mock.client.set("other:1", "x");

    const out = await runRedis({
      operation: "keys",
      keyPattern: "user:*",
      getValues: true,
    });
    const items = out[0]!;
    expect(items).toHaveLength(3);
    const keys = items.map((i) => i.json.key).sort();
    expect(keys).toEqual(["user:1", "user:2", "user:3"]);
    expect(items.every((i) => i.json.value !== undefined)).toBe(true);
  });

  it("fails on missing required key param", async () => {
    setRedisClientFactory(async () => mockRedis().client);
    await expect(runRedis({ operation: "get", propertyName: "v" })).rejects.toThrow(
      /required parameter "key"/,
    );
  });

  it("continueOnFail yields error shape", async () => {
    setRedisClientFactory(async () => mockRedis().client);
    const out = await runRedis(
      { operation: "get", propertyName: "v" },
      [{}],
      CREDS,
      { continueOnFail: true },
    );
    expect(out[0]![0]!.json.error).toMatch(/required parameter "key"/);
  });
});

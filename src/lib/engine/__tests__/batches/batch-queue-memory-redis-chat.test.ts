import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setRedisChatClientFactory,
  type MemoryChatMessage,
  type RedisChatClientFactory,
} from "../../executors/memory-redis-chat";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.memoryRedisChat";

type StoreEntry = { role: string; content: string };

function makeMockClientFactory(initial: StoreEntry[] = []): { factory: RedisChatClientFactory; store: StoreEntry[] } {
  const store: StoreEntry[] = [...initial.map((r) => ({ ...r }))].reverse();

  const factory: RedisChatClientFactory = async () => {
    return {
      async lrange(_key: string, start: number, stop: number) {
        const slice = store.slice(start, stop + 1);
        return slice.map((m) => JSON.stringify(m));
      },
      async lpush(_key: string, ...values: string[]) {
        const entries = values.map((v) => JSON.parse(v) as StoreEntry);
        store.unshift(...entries);
        return store.length;
      },
      async ltrim(_key: string, _start: number, _stop: number) {
        return "OK" as const;
      },
      async expire(_key: string, _seconds: number) {
        return 1;
      },
      async del(_key: string) {
        const count = store.length;
        store.length = 0;
        return count;
      },
      async llen(_key: string) {
        return store.length;
      },
      async quit() {
      },
    };
  };

  return { factory, store };
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(items: INodeExecutionData[], node: INode, getCredential?: (name: string) => Promise<Record<string, unknown> | null>): ExecutionContext {
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
    continueOnFail: false,
    getCredential,
  });
}

async function runMemory(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Memory", type: TYPE, parameters });
  const items = toItems(inputItems);
  const getCredential = async (_name: string) => ({
    host: "localhost",
    port: 6379,
    password: "",
    database: 0,
  });
  const ctx = makeCtx(items, node, getCredential);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]): Record<string, unknown> {
  return out[0][0].json as unknown as Record<string, unknown>;
}

function user(content: string): MemoryChatMessage {
  return { role: "user", content };
}
function assistant(content: string): MemoryChatMessage {
  return { role: "assistant", content };
}

beforeEach(() => {
  setRedisChatClientFactory(null);
});

afterEach(() => {
  setRedisChatClientFactory(null);
});

describe("batch-queue memoryRedisChat — @n8n/n8n-nodes-langchain.memoryRedisChat", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Redis Chat Memory");
  });

  it("wire shape — handle exposes sessionId + contextWindowLength + sessionTTL", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory({
      sessionId: "my_chat_session",
      contextWindowLength: 5,
      sessionTTL: 3600,
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.sessionId).toBe("my_chat_session");
    expect(handle.contextWindowLength).toBe(5);
    expect(handle.sessionTTL).toBe(3600);
    expect(typeof handle.loadMessages).toBe("function");
    expect(typeof handle.saveMessages).toBe("function");
    expect(typeof handle.appendTurn).toBe("function");
  });

  it("sessionId auto from Chat Trigger: blank param falls back to first item sessionId", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory(
      { contextWindowLength: 3 },
      [{ sessionId: "abc-123", chatInput: "hi" }],
    );

    const handle = getHandle(out);
    expect(handle.sessionId).toBe("abc-123");
  });

  it("window truncates to last N interactions", async () => {
    const { factory } = makeMockClientFactory([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
      { role: "assistant", content: "a4" },
    ]);
    setRedisChatClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      contextWindowLength: 2,
    });
    const handle = getHandle(out);
    const loadFn = handle.loadMessages as () => Promise<MemoryChatMessage[]>;

    const messages = await loadFn();
    expect(messages).toEqual([
      user("u3"),
      assistant("a3"),
      user("u4"),
      assistant("a4"),
    ]);
  });

  it("new turn appended after a run: load returns both interactions", async () => {
    const { factory } = makeMockClientFactory([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
    setRedisChatClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      contextWindowLength: 5,
    });
    const handle = getHandle(out);
    const appendFn = handle.appendTurn as (user: MemoryChatMessage, assistant: MemoryChatMessage) => Promise<void>;
    const loadFn = handle.loadMessages as () => Promise<MemoryChatMessage[]>;

    await appendFn(user("u2"), assistant("a2"));

    const messages = await loadFn();
    expect(messages).toEqual([
      user("u1"),
      assistant("a1"),
      user("u2"),
      assistant("a2"),
    ]);
  });

  it("No sessionId error: blank param + no trigger sessionId throws", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    await expect(
      runMemory({ contextWindowLength: 5 }, [{}]),
    ).rejects.toThrow(/No sessionId/i);
  });

  it("No sessionId error: blank param + empty input throws", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    await expect(
      runMemory({ contextWindowLength: 5 }, []),
    ).rejects.toThrow(/No sessionId/i);
  });

  it("separate sessions stay isolated", async () => {
    const { factory: factoryA } = makeMockClientFactory();
    setRedisChatClientFactory(factoryA);

    const outA = await runMemory({
      sessionId: "a",
      contextWindowLength: 5,
    });

    const { factory: factoryB } = makeMockClientFactory();
    setRedisChatClientFactory(factoryB);

    const outB = await runMemory({
      sessionId: "b",
      contextWindowLength: 5,
    });
    const handleA = getHandle(outA);
    const handleB = getHandle(outB);
    const appendA = handleA.appendTurn as (user: MemoryChatMessage, assistant: MemoryChatMessage) => Promise<void>;
    const loadB = handleB.loadMessages as () => Promise<MemoryChatMessage[]>;
    const loadA = handleA.loadMessages as () => Promise<MemoryChatMessage[]>;

    await appendA(user("ua1"), assistant("aa1"));

    expect(await loadB()).toEqual([]);
    expect(await loadA()).toEqual([user("ua1"), assistant("aa1")]);
  });

  it("contextWindowLength 0: load returns no prior context", async () => {
    const { factory } = makeMockClientFactory([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
    setRedisChatClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      contextWindowLength: 0,
    });
    const handle = getHandle(out);
    const loadFn = handle.loadMessages as () => Promise<MemoryChatMessage[]>;

    expect(await loadFn()).toEqual([]);
  });

  it("saveMessages replaces all messages in Redis for session", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      contextWindowLength: 5,
    });
    const handle = getHandle(out);
    const saveFn = handle.saveMessages as (messages: MemoryChatMessage[]) => Promise<void>;
    const loadFn = handle.loadMessages as () => Promise<MemoryChatMessage[]>;

    await saveFn([user("u1"), assistant("a1"), user("u2"), assistant("a2")]);

    const messages = await loadFn();
    expect(messages).toEqual([
      user("u1"),
      assistant("a1"),
      user("u2"),
      assistant("a2"),
    ]);
  });

  it("sessionId expression: resolved against first item", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory(
      { sessionId: "={{ $json.s }}", contextWindowLength: 5 },
      [{ s: "expr-session" }],
    );

    expect(getHandle(out).sessionId).toBe("expr-session");
  });

  it("contextWindowLength expression: resolved against first item", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory(
      { sessionId: "sess", contextWindowLength: "={{ $json.w }}" },
      [{ w: 3 }],
    );

    expect(getHandle(out).contextWindowLength).toBe(3);
  });

  it("default contextWindowLength from definition: 0 when param absent", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory({ sessionId: "sess" });
    expect(getHandle(out).contextWindowLength).toBe(0);
  });

  it("TTL is passed through in the handle", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      contextWindowLength: 5,
      sessionTTL: 3600,
    });
    expect(getHandle(out).sessionTTL).toBe(3600);
  });

  it("TTL 0 means no expiration", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      contextWindowLength: 5,
      sessionTTL: 0,
    });
    expect(getHandle(out).sessionTTL).toBe(0);
  });

  it("handle is consumable by AI Agent: loadMessages returns flat message list", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      contextWindowLength: 5,
    });
    const handle = getHandle(out);
    const appendFn = handle.appendTurn as (user: MemoryChatMessage, assistant: MemoryChatMessage) => Promise<void>;
    const loadFn = handle.loadMessages as () => Promise<MemoryChatMessage[]>;

    await appendFn(user("hi"), assistant("hello"));

    const messages = await loadFn();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages[0]).toEqual({ role: "user", content: "hi" });
    expect(messages[1]).toEqual({ role: "assistant", content: "hello" });
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
  });

  it("durable persistence across executions: re-fetching after same session returns stored turns", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out1 = await runMemory({
      sessionId: "sess",
      contextWindowLength: 5,
    });
    const handle1 = getHandle(out1);
    const appendFn = handle1.appendTurn as (user: MemoryChatMessage, assistant: MemoryChatMessage) => Promise<void>;
    await appendFn(user("u1"), assistant("a1"));

    const out2 = await runMemory({
      sessionId: "sess",
      contextWindowLength: 5,
    });
    const handle2 = getHandle(out2);
    const loadFn = handle2.loadMessages as () => Promise<MemoryChatMessage[]>;

    const messages = await loadFn();
    expect(messages).toEqual([user("u1"), assistant("a1")]);
  });

  it("missing redis credential throws error", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const node = makeNode({ name: "Memory", type: TYPE, parameters: { sessionId: "sess", contextWindowLength: 5 } });
    const items = toItems([{}]);
    const getCredential = async (_name: string) => null;
    const ctx = makeCtx(items, node, getCredential);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/redis/i);
  });

  it("sessionTTL expression: resolved against first item", async () => {
    const { factory } = makeMockClientFactory();
    setRedisChatClientFactory(factory);

    const out = await runMemory(
      { sessionId: "sess", contextWindowLength: 5, sessionTTL: "={{ $json.ttl }}" },
      [{ ttl: 7200 }],
    );

    expect(getHandle(out).sessionTTL).toBe(7200);
  });
});

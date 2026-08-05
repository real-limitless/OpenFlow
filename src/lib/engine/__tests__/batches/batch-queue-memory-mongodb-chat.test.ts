import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setMongoDbChatClientFactory,
  type MemoryChatMessage,
} from "../../executors/memory-mongodb-chat";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.memoryMongoDbChat";

interface InMemoryCollection {
  data: Record<string, unknown>[];
}

const collections = new Map<string, InMemoryCollection>();

const fakeFactory = async () => ({
  collection(name: string) {
    if (!collections.has(name)) {
      collections.set(name, { data: [] });
    }
    const col = collections.get(name)!;
    return {
      find(_filter: Record<string, unknown>) {
        return {
          sort(_sort: Record<string, number>) {
            return {
              async toArray() {
                return col.data
                  .filter((d) => d.sessionId === _filter.sessionId)
                  .sort(
                    (a, b) =>
                      String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
                  );
              },
            };
          },
        };
      },
      async insertMany(docs: Record<string, unknown>[]) {
        col.data.push(...docs);
      },
      async deleteMany(filter: Record<string, unknown>) {
        const before = col.data.length;
        col.data = col.data.filter(
          (d) => Object.entries(filter).every(([k, v]) => d[k] === v),
        );
        return { deletedCount: before - col.data.length };
      },
    };
  },
  db(_name: string) {
    return {
      collection(name: string) {
        if (!collections.has(name)) {
          collections.set(name, { data: [] });
        }
        const col = collections.get(name)!;
        return {
          find(f: Record<string, unknown>) {
            return {
              sort(_sort: Record<string, number>) {
                return {
                  async toArray() {
                    return col.data
                      .filter((d) => d.sessionId === f.sessionId)
                      .sort(
                        (a, b) =>
                          String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
                      );
                  },
                };
              },
            };
          },
          async insertMany(docs: Record<string, unknown>[]) {
            col.data.push(...docs);
          },
          async deleteMany(filter: Record<string, unknown>) {
            const before = col.data.length;
            col.data = col.data.filter(
              (d) => Object.entries(filter).every(([k, v]) => d[k] === v),
            );
            return { deletedCount: before - col.data.length };
          },
        };
      },
    };
  },
  async close() {},
});

function toItems(
  input: Array<Record<string, unknown> | INodeExecutionData>,
): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(items: INodeExecutionData[], node: INode): ExecutionContext {
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
    getCredential: async (_name: string) => ({ connectionString: "mongodb://fake:27017" }),
  });
}

async function runMemory(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Memory", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtx(items, node);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function getHandle(out: INodeExecutionData[][]) {
  return out[0][0].json as Record<string, unknown>;
}

function user(content: string): MemoryChatMessage {
  return { role: "user", content };
}

function assistant(content: string): MemoryChatMessage {
  return { role: "assistant", content };
}

beforeEach(() => {
  collections.clear();
  setMongoDbChatClientFactory(fakeFactory as never);
});

describe("batch-queue memoryMongoDbChat — @n8n/n8n-nodes-langchain.memoryMongoDbChat", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MongoDB Chat Memory");
  });

  it("wire shape — session key + collection + database + window", async () => {
    const out = await runMemory({
      sessionId: "my_chat_session",
      collectionName: "chat_history",
      databaseName: "my_app",
      contextWindowLength: 5,
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.sessionId).toBe("my_chat_session");
    expect(handle.collectionName).toBe("chat_history");
    expect(handle.databaseName).toBe("my_app");
    expect(handle.contextWindowLength).toBe(5);
    expect(typeof handle.loadMessages).toBe("function");
    expect(typeof handle.saveMessages).toBe("function");
    expect(typeof handle.appendTurn).toBe("function");
  });

  it("sessionId auto from Chat Trigger: blank param falls back to first item sessionId", async () => {
    const out = await runMemory({ collectionName: "ch", contextWindowLength: 3 }, [
      { sessionId: "abc-123", chatInput: "hi" },
    ]);

    expect(getHandle(out).sessionId).toBe("abc-123");
  });

  it("no sessionId throws", async () => {
    await expect(runMemory({ collectionName: "ch" }, [{}])).rejects.toThrow(/No sessionId/i);
  });

  it("no sessionId with empty input throws", async () => {
    await expect(runMemory({ collectionName: "ch" }, [])).rejects.toThrow(/No sessionId/i);
  });

  it("window truncates to last N interactions", async () => {
    const out = await runMemory({
      sessionId: "sess",
      collectionName: "ch",
      contextWindowLength: 2,
    });
    const handle = getHandle(out);

    const load = handle.loadMessages as () => Promise<MemoryChatMessage[]>;
    const append = handle.appendTurn as (
      u: MemoryChatMessage,
      a: MemoryChatMessage,
    ) => Promise<void>;

    await append(user("u1"), assistant("a1"));
    await append(user("u2"), assistant("a2"));
    await append(user("u3"), assistant("a3"));
    await append(user("u4"), assistant("a4"));

    expect(await load()).toEqual([user("u3"), assistant("a3"), user("u4"), assistant("a4")]);
  });

  it("durable persistence across executions", async () => {
    const out1 = await runMemory({
      sessionId: "sess",
      collectionName: "ch",
      contextWindowLength: 5,
    });
    const handle1 = getHandle(out1);
    const append1 = handle1.appendTurn as (
      u: MemoryChatMessage,
      a: MemoryChatMessage,
    ) => Promise<void>;

    await append1(user("u1"), assistant("a1"));

    const out2 = await runMemory({
      sessionId: "sess",
      collectionName: "ch",
      contextWindowLength: 5,
    });
    const handle2 = getHandle(out2);
    const load2 = handle2.loadMessages as () => Promise<MemoryChatMessage[]>;

    expect(await load2()).toEqual([user("u1"), assistant("a1")]);
  });

  it("database defaults to credential database when not specified", async () => {
    const out = await runMemory({
      sessionId: "s1",
      collectionName: "history",
      databaseName: "",
    });

    const handle = getHandle(out);
    expect(handle.databaseName).toBe("");
  });

  it("contextWindowLength 0: load returns no prior context", async () => {
    const out = await runMemory({
      sessionId: "sess",
      collectionName: "ch",
      contextWindowLength: 0,
    });
    const handle = getHandle(out);
    const load = handle.loadMessages as () => Promise<MemoryChatMessage[]>;
    const append = handle.appendTurn as (
      u: MemoryChatMessage,
      a: MemoryChatMessage,
    ) => Promise<void>;

    await append(user("u1"), assistant("a1"));
    expect(await load()).toEqual([]);
  });

  it("saveMessages replaces all messages for session", async () => {
    const out = await runMemory({
      sessionId: "sess",
      collectionName: "ch",
      contextWindowLength: 5,
    });
    const handle = getHandle(out);
    const load = handle.loadMessages as () => Promise<MemoryChatMessage[]>;
    const save = handle.saveMessages as (msgs: MemoryChatMessage[]) => Promise<void>;

    await save([user("u1"), assistant("a1"), user("u2"), assistant("a2")]);
    expect(await load()).toEqual([user("u1"), assistant("a1"), user("u2"), assistant("a2")]);
  });

  it("sessionId expression resolved against first item", async () => {
    const out = await runMemory(
      { sessionId: "={{ $json.s }}", collectionName: "ch", contextWindowLength: 5 },
      [{ s: "expr-session" }],
    );

    expect(getHandle(out).sessionId).toBe("expr-session");
  });

  it("contextWindowLength expression resolved against first item", async () => {
    const out = await runMemory(
      { sessionId: "sess", collectionName: "ch", contextWindowLength: "={{ $json.w }}" },
      [{ w: 3 }],
    );

    expect(getHandle(out).contextWindowLength).toBe(3);
  });

  it("default contextWindowLength is 5 when param absent", async () => {
    const out = await runMemory({ sessionId: "sess", collectionName: "ch" });
    expect(getHandle(out).contextWindowLength).toBe(5);
  });

  it("default collectionName is chat_history when param absent", async () => {
    const out = await runMemory({ sessionId: "sess" });
    expect(getHandle(out).collectionName).toBe("chat_history");
  });

  it("separate sessions stay isolated", async () => {
    const outA = await runMemory({ sessionId: "a", collectionName: "ch" });
    const outB = await runMemory({ sessionId: "b", collectionName: "ch" });

    const appendA = getHandle(outA).appendTurn as (
      u: MemoryChatMessage,
      a: MemoryChatMessage,
    ) => Promise<void>;
    const loadB = getHandle(outB).loadMessages as () => Promise<MemoryChatMessage[]>;

    await appendA(user("ua1"), assistant("aa1"));
    expect(await loadB()).toEqual([]);
  });
});

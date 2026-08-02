import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setPostgresClientFactory,
  type MemoryChatMessage,
  type PostgresClientFactory,
} from "../../executors/memory-postgres-chat";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "@n8n/n8n-nodes-langchain.memoryPostgresChat";

interface MockRow {
  id: number;
  sessionId: string;
  role: string;
  content: string;
}

function makeMockClientFactory(initial: MockRow[] = []): { factory: PostgresClientFactory; store: MockRow[] } {
  let nextId = initial.length + 1;
  const store: MockRow[] = [...initial.map((r) => ({ ...r }))];

  const factory: PostgresClientFactory = async () => {
    let ended = false;
    return {
      async query(sql: string, params?: unknown[]) {
        const upper = sql.toUpperCase();

        if (upper.includes("CREATE TABLE IF NOT EXISTS") || upper.includes("CREATE INDEX IF NOT EXISTS")) {
          return { rows: [], rowCount: 0 };
        }

        if (upper.includes("DELETE")) {
          const sid = params?.[0] ? String(params[0]) : "";
          for (let i = store.length - 1; i >= 0; i--) {
            if (store[i].sessionId === sid) store.splice(i, 1);
          }
          return { rows: [], rowCount: 0 };
        }

        if (upper.includes("INSERT")) {
          // The executor emits two different parameter shapes. appendTurn uses
          // `($1,$2,$3),($1,$4,$5)` — the sessionId once, then two role/content
          // pairs — while saveMessages repeats whole (sessionId, role, content)
          // triples. Reading the 5-param form as triples drops the assistant
          // row, so discriminate on length (5 is not a multiple of 3).
          if (params && params.length === 5) {
            const sid = String(params[0]);
            store.push({ id: nextId++, sessionId: sid, role: String(params[1]), content: String(params[2]) });
            store.push({ id: nextId++, sessionId: sid, role: String(params[3]), content: String(params[4]) });
          } else if (params && params.length >= 3) {
            for (let i = 0; i + 2 < params.length; i += 3) {
              store.push({ id: nextId++, sessionId: String(params[i]), role: String(params[i + 1]), content: String(params[i + 2]) });
            }
          }
          return { rows: [], rowCount: 0 };
        }

        if (upper.includes("SELECT")) {
          const sid = params?.[0] ? String(params[0]) : "";
          const filtered = store
            .filter((r) => r.sessionId === sid)
            .sort((a, b) => a.id - b.id);
          return {
            rows: filtered.map((r) => ({ role: r.role, content: r.content })),
            rowCount: filtered.length,
          };
        }

        return { rows: [], rowCount: 0 };
      },
      async end() {},
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
    port: 5432,
    user: "test",
    password: "test",
    database: "test",
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
  setPostgresClientFactory(null);
});

afterEach(() => {
  setPostgresClientFactory(null);
});

describe("batch-queue memoryPostgresChat — @n8n/n8n-nodes-langchain.memoryPostgresChat", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Postgres Chat Memory");
  });

  it("wire shape — handle exposes sessionId + tableName + contextWindowLength", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const out = await runMemory({
      sessionId: "my_chat_session",
      tableName: "chat_history",
      contextWindowLength: 5,
    });

    const handle = getHandle(out);
    expect(handle.type).toBe(TYPE);
    expect(handle.sessionId).toBe("my_chat_session");
    expect(handle.tableName).toBe("chat_history");
    expect(handle.contextWindowLength).toBe(5);
    expect(typeof handle.loadMessages).toBe("function");
    expect(typeof handle.saveMessages).toBe("function");
    expect(typeof handle.appendTurn).toBe("function");
  });

  it("sessionId auto from Chat Trigger: blank param falls back to first item sessionId", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const out = await runMemory(
      { tableName: "chat_history", contextWindowLength: 3 },
      [{ sessionId: "abc-123", chatInput: "hi" }],
    );

    const handle = getHandle(out);
    expect(handle.sessionId).toBe("abc-123");
  });

  it("window truncates to last N interactions", async () => {
    const { factory } = makeMockClientFactory([
      { id: 1, sessionId: "sess", role: "user", content: "u1" },
      { id: 2, sessionId: "sess", role: "assistant", content: "a1" },
      { id: 3, sessionId: "sess", role: "user", content: "u2" },
      { id: 4, sessionId: "sess", role: "assistant", content: "a2" },
      { id: 5, sessionId: "sess", role: "user", content: "u3" },
      { id: 6, sessionId: "sess", role: "assistant", content: "a3" },
      { id: 7, sessionId: "sess", role: "user", content: "u4" },
      { id: 8, sessionId: "sess", role: "assistant", content: "a4" },
    ]);
    setPostgresClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
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
      { id: 1, sessionId: "sess", role: "user", content: "u1" },
      { id: 2, sessionId: "sess", role: "assistant", content: "a1" },
    ]);
    setPostgresClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
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
    setPostgresClientFactory(factory);

    await expect(
      runMemory({ tableName: "chat_history", contextWindowLength: 5 }, [{}]),
    ).rejects.toThrow(/No sessionId/i);
  });

  it("No sessionId error: blank param + empty input throws", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    await expect(
      runMemory({ tableName: "chat_history", contextWindowLength: 5 }, []),
    ).rejects.toThrow(/No sessionId/i);
  });

  it("separate sessions stay isolated", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const outA = await runMemory({
      sessionId: "a",
      tableName: "chat_history",
      contextWindowLength: 5,
    });
    const outB = await runMemory({
      sessionId: "b",
      tableName: "chat_history",
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
      { id: 1, sessionId: "sess", role: "user", content: "u1" },
      { id: 2, sessionId: "sess", role: "assistant", content: "a1" },
      { id: 3, sessionId: "sess", role: "user", content: "u2" },
      { id: 4, sessionId: "sess", role: "assistant", content: "a2" },
    ]);
    setPostgresClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
      contextWindowLength: 0,
    });
    const handle = getHandle(out);
    const loadFn = handle.loadMessages as () => Promise<MemoryChatMessage[]>;

    expect(await loadFn()).toEqual([]);
  });

  it("saveMessages replaces all messages in Postgres for session", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
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
    setPostgresClientFactory(factory);

    const out = await runMemory(
      { sessionId: "={{ $json.s }}", tableName: "chat_history", contextWindowLength: 5 },
      [{ s: "expr-session" }],
    );

    expect(getHandle(out).sessionId).toBe("expr-session");
  });

  it("contextWindowLength expression: resolved against first item", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const out = await runMemory(
      { sessionId: "sess", tableName: "chat_history", contextWindowLength: "={{ $json.w }}" },
      [{ w: 3 }],
    );

    expect(getHandle(out).contextWindowLength).toBe(3);
  });

  it("default contextWindowLength from definition: 5 when param absent", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const out = await runMemory({ sessionId: "sess", tableName: "chat_history" });
    expect(getHandle(out).contextWindowLength).toBe(5);
  });

  it("default tableName when param absent", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const out = await runMemory({ sessionId: "sess", contextWindowLength: 5 });
    expect(getHandle(out).tableName).toBe("chat_history");
  });

  it("handle is consumable by AI Agent: loadMessages returns flat message list", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
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

  it("table auto-created when missing", async () => {
    let createCalled = false;
    const factory: PostgresClientFactory = async () => ({
      async query(sql: string, _params?: unknown[]) {
        const upper = sql.toUpperCase();
        if (upper.includes("CREATE TABLE")) {
          createCalled = true;
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
      async end() {},
    });
    setPostgresClientFactory(factory);

    const out = await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
      contextWindowLength: 5,
    });
    expect(createCalled).toBe(true);
  });

  it("CREATE INDEX uses bare identifier without double-quotes inside index name", async () => {
    const captured: string[] = [];
    const factory: PostgresClientFactory = async () => ({
      async query(sql: string, _params?: unknown[]) {
        const upper = sql.toUpperCase();
        if (upper.includes("CREATE INDEX") || upper.includes("CREATE TABLE")) {
          captured.push(sql);
        }
        return { rows: [], rowCount: 0 };
      },
      async end() {},
    });
    setPostgresClientFactory(factory);

    await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
      contextWindowLength: 5,
    });

    const indexSql = captured.find((s) => s.toUpperCase().includes("CREATE INDEX"));
    expect(indexSql).toBeDefined();
    // index name should be a bare identifier like idx_chat_history_session, not "idx_chat_history_session"
    const match = indexSql!.match(/CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i);
    expect(match).not.toBeNull();
    const indexName = match![1];
    expect(indexName).not.toContain('"');
    expect(indexName).toMatch(/^idx_/);
    // table/column refs should still be quoteIdent'd
    expect(indexSql).toContain('ON "');
    expect(indexSql).toContain('" ("sessionId")');
  });

  it("durable persistence across executions: re-fetching after same session returns stored turns", async () => {
    const { factory, store } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const out1 = await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
      contextWindowLength: 5,
    });
    const handle1 = getHandle(out1);
    const appendFn = handle1.appendTurn as (user: MemoryChatMessage, assistant: MemoryChatMessage) => Promise<void>;
    await appendFn(user("u1"), assistant("a1"));

    const out2 = await runMemory({
      sessionId: "sess",
      tableName: "chat_history",
      contextWindowLength: 5,
    });
    const handle2 = getHandle(out2);
    const loadFn = handle2.loadMessages as () => Promise<MemoryChatMessage[]>;

    const messages = await loadFn();
    expect(messages).toEqual([user("u1"), assistant("a1")]);
  });

  it("missing postgres credential throws error", async () => {
    const { factory } = makeMockClientFactory();
    setPostgresClientFactory(factory);

    const node = makeNode({ name: "Memory", type: TYPE, parameters: { sessionId: "sess", tableName: "chat_history", contextWindowLength: 5 } });
    const items = toItems([{}]);
    const getCredential = async (_name: string) => null;
    const ctx = makeCtx(items, node, getCredential);
    const executor = getExecutor(TYPE)!;

    await expect(executor(ctx, node)).rejects.toThrow(/postgres/);
  });
});

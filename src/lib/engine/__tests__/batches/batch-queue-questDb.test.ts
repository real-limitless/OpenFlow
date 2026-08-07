import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setQuestDbClientFactory,
  type QuestDbClient,
  type QuestDbQueryResult,
} from "../../executors/n8n-nodes-base.questDb";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.questDb";
const CREDS = {
  questDb: {
    host: "localhost",
    port: 8812,
    user: "admin",
    password: "quest",
    database: "qdb",
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

async function runQdb(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData>,
  credentials: Record<string, Record<string, unknown>> = CREDS,
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const ctx = makeCtxWithCred(items, node, credentials, opts?.continueOnFail);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

function mockClient(
  handler: (sql: string, params?: unknown[]) => QuestDbQueryResult,
): QuestDbClient {
  return {
    query: async (sql, params) => handler(sql, params),
    end: async () => {},
  };
}

afterEach(() => setQuestDbClientFactory(null));

describe("batch-queue questDb — n8n-nodes-base.questDb", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("QuestDB");
  });

  it("throws when the required credential is missing", async () => {
    setQuestDbClientFactory(async () => mockClient(() => ({ rows: [], fields: [] })));
    await expect(runQdb({ operation: "executeQuery", query: "SELECT 1" }, [{}], {})).rejects.toThrow(
      /credential "questDb"/,
    );
  });

  it("executeQuery returns result rows", async () => {
    setQuestDbClientFactory(async () =>
      mockClient((sql) => {
        expect(sql).toBe("SELECT 1 AS n, 'hello' AS msg");
        return {
          rows: [{ n: 1, msg: "hello" }],
          fields: [{ name: "n" }, { name: "msg" }],
        };
      }),
    );

    const out = await runQdb(
      { operation: "executeQuery", query: "SELECT 1 AS n, 'hello' AS msg" },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ n: 1, msg: "hello" });
  });

  it("executeQuery expands multi-row result to N output items", async () => {
    setQuestDbClientFactory(async () =>
      mockClient(() => ({
        rows: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }, { id: 3, name: "Charlie" }],
        fields: [{ name: "id" }, { name: "name" }],
      })),
    );

    const out = await runQdb(
      { operation: "executeQuery", query: "SELECT id, name FROM users" },
      [{}],
    );

    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toEqual({ id: 1, name: "Alice" });
    expect(out[0][1].json).toEqual({ id: 2, name: "Bob" });
    expect(out[0][2].json).toEqual({ id: 3, name: "Charlie" });
  });

  it("executeQuery with empty result returns empty object", async () => {
    setQuestDbClientFactory(async () =>
      mockClient(() => ({
        rows: [],
        fields: [],
      })),
    );

    const out = await runQdb(
      { operation: "executeQuery", query: "SELECT * FROM empty_table" },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("executeQuery binds queryParameters to $1..$N placeholders", async () => {
    let capturedParams: unknown[] | undefined;
    setQuestDbClientFactory(async () =>
      mockClient((sql, params) => {
        capturedParams = params;
        return { rows: [{ name: "test", value: 42 }], fields: [{ name: "name" }, { name: "value" }] };
      }),
    );

    const out = await runQdb(
      {
        operation: "executeQuery",
        query: "SELECT name, value FROM trades WHERE id = $1",
        additionalFields: { queryParameters: "1" },
      },
      [{}],
    );

    expect(capturedParams).toEqual(["1"]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ name: "test", value: 42 });
  });

  it("insert returns affectedRows", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] | undefined;
    setQuestDbClientFactory(async () =>
      mockClient((sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [], fields: [] };
      }),
    );

    const out = await runQdb(
      { operation: "insert", table: "trades", columns: "name:text,value:int" },
      [{ name: "Alice", value: 30 }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ affectedRows: 1 });
    expect(capturedSql).toContain('INSERT INTO "trades"');
    expect(capturedSql).toContain('"name"');
    expect(capturedSql).toContain('"value"');
    expect(capturedParams).toEqual(["Alice", 30]);
  });

  it("insert with auto-detected columns", async () => {
    let capturedSql = "";
    setQuestDbClientFactory(async () =>
      mockClient((sql) => {
        capturedSql = sql;
        return { rows: [], fields: [] };
      }),
    );

    const out = await runQdb({ operation: "insert", table: "leaderboard" }, [
      { name: "Bob", score: 95 },
    ]);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ affectedRows: 1 });
    expect(capturedSql).toContain('"name"');
    expect(capturedSql).toContain('"score"');
  });

  it("continueOnFail suppresses per-item errors in executeQuery", async () => {
    let callCount = 0;
    setQuestDbClientFactory(async () =>
      mockClient((_sql) => {
        callCount++;
        if (callCount === 1) throw new Error("Query failed for item 0");
        return { rows: [{ result: "ok" }], fields: [{ name: "result" }] };
      }),
    );

    const out = await runQdb(
      { operation: "executeQuery", query: "SELECT 1" },
      [{}, {}],
      CREDS,
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ error: "Query failed for item 0" });
    expect(out[0][1].json).toEqual({ result: "ok" });
  });

  it("throws for unsupported DELETE (executor delegates error to QuestDB)", async () => {
    setQuestDbClientFactory(async () =>
      mockClient(() => {
        throw new Error("QuestDB does not support DELETE over PGWire");
      }),
    );

    await expect(
      runQdb(
        { operation: "executeQuery", query: "DELETE FROM trades WHERE id = 1" },
        [{}],
      ),
    ).rejects.toThrow(/DELETE/);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { makeNode, makeCtx } from "../helpers";
import {
  setSnowflakeClientFactory,
  type SnowflakeClient,
  type SnowflakeQueryResult,
} from "../../executors/n8n-nodes-base.snowflake";
import { createExecutionContext, type ExecutionContext, type INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.snowflake";
const CREDS = {
  snowflake: {
    account: "test_account",
    username: "test_user",
    password: "test_pass",
    database: "test_db",
    warehouse: "test_wh",
    schema: "public",
  },
};

interface QueryCall {
  sql: string;
  params?: unknown[];
}

function mockClient(handler: (sql: string, params?: unknown[]) => SnowflakeQueryResult): {
  client: SnowflakeClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const client: SnowflakeClient = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return handler(sql, params);
    },
    close: async () => {},
  };
  return { client, calls };
}

async function runSnowflake(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>>,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const normalized: INodeExecutionData[] = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => normalized,
    continueOnFail: false,
    getCredential: async (name) => CREDS[name] ?? null,
  });
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

afterEach(() => setSnowflakeClientFactory(null));

describe("batch-queue n8n-nodes-base.snowflake — Snowflake", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Snowflake");
  });

  it("executeQuery (basic)", async () => {
    setSnowflakeClientFactory(async () =>
      mockClient((sql) => {
        expect(sql).toBe("SELECT 1 AS n, 'hello' AS msg");
        return { rows: [{ n: 1, msg: "hello" }], rowCount: 1 };
      }).client,
    );

    const out = await runSnowflake(
      {
        operation: "executeQuery",
        query: "SELECT 1 AS n, 'hello' AS msg",
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ n: 1, msg: "hello" });
  });

  it("executeQuery with parameterized query", async () => {
    setSnowflakeClientFactory(async () =>
      mockClient((sql, params) => {
        expect(sql).toBe("SELECT * FROM users WHERE email = $1 AND status = $2");
        expect(params).toEqual(["alice@example.com", "active"]);
        return { rows: [{ id: 1, email: "alice@example.com", status: "active" }], rowCount: 1 };
      }).client,
    );

    const out = await runSnowflake(
      {
        operation: "executeQuery",
        query: "SELECT * FROM users WHERE email = $1 AND status = $2",
        additionalFields: {
          queryParameters: "alice@example.com, active",
        },
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, email: "alice@example.com", status: "active" });
  });

  it("insert rows from input items", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toContain("INSERT INTO");
      expect(sql).toContain('"employees"');
      expect(sql).toContain('"name"');
      expect(sql).toContain('"age"');
      expect(params).toEqual(["Alice", 30]);
      return { rows: [], rowCount: 1 };
    });
    setSnowflakeClientFactory(async () => client);

    const out = await runSnowflake(
      {
        operation: "insert",
        table: "employees",
        columns: "name,age",
      },
      [{ json: { name: "Alice", age: 30 } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ affectedRows: 1 });
    expect(calls[0].sql).toContain("INSERT INTO");
  });

  it("update rows matched by key", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toContain("UPDATE");
      expect(sql).toContain('"employees"');
      expect(params).toContain(42);
      return { rows: [], rowCount: 1 };
    });
    setSnowflakeClientFactory(async () => client);

    const out = await runSnowflake(
      {
        operation: "update",
        table: "employees",
        updateKey: "id",
        columns: "name,age",
      },
      [{ json: { id: 42, name: "Alice Updated", age: 31 } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ affectedRows: 1 });
    expect(calls[0].sql).toContain("UPDATE");
  });

  it("multi-item batch", async () => {
    let callCount = 0;
    setSnowflakeClientFactory(async () =>
      mockClient((sql, params) => {
        callCount++;
        expect(sql).toBe("SELECT email FROM users WHERE email = $1");
        if (callCount === 1) {
          expect(params).toEqual(["a@x.com"]);
          return { rows: [{ email: "a@x.com" }], rowCount: 1 };
        }
        expect(params).toEqual(["b@x.com"]);
        return { rows: [], rowCount: 0 };
      }).client,
    );

    const out = await runSnowflake(
      {
        operation: "executeQuery",
        query: "SELECT email FROM users WHERE email = $1",
        additionalFields: {
          queryParameters: "{{ $json.email }}",
        },
      },
      [{ json: { email: "a@x.com" } }, { json: { email: "b@x.com" } }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ email: "a@x.com" });
    expect(callCount).toBe(2);
  });

  it("throws when snowflake credential is missing", async () => {
    setSnowflakeClientFactory(async () =>
      mockClient(() => ({ rows: [] })).client,
    );
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { operation: "executeQuery", query: "SELECT 1" },
    });
    const ctx = makeCtx([{ json: {} }], node, false);
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/credential "snowflake"/);
  });
});

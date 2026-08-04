import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setMySqlClientFactory,
  type MySqlClient,
  type MySqlQueryResult,
} from "../../executors/mySql";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.mySqlTool";
const CREDS = {
  mySql: {
    host: "localhost",
    port: 3306,
    user: "test",
    password: "test",
    database: "testdb",
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

async function runMySqlTool(
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

interface QueryCall {
  sql: string;
  params?: unknown[];
}

function mockClient(
  handler: (sql: string, params?: unknown[]) => MySqlQueryResult | Promise<MySqlQueryResult>,
): {
  client: MySqlClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const client: MySqlClient = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return handler(sql, params);
    },
    begin: async () => { calls.push({ sql: "BEGIN" }); },
    commit: async () => { calls.push({ sql: "COMMIT" }); },
    rollback: async () => { calls.push({ sql: "ROLLBACK" }); },
    end: async () => {},
  };
  return { client, calls };
}

afterEach(() => setMySqlClientFactory(null));

describe("batch-queue mySqlTool — n8n-nodes-base.mySqlTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MySQL Tool");
  });

  it("throws when the required credential is missing", async () => {
    setMySqlClientFactory(async () => mockClient(() => ({ rows: [] })).client);
    await expect(
      runMySqlTool({ operation: "executeQuery", query: "SELECT 1" }, [{}], {}),
    ).rejects.toThrow(/credential/);
  });

  it("executeQuery basic", async () => {
    setMySqlClientFactory(async () =>
      mockClient((sql, params) => {
        expect(sql).toMatch(/SELECT id, name FROM users/);
        expect(params).toEqual(["alex@example.com"]);
        return {
          rows: [{ id: 1, name: "Alex" }],
          fields: [{ name: "id" }, { name: "name" }],
        };
      }).client,
    );

    const out = await runMySqlTool(
      {
        operation: "executeQuery",
        query: "SELECT id, name FROM users WHERE email = $1",
        options: { queryReplacement: "alex@example.com" },
      },
      [{ json: { email: "alex@example.com" } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, name: "Alex" });
  });

  it("insert with auto-map", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO.*products/);
      return {
        rows: [{ id: 42, name: "Gadget", price: 25.50, quantity: 100 }],
        fields: [{ name: "id" }, { name: "name" }, { name: "price" }, { name: "quantity" }],
        affectedRows: 1,
        insertId: 42,
      };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySqlTool(
      {
        operation: "insert",
        table: { mode: "name", value: "products" },
        columns: "name,price,quantity",
        dataMode: "autoMapInputData",
      },
      [{ json: { name: "Gadget", price: 25.50, quantity: 100 } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ name: "Gadget", price: 25.5 });
    expect(calls[0].params).toContain("Gadget");
    expect(calls[0].params).toContain(25.50);
  });

  it("select with where and limit", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/SELECT/);
      expect(sql).toMatch(/WHERE/);
      expect(sql).toMatch(/LIMIT/);
      return {
        rows: [
          { id: 1, name: "Expensive Widget", price: 99.99 },
          { id: 2, name: "Mid Widget", price: 49.99 },
        ],
        fields: [{ name: "id" }, { name: "name" }, { name: "price" }],
      };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySqlTool(
      {
        operation: "select",
        table: { mode: "name", value: "products" },
        returnAll: false,
        limit: 5,
        where: {
          values: [{ column: "price", condition: ">", value: "20" }],
        },
        combineConditions: "AND",
        sort: { values: [{ column: "price", direction: "DESC" }] },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: 1, name: "Expensive Widget" });
  });

  it("executeQuery empty result", async () => {
    setMySqlClientFactory(async () =>
      mockClient(() => ({
        rows: [],
        fields: [],
      })).client,
    );

    const out = await runMySqlTool(
      {
        operation: "executeQuery",
        query: "SELECT * FROM products WHERE id = -1",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("upsert with updateKey (columnToMatchOn)", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
      expect(params).toContain("Updated Widget");
      return {
        rows: [{ id: 1, name: "Updated Widget", price: 30.00 }],
        fields: [{ name: "id" }, { name: "name" }, { name: "price" }],
        affectedRows: 2,
      };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySqlTool(
      {
        operation: "upsert",
        table: { mode: "name", value: "products" },
        columnToMatchOn: "id",
        dataMode: "autoMapInputData",
        options: { outputColumns: ["id", "name", "price"] },
      },
      [{ json: { id: 1, name: "Updated Widget", price: 30.00 } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, name: "Updated Widget", price: 30.00 });
    expect(calls[0].sql).toMatch(/ON DUPLICATE KEY UPDATE/);
  });

  it("deleteTable truncate", async () => {
    const { client, calls } = mockClient((sql) => {
      expect(sql).toMatch(/TRUNCATE TABLE/);
      return { rows: [] };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySqlTool(
      {
        operation: "deleteTable",
        table: { mode: "name", value: "temp_products" },
        deleteCommand: "truncate",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    expect(calls[0].sql).toMatch(/TRUNCATE TABLE/);
  });

  it("deleteTable drop", async () => {
    const { client, calls } = mockClient((sql) => {
      expect(sql).toMatch(/DROP TABLE/);
      return { rows: [] };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySqlTool(
      {
        operation: "deleteTable",
        table: { mode: "name", value: "obsolete_table" },
        deleteCommand: "drop",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    expect(calls[0].sql).toMatch(/DROP TABLE/);
  });

  it("deleteTable delete with where", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/DELETE FROM/);
      expect(sql).toMatch(/WHERE/);
      return { rows: [], affectedRows: 3 };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySqlTool(
      {
        operation: "deleteTable",
        table: { mode: "name", value: "products" },
        deleteCommand: "delete",
        where: {
          values: [
            { column: "status", condition: "equal", value: "archived" },
          ],
        },
        combineConditions: "AND",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ affectedRows: 3 });
    expect(calls[0].sql).toMatch(/DELETE FROM/);
    expect(calls[0].sql).toMatch(/WHERE/);
  });
});

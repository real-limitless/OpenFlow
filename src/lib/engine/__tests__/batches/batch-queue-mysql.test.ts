import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setMySqlClientFactory,
  type MySqlClient,
  type MySqlQueryResult,
} from "../../executors/mySql";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mySql";
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

async function runMySql(
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
    begin: async () => {
      calls.push({ sql: "BEGIN" });
    },
    commit: async () => {
      calls.push({ sql: "COMMIT" });
    },
    rollback: async () => {
      calls.push({ sql: "ROLLBACK" });
    },
    end: async () => {},
  };
  return { client, calls };
}

afterEach(() => setMySqlClientFactory(null));

describe("batch-queue mysql — n8n-nodes-base.mySql", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MySQL");
  });

  it("throws when the required credential is missing", async () => {
    setMySqlClientFactory(async () => mockClient(() => ({ rows: [] })).client);
    await expect(
      runMySql({ operation: "select", table: { mode: "name", value: "t" } }, [{}], {}),
    ).rejects.toThrow(/credential "mySql"/);
  });

  it("executeQuery with parameters (independently)", async () => {
    const users: Record<string, Record<string, unknown>> = {
      "alex@example.com": { id: 1, name: "Alex", email: "alex@example.com", age: 21 },
      "jamie@example.com": { id: 2, name: "Jamie", email: "jamie@example.com", age: 33 },
    };

    setMySqlClientFactory(async () =>
      mockClient((sql, params) => {
        expect(sql).toMatch(/SELECT \* FROM `users` WHERE email = \?/);
        const email = String(params?.[0] ?? "");
        const row = users[email];
        return {
          rows: row ? [row] : [],
          fields: [
            { name: "id" },
            { name: "name" },
            { name: "email" },
            { name: "age" },
          ],
        };
      }).client,
    );

    const out = await runMySql(
      {
        operation: "executeQuery",
        query: "SELECT * FROM $1:name WHERE email = $2;",
        options: {
          queryReplacement: "={{ ['users', $json.email] }}",
          queryBatching: "independently",
        },
      },
      [
        { email: "alex@example.com", name: "Alex", age: 21 },
        { email: "jamie@example.com", name: "Jamie", age: 33 },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({
      columns: ["id", "name", "email", "age"],
      rows: [[1, "Alex", "alex@example.com", 21]],
    });
    expect(out[0][1].json).toEqual({
      columns: ["id", "name", "email", "age"],
      rows: [[2, "Jamie", "jamie@example.com", 33]],
    });
  });

  it("insert with auto-map", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO `products`/);
      expect(params).toEqual(["Widget", 9.99, "tools"]);
      return { rows: [], affectedRows: 1 };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySql(
      {
        operation: "insert",
        table: { mode: "name", value: "products" },
        dataMode: "autoMapInputData",
      },
      [{ name: "Widget", price: 9.99, category: "tools" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ name: "Widget", price: 9.99, category: "tools" });
    expect(calls[0].params).toEqual(["Widget", 9.99, "tools"]);
  });

  it("select with where clause", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/SELECT \* FROM `products`/);
      expect(sql).toMatch(/WHERE `category` = \?/);
      expect(sql).toMatch(/LIMIT \?/);
      expect(params).toEqual(["tools", 10]);
      return {
        rows: [{ id: 1, name: "Widget", price: 9.99, category: "tools" }],
        fields: [
          { name: "id" },
          { name: "name" },
          { name: "price" },
          { name: "category" },
        ],
      };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySql(
      {
        operation: "select",
        table: { mode: "name", value: "products" },
        returnAll: false,
        limit: 10,
        where: {
          values: [{ column: "category", condition: "equal", value: "tools" }],
        },
        combineConditions: "AND",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      id: 1,
      name: "Widget",
      price: 9.99,
      category: "tools",
    });
    expect(calls).toHaveLength(1);
  });

  it("deleteTable truncate", async () => {
    const { client, calls } = mockClient((sql) => {
      expect(sql).toBe("TRUNCATE TABLE `temp_data`");
      return { rows: [] };
    });
    setMySqlClientFactory(async () => client);

    const out = await runMySql(
      {
        operation: "deleteTable",
        table: { mode: "name", value: "temp_data" },
        deleteCommand: "truncate",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ success: true });
    expect(calls).toHaveLength(1);
  });

  it("decimal output as string by default", async () => {
    const { client } = mockClient(() => ({
      rows: [{ amount: "19.99", rate: "0.075" }],
      fields: [{ name: "amount" }, { name: "rate" }],
    }));
    setMySqlClientFactory(async () => client);

    const out = await runMySql(
      {
        operation: "select",
        table: { mode: "name", value: "financials" },
        returnAll: true,
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ amount: "19.99", rate: "0.075" });
  });
});

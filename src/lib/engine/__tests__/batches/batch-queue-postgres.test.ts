import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setPostgresClientFactory,
  type PostgresClient,
  type PostgresQueryResult,
} from "../../executors/postgres";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.postgres";
const CREDS = {
  postgres: {
    host: "localhost",
    port: 5432,
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

async function runPg(
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

function mockClient(handler: (sql: string, params?: unknown[]) => PostgresQueryResult | Promise<PostgresQueryResult>): {
  client: PostgresClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const client: PostgresClient = {
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

afterEach(() => setPostgresClientFactory(null));

describe("batch-queue postgres — n8n-nodes-base.postgres", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Postgres");
  });

  it("throws when the required credential is missing", async () => {
    setPostgresClientFactory(async () => mockClient(() => ({ rows: [] })).client);
    await expect(
      runPg({ operation: "select", table: { mode: "name", value: "t" } }, [{}], {}),
    ).rejects.toThrow(/credential "postgres"/);
  });

  it("executeQuery with parameters (independently)", async () => {
    const users: Record<string, Record<string, unknown>> = {
      "alex@example.com": { id: 1, name: "Alex", email: "alex@example.com", age: 21 },
      "jamie@example.com": { id: 2, name: "Jamie", email: "jamie@example.com", age: 33 },
    };

    setPostgresClientFactory(async () =>
      mockClient((sql, params) => {
        expect(sql).toMatch(/SELECT \* FROM "users" WHERE email = \$1/);
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

    const out = await runPg(
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
      expect(sql).toMatch(/INSERT INTO "public"\."products"/);
      expect(sql).toMatch(/RETURNING \*/);
      const [name, price, category] = params ?? [];
      return {
        rows: [{ name, price, category }],
        fields: [{ name: "name" }, { name: "price" }, { name: "category" }],
      };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPg(
      {
        operation: "insert",
        schema: { mode: "name", value: "public" },
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
      expect(sql).toMatch(/SELECT \* FROM "public"\."products"/);
      expect(sql).toMatch(/WHERE "category" = \$1/);
      expect(sql).toMatch(/LIMIT \$2/);
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
    setPostgresClientFactory(async () => client);

    const out = await runPg(
      {
        operation: "select",
        schema: { mode: "name", value: "public" },
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
      expect(sql).toBe('TRUNCATE TABLE "public"."temp_data"');
      return { rows: [] };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPg(
      {
        operation: "deleteTable",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "temp_data" },
        deleteCommand: "truncate",
        options: { cascade: false },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    expect(calls).toHaveLength(1);
  });

  it("upsert with match column", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO "public"\."users"/);
      expect(sql).toMatch(/ON CONFLICT \("email"\) DO UPDATE SET/);
      expect(sql).toMatch(/RETURNING \*/);
      const row: Record<string, unknown> = {};
      // reconstruct from columns order in SQL is fragile; return from params by known keys
      const cols = sql.match(/\(([^)]+)\) VALUES/)?.[1]?.split(", ").map((c) => c.replace(/"/g, "")) ?? [];
      cols.forEach((c, i) => {
        row[c] = params?.[i];
      });
      return { rows: [row] };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPg(
      {
        operation: "upsert",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "users" },
        dataMode: "autoMapInputData",
        columnToMatchOn: "email",
      },
      [{ email: "alex@example.com", name: "Alex Smith", age: 22 }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      email: "alex@example.com",
      name: "Alex Smith",
      age: 22,
    });
    expect(calls[0].sql).toContain("ON CONFLICT");
  });
});

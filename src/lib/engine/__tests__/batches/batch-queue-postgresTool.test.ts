import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setPostgresClientFactory,
  type PostgresClient,
  type PostgresQueryResult,
} from "../../executors/postgres";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.postgresTool";
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

async function runPgTool(
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
    begin: async () => { calls.push({ sql: "BEGIN" }); },
    commit: async () => { calls.push({ sql: "COMMIT" }); },
    rollback: async () => { calls.push({ sql: "ROLLBACK" }); },
    end: async () => {},
  };
  return { client, calls };
}

afterEach(() => setPostgresClientFactory(null));

describe("batch-queue postgresTool — n8n-nodes-base.postgresTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Postgres Tool");
  });

  it("throws when the required credential is missing", async () => {
    setPostgresClientFactory(async () => mockClient(() => ({ rows: [] })).client);
    await expect(
      runPgTool({ operation: "select", table: { mode: "name", value: "t" } }, [{}], {}),
    ).rejects.toThrow(/credential "postgres"/);
  });

  it("executeQuery basic", async () => {
    setPostgresClientFactory(async () =>
      mockClient((sql, params) => {
        expect(sql).toMatch(/SELECT id, name FROM products/);
        expect(params).toEqual([10, 100]);
        return {
          rows: [{ id: 1, name: "Widget" }],
          fields: [{ name: "id" }, { name: "name" }],
        };
      }).client,
    );

    const out = await runPgTool(
      {
        operation: "executeQuery",
        query: "SELECT id, name FROM products WHERE quantity > $1 AND price <= $2",
        options: { queryParameters: "minQty,maxPrice" },
      },
      [{ json: { minQty: 10, maxPrice: 100 } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      columns: ["id", "name"],
      rows: [[1, "Widget"]],
    });
  });

  it("insert with auto-map", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO "public"\."products"/);
      expect(sql).toMatch(/RETURNING "id", "name", "price"/);
      return {
        rows: [{ id: 42, name: "Gadget", price: 25.50 }],
        fields: [{ name: "id" }, { name: "name" }, { name: "price" }],
      };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPgTool(
      {
        operation: "insert",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "products" },
        mappingMode: "autoMapInputData",
        options: { outputColumns: "id, name, price" },
      },
      [{ json: { name: "Gadget", price: 25.50, quantity: 100 } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 42, name: "Gadget", price: 25.50 });
    expect(calls[0].params).toContain("Gadget");
    expect(calls[0].params).toContain(25.50);
  });

  it("select with filters and limit", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/SELECT "id", "name", "price" FROM "public"\."products"/);
      expect(sql).toMatch(/WHERE "price" > \$1 AND "quantity" > \$2/);
      expect(sql).toMatch(/ORDER BY "price" DESC/);
      expect(sql).toMatch(/LIMIT \$3/);
      expect(params).toEqual(["20", "0", 5]);
      return {
        rows: [
          { id: 1, name: "Expensive Widget", price: 99.99 },
          { id: 2, name: "Mid Widget", price: 49.99 },
        ],
        fields: [{ name: "id" }, { name: "name" }, { name: "price" }],
      };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPgTool(
      {
        operation: "select",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "products" },
        returnAll: false,
        limit: 5,
        where: {
          values: [
            { column: "price", condition: ">", value: "20" },
            { column: "quantity", condition: ">", value: "0" },
          ],
        },
        combineConditions: "AND",
        sort: { values: [{ column: "price", direction: "DESC" }] },
        options: { outputColumns: "id, name, price" },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ id: 1, name: "Expensive Widget", price: 99.99 });
    expect(out[0][1].json).toEqual({ id: 2, name: "Mid Widget", price: 49.99 });
    expect(calls).toHaveLength(1);
  });

  it("upsert with updateKey", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO "public"\."products"/);
      expect(sql).toMatch(/ON CONFLICT \("id"\) DO UPDATE SET/);
      expect(sql).toMatch(/RETURNING "id", "name", "price"/);
      return {
        rows: [{ id: 1, name: "Updated Widget", price: 30.00 }],
        fields: [{ name: "id" }, { name: "name" }, { name: "price" }],
      };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPgTool(
      {
        operation: "upsert",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "products" },
        updateKey: "id",
        mappingMode: "autoMapInputData",
        options: { outputColumns: "id, name, price" },
      },
      [{ json: { id: 1, name: "Updated Widget", price: 30.00 } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, name: "Updated Widget", price: 30.00 });
    expect(calls[0].sql).toContain("ON CONFLICT");
  });

  it("deleteTable truncate with restart sequences", async () => {
    const { client, calls } = mockClient((sql) => {
      expect(sql).toBe('TRUNCATE TABLE "public"."temp_products" RESTART IDENTITY CASCADE');
      return { rows: [] };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPgTool(
      {
        operation: "deleteTable",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "temp_products" },
        deleteCommand: "truncate",
        restartSequences: true,
        options: { cascade: true },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
    expect(calls).toHaveLength(1);
  });

  it("insert with defineBelow (columns.values fixedCollection)", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO "public"\."products"/);
      expect(sql).toMatch(/"name"/);
      expect(sql).toMatch(/"price"/);
      expect(sql).toMatch(/"quantity"/);
      expect(sql).toMatch(/RETURNING "id", "name", "price"/);
      expect(params).toEqual(["Tool", 99.00, 10]);
      return {
        rows: [{ id: 1, name: "Tool", price: 99.00 }],
        fields: [{ name: "id" }, { name: "name" }, { name: "price" }],
      };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPgTool(
      {
        operation: "insert",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "products" },
        mappingMode: "defineBelow",
        columns: {
          values: [
            { column: "name", value: "={{ $json.productName }}" },
            { column: "price", value: "={{ $json.productPrice }}" },
            { column: "quantity", value: 10 },
          ],
        },
        options: { outputColumns: "id, name, price" },
      },
      [{ json: { productName: "Tool", productPrice: 99.00 } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, name: "Tool", price: 99.00 });
    expect(calls).toHaveLength(1);
  });

  it("update with defineBelow, updateKey, and columns.values", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/UPDATE "public"\."products"/);
      expect(sql).toMatch(/SET "name" = \$1, "price" = \$2/);
      expect(sql).toMatch(/WHERE "id" = \$3/);
      expect(sql).toMatch(/RETURNING "id", "name", "price"/);
      expect(params).toEqual(["Renamed", 45.00, 1]);
      return {
        rows: [{ id: 1, name: "Renamed", price: 45.00 }],
        fields: [{ name: "id" }, { name: "name" }, { name: "price" }],
      };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPgTool(
      {
        operation: "update",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "products" },
        updateKey: "id",
        mappingMode: "defineBelow",
        columns: {
          values: [
            { column: "id", value: "={{ $json.productId }}" },
            { column: "name", value: "={{ $json.newName }}" },
            { column: "price", value: "={{ $json.newPrice }}" },
          ],
        },
        options: { outputColumns: "id, name, price" },
      },
      [{ json: { productId: 1, newName: "Renamed", newPrice: 45.00 } }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, name: "Renamed", price: 45.00 });
    expect(calls).toHaveLength(1);
  });

  it("deleteTable delete with where conditions (mirrors select)", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/DELETE FROM "public"\."products"/);
      expect(sql).toMatch(/WHERE "status" = \$1 AND "updatedAt" < \$2/);
      expect(params).toEqual(["archived", "2024-01-01"]);
      return { rows: [], rowCount: 3 };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPgTool(
      {
        operation: "deleteTable",
        schema: { mode: "name", value: "public" },
        table: { mode: "name", value: "products" },
        deleteCommand: "delete",
        where: {
          values: [
            { column: "status", condition: "=", value: "archived" },
            { column: "updatedAt", condition: "<", value: "2024-01-01" },
          ],
        },
        combineConditions: "AND",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("executeQuery with multiple input items (independent batching)", async () => {
    let callCount = 0;
    const { client, calls } = mockClient((sql, params) => {
      callCount++;
      if (callCount === 1) {
        expect(params).toEqual(["alex@example.com"]);
        return {
          rows: [{ id: 1, name: "Alex", email: "alex@example.com" }],
          fields: [{ name: "id" }, { name: "name" }, { name: "email" }],
        };
      }
      expect(params).toEqual(["jamie@example.com"]);
      return {
        rows: [{ id: 2, name: "Jamie", email: "jamie@example.com" }],
        fields: [{ name: "id" }, { name: "name" }, { name: "email" }],
      };
    });
    setPostgresClientFactory(async () => client);

    const out = await runPgTool(
      {
        operation: "executeQuery",
        query: "SELECT * FROM users WHERE email = $1",
        options: { queryParameters: "email", queryBatching: "independently" },
      },
      [
        { json: { email: "alex@example.com" } },
        { json: { email: "jamie@example.com" } },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({
      columns: ["id", "name", "email"],
      rows: [[1, "Alex", "alex@example.com"]],
    });
    expect(out[0][1].json).toEqual({
      columns: ["id", "name", "email"],
      rows: [[2, "Jamie", "jamie@example.com"]],
    });
    expect(calls).toHaveLength(2);
  });
});

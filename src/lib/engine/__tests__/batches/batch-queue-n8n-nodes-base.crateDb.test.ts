import { describe, it, expect, afterEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";
import {
  setCrateDbClientFactory,
  type CrateDbClient,
} from "../../executors/n8n-nodes-base.crateDb";
import { createExecutionContext, type ExecutionContext, type INodeExecutionData } from "@/sdk";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.crateDb";
const CREDS = {
  crateDb: {
    host: "localhost",
    database: "test_db",
    user: "crate",
    password: "",
    port: 5432,
  },
};

interface QueryCall {
  sql: string;
  params?: unknown[];
}

function mockClient(handler: (sql: string, params?: unknown[]) => { rows: Record<string, unknown>[]; rowCount?: number | null }): {
  client: CrateDbClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const client: CrateDbClient = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return handler(sql, params);
    },
    close: async () => {},
  };
  return { client, calls };
}

async function runCrateDb(
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

afterEach(() => setCrateDbClientFactory(null));

describe("batch-queue n8n-nodes-base.crateDb — CrateDB", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("CrateDB");
  });

  it("executeQuery (basic)", async () => {
    setCrateDbClientFactory(async () =>
      mockClient((sql) => {
        expect(sql).toBe("SELECT 1 AS n, 'hello' AS msg");
        return { rows: [{ n: 1, msg: "hello" }], rowCount: 1 };
      }).client,
    );

    const out = await runCrateDb(
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
    setCrateDbClientFactory(async () =>
      mockClient((sql, params) => {
        expect(sql).toBe("SELECT * FROM users WHERE email = $1 AND status = $2");
        expect(params).toEqual(["alice@example.com", "active"]);
        return { rows: [{ id: 1, email: "alice@example.com", status: "active" }], rowCount: 1 };
      }).client,
    );

    const out = await runCrateDb(
      {
        operation: "executeQuery",
        query: "SELECT * FROM users WHERE email = $1 AND status = $2",
        additionalFields: {
          queryParams: "email,status",
        },
      },
      [{ json: { email: "alice@example.com", status: "active" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, email: "alice@example.com", status: "active" });
  });

  it("insert rows from input items", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toContain("INSERT INTO");
      expect(sql).toContain('"doc"');
      expect(sql).toContain('"employees"');
      expect(sql).toContain('"name"');
      expect(sql).toContain('"age"');
      expect(sql).toContain("RETURNING *");
      expect(params).toEqual(["Alice", 30]);
      return { rows: [{ name: "Alice", age: 30 }], rowCount: 1 };
    });
    setCrateDbClientFactory(async () => client);

    const out = await runCrateDb(
      {
        operation: "insert",
        schema: "doc",
        table: "employees",
        columns: "name,age",
        returnFields: "*",
      },
      [{ json: { name: "Alice", age: 30 } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ name: "Alice", age: 30 });
    expect(calls[0].sql).toContain("INSERT INTO");
  });

  it("insert with column type hints", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toContain("INSERT INTO");
      expect(sql).toContain('"doc"');
      expect(sql).toContain('"products"');
      expect(sql).toContain('"id"');
      expect(sql).toContain('"name"');
      expect(sql).toContain('"price"');
      expect(params).toEqual([1, "Widget", 9.99]);
      return { rows: [{ id: 1, name: "Widget", price: 9.99 }], rowCount: 1 };
    });
    setCrateDbClientFactory(async () => client);

    const out = await runCrateDb(
      {
        operation: "insert",
        schema: "doc",
        table: "products",
        columns: "id:int,name:text,price:float",
        returnFields: "*",
      },
      [{ json: { id: 1, name: "Widget", price: 9.99 } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 1, name: "Widget", price: 9.99 });
    expect(calls[0].sql).not.toContain(":int");
  });

  it("update rows matched by key", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toContain("UPDATE");
      expect(sql).toContain('"doc"');
      expect(sql).toContain('"employees"');
      expect(sql).toContain('"name" = ');
      expect(sql).toContain('"age" = ');
      expect(sql).toContain('"id" = ');
      expect(params).toEqual(["Alice Updated", 31, 42]);
      return { rows: [{ id: 42, name: "Alice Updated", age: 31 }], rowCount: 1 };
    });
    setCrateDbClientFactory(async () => client);

    const out = await runCrateDb(
      {
        operation: "update",
        schema: "doc",
        table: "employees",
        updateKey: "id",
        columns: "name,age",
        returnFields: "*",
      },
      [{ json: { id: 42, name: "Alice Updated", age: 31 } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: 42, name: "Alice Updated", age: 31 });
    expect(calls[0].sql).toContain("UPDATE");
  });

  it("throws when crateDb credential is missing", async () => {
    setCrateDbClientFactory(async () =>
      mockClient(() => ({ rows: [] })).client,
    );
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { operation: "executeQuery", query: "SELECT 1" },
    });
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/credential "crateDb"/);
  });

  it("executeQuery with multiple items", async () => {
    let callCount = 0;
    setCrateDbClientFactory(async () =>
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

    const out = await runCrateDb(
      {
        operation: "executeQuery",
        query: "SELECT email FROM users WHERE email = $1",
        additionalFields: {
          queryParams: "email",
        },
      },
      [{ json: { email: "a@x.com" } }, { json: { email: "b@x.com" } }],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ email: "a@x.com" });
    expect(callCount).toBe(2);
  });
});

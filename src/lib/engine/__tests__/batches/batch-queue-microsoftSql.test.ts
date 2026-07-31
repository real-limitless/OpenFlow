import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setMssqlClientFactory,
  type MssqlClient,
  type MssqlQueryResult,
} from "../../executors/microsoftSql";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftSql";
const CREDS = {
  microsoftSql: {
    server: "localhost",
    port: 1433,
    user: "sa",
    password: "Test123!",
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

async function runMsSql(
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
  handler: (sql: string, params?: unknown[]) => MssqlQueryResult | Promise<MssqlQueryResult>,
): {
  client: MssqlClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const client: MssqlClient = {
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

afterEach(() => setMssqlClientFactory(null));

describe("batch-queue microsoftSql — n8n-nodes-base.microsoftSql", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft SQL");
  });

  it("throws when the required credential is missing", async () => {
    setMssqlClientFactory(async () => mockClient(() => ({ rows: [] })).client);
    await expect(
      runMsSql({ operation: "executeQuery", query: "SELECT 1" }, [{}], {}),
    ).rejects.toThrow(/credential "microsoftSql"/);
  });

  it("executeQuery with parameters", async () => {
    const users: Record<string, Record<string, unknown>> = {
      "user@example.com": { id: 1, name: "User", email: "user@example.com" },
    };

    setMssqlClientFactory(async () =>
      mockClient((sql, params) => {
        expect(sql).toMatch(/SELECT \* FROM \[users\] WHERE email = @p1/);
        const email = String(params?.[0] ?? "");
        const row = users[email];
        return {
          rows: row ? [row] : [],
          fields: [{ name: "id" }, { name: "name" }, { name: "email" }],
        };
      }).client,
    );

    const out = await runMsSql(
      {
        operation: "executeQuery",
        query: "SELECT * FROM $1:name WHERE email = $2;",
        options: {
          queryReplacement: "={{ ['users', $json.email] }}",
        },
      },
      [{ email: "user@example.com", name: "User" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      columns: ["id", "name", "email"],
      rows: [[1, "User", "user@example.com"]],
    });
  });

  it("insert with auto-map", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO \[products\]/);
      expect(params).toEqual(["Widget", 9.99, "tools"]);
      return { rows: [] };
    });
    setMssqlClientFactory(async () => client);

    const out = await runMsSql(
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

  it("update rows", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/UPDATE \[orders\] SET/);
      expect(sql).toMatch(/WHERE \[id\] = @p2/);
      return { rows: [] };
    });
    setMssqlClientFactory(async () => client);

    const out = await runMsSql(
      {
        operation: "update",
        table: { mode: "name", value: "orders" },
        columnToMatchOn: "id",
        valueToMatchOn: "1",
        dataMode: "autoMapInputData",
      },
      [{ id: 1, status: "shipped" }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: "1", status: "shipped" });
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual(["shipped", "1"]);
  });

  it("delete rows", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toBe("DELETE FROM [orders] WHERE [id] = @p1");
      expect(params).toEqual(["42"]);
      return { rows: [] };
    });
    setMssqlClientFactory(async () => client);

    const out = await runMsSql(
      {
        operation: "delete",
        table: { mode: "name", value: "orders" },
        columnToMatchOn: "id",
        valueToMatchOn: "42",
      },
      [{ id: 42 }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ success: true });
    expect(calls).toHaveLength(1);
  });

  it("large numbers output as text with outputLargeNumbersAsText option", async () => {
    const { client } = mockClient(() => ({
      rows: [{ amount: "9999999999999999", rate: "0.075" }],
      fields: [{ name: "amount" }, { name: "rate" }],
    }));
    setMssqlClientFactory(async () => client);

    const out = await runMsSql(
      {
        operation: "executeQuery",
        query: "SELECT * FROM financials",
      },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({
      columns: ["amount", "rate"],
      rows: [["9999999999999999", "0.075"]],
    });
  });
});
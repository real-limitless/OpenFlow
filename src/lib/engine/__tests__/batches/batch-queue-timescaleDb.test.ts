import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setTimescaleDbClientFactory,
  type TimescaleDbClient,
  type TimescaleDbQueryResult,
} from "../../executors/timescaleDb";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.timescaleDb";
const CREDS = {
  timescaleDb: {
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

async function runTsdb(
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
  handler: (sql: string, params?: unknown[]) => TimescaleDbQueryResult | Promise<TimescaleDbQueryResult>,
): { client: TimescaleDbClient; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const client: TimescaleDbClient = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return handler(sql, params);
    },
    end: async () => {},
  };
  return { client, calls };
}

afterEach(() => setTimescaleDbClientFactory(null));

describe("batch-queue timescaleDb — n8n-nodes-base.timescaleDb", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("TimescaleDB");
  });

  it("throws when no credential and no factory is set", async () => {
    setTimescaleDbClientFactory(null);
    await expect(
      runTsdb({ operation: "executeQuery", query: "SELECT 1" }, [{}], {}),
    ).rejects.toThrow(/Credential/);
  });

  it("executeQuery returns rows as output items", async () => {
    const { client, calls } = mockClient((sql) => {
      expect(sql).toBe("SELECT 1 AS n, 'hello' AS msg");
      return {
        rows: [{ n: 1, msg: "hello" }],
        fields: [{ name: "n" }, { name: "msg" }],
      };
    });
    setTimescaleDbClientFactory(async () => client);

    const out = await runTsdb(
      { operation: "executeQuery", query: "SELECT 1 AS n, 'hello' AS msg" },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ n: 1, msg: "hello" });
    expect(calls).toHaveLength(1);
  });

  it("insert returns affectedRows", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO "public"."sensor_data"/);
      expect(params).toEqual(["2024-01-01T00:00:00Z", 22.5, 60]);
      return { rows: [], rowCount: 1 };
    });
    setTimescaleDbClientFactory(async () => client);

    const out = await runTsdb(
      {
        operation: "insert",
        table: "sensor_data",
        columns: "time:timestamptz,temperature:float8,humidity:int",
      },
      [{ time: "2024-01-01T00:00:00Z", temperature: 22.5, humidity: 60 }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ affectedRows: 1 });
    expect(calls).toHaveLength(1);
  });

  it("update returns affectedRows", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/UPDATE "public"."sensor_data" SET/);
      expect(params).toEqual([23.1]);
      return { rows: [], rowCount: 1 };
    });
    setTimescaleDbClientFactory(async () => client);

    const out = await runTsdb(
      {
        operation: "update",
        table: "sensor_data",
        columns: "temperature:float8",
      },
      [{ temperature: 23.1 }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ affectedRows: 1 });
    expect(calls).toHaveLength(1);
  });

  it("insert with auto-detected columns when columns is omitted", async () => {
    const { client, calls } = mockClient((sql, params) => {
      expect(sql).toMatch(/INSERT INTO "public"."readings"/);
      expect(sql).toMatch(/"device"/);
      expect(sql).toMatch(/"reading"/);
      expect(params).toEqual(["sensor-1", 98.5]);
      return { rows: [], rowCount: 1 };
    });
    setTimescaleDbClientFactory(async () => client);

    const out = await runTsdb(
      { operation: "insert", table: "readings" },
      [{ device: "sensor-1", reading: 98.5 }],
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ affectedRows: 1 });
    expect(calls).toHaveLength(1);
  });

  it("executeQuery with multiple input items processes each item", async () => {
    let callCount = 0;
    const { client, calls } = mockClient((sql) => {
      callCount++;
      return { rows: [{ result: callCount }], fields: [{ name: "result" }] };
    });
    setTimescaleDbClientFactory(async () => client);

    const out = await runTsdb(
      { operation: "executeQuery", query: "SELECT 1 AS result" },
      [{}, {}],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ result: 1 });
    expect(out[0][1].json).toEqual({ result: 2 });
    expect(calls).toHaveLength(2);
  });
});

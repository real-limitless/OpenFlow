import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setNocoDbClientFactory,
  type NocoDbClient,
} from "../../executors/n8n-nodes-base.nocoDb";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.nocoDb";
const CREDS = {
  nocoDbApi: {
    apiKey: "test-key",
    baseUrl: "http://localhost:8080",
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

async function runNoco(
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

interface MockCall {
  method: string;
  path: string;
  body?: unknown;
}

function mockClient(): { client: NocoDbClient; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const client: NocoDbClient = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body });
      if (path.includes("nonexistent")) {
        return { status: 404, body: { message: "Invalid table" } };
      }
      return { status: 200, body: {} };
    },
  };
  return { client, calls };
}

describe("n8n-nodes-base.nocoDb", () => {
  afterEach(() => {
    setNocoDbClientFactory(null);
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("select returns records", async () => {
    const { client, calls } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {},
      [{ operation: "select", table: "users", where: { id: { eq: 1 } } }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ records: {} });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].path).toContain("users");
  });

  it("insert creates record and returns id", async () => {
    const { client, calls } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {},
      [{
        operation: "insert",
        table: "users",
        payload: { name: "Alice", email: "alice@example.com" },
      }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ created: true });
    expect(calls[0].method).toBe("POST");
  });

  it("returns error for invalid table", async () => {
    const { client } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {},
      [{ operation: "select", table: "nonexistent" }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ error: "Invalid table: nonexistent" });
  });

  it("handles missing credentials gracefully", async () => {
    const { client } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {},
      [{ operation: "select", table: "items" }],
      {},
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ records: {} });
  });

  it("processes batch with multiple items", async () => {
    const { client, calls } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      { batchSize: 10 },
      [
        { operation: "select", table: "users" },
        { operation: "select", table: "posts" },
      ],
    );

    expect(results).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});

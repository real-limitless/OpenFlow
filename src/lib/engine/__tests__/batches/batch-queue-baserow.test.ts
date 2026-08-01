import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import {
  setBaserowClientFactory,
  type BaserowClient,
} from "../../executors/n8n-nodes-base.baserow";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.baserow";
const CREDS = {
  baserowApi: {
    token: "test-token",
    baseUrl: "https://api.baserow.io",
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

async function runBaserow(
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

function mockClient(): { client: BaserowClient; calls: MockCall[] } {
  let idCounter = 100;
  const calls: MockCall[] = [];
  const client: BaserowClient = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body });
      if (path.includes("nonexistent")) {
        return { status: 404, body: { error: "Not found" } };
      }
      if (method === "POST" && path.includes("batch")) {
        const batch = body as { items?: Record<string, unknown>[] };
        return { status: 200, body: batch?.items?.map((item) => ({ id: ++idCounter, ...item })) ?? [] };
      }
      if (method === "POST") {
        return { status: 200, body: { id: ++idCounter, ...(body as Record<string, unknown>) } };
      }
      if (method === "PATCH") {
        return { status: 200, body: { id: Number(path.split("/").filter(Boolean).pop()), ...(body as Record<string, unknown>) } };
      }
      if (method === "DELETE") {
        return { status: 204, body: {} };
      }
      if (method === "GET") {
        const tableMatch = path.match(/\/table\/(\d+)\/(?:(\d+)\/)?$/);
        if (tableMatch) {
          if (tableMatch[2]) {
            return { status: 200, body: { id: Number(tableMatch[2]), name: "Test", value: 1 } };
          }
          return { status: 200, body: { results: [{ id: 1, name: "Item 1" }, { id: 2, name: "Item 2" }] } };
        }
        return { status: 200, body: { results: [] } };
      }
      return { status: 200, body: { id: 1, name: "Test", value: 1 } };
    },
  };
  return { client, calls };
}

describe("n8n-nodes-base.baserow", () => {
  afterEach(() => {
    setBaserowClientFactory(null);
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("create row returns new id and echoed data", async () => {
    const { client, calls } = mockClient();
    setBaserowClientFactory(async () => client);

    const [results] = await runBaserow(
      {},
      [{ operation: "create", table: "123", payload: { field_1: "Test", field_2: 1 } }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ id: 101, field_1: "Test", field_2: 1 });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toContain("/database/rows/table/123/");
  });

  it("get many rows returns records array", async () => {
    const { client, calls } = mockClient();
    setBaserowClientFactory(async () => client);

    const [results] = await runBaserow(
      {},
      [{ operation: "read", table: "123" }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ records: [{ id: 1 }, { id: 2 }] });
    expect(calls[0].method).toBe("GET");
  });

  it("get a single row by id", async () => {
    const { client, calls } = mockClient();
    setBaserowClientFactory(async () => client);

    const [results] = await runBaserow(
      {},
      [{ operation: "read", table: "123", rowId: 42 }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ id: 42, name: "Test" });
    expect(calls[0].path).toContain("/42/");
  });

  it("update row reflects updated data", async () => {
    const { client, calls } = mockClient();
    setBaserowClientFactory(async () => client);

    const [results] = await runBaserow(
      {},
      [{ operation: "update", table: "123", rowId: 42, payload: { value: 2 } }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ id: 42, value: 2 });
    expect(calls[0].method).toBe("PATCH");
  });

  it("delete row returns success", async () => {
    const { client, calls } = mockClient();
    setBaserowClientFactory(async () => client);

    const [results] = await runBaserow(
      {},
      [{ operation: "delete", table: "123", rowId: 42 }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ success: true });
    expect(calls[0].method).toBe("DELETE");
  });

  it("batch create creates multiple rows", async () => {
    const { client, calls } = mockClient();
    setBaserowClientFactory(async () => client);

    const [results] = await runBaserow(
      {},
      [{
        operation: "createMultiple",
        table: "123",
        payload: { items: [{ name: "A" }, { name: "B" }, { name: "C" }] },
      }],
    );

    expect(results).toHaveLength(1);
    const ids = (results[0].json as unknown as Array<Record<string, unknown>>).map((r: Record<string, unknown>) => r.id);
    expect(ids).toHaveLength(3);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toContain("batch");
  });

  it("handles invalid table gracefully", async () => {
    const { client } = mockClient();
    setBaserowClientFactory(async () => client);

    const [results] = await runBaserow(
      {},
      [{ operation: "read", table: "nonexistent" }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ error: "Read failed: 404" });
  });

  it("handles missing credentials gracefully", async () => {
    const { client } = mockClient();
    setBaserowClientFactory(async () => client);

    const [results] = await runBaserow(
      {},
      [{ operation: "read", table: "123" }],
      {},
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ records: expect.any(Array) });
  });
});

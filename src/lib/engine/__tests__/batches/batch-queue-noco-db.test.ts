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
    xcToken: "test-key",
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
  let idCounter = 100;
  const calls: MockCall[] = [];
  const client: NocoDbClient = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body });
      if (method === "POST" && path.includes("/bulk/")) {
        return { status: 200, body: { id: ++idCounter, ...(body as Record<string, unknown>) } };
      }
      if (method === "PATCH") {
        const parts = path.split("/");
        const rowId = parts[parts.length - 1];
        return { status: 200, body: { id: Number(rowId), ...(body as Record<string, unknown>) } };
      }
      if (method === "DELETE") {
        return { status: 200, body: {} };
      }
      if (method === "GET" && path.includes("/list")) {
        const rows = [
          { id: 1, name: "Item 1", status: "active", created_at: "2024-01-01" },
          { id: 2, name: "Item 2", status: "done", created_at: "2024-01-02" },
        ];
        return { status: 200, body: { list: rows } };
      }
      return { status: 200, body: { id: 1, name: "Test" } };
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

  it("create row with auto-map", async () => {
    const { client, calls } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {
        operation: "create",
        projectId: "wksp_abc",
        table: "tbl_tasks",
        dataToSend: "autoMapInputData",
        inputsToIgnore: "",
      },
      [{ json: { title: "Hello", status: "done" } }],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ title: "Hello", status: "done" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({ title: "Hello", status: "done" });
  });

  it("create row with define-below fields", async () => {
    const { client, calls } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {
        operation: "create",
        projectId: "wksp_abc",
        table: "tbl_tasks",
        dataToSend: "defineBelow",
        fieldsUi: {
          fieldValues: [
            { fieldName: "name", fieldValue: "Test Task", binaryData: false },
          ],
        },
      },
      [{}],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ name: "Test Task" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toMatchObject({ name: "Test Task" });
  });

  it("get many rows with sort and field projection", async () => {
    const { client, calls } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {
        operation: "getAll",
        projectId: "wksp_abc",
        table: "tbl_tasks",
        returnAll: false,
        limit: 10,
        options: {
          sort: { property: [{ field: "created_at", direction: "desc" }] },
          fields: ["name", "status"],
        },
      },
      [{}],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ list: expect.any(Array) });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].path).toContain("/list");
  });

  it("update existing row", async () => {
    const { client, calls } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {
        operation: "update",
        projectId: "proj_abc",
        table: "Tasks",
        id: "42",
        primaryKey: "id",
        dataToSend: "defineBelow",
        fieldsUi: {
          fieldValues: [
            { fieldName: "status", fieldValue: "completed", binaryData: false },
          ],
        },
      },
      [{}],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ status: "completed" });
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].path).toContain("/42");
  });

  it("delete row", async () => {
    const { client, calls } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      {
        operation: "delete",
        projectId: "proj_abc",
        table: "Tasks",
        id: "99",
        primaryKey: "id",
      },
      [{}],
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ success: true });
    expect(calls[0].method).toBe("DELETE");
  });

  it("handles missing credentials gracefully", async () => {
    const { client } = mockClient();
    setNocoDbClientFactory(async () => client);

    const [results] = await runNoco(
      { operation: "create", projectId: "p", table: "t", dataToSend: "defineBelow" },
      [{}],
      {},
    );

    expect(results).toHaveLength(1);
  });

  it("continueOnFail returns error item instead of throwing", async () => {
    setNocoDbClientFactory(async () => {
      throw new Error("Network error");
    });

    const [results] = await runNoco(
      { operation: "create", projectId: "p", table: "t", dataToSend: "defineBelow" },
      [{}],
      CREDS,
      { continueOnFail: true },
    );

    expect(results).toHaveLength(1);
    expect(results[0].json).toMatchObject({ error: expect.any(String) });
  });
});
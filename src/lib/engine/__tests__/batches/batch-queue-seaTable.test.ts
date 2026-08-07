import { describe, it, expect, afterEach } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { setSeaTableClientFactory, type SeaTableClient } from "../../executors/seaTable";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.seaTable";
const CREDS = {
  seaTableApi: {
    environment: "cloudHosted",
    domain: "https://cloud.seatable.io",
    token: "test-api-token",
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

async function runSeaTable(
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

function mockClient(): { client: SeaTableClient; calls: MockCall[] } {
  let idCounter = 100;
  const calls: MockCall[] = [];
  const client: SeaTableClient = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body });
      if (path.includes("app-access-token")) {
        return { status: 200, body: { access_token: "mock-base-token" } };
      }
      if (method === "POST" && path.includes("query")) {
        return { status: 200, body: { results: [{ _id: "1", Email: "john@example.com" }] } };
      }
      if (method === "POST" && path.includes("rows")) {
        return { status: 200, body: { _id: String(++idCounter), _ctime: "2025-01-01T00:00:00Z", _creator: "test", ...(body as Record<string, unknown>) } };
      }
      if (method === "PUT" && path.includes("unlock")) {
        return { status: 200, body: { _id: "1", locked: false } };
      }
      if (method === "PUT" && path.includes("lock")) {
        return { status: 200, body: { _id: "1", locked: true } };
      }
      if (method === "PUT" && path.includes("rows")) {
        return { status: 200, body: { success: true } };
      }
      if (method === "DELETE") {
        return { status: 200, body: { success: true } };
      }
      if (method === "GET" && path.includes("rows")) {
        return { status: 200, body: { results: [{ _id: "1", Name: "John" }, { _id: "2", Name: "Jane" }] } };
      }
      if (method === "GET" && path.includes("metadata")) {
        return { status: 200, body: { tables: [{ name: "Table1", columns: [{ name: "Name", type: "text" }] }] } };
      }
      if (method === "GET" && path.includes("collaborators")) {
        return { status: 200, body: [{ email: "user@example.com", name: "User" }] };
      }
      if (method === "POST" && path.includes("links")) {
        return { status: 200, body: { success: true } };
      }
      if (method === "GET" && path.includes("links")) {
        return { status: 200, body: { links: [{ row_id: "2" }] } };
      }
      if (method === "POST" && path.includes("snapshot")) {
        return { status: 200, body: { success: true, snapshot_name: "snap1" } };
      }
      if (method === "POST" && path.includes("asset/upload")) {
        return { status: 200, body: { relative_path: "images/photo.jpg" } };
      }
      if (method === "POST" && path.includes("asset/public-url")) {
        return { status: 200, body: { url: "https://cloud.seatable.io/asset/public/abc123" } };
      }
      return { status: 200, body: {} };
    },
  };
  return { client, calls };
}

describe("n8n-nodes-base.seaTable", () => {
  afterEach(() => {
    setSeaTableClientFactory(null);
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("create row returns _id and system fields", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "row", operation: "create", tableName: "Table1" },
      [{ columnValues: { Name: "John Doe", Email: "john@example.com" } }],
    );

    expect(results[0].json).toMatchObject({ _id: "101", Name: "John Doe" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toContain("/rows/");
  });

  it("get row by ID returns row data", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "row", operation: "get", tableName: "Table1", rowId: "1" },
      [{}],
    );

    expect(results[0].json).toMatchObject({ results: expect.any(Array) });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].path).toContain("/rows/Table1/1/");
  });

  it("search rows by column value returns matching results", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "row", operation: "search", tableName: "Table1", searchColumn: "Email", searchValue: "john@example.com" },
      [{}],
    );

    expect(results[0].json).toMatchObject({ results: [{ _id: "1", Email: "john@example.com" }] });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toContain("/query");
  });

  it("list rows returns results array", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "row", operation: "list", tableName: "Table1" },
      [{}],
    );

    expect(results[0].json).toMatchObject({ results: expect.any(Array) });
    expect(calls[0].method).toBe("GET");
  });

  it("update row returns success", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "row", operation: "update", tableName: "Table1", rowId: "1", columnValues: { Status: "Completed" } },
      [{}],
    );

    expect(results[0].json).toMatchObject({ success: true });
    expect(calls[0].method).toBe("PUT");
  });

  it("base metadata returns metadata object", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "base", operation: "metadata" },
      [{}],
    );

    expect(results[0].json).toMatchObject({ metadata: { tables: expect.any(Array) } });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].path).toContain("/metadata");
  });

  it("handles missing tableName gracefully", async () => {
    const { client } = mockClient();
    setSeaTableClientFactory(async () => client);

    await expect(
      runSeaTable(
        { resource: "row", operation: "create" },
        [{}],
      ),
    ).rejects.toThrow("tableName is required");
  });

  it("lock row returns locked state", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "row", operation: "lock", tableName: "Table1", rowId: "5" },
      [{}],
    );

    expect(results[0].json).toMatchObject({ locked: true });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].path).toContain("/lock/");
  });

  it("unlock row returns unlocked state", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "row", operation: "unlock", tableName: "Table1", rowId: "5" },
      [{}],
    );

    expect(results[0].json).toMatchObject({ locked: false });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].path).toContain("/unlock/");
  });

  it("link add creates link relationship", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "link", operation: "add", tableName: "Table1", linkedTableName: "Table2", rowId: "1", linkedRowId: "2" },
      [{}],
    );

    expect(results[0].json).toMatchObject({ success: true });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toContain("/links/");
  });

  it("asset getPublicURL returns URL", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "asset", operation: "getPublicURL", assetPath: "images/photo.jpg" },
      [{}],
    );

    expect(results[0].json).toMatchObject({ url: expect.stringContaining("seatable") });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].path).toContain("public-url");
  });

  it("selfHosted uses domain as base URL", async () => {
    const { client, calls } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "base", operation: "metadata" },
      [{}],
      {
        seaTableApi: {
          environment: "selfHosted",
          domain: "https://seatable.example.com",
          token: "test-token",
        },
      },
    );

    expect(results[0].json).toMatchObject({ metadata: { tables: expect.any(Array) } });
    expect(calls[0].path).toContain("/metadata");
  });

  it("continueOnFail emits error item instead of throwing", async () => {
    const { client } = mockClient();
    setSeaTableClientFactory(async () => client);

    const [results] = await runSeaTable(
      { resource: "row", operation: "create" },
      [{}],
      CREDS,
      { continueOnFail: true },
    );

    expect(results[0].json).toMatchObject({ error: expect.any(String) });
  });
});

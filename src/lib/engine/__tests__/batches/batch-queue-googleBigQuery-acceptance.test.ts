import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleBigQuery";
const CREDS = { googleBigQueryOAuth2Api: { accessToken: "tok_bq" } };

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
  lastMethod = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleBigQueryOAuth2Api: { name: "googleBigQueryOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleBigQuery executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("execute a simple SQL query", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/queries")) {
        return mockResponse({
          kind: "bigquery#queryResponse",
          schema: {
            fields: [
              { name: "name", type: "STRING" },
              { name: "age", type: "INTEGER" },
            ],
          },
          rows: [
            { f: [{ v: "Alice" }, { v: "30" }] },
            { f: [{ v: "Bob" }, { v: "25" }] },
          ],
          totalRows: "2",
        });
      }
      return mockResponse({});
    });

    const out = await run({
      operation: "executeQuery",
      projectId: { mode: "id", value: "my-project" },
      datasetId: { mode: "id", value: "my_dataset" },
      sqlQuery: "SELECT name, age FROM my_dataset.users LIMIT 5",
    });

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ name: "Alice", age: "30" });
    expect(out[0][1].json).toMatchObject({ name: "Bob", age: "25" });
    expect(lastBody).toMatchObject({
      query: "SELECT name, age FROM my_dataset.users LIMIT 5",
      useLegacySql: false,
      maxResults: 1000,
      timeoutMs: 10000,
    });
  });

  it("insert rows with auto-map", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/insertAll")) {
        return mockResponse({ kind: "bigquery#tableDataInsertAllResponse" });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        operation: "insert",
        projectId: { mode: "id", value: "my-project" },
        datasetId: { mode: "id", value: "my_dataset" },
        tableId: { mode: "id", value: "users" },
        dataMode: "autoMap",
      },
      [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ],
    );

    expect(out[0]).toHaveLength(2);
    expect(lastBody).toMatchObject({
      rows: [
        { json: { name: "Alice", age: 30 } },
        { json: { name: "Bob", age: 25 } },
      ],
      ignoreUnknownValues: false,
      skipInvalidRows: false,
    });
  });

  it("insert rows with define mode", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/insertAll")) {
        return mockResponse({ kind: "bigquery#tableDataInsertAllResponse" });
      }
      return mockResponse({});
    });

    const out = await run(
      {
        operation: "insert",
        projectId: { mode: "id", value: "my-project" },
        datasetId: { mode: "id", value: "my_dataset" },
        tableId: { mode: "id", value: "users" },
        dataMode: "define",
        fieldsUi: {
          values: [
            { fieldId: "name", fieldValue: "={{ $json.fullName }}" },
            { fieldId: "age", fieldValue: "={{ $json.years }}" },
          ],
        },
      },
      [{ fullName: "Charlie", years: 35 }],
    );

    expect(out[0]).toHaveLength(1);
    expect(lastBody).toMatchObject({
      rows: [{ json: { name: "Charlie", age: 35 } }],
    });
  });

  it("execute query with dryRun option", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("/queries")) {
        return mockResponse({
          kind: "bigquery#queryResponse",
          totalBytesProcessed: "1024",
          cacheHit: false,
          jobComplete: true,
        });
      }
      return mockResponse({});
    });

    const out = await run({
      operation: "executeQuery",
      projectId: { mode: "id", value: "my-project" },
      datasetId: { mode: "id", value: "my_dataset" },
      sqlQuery: "SELECT * FROM my_dataset.users",
      options: { dryRun: true },
    });

    expect(out[0][0].json).toMatchObject({
      totalBytesProcessed: "1024",
      cacheHit: false,
      jobComplete: true,
    });
    expect(lastBody).toMatchObject({ dryRun: true });
  });

  it("continue on fail", async () => {
    installFetch(() => mockResponse({ error: { message: "Project not found" } }, 404));

    const out = await run(
      {
        operation: "executeQuery",
        projectId: { mode: "id", value: "invalid-project" },
        datasetId: { mode: "id", value: "my_dataset" },
        sqlQuery: "SELECT * FROM my_dataset.users",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Project not found") });
  });
});
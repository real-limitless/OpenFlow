import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.airtableTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get() { return "application/json"; },
      entries() { return new Map([["content-type", "application/json"]]).entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return responseQueue.shift() ?? mockResponse({});
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
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
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = { airtableTokenApi: { accessToken: "pat_test_token" } };
const BASE = "appXXXXXXXXXXXXXX";
const TABLE = "tblYYYYYYYYYYYYYY";
const REC = "recZZZZZZZZZZZZZZ";

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue airtableTool — n8n-nodes-base.airtableTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Airtable");
  });

  it("record.create — creates record with auto-mapped fields", async () => {
    installFetch(
      mockResponse({
        records: [{ id: REC, createdTime: "2024-01-15T12:00:00.000Z", fields: { Name: "Alice", Email: "alice@example.com" } }],
      }),
    );
    const out = await run(
      {
        authentication: "airtableTokenApi",
        resource: "record",
        operation: "create",
        base: { mode: "id", value: BASE },
        table: { mode: "id", value: TABLE },
        columns: { mappingMode: "autoMapInputData", value: null },
        options: { typecast: false },
      },
      [{ Name: "Alice", Email: "alice@example.com" }],
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    expect(JSON.parse(calls[0].body!)).toEqual({ records: [{ fields: { Name: "Alice", Email: "alice@example.com" } }] });
    expect(out[0][0].json).toEqual({
      id: REC,
      createdTime: "2024-01-15T12:00:00.000Z",
      fields: { Name: "Alice", Email: "alice@example.com" },
    });
  });

  it("record.search — filters by formula, respects returnAll: false + limit", async () => {
    installFetch(
      mockResponse({
        records: [{ id: REC, fields: { Name: "Alice", Status: "Active" } }],
      }),
    );
    const out = await run({
      authentication: "airtableTokenApi",
      resource: "record",
      operation: "search",
      base: { mode: "id", value: BASE },
      table: { mode: "id", value: TABLE },
      filterByFormula: "{Status} = 'Active'",
      returnAll: false,
      limit: 10,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("maxRecords=10");
    expect(calls[0].url).toContain(encodeURIComponent("{Status} = 'Active'"));
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ id: REC, fields: { Name: "Alice", Status: "Active" } });
  });

  it("record.get — retrieves a single record by id", async () => {
    installFetch(
      mockResponse({ id: REC, fields: { Name: "Alice", Email: "alice@example.com" }, createdTime: "2024-01-15T12:00:00.000Z" }),
    );
    const out = await run({
      authentication: "airtableTokenApi",
      resource: "record",
      operation: "get",
      base: { mode: "id", value: BASE },
      table: { mode: "id", value: TABLE },
      id: REC,
    });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`https://api.airtable.com/v0/${BASE}/${TABLE}/${REC}`);
    expect(out[0][0].json).toEqual({
      id: REC,
      fields: { Name: "Alice", Email: "alice@example.com" },
      createdTime: "2024-01-15T12:00:00.000Z",
    });
  });

  it("record.upsert — upserts by matching column id", async () => {
    installFetch(
      mockResponse({ records: [{ id: REC, fields: { Email: "newalice@example.com" } }] }),
    );
    const out = await run(
      {
        authentication: "airtableTokenApi",
        resource: "record",
        operation: "upsert",
        base: { mode: "id", value: BASE },
        table: { mode: "id", value: TABLE },
        columns: { mappingMode: "autoMapInputData", matchingColumns: ["id"] },
        options: { typecast: false },
      },
      [{ id: REC, Email: "newalice@example.com" }],
    );
    expect(calls[0].method).toBe("PATCH");
    expect(JSON.parse(calls[0].body!)).toEqual({ records: [{ id: REC, fields: { Email: "newalice@example.com" } }] });
    expect(out[0][0].json).toEqual({ records: [{ id: REC, fields: { Email: "newalice@example.com" } }] });
  });

  it("record.delete — deletes by id", async () => {
    installFetch(mockResponse({ id: REC, deleted: true }));
    const out = await run({
      authentication: "airtableTokenApi",
      resource: "record",
      operation: "delete",
      base: { mode: "id", value: BASE },
      table: { mode: "id", value: TABLE },
      id: REC,
    });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`https://api.airtable.com/v0/${BASE}/${TABLE}/${REC}`);
    expect(out[0][0].json).toMatchObject({ id: REC, deleted: true });
  });

  it("record.update — updates fields by record id", async () => {
    installFetch(mockResponse({ records: [{ id: REC, fields: { Name: "Bob" } }] }));
    const out = await run(
      {
        authentication: "airtableTokenApi",
        resource: "record",
        operation: "update",
        base: { mode: "id", value: BASE },
        table: { mode: "id", value: TABLE },
        id: REC,
        columns: { mappingMode: "autoMapInputData" },
        options: {},
      },
      [{ Name: "Bob" }],
    );
    expect(calls[0].method).toBe("PATCH");
    expect(JSON.parse(calls[0].body!)).toEqual({ records: [{ id: REC, fields: { Name: "Bob" } }] });
    expect(out[0][0].json).toEqual({ records: [{ id: REC, fields: { Name: "Bob" } }] });
  });

  it("base.getSchema — returns table schemas", async () => {
    installFetch(
      mockResponse({
        tables: [{ id: "tbl1", name: "Contacts", fields: [{ id: "fld1", name: "Name", type: "singleLineText" }] }],
      }),
    );
    const out = await run({
      authentication: "airtableTokenApi",
      resource: "base",
      operation: "getSchema",
      base: { mode: "id", value: BASE },
    });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`);
    expect(out[0][0].json).toEqual({
      id: "tbl1",
      name: "Contacts",
      fields: [{ id: "fld1", name: "Name", type: "singleLineText" }],
    });
  });

  it("continueOnFail returns error item", async () => {
    installFetch(mockResponse({ error: { type: "NOT_FOUND", message: "Not found" } }, 404));
    const out = await run(
      {
        authentication: "airtableTokenApi",
        resource: "record",
        operation: "get",
        base: { mode: "id", value: BASE },
        table: { mode: "id", value: TABLE },
        id: "recMissing",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("throws when credential missing", async () => {
    await expect(
      run(
        { authentication: "airtableTokenApi", resource: "base", operation: "getMany" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/airtableTokenApi credential is not configured/);
  });
});

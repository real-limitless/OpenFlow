import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleSheetsTool";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

const CREDS = { googleSheetsOAuth2Api: { accessToken: "ya29.sheets_token" } };
const SHEET_DATA_RESPONSE = {
  range: "Sheet1!A1:B3",
  majorDimension: "ROWS",
  values: [
    ["Name", "Email"],
    ["Alice", "alice@example.com"],
  ],
};

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse(SHEET_DATA_RESPONSE)) {
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
      return response;
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
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue googleSheetsTool — n8n-nodes-base.googleSheetsTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Sheets (AI Tool)");
  });

  // Acceptance: Get all rows from a sheet (test from spec)
  it("gets all rows from a sheet", async () => {
    installFetch(mockResponse({
      range: "Sheet1!A1:B3",
      majorDimension: "ROWS",
      values: [
        ["Name", "Email"],
        ["Alice", "alice@example.com"],
      ],
    }));
    const out = await run({
      resource: "sheet",
      operation: "getAll",
      documentId: { mode: "url", value: "https://docs.google.com/spreadsheets/d/abc123/edit" },
      sheetName: { mode: "name", value: "Sheet1" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/abc123/values/Sheet1");
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      Name: "Alice",
      Email: "alice@example.com",
      row_number: 2,
    });
  });

  // Acceptance: Append a new row (test from spec)
  it("appends a new row", async () => {
    const appendResponse = {
      spreadsheetId: "abc123",
      updates: {
        spreadsheetId: "abc123",
        updatedRange: "Sheet1!A4:B4",
        updatedRows: 1,
        updatedCells: 2,
      },
    };
    installFetch(mockResponse(appendResponse));
    const out = await run(
      {
        resource: "sheet",
        operation: "append",
        documentId: { mode: "id", value: "abc123" },
        sheetName: { mode: "name", value: "Sheet1" },
        columnMapping: { mode: "auto" },
      },
      [{ name: "Bob", email: "bob@example.com" }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/abc123/values/");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.values).toEqual([["Bob", "bob@example.com"]]);
    expect(out[0][0].json).toMatchObject({
      spreadsheetId: "abc123",
      updatedRows: 1,
      updatedCells: 2,
    });
  });

  // Acceptance: Get rows with a column filter (test from spec)
  it("filters rows by column value", async () => {
    installFetch(mockResponse({
      range: "Sheet1!A1:B3",
      majorDimension: "ROWS",
      values: [
        ["Name", "Email"],
        ["Alice", "alice@example.com"],
        ["Bob", "bob@example.com"],
        ["Alice", "alice2@example.com"],
      ],
    }));
    const out = await run({
      resource: "sheet",
      operation: "getAll",
      documentId: { mode: "id", value: "abc123" },
      sheetName: { mode: "name", value: "Sheet1" },
      filters: { column: "Email", value: "alice@example.com" },
    });

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      Name: "Alice",
      Email: "alice@example.com",
    });
  });

  // Acceptance: Update an existing row (test from spec)
  it("updates an existing row", async () => {
    const mockResponses = [
      mockResponse({ range: "Sheet1!A1:B3", majorDimension: "ROWS", values: [["Name", "Email"], ["Alice Smith", "alice@example.com"]] }),
      mockResponse({
        spreadsheetId: "abc123",
        updates: { spreadsheetId: "abc123", updatedRange: "Sheet1!B2:B2", updatedRows: 1, updatedCells: 1 },
      }),
    ];
    let idx = 0;
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit | undefined) => {
        const headers: Record<string, string> = {};
        const h = init?.headers as Record<string, string> | undefined;
        if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
        calls.push({ url: String(url), method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? init.body : undefined });
        return mockResponses[idx++] ?? mockResponses[mockResponses.length - 1];
      }),
    );
    const out = await run(
      {
        resource: "sheet",
        operation: "update",
        documentId: { mode: "id", value: "abc123" },
        sheetName: { mode: "name", value: "Sheet1" },
        columnMapping: { mode: "manual", values: [{ column: "Name", value: "={{ $json.Name }}" }] },
        columnToMatchOn: "Name",
      },
      [{ rowNumber: 2, Name: "Alice Smith" }],
    );

    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe("PUT");
    expect(out[0][0].json).toMatchObject({
      spreadsheetId: "abc123",
      updatedRows: 1,
    });
  });

  // Acceptance: Create a new spreadsheet (test from spec)
  it("creates a new spreadsheet", async () => {
    const createResponse = {
      spreadsheetId: "new-id-456",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/new-id-456/edit",
      properties: { title: "My New Sheet" },
      sheets: [{ properties: { sheetId: 0, title: "Data" } }],
    };
    installFetch(mockResponse(createResponse));
    const out = await run({
      resource: "document",
      operation: "create",
      title: "My New Sheet",
      sheets: [{ title: "Data" }],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://sheets.googleapis.com/v4/spreadsheets");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.properties.title).toBe("My New Sheet");
    expect(sentBody.sheets[0].properties.title).toBe("Data");
    expect(out[0][0].json).toMatchObject({
      spreadsheetId: "new-id-456",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/new-id-456/edit",
      sheets: [{ properties: { sheetId: 0, title: "Data" } }],
    });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "sheet",
          operation: "getAll",
          documentId: { mode: "id", value: "abc123" },
          sheetName: { mode: "name", value: "Sheet1" },
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/googleSheetsOAuth2Api credential is not configured/);
  });

  it("continueOnFail emits error item and continues", async () => {
    installFetch(mockResponse({ error: { message: "Not found" } }, { status: 404 }));
    const out = await run(
      {
        resource: "sheet",
        operation: "getAll",
        documentId: { mode: "id", value: "bad-id" },
        sheetName: { mode: "name", value: "Sheet1" },
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});

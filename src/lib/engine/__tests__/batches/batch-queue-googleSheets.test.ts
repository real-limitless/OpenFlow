import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleSheets";
const CREDS = { googleSheetsOAuth2Api: { accessToken: "tok_sheets" } };

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async json() {
      return JSON.parse(text || "{}");
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];
type Handler = (url: string, method: string, body?: string) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h?: Handler) {
  calls = [];
  handler =
    h ??
    ((_url, _method) => mockResponse({}));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ url: String(url), method, body });
      return handler(String(url), method, body);
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

describe("batch-queue googleSheets — n8n-nodes-base.googleSheets", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Sheets");
  });

  it("creates a spreadsheet", async () => {
    installFetch((url, method) => {
      if (
        method === "POST" &&
        /\/v4\/spreadsheets\/?(\?|$)/.test(url) &&
        !url.includes(":batchUpdate")
      ) {
        return mockResponse({
          spreadsheetId: "ss-new",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ss-new",
          properties: { title: "Test Sheet" },
          sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "spreadsheet",
      operation: "create",
      title: "Test Sheet",
      sheetsUi: { sheetValues: [{ title: "Sheet1" }] },
      options: { locale: "en_US", autoRecalc: "ON_CHANGE" },
    });
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.spreadsheetId).toBe("ss-new");
    expect(json.spreadsheetUrl).toEqual(expect.any(String));
    expect(json.sheets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ properties: expect.objectContaining({ title: "Sheet1" }) }),
      ]),
    );
  });

  it("reads a sheet (basic)", async () => {
    installFetch((url) => {
      if (url.includes("/values/")) {
        return mockResponse({
          values: [
            ["colA", "colB", "colC", "colD"],
            ["val1", "val2", 123, "text"],
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "sheet",
      operation: "read",
      documentId: { mode: "id", value: "1ABC123" },
      sheetName: { mode: "name", value: "Sheet1" },
      options: {
        dataLocationOnSheet: { values: { rangeDefinition: "detectAutomatically" } },
        outputFormatting: {
          values: { general: "UNFORMATTED_VALUE", date: "FORMATTED_STRING" },
        },
      },
    });
    expect(out[0][0].json).toMatchObject({
      colA: "val1",
      colB: "val2",
      colC: 123,
      colD: "text",
    });
  });

  it("appends rows (auto-map)", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/values/")) {
        return mockResponse({ values: [["name", "email", "age"]] });
      }
      if (method === "POST" && url.includes(":append")) {
        return mockResponse({
          updates: {
            updatedRange: "Sheet1!A2:C2",
            updatedRows: 1,
            updatedColumns: 3,
            updatedCells: 3,
          },
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "sheet",
        operation: "append",
        documentId: { mode: "id", value: "1ABC123" },
        sheetName: { mode: "name", value: "Sheet1" },
        columns: { mappingMode: "autoMapInputData" },
        options: { cellFormat: "USER_ENTERED" },
      },
      [{ name: "Alice", email: "alice@example.com", age: 30 }],
    );
    expect(out[0][0].json).toMatchObject({
      updatedRange: "Sheet1!A2:C2",
      updatedRows: 1,
      updatedColumns: 3,
      updatedCells: 3,
    });
  });

  it("updates a row by key match", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("/values/")) {
        return mockResponse({
          values: [
            ["id", "name", "email"],
            ["row-1", "Alice", "alice@example.com"],
          ],
        });
      }
      if (method === "PUT" && url.includes("/values/")) {
        return mockResponse({
          updatedRange: "Sheet1!A2:C2",
          updatedRows: 1,
          updatedColumns: 3,
          updatedCells: 3,
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "sheet",
        operation: "update",
        documentId: { mode: "id", value: "1ABC123" },
        sheetName: { mode: "name", value: "Sheet1" },
        columns: { mappingMode: "defineBelow", value: [{ matchingColumns: ["id"] }] },
        options: {
          cellFormat: "USER_ENTERED",
          locationDefine: { values: { headerRow: 1, firstDataRow: 2 } },
        },
      },
      [{ id: "row-1", name: "Alice Updated", email: "alice@example.com" }],
    );
    expect(out[0][0].json).toMatchObject({
      updatedRange: "Sheet1!A2:C2",
      updatedRows: 1,
    });
  });

  it("reads filtered rows (return first match)", async () => {
    installFetch((url) => {
      if (url.includes("/values/")) {
        return mockResponse({
          values: [
            ["id", "name", "email"],
            ["row-1", "Alice", "alice@example.com"],
            ["row-2", "Bob", "bob@example.com"],
          ],
        });
      }
      return mockResponse({});
    });
    const out = await run(
      {
        resource: "sheet",
        operation: "read",
        documentId: { mode: "id", value: "1ABC123" },
        sheetName: { mode: "name", value: "Sheet1" },
        filtersUI: {
          values: [{ lookupColumn: "email", lookupValue: "={{ $json.searchEmail }}" }],
        },
        combineFilters: "AND",
        options: {
          returnFirstMatch: true,
          outputFormatting: { values: { general: "UNFORMATTED_VALUE" } },
        },
      },
      [{ searchEmail: "alice@example.com" }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "row-1",
      name: "Alice",
      email: "alice@example.com",
    });
  });

  it("clears whole sheet keeping header", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes(":clear")) {
        return mockResponse({ clearedRange: "Sheet1!A2:Z1000" });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "sheet",
      operation: "clear",
      documentId: { mode: "id", value: "1ABC123" },
      sheetName: { mode: "name", value: "Sheet1" },
      clear: "wholeSheet",
      keepFirstRow: true,
    });
    expect(out[0][0].json).toMatchObject({
      success: true,
      clearedRange: expect.any(String),
    });
  });

  it("creates a sheet tab", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({
          replies: [{ addSheet: { properties: { sheetId: 42, title: "NewSheet", index: 1 } } }],
        });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "sheet",
      operation: "create",
      documentId: { mode: "id", value: "1ABC123" },
      title: "NewSheet",
      options: { hidden: false, index: 1, tabColor: "0aa55c" },
    });
    expect(out[0][0].json).toMatchObject({
      sheetId: 42,
      title: "NewSheet",
      index: 1,
    });
  });

  it("deletes rows", async () => {
    installFetch((url, method) => {
      if (method === "GET" && url.includes("fields=sheets")) {
        return mockResponse({
          sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
        });
      }
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({ replies: [{}] });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "sheet",
      operation: "delete",
      documentId: { mode: "id", value: "1ABC123" },
      sheetName: { mode: "name", value: "Sheet1" },
      toDelete: "rows",
      startIndex: 5,
      numberToDelete: 2,
    });
    expect(out[0][0].json).toMatchObject({
      success: true,
      deletedRows: 2,
      startRow: 5,
    });
  });

  it("removes an entire sheet", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes(":batchUpdate")) {
        return mockResponse({ replies: [{}] });
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "sheet",
      operation: "remove",
      documentId: { mode: "id", value: "1ABC123" },
      id: "0",
    });
    expect(out[0][0].json).toMatchObject({
      success: true,
      deletedSheetId: "0",
    });
  });

  it("deletes a spreadsheet", async () => {
    installFetch((url, method) => {
      if (method === "DELETE" && url.includes("/drive/v3/files/")) {
        return mockResponse({});
      }
      return mockResponse({});
    });
    const out = await run({
      resource: "spreadsheet",
      operation: "deleteSpreadsheet",
      documentId: { mode: "id", value: "1ABC123" },
    });
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "sheet", operation: "read", documentId: { mode: "id", value: "x" } },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/credential is not configured/);
  });
});

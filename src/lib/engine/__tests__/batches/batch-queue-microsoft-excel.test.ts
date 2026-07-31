import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftExcel";
const CREDS = { microsoftExcelOAuth2Api: { accessToken: "mock-token" } };

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      forEach(cb: (v: string, k: string) => void) {
        map.forEach((v, k) => cb(v, k));
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return text ? JSON.parse(text) : null;
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
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse({}),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
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

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue microsoftExcel — n8n-nodes-base.microsoftExcel", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Microsoft Excel");
  });

  describe("table", () => {
    it("getRows - returns rows from a table", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1/columns":
          mockResponse({
            value: [{ name: "Name" }, { name: "Age" }],
          }),
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1/rows":
          mockResponse({
            value: [
              { index: 0, values: [["Alice", 30]] },
              { index: 1, values: [["Bob", 25]] },
            ],
          }),
      });
      const out = await run({
        resource: "table",
        operation: "getRows",
        workbook: "wb1",
        worksheet: "ws1",
        table: "t1",
      });

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ Name: "Alice", Age: 30 });
      expect(out[0][1].json).toMatchObject({ Name: "Bob", Age: 25 });
    });

    it("append - appends a row to a table", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1/columns":
          mockResponse({
            value: [{ name: "Name" }, { name: "Age" }],
          }),
        "POST https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1/rows":
          mockResponse({
            range: "Sheet1!A3:B3",
          }),
      });
      const out = await run(
        {
          resource: "table",
          operation: "append",
          workbook: "wb1",
          worksheet: "ws1",
          table: "t1",
        },
        [{ Name: "Charlie", Age: 35 }],
      );

      expect(out[0][0].json).toMatchObject({ Name: "Charlie", Age: 35, range: "Sheet1!A3:B3" });
      const body = JSON.parse(calls[1].body!);
      expect(body.values).toEqual([["Charlie", 35]]);
    });

    it("lookup - finds a matching row", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1/columns":
          mockResponse({
            value: [{ name: "Email" }, { name: "Name" }],
          }),
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1/rows":
          mockResponse({
            value: [
              { index: 0, values: [["alice@example.com", "Alice"]] },
              { index: 1, values: [["bob@example.com", "Bob"]] },
            ],
          }),
      });
      const out = await run({
        resource: "table",
        operation: "lookup",
        workbook: "wb1",
        worksheet: "ws1",
        table: "t1",
        columnToMatchOn: "Email",
        valueToMatch: "bob@example.com",
      });

      expect(out[0][0].json).toMatchObject({ Email: "bob@example.com", Name: "Bob" });
    });

    it("getColumns - returns column names", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1/columns":
          mockResponse({
            value: [{ name: "ID" }, { name: "Name" }, { name: "Score" }],
          }),
      });
      const out = await run({
        resource: "table",
        operation: "getColumns",
        workbook: "wb1",
        worksheet: "ws1",
        table: "t1",
      });

      expect(out[0]).toHaveLength(3);
      expect(out[0][0].json).toMatchObject({ column: "ID", index: 0 });
      expect(out[0][1].json).toMatchObject({ column: "Name", index: 1 });
      expect(out[0][2].json).toMatchObject({ column: "Score", index: 2 });
    });

    it("addTable - creates a table from a range", async () => {
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables":
          mockResponse({
            id: "t2",
            name: "Table2",
            address: "A1:C10",
          }),
      });
      const out = await run({
        resource: "table",
        operation: "addTable",
        workbook: "wb1",
        worksheet: "ws1",
        range: "A1:C10",
        hasHeaders: true,
      });

      expect(out[0][0].json).toMatchObject({ id: "t2", name: "Table2", address: "A1:C10" });
      const body = JSON.parse(calls[0].body!);
      expect(body).toMatchObject({ address: "A1:C10", hasHeaders: true });
    });

    it("deleteTable - passes input items through", async () => {
      installFetch({
        "DELETE https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1":
          mockResponse("", { status: 204 }),
      });
      const out = await run(
        {
          resource: "table",
          operation: "deleteTable",
          workbook: "wb1",
          worksheet: "ws1",
          table: "t1",
        },
        [{ myField: "keep" }],
      );

      expect(out[0][0].json).toMatchObject({ myField: "keep" });
    });

    it("convertToRange - converts table to range", async () => {
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/tables/t1/convertToRange":
          mockResponse({
            address: "A1:C10",
          }),
      });
      const out = await run({
        resource: "table",
        operation: "convertToRange",
        workbook: "wb1",
        worksheet: "ws1",
        table: "t1",
      });

      expect(out[0][0].json).toMatchObject({ address: "A1:C10", success: true });
    });
  });

  describe("workbook", () => {
    it("getAll - lists accessible workbooks", async () => {
      const workbooks = [
        {
          id: "wb1",
          name: "report.xlsx",
          webUrl: "https://1drv.ms/u/wb1",
          createdDateTime: "2024-01-01T00:00:00Z",
          lastModifiedDateTime: "2024-06-01T00:00:00Z",
          size: 1024,
        },
        {
          id: "wb2",
          name: "data.xlsx",
          webUrl: "https://1drv.ms/u/wb2",
          createdDateTime: "2024-02-01T00:00:00Z",
          lastModifiedDateTime: "2024-06-15T00:00:00Z",
          size: 2048,
        },
      ];
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/root/search(q='.xlsx')": mockResponse({
          value: workbooks,
        }),
      });
      const out = await run({
        resource: "workbook",
        operation: "getAll",
      });

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: "wb1", name: "report.xlsx" });
      expect(out[0][1].json).toMatchObject({ id: "wb2", name: "data.xlsx" });
    });

    it("addWorksheet - creates a new worksheet", async () => {
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets":
          mockResponse({
            id: "sheet2",
            name: "Sheet2",
            position: 1,
          }),
      });
      const out = await run({
        resource: "workbook",
        operation: "addWorksheet",
        workbook: "wb1",
        worksheet: "Sheet2",
      });

      expect(out[0][0].json).toMatchObject({ id: "sheet2", name: "Sheet2", position: 1 });
      const body = JSON.parse(calls[0].body!);
      expect(body).toEqual({ name: "Sheet2" });
    });

    it("deleteWorkbook - passes input items through", async () => {
      installFetch({
        "DELETE https://graph.microsoft.com/v1.0/me/drive/items/wb1": mockResponse("", {
          status: 204,
        }),
      });
      const out = await run(
        {
          resource: "workbook",
          operation: "deleteWorkbook",
          workbook: "wb1",
        },
        [{ myField: "keep" }],
      );

      expect(out[0][0].json).toMatchObject({ myField: "keep" });
    });
  });

  describe("worksheet", () => {
    it("getAll - lists worksheets", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets": mockResponse(
          {
            value: [
              { id: "sheet1", name: "Sheet1", position: 0, visibility: "Visible" },
              { id: "sheet2", name: "Sheet2", position: 1, visibility: "Visible" },
            ],
          },
        ),
      });
      const out = await run({
        resource: "worksheet",
        operation: "getAll",
        workbook: "wb1",
      });

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: "sheet1", name: "Sheet1" });
      expect(out[0][1].json).toMatchObject({ id: "sheet2", name: "Sheet2" });
    });

    it("readRows - reads rows from a worksheet", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/usedRange":
          mockResponse({
            values: [
              ["Name", "Age", "City"],
              ["Alice", "30", "NYC"],
              ["Bob", "25", "LA"],
            ],
          }),
      });
      const out = await run({
        resource: "worksheet",
        operation: "readRows",
        workbook: "wb1",
        worksheet: "ws1",
        dataStartRow: 1,
      });

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ Name: "Alice", Age: "30", City: "NYC" });
      expect(out[0][1].json).toMatchObject({ Name: "Bob", Age: "25", City: "LA" });
    });

    it("append - writes a row to a worksheet", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/range(address='A1')":
          mockResponse({
            values: [["Name", "Age"]],
          }),
        "PATCH https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/range(address='A3%3AB3')":
          mockResponse({
            address: "A3:B3",
          }),
      });
      const out = await run(
        {
          resource: "worksheet",
          operation: "append",
          workbook: "wb1",
          worksheet: "ws1",
          dataStartRow: 1,
        },
        [{ Name: "Charlie", Age: "35" }],
      );

      expect(out[0][0].json).toMatchObject({ Name: "Charlie", Age: "35", range: "A2:B2" });
    });

    it("clear - clears a range", async () => {
      installFetch({
        "POST https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/usedRange/clear":
          mockResponse({}),
      });
      const out = await run(
        {
          resource: "worksheet",
          operation: "clear",
          workbook: "wb1",
          worksheet: "ws1",
        },
        [{ myField: "keep" }],
      );

      expect(out[0][0].json).toMatchObject({ myField: "keep" });
    });

    it("deleteWorksheet - passes input items through", async () => {
      installFetch({
        "DELETE https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1":
          mockResponse("", { status: 204 }),
      });
      const out = await run(
        {
          resource: "worksheet",
          operation: "deleteWorksheet",
          workbook: "wb1",
          worksheet: "ws1",
        },
        [{ myField: "keep" }],
      );

      expect(out[0][0].json).toMatchObject({ myField: "keep" });
    });

    it("update - updates a matching row", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/usedRange":
          mockResponse({
            values: [
              ["Email", "Name", "Score"],
              ["alice@example.com", "Alice", "90"],
              ["bob@example.com", "Bob", "85"],
            ],
          }),
        "PATCH https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/range(address='A3%3AC3')":
          mockResponse({
            address: "A3:C3",
          }),
      });
      const out = await run(
        {
          resource: "worksheet",
          operation: "update",
          workbook: "wb1",
          worksheet: "ws1",
          columnToMatchOn: "Email",
          valueToMatch: "bob@example.com",
        },
        [{ Email: "bob@example.com", Name: "Bob", Score: "95" }],
      );

      expect(out[0][0].json).toMatchObject({ Email: "bob@example.com", Name: "Bob", Score: "95" });
    });

    it("upsert - updates existing row", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/usedRange":
          mockResponse({
            values: [
              ["Email", "Name"],
              ["alice@example.com", "Alice"],
            ],
          }),
        "PATCH https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/range(address='A2%3AB2')":
          mockResponse({
            address: "A2:B2",
          }),
      });
      const out = await run(
        {
          resource: "worksheet",
          operation: "upsert",
          workbook: "wb1",
          worksheet: "ws1",
          columnToMatchOn: "Email",
          valueToMatch: "alice@example.com",
        },
        [{ Email: "alice@example.com", Name: "Alice Updated" }],
      );

      expect(out[0][0].json).toMatchObject({ Email: "alice@example.com", Name: "Alice Updated" });
    });

    it("upsert - inserts new row when no match", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/usedRange":
          mockResponse({
            values: [
              ["Email", "Name"],
              ["alice@example.com", "Alice"],
            ],
          }),
        "PATCH https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets/ws1/range(address='A3%3AB3')":
          mockResponse({
            address: "A3:B3",
          }),
      });
      const out = await run(
        {
          resource: "worksheet",
          operation: "upsert",
          workbook: "wb1",
          worksheet: "ws1",
          columnToMatchOn: "Email",
          valueToMatch: "charlie@example.com",
        },
        [{ Email: "charlie@example.com", Name: "Charlie" }],
      );

      expect(out[0][0].json).toMatchObject({ Email: "charlie@example.com", Name: "Charlie" });
    });
  });

  describe("authentication", () => {
    it("sends Bearer token from microsoftExcelOAuth2Api credential", async () => {
      installFetch({
        "GET https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets": mockResponse(
          { value: [] },
        ),
      });
      await run({ resource: "worksheet", operation: "getAll", workbook: "wb1" }, [{}], {
        credentials: { microsoftExcelOAuth2Api: { accessToken: "my-token" } },
      });
      expect(calls[0].url).toBe(
        "https://graph.microsoft.com/v1.0/me/drive/items/wb1/workbook/worksheets",
      );
    });

    it("throws when no credential is configured", async () => {
      await expect(
        run({ resource: "worksheet", operation: "getAll", workbook: "wb1" }, [{}], {
          credentials: {},
        }),
      ).rejects.toThrow(/Microsoft credential is required/);
    });
  });

  describe("continueOnFail", () => {
    it("returns error item when continueOnFail is enabled", async () => {
      installFetch({}, mockResponse({ error: { message: "not found" } }, { status: 404 }));
      const out = await run(
        {
          resource: "table",
          operation: "getRows",
          workbook: "wb1",
          worksheet: "ws1",
          table: "nonexistent",
        },
        [{}],
        { continueOnFail: true },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect(String(out[0][0].json.error)).toContain("not found");
    });
  });
});

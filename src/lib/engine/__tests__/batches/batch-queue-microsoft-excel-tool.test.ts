import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.microsoftExcelTool";

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

const CREDS = { microsoftExcelOAuth2Api: { accessToken: "mock_excel_token" } };

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({})) {
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
): Promise<INodeExecutionData[][]> {
  const normalized: INodeExecutionData[] = inputItems.map((item) =>
    item && typeof item === "object" && "json" in item
      ? (item as INodeExecutionData)
      : { json: item as Record<string, unknown> },
  );
  const node = makeNode({ name: "ExcelTool", type: TYPE, parameters });
  const ctx = makeCtx(normalized, node, opts?.continueOnFail, opts?.credentials ?? CREDS);
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`Executor ${TYPE} not registered`);
  return executor(ctx, node);
}

describe("microsoftExcelTool", () => {
  beforeEach(() => {
    installFetch(mockResponse({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("registration", () => {
    it("should be registered", () => {
      expect(hasExecutor(TYPE)).toBe(true);
    });
  });

  describe("table append", () => {
    it("should POST rows to table and return items with range", async () => {
      const appendResponse = mockResponse({ range: "Sheet1!A1:B3" });
      installFetch(appendResponse);

      const input = [{ json: { Name: "Alice", Age: 30 } }, { json: { Name: "Bob", Age: 25 } }];
      const result = await run(
        { resource: "table", operation: "append", workbook: "wb-1", worksheet: "Sheet1", table: "Table1" },
        input,
      );

      expect(result[0]).toHaveLength(2);
      expect(result[0][0].json).toHaveProperty("range", "Sheet1!A1:B3");

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toContain("/workbook/worksheets/Sheet1/tables/Table1/rows/add");
      const body = JSON.parse(calls[0].body ?? "{}");
      expect(body.values).toEqual([["Alice", 30], ["Bob", 25]]);
    });

    it("should not throw on $fromAI() expressions", async () => {
      const appendResponse = mockResponse({ range: "Sheet1!A1:B3" });
      installFetch(appendResponse);

      const result = await run(
        {
          resource: "table",
          operation: "append",
          workbook: "= $fromAI('workbook')",
          worksheet: "= $fromAI('worksheet')",
          table: "= $fromAI('table')",
        },
        [{ json: { Name: "Alice", Age: 30 } }],
      );

      expect(result[0]).toHaveLength(1);
      expect(calls).toHaveLength(1);
    });
  });

  describe("table lookup", () => {
    it("should find matching row by column value", async () => {
      const lookupResponse = mockResponse({
        value: [
          { values: [["alice@example.com", "Alice"]], cellAddress: "Email,Name" },
          { values: [["bob@example.com", "Bob"]], cellAddress: "Email,Name" },
        ],
      });
      installFetch(lookupResponse);

      const result = await run(
        {
          resource: "table",
          operation: "lookup",
          workbook: "wb-1",
          worksheet: "Sheet1",
          table: "Table1",
          columnToMatchOn: "Email",
          value: "alice@example.com",
        },
        [{ json: { email: "alice@example.com" } }],
      );

      expect(result[0]).toHaveLength(1);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("/rows");
    });
  });

  describe("workbook getAll", () => {
    it("should list Excel files from drive root", async () => {
      const driveResponse = mockResponse({
        value: [
          { id: "f1", name: "report.xlsx", webUrl: "https://..." },
          { id: "f2", name: "notes.txt", webUrl: "https://..." },
          { id: "f3", name: "data.xls", webUrl: "https://..." },
        ],
      });
      installFetch(driveResponse);

      const result = await run(
        { resource: "workbook", operation: "getAll" },
      );

      expect(result[0]).toHaveLength(2);
      expect(result[0][0].json.name).toBe("report.xlsx");
      expect(result[0][1].json.name).toBe("data.xls");
      expect(calls[0].url).toContain("/me/drive/root/children");
    });
  });

  describe("worksheet readRows", () => {
    it("should return items per row with column headers", async () => {
      const rangeResponse = mockResponse({
        range: "Sheet1!A1:B3",
        values: [
          ["Name", "Email"],
          ["Alice", "alice@example.com"],
          ["Bob", "bob@example.com"],
        ],
      });
      installFetch(rangeResponse);

      const result = await run(
        { resource: "worksheet", operation: "readRows", workbook: "wb-1", worksheet: "Sheet1" },
      );

      expect(result[0]).toHaveLength(2);
      expect(result[0][0].json.Name).toBe("Alice");
      expect(result[0][0].json.Email).toBe("alice@example.com");
      expect(result[0][1].json.Name).toBe("Bob");
      expect(calls[0].url).toContain("/worksheets/Sheet1/range");
    });
  });

  describe("worksheet delete", () => {
    it("should pass through items on successful deletion", async () => {
      installFetch(mockResponse(null, { status: 204 }));

      const result = await run(
        { resource: "worksheet", operation: "deleteWorksheet", workbook: "wb-1", worksheet: "Sheet1" },
        [{ json: { id: 1 } }],
      );

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.id).toBe(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/worksheets/Sheet1");
    });
  });

  describe("error handling", () => {
    it("should propagate API errors", async () => {
      installFetch(mockResponse({ error: { message: "Resource not found" } }, { status: 404 }));

      await expect(
        run(
          { resource: "table", operation: "append", workbook: "wb-1", worksheet: "Sheet1", table: "Table1" },
          [{ json: { Name: "Alice" } }],
        ),
      ).rejects.toThrow("Resource not found");
    });

    it("should emit error item when continueOnFail is true", async () => {
      installFetch(mockResponse({ error: { message: "Not found" } }, { status: 404 }));

      const result = await run(
        { resource: "table", operation: "append", workbook: "wb-1", worksheet: "Sheet1", table: "Table1" },
        [{ json: { Name: "Alice" } }],
        { continueOnFail: true },
      );

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toHaveProperty("error");
    });
  });
});

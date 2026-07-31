import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleSheets";
const CREDS = { googleSheetsOAuth2Api: { accessToken: "tok_sheets" } };

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

type Handler = (url: string, method: string) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h: Handler) {
  handler = h;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) =>
      handler(String(url), init?.method ?? "GET"),
    ),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleSheetsOAuth2Api: { name: "googleSheetsOAuth2Api" } },
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
    continueOnFail: false,
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

describe("googleSheets executor – acceptance tests", () => {
  it("Spreadsheet Create", async () => {
    installFetch((url, method) => {
      if (
        method === "POST" &&
        /\/v4\/spreadsheets\/?(\?|$)/.test(url) &&
        !url.includes(":batchUpdate")
      ) {
        return mockResponse({
          spreadsheetId: "ss1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ss1",
          properties: { title: "Test" },
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
    const json = out[0][0].json as Record<string, unknown>;
    expect(json).toHaveProperty("spreadsheetId");
    expect(json).toHaveProperty("spreadsheetUrl");
    expect(json).toHaveProperty("sheets");
  });

  it("Sheet Append (Auto-Map)", async () => {
    installFetch((url, method) => {
      if (method === "GET") return mockResponse({ values: [["name", "email", "age"]] });
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

  it("Sheet Append or Update (Upsert) appends when missing", async () => {
    installFetch((url, method) => {
      if (method === "GET") {
        return mockResponse({
          values: [
            ["id", "name", "email"],
            ["row-1", "Alice", "a@x.com"],
          ],
        });
      }
      if (method === "POST" && url.includes(":append")) {
        return mockResponse({
          updates: {
            updatedRange: "Sheet1!A3:C3",
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
        operation: "appendOrUpdate",
        documentId: { mode: "id", value: "1ABC123" },
        sheetName: { mode: "name", value: "Sheet1" },
        columns: { mappingMode: "defineBelow", value: [{ matchingColumns: ["id"] }] },
        options: {
          cellFormat: "USER_ENTERED",
          locationDefine: { values: { headerRow: 1, firstDataRow: 2 } },
        },
      },
      [{ id: "row-2", name: "Bob", email: "bob@example.com" }],
    );
    expect(out[0][0].json).toMatchObject({
      updatedRange: "Sheet1!A3:C3",
      updatedRows: 1,
    });
  });
});

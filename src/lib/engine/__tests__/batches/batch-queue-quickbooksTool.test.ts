import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.quickbooksTool";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return name.toLowerCase() === "content-type" ? "application/json" : null; },
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
let responseQueue: ReturnType<typeof mockResponse>[];

function installFetch(
  responses: ReturnType<typeof mockResponse> | ReturnType<typeof mockResponse>[] = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

function jsonBody(call: FetchCall): unknown {
  if (!call.body) return undefined;
  try { return JSON.parse(call.body); } catch { return call.body; }
}

const testCred = () => ({ accessToken: "test-access-token", companyId: "1234567890" });

describe("batch-queue quickbooksTool — n8n-nodes-base.quickbooksTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("QuickBooks Online (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.quickbooksTool")).toBe(getExecutor(TYPE));
  });

  describe("create invoice", () => {
    it("sends POST with additionalFields as entity body", async () => {
      responseQueue = [mockResponse({
        Invoice: { Id: "123", SyncToken: "0", TotalAmt: 100 },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "invoice",
          operation: "create",
          additionalFields: JSON.stringify({
            Line: [{ DetailType: "SalesItemLineDetail", Amount: 100 }],
            CustomerRef: { value: "1" },
          }),
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ Id: "123", TotalAmt: 100 });
      expect(lastCall().url).toBe("https://quickbooks.api.intuit.com/v3/company/1234567890/invoice");
      expect(lastCall().method).toBe("POST");
      const body = jsonBody(lastCall()) as Record<string, unknown>;
      expect(body.Invoice).toBeDefined();
      const invoice = body.Invoice as Record<string, unknown>;
      expect(invoice.Line).toBeDefined();
      expect(invoice.CustomerRef).toMatchObject({ value: "1" });
    });
  });

  describe("get all customers with date filter", () => {
    it("sends query with filter string", async () => {
      responseQueue = [mockResponse({
        QueryResponse: { Customer: [{ Id: "1", DisplayName: "Alice" }] },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "customer",
          operation: "getAll",
          filters: { query: "WHERE MetaData.CreateTime > '2024-01-01T00:00:00'" },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ Id: "1", DisplayName: "Alice" });
      expect(lastCall().url).toContain("/query");
      expect(lastCall().url).toContain("query=select+*+from+Customer+WHERE+MetaData.CreateTime+%3E+%272024-01-01T00%3A00%3A00%27");
    });
  });

  describe("get vendor by ID (dynamic from $fromAI)", () => {
    it("resolves id and sends GET", async () => {
      responseQueue = [mockResponse({ Vendor: { Id: "42", DisplayName: "Acme Supply" } })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "vendor",
          operation: "get",
          id: "={{ $json.vendorId }}",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { vendorId: "42" } }],
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ Id: "42", DisplayName: "Acme Supply" });
      expect(lastCall().url).toContain("/vendor/42");
    });
  });

  describe("get transaction report with predefined date range", () => {
    it("sends GET to /reports with date_macro and columns", async () => {
      responseQueue = [mockResponse({
        Rows: {
          Row: [
            { ColData: [{ value: "Income" }, { value: "5000" }], type: "Data" },
          ],
        },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "transaction",
          operation: "getReport",
          filters: {
            date_macro: "Last Fiscal Year",
            columns: "tx_date,txn_type,name,amount",
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(lastCall().url).toContain("/reports/TransactionList");
      expect(lastCall().url).toContain("date_macro=Last+Fiscal+Year");
      expect(lastCall().url).toContain("columns=tx_date%2Ctxn_type%2Cname%2Camount");
      expect(lastCall().method).toBe("GET");
    });
  });

  describe("delete estimate", () => {
    it("sends delete request for estimate", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "estimate",
          operation: "delete",
          id: "={{ $json.estimateId }}",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { estimateId: "789" } }],
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ status: "Deleted", id: "789" });
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true and id is missing for get", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "invoice",
          operation: "get",
          id: "",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.stringContaining("id is required"), code: 500 } });
    });
  });
});

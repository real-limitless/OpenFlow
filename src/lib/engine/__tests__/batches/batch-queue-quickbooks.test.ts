import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.quickbooks";

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

describe("batch-queue quickbooks — n8n-nodes-base.quickbooks", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("QuickBooks Online");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.quickbooks")).toBe(getExecutor(TYPE));
  });

  describe("create invoice", () => {
    it("sends POST with additionalFields as the entity body", async () => {
      responseQueue = [mockResponse({
        Invoice: { Id: "123", SyncToken: "0", CustomerRef: { name: "Acme Corp" } },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "invoice",
          operation: "create",
          additionalFields: {
            fields: JSON.stringify({
              CustomerRef: { name: "Acme Corp" },
              Line: [{ DetailType: "SalesItemLineDetail", Amount: 100, Description: "Consulting" }],
            }),
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { customerName: "Acme Corp" } }],
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ Id: "123", SyncToken: "0" });
      expect(lastCall().url).toContain("/v3/company/1234567890/query");
      const body = jsonBody(lastCall()) as Record<string, unknown>;
      expect(body.Invoice).toBeDefined();
      expect((body.Invoice as Record<string, unknown>).Line).toBeDefined();
    });
  });

  describe("get all customers with filter", () => {
    it("sends query with filter string", async () => {
      responseQueue = [mockResponse({
        QueryResponse: { Customer: [{ Id: "1", DisplayName: "Alice" }, { Id: "2", DisplayName: "Bob" }] },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "customer",
          operation: "getAll",
          queryFilter: "WHERE Active = true MAXRESULTS 10",
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
      const result = out[0][0].json as Record<string, unknown>;
      const items = result.results as Record<string, unknown>[];
      expect(Array.isArray(items)).toBe(true);
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({ Id: "1", DisplayName: "Alice" });
      expect(lastCall().url).toContain("query");
    });
  });

  describe("update bill", () => {
    it("sends POST with updateFields including SyncToken", async () => {
      responseQueue = [mockResponse({
        Bill: { Id: "123", SyncToken: "3", TotalAmt: 250 },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "bill",
          operation: "update",
          id: "={{ $json.billId }}",
          updateFields: {
            fields: JSON.stringify({
              SyncToken: "={{ $json.syncToken }}",
              TotalAmt: 250,
            }),
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { billId: "123", syncToken: "2" } }],
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ Id: "123", SyncToken: "3", TotalAmt: 250 });
    });
  });

  describe("delete estimate", () => {
    it("sends delete request for estimate", async () => {
      responseQueue = [mockResponse({})];
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
        getNodeInputItems: () => [{ json: { estimateId: "456" } }],
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ status: "Deleted", id: "456" });
    });
  });

  describe("missing ID on get operation", () => {
    it("fails with validation error", async () => {
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
        continueOnFail: false,
        getCredential: async () => testCred(),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow(/id is required/);
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true and operation fails", async () => {
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
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String), code: 500 } });
    });
  });

  describe("send operation", () => {
    it("sends send request and returns entity", async () => {
      responseQueue = [mockResponse({
        Invoice: { Id: "123", EmailStatus: "EmailSent" },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "invoice",
          operation: "send",
          id: "123",
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
      expect(out[0][0].json).toMatchObject({ Id: "123", EmailStatus: "EmailSent" });
    });
  });

  describe("void operation", () => {
    it("sends void request and returns voided entity", async () => {
      responseQueue = [mockResponse({
        Invoice: { Id: "123", SyncToken: "1" },
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "invoice",
          operation: "void",
          id: "123",
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
      expect(out[0][0].json).toMatchObject({ Id: "123" });
    });
  });
});

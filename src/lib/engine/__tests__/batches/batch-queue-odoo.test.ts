import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.odoo";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockJResponse(body: unknown, init: MockResponseInit = {}) {
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
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
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
let responseQueue: Array<ReturnType<typeof mockJResponse>>;

function installFetch() {
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
    const next = responseQueue.shift() ?? mockJResponse({});
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

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async () => ({
      siteUrl: "https://my-odoo.example.com",
      database: "testdb",
      username: "admin",
      password: "secret",
    }),
  });
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const ctx = makeCtx(
    inputItems.map((i) => ({ json: i })),
    node,
    opts?.continueOnFail,
  );
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  responseQueue = [];
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue odoo — n8n-nodes-base.odoo", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Odoo");
  });

  describe("create a contact", () => {
    it("authenticates and creates a contact via JSON-RPC", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({ jsonrpc: "2.0", id: 2, result: 99 }),
        mockJResponse({
          jsonrpc: "2.0", id: 3,
          result: [{ id: 99, name: "OpenFlow test contact", email: "openflow@example.test" }],
        }),
      ];

      const out = await run({
        resource: "contact",
        operation: "create",
        fields: { name: "OpenFlow test contact", email: "openflow@example.test" },
      });

      expect(calls.length).toBe(3);
      expect(calls[0].url).toBe("https://my-odoo.example.com/jsonrpc");
      expect(calls[0].method).toBe("POST");

      const authBody = jsonBody(calls[0]) as Record<string, unknown>;
      expect((authBody.params as Record<string, unknown>).method).toBe("authenticate");

      const createBody = jsonBody(calls[1]) as Record<string, unknown>;
      const createParams = createBody.params as Record<string, unknown>;
      expect(createParams.method).toBe("execute_kw");
      expect((createParams.args as unknown[])[3]).toBe("res.partner");

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 99, name: "OpenFlow test contact" });
    });

    it("throws on authentication failure", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: false }),
      ];

      await expect(
        run({ resource: "contact", operation: "create", fields: { name: "Test" } }),
      ).rejects.toThrow(/authentication failed/);
    });

    it("throws on RPC error", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({
          jsonrpc: "2.0", id: 2,
          error: { code: 200, message: "Model res.partner does not exist" },
        }),
      ];

      await expect(
        run({ resource: "contact", operation: "create", fields: { name: "Test" } }),
      ).rejects.toThrow(/Model res.partner does not exist/);
    });
  });

  describe("get a contact", () => {
    it("reads a record by ID", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({
          jsonrpc: "2.0", id: 2,
          result: [{ id: 42, name: "Alice", email: "alice@test.com" }],
        }),
      ];

      const out = await run({
        resource: "contact",
        operation: "get",
        recordId: "42",
      });

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 42, name: "Alice" });
    });

    it("throws when record is not found", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({ jsonrpc: "2.0", id: 2, result: [] }),
      ];

      await expect(
        run({ resource: "contact", operation: "get", recordId: "999" }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("update a contact", () => {
    it("writes fields and returns the updated record", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({ jsonrpc: "2.0", id: 2, result: true }),
        mockJResponse({
          jsonrpc: "2.0", id: 3,
          result: [{ id: 42, name: "Renamed by OpenFlow" }],
        }),
      ];

      const out = await run({
        resource: "contact",
        operation: "update",
        recordId: "42",
        fields: { name: "Renamed by OpenFlow" },
      });

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 42, name: "Renamed by OpenFlow" });

      const writeBody = jsonBody(calls[1]) as Record<string, unknown>;
      const writeArgs = (writeBody.params as Record<string, unknown>).args as unknown[];
      expect(writeArgs[4]).toBe("write");
      expect(writeArgs[5]).toEqual([[42], { name: "Renamed by OpenFlow" }]);
    });
  });

  describe("delete a contact", () => {
    it("unlinks a record and returns success", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({ jsonrpc: "2.0", id: 2, result: true }),
      ];

      const out = await run({
        resource: "contact",
        operation: "delete",
        recordId: "42",
      });

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 42, success: true });

      const deleteBody = jsonBody(calls[1]) as Record<string, unknown>;
      const deleteArgs = (deleteBody.params as Record<string, unknown>).args as unknown[];
      expect(deleteArgs[4]).toBe("unlink");
      expect(deleteArgs[5]).toEqual([[42]]);
    });
  });

  describe("getAll notes with limit", () => {
    it("returns no more than limit items", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({
          jsonrpc: "2.0", id: 2,
          result: [
            { id: 1, name: "Note 1", memo: "First" },
            { id: 2, name: "Note 2", memo: "Second" },
          ],
        }),
      ];

      const out = await run({
        resource: "note",
        operation: "getAll",
        returnAll: false,
        limit: 2,
      });

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: 1, name: "Note 1" });
      expect(out[0][1].json).toMatchObject({ id: 2, name: "Note 2" });

      const readBody = jsonBody(calls[1]) as Record<string, unknown>;
      const readKwargs = (readBody.params as Record<string, unknown>).args as unknown[];
      expect(readKwargs[6]).toMatchObject({ limit: 2 });
    });
  });

  describe("custom resource", () => {
    it("uses the user-supplied model name", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({ jsonrpc: "2.0", id: 2, result: 100 }),
        mockJResponse({
          jsonrpc: "2.0", id: 3,
          result: [{ id: 100, x_name: "Custom Item" }],
        }),
      ];

      const out = await run({
        resource: "customResource",
        customResourceModel: "x_custom.model",
        operation: "create",
        fields: { x_name: "Custom Item" },
      });

      expect(out[0]).toHaveLength(1);

      const createCall = jsonBody(calls[1]) as Record<string, unknown>;
      const createArgs = (createCall.params as Record<string, unknown>).args as unknown[];
      expect(createArgs[3]).toBe("x_custom.model");
    });
  });

  describe("expression resolution", () => {
    it("resolves ={{ $json.field }} expressions in recordId", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({
          jsonrpc: "2.0", id: 2,
          result: [{ id: 77, name: "From expression" }],
        }),
      ];

      const out = await run(
        { resource: "contact", operation: "get", recordId: "={{ $json.contactId }}" },
        [{ contactId: 77 }],
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 77 });

      const readCall = jsonBody(calls[1]) as Record<string, unknown>;
      const readArgs = (readCall.params as Record<string, unknown>).args as unknown[];
      expect(readArgs[5]).toEqual([77]);
    });
  });

  describe("continueOnFail", () => {
    it("returns error items on failure instead of throwing", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: false }),
      ];

      const out = await run(
        { resource: "contact", operation: "create", fields: { name: "Test" } },
        [{}],
        { continueOnFail: true },
      );

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({ code: 500 });
    });
  });

  describe("service error is surfaced", () => {
    it("fails with the Odoo error message preserved", async () => {
      responseQueue = [
        mockJResponse({ jsonrpc: "2.0", id: 1, result: 42 }),
        mockJResponse({
          jsonrpc: "2.0", id: 2,
          error: { code: 404, message: "Model not found" },
        }),
      ];

      await expect(
        run({ resource: "contact", operation: "get", recordId: "999" }),
      ).rejects.toThrow(/Model not found/);
    });
  });
});
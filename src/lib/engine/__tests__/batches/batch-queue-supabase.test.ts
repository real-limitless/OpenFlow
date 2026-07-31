import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.supabase";

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
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
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

const supabaseCred = { host: "abc123.supabase.co", secretKey: "service-role-key-xyz" };

describe("batch-queue supabase — n8n-nodes-base.supabase", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Supabase");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.supabase")).toBe(getExecutor(TYPE));
  });

  describe("create row with auto-mapped data", () => {
    it("sends POST to /rest/v1/<table> with auto-mapped body", async () => {
      responseQueue = [mockResponse([{ id: 1, name: "Alice", email: "alice@example.com" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "create",
          tableId: "users",
          dataToSend: "autoMapInputData",
          inputsToIgnore: "",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { name: "Alice", email: "alice@example.com" } }],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 1, name: "Alice", email: "alice@example.com" });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/rest/v1/users");
      expect(call.headers["Prefer"]).toBe("return=representation");
      expect(jsonBody(call)).toMatchObject({ name: "Alice", email: "alice@example.com" });
    });
  });

  describe("create row with defineBelow fields", () => {
    it("uses fieldsUi fieldValues as body", async () => {
      responseQueue = [mockResponse([{ id: 2, role: "admin" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "create",
          tableId: "profiles",
          dataToSend: "defineBelow",
          fieldsUi: {
            fieldValues: [{ fieldId: "role", fieldValue: "admin" }],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(jsonBody(lastCall())).toMatchObject({ role: "admin" });
    });
  });

  describe("get single row with manual filter", () => {
    it("sends GET with filter query params", async () => {
      responseQueue = [mockResponse([{ id: 1, name: "Alice" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "get",
          tableId: "users",
          filters: {
            conditions: [{ keyName: "id", condition: "eq", keyValue: "1" }],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 1, name: "Alice" });
      const call = lastCall();
      expect(call.url).toContain("id=eq.1");
    });
  });

  describe("getAll with manual filters (allFilters)", () => {
    it("sends GET with multiple filter params", async () => {
      responseQueue = [mockResponse([{ id: 1, name: "Alice", age: 25 }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "getAll",
          tableId: "users",
          returnAll: true,
          filterType: "manual",
          matchType: "allFilters",
          filters: {
            conditions: [
              { keyName: "age", condition: "gte", keyValue: "18" },
              { keyName: "status", condition: "eq", keyValue: "active" },
            ],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const call = lastCall();
      expect(call.url).toContain("age=gte.18");
      expect(call.url).toContain("status=eq.active");
      expect(call.url).toContain("select=*");
    });
  });

  describe("getAll with manual filters (anyFilter)", () => {
    it("sends GET with or() syntax", async () => {
      responseQueue = [mockResponse([{ id: 1, name: "Alice" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "getAll",
          tableId: "users",
          returnAll: true,
          filterType: "manual",
          matchType: "anyFilter",
          filters: {
            conditions: [
              { keyName: "name", condition: "eq", keyValue: "Alice" },
              { keyName: "name", condition: "eq", keyValue: "Bob" },
            ],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const call = lastCall();
      expect(call.url).toContain("or=%28name.eq.Alice%2Cname.eq.Bob%29");
    });
  });

  describe("getAll with string filter", () => {
    it("sends GET with raw filter string", async () => {
      responseQueue = [mockResponse([{ id: 1 }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "getAll",
          tableId: "users",
          returnAll: false,
          limit: 10,
          filterType: "string",
          filterString: "name=eq.john",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const call = lastCall();
      expect(call.url).toContain("name=eq.john");
      expect(call.url).toContain("limit=10");
    });
  });

  describe("update with string filter", () => {
    it("sends PATCH with filter string and body", async () => {
      responseQueue = [mockResponse([{ id: 1, role: "admin" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "update",
          tableId: "users",
          dataToSend: "defineBelow",
          fieldsUi: {
            fieldValues: [{ fieldId: "role", fieldValue: "admin" }],
          },
          filterType: "string",
          filterString: "email=eq.alice@example.com",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const call = lastCall();
      expect(call.method).toBe("PATCH");
      expect(call.url).toContain("email=eq.alice%40example.com");
      expect(call.headers["Prefer"]).toBe("return=representation");
      expect(jsonBody(call)).toMatchObject({ role: "admin" });
    });
  });

  describe("delete with manual filter (anyFilter)", () => {
    it("sends DELETE and returns success", async () => {
      responseQueue = [mockResponse(null, { status: 200 })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "delete",
          tableId: "users",
          filterType: "manual",
          matchType: "anyFilter",
          filters: {
            conditions: [{ keyName: "id", condition: "eq", keyValue: "42" }],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ success: true });
      const call = lastCall();
      expect(call.method).toBe("DELETE");
      expect(call.url).toContain("id=eq.42");
    });
  });

  describe("custom schema", () => {
    it("sends Accept-Profile header for custom schema", async () => {
      responseQueue = [mockResponse([{ id: 1, data: "test" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          useCustomSchema: true,
          schema: "custom_schema",
          resource: "row",
          operation: "getAll",
          tableId: "my_table",
          filterType: "none",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const call = lastCall();
      expect(call.headers["Accept-Profile"]).toBe("custom_schema");
      expect(call.url).toContain("select=*");
    });
  });

  describe("continueOnFail", () => {
    it("returns error item when API throws and continueOnFail is true", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "get",
          tableId: "users",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => supabaseCred,
      });
      responseQueue = [mockResponse({ message: "not found" }, { status: 404 })];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String), code: 404 } });
    });
  });

  describe("empty input with fallback", () => {
    it("returns one fallback item for no input", async () => {
      responseQueue = [mockResponse([{ id: 1 }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "getAll",
          tableId: "users",
          filterType: "none",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
    });
  });

  describe("LIKE operator converts * to %", () => {
    it("sends LIKE value with % instead of *", async () => {
      responseQueue = [mockResponse([{ id: 1, name: "John" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "getAll",
          tableId: "users",
          returnAll: true,
          filterType: "manual",
          matchType: "allFilters",
          filters: {
            conditions: [{ keyName: "name", condition: "like", keyValue: "J*" }],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await executor(ctx, node);
      const call = lastCall();
      expect(call.url).toContain("name=like.J%25");
    });
  });
});
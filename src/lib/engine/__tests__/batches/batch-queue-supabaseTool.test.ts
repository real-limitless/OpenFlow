import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.supabaseTool";

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

describe("batch-queue supabaseTool — n8n-nodes-base.supabaseTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Supabase Tool");
  });

  describe("create row with defineBelow fields", () => {
    it("sends POST to /rest/v1/<table> with fieldsUi body", async () => {
      responseQueue = [mockResponse([{ id: 1, title: "Hello", content: "World", created_at: "2024-01-01" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "create",
          tableId: "posts",
          dataToSend: "defineBelow",
          fieldsUi: {
            fieldValues: [
              { fieldId: "title", fieldValue: "Hello" },
              { fieldId: "content", fieldValue: "World" },
            ],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { title: "Hello", content: "World" } }],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 1, title: "Hello", content: "World", created_at: "2024-01-01" });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/rest/v1/posts");
      expect(call.headers["Prefer"]).toBe("return=representation");
      expect(jsonBody(call)).toMatchObject({ title: "Hello", content: "World" });
    });
  });

  describe("getAll rows with manual filters", () => {
    it("sends GET with multiple filter params and limit", async () => {
      responseQueue = [mockResponse([{ id: 1, title: "Post 1", status: "published" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "getAll",
          tableId: "posts",
          returnAll: false,
          limit: 10,
          filterType: "manual",
          matchType: "allFilters",
          filters: {
            conditions: [
              { keyName: "status", condition: "eq", keyValue: "published" },
              { keyName: "created_at", condition: "gte", keyValue: "2024-01-01" },
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
      expect(call.url).toContain("status=eq.published");
      expect(call.url).toContain("created_at=gte.2024-01-01");
      expect(call.url).toContain("limit=10");
      expect(call.url).toContain("select=*");
    });
  });

  describe("get single row", () => {
    it("sends GET with eq filter", async () => {
      responseQueue = [mockResponse([{ id: 42, title: "Hello" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "get",
          tableId: "posts",
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
      expect(out[0][0].json).toMatchObject({ id: 42, title: "Hello" });
      const call = lastCall();
      expect(call.url).toContain("id=eq.42");
    });
  });

  describe("update row with auto-map and expression", () => {
    it("sends PATCH with auto-mapped body", async () => {
      responseQueue = [mockResponse([{ id: 1, title: "Updated Title", content: "Updated Content" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "update",
          tableId: "posts",
          dataToSend: "autoMapInputData",
          inputsToIgnore: "id",
          filterType: "manual",
          matchType: "allFilters",
          filters: {
            conditions: [{ keyName: "id", condition: "eq", keyValue: "1" }],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { id: 1, title: "Updated Title", content: "Updated Content" } }],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);

      expect(out[0]).toHaveLength(1);
      const call = lastCall();
      expect(call.method).toBe("PATCH");
      expect(call.headers["Prefer"]).toBe("return=representation");
      expect(jsonBody(call)).toMatchObject({ title: "Updated Title", content: "Updated Content" });
      expect(call.url).toContain("id=eq.1");
    });
  });

  describe("delete row", () => {
    it("sends DELETE with filter", async () => {
      responseQueue = [mockResponse([{ id: 1, title: "Deleted Post" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "delete",
          tableId: "posts",
          filterType: "manual",
          matchType: "allFilters",
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
      const call = lastCall();
      expect(call.method).toBe("DELETE");
      expect(call.headers["Prefer"]).toBe("return=representation");
      expect(call.url).toContain("id=eq.1");
      expect(out[0][0].json).toMatchObject({ id: 1, title: "Deleted Post" });
    });
  });

  describe("getAll with raw filter string", () => {
    it("sends GET with raw filter string params", async () => {
      responseQueue = [mockResponse([{ id: 1, title: "Tech Post", status: "published" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "getAll",
          tableId: "posts",
          returnAll: false,
          limit: 5,
          filterType: "string",
          filterString: "category=eq.tech&status=eq.published",
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
      expect(call.url).toContain("category=eq.tech");
      expect(call.url).toContain("status=eq.published");
      expect(call.url).toContain("limit=5");
    });
  });

  describe("get not found", () => {
    it("emits empty output for empty array response", async () => {
      responseQueue = [mockResponse([])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "get",
          tableId: "posts",
          filters: {
            conditions: [{ keyName: "id", condition: "eq", keyValue: "999" }],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(0);
    });
  });

  describe("continueOnFail", () => {
    it("returns error item when API throws", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "row",
          operation: "get",
          tableId: "posts",
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

  describe("custom schema", () => {
    it("sends Accept-Profile header for GET when useCustomSchema is true", async () => {
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

    it("sends Content-Profile header for POST/PATCH when useCustomSchema is true", async () => {
      responseQueue = [mockResponse([{ id: 1, title: "Hello" }])];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          useCustomSchema: true,
          schema: "my_schema",
          resource: "row",
          operation: "create",
          tableId: "posts",
          dataToSend: "defineBelow",
          fieldsUi: {
            fieldValues: [{ fieldId: "title", fieldValue: "Hello" }],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { title: "Hello" } }],
        continueOnFail: false,
        getCredential: async () => supabaseCred,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const call = lastCall();
      expect(call.headers["Accept-Profile"]).toBe("my_schema");
      expect(call.headers["Content-Profile"]).toBe("my_schema");
      expect(call.headers["Prefer"]).toBe("return=representation");
    });
  });
});

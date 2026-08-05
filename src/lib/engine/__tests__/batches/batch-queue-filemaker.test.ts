import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.filemaker";

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
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
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

function sessionAuthResponse() {
  return mockResponse({ response: { token: "test-token-abc" } });
}

function sessionDeleteResponse() {
  return mockResponse({}, { status: 204 });
}

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
      method: (init?.method as string) ?? "GET",
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

const defaultCreds = { filemakerApi: { host: "https://fm.example.com", database: "TestDB", login: "admin", password: "pass" } };

function makeFileMakerCtx(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  continueOnFail = false,
): ExecutionContext {
  const node = { id: "1", name: "N", type: TYPE, typeVersion: 1, position: [0, 0] as [number, number], parameters: params };
  return createExecutionContext({
    node,
    workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => inputItems.map((item) =>
      item && typeof item === "object" && "json" in item
        ? (item as INodeExecutionData)
        : { json: item as Record<string, unknown> },
    ),
    continueOnFail,
    getCredential: async (name: string) => defaultCreds[name] ?? null,
  });
}

describe("batch-queue filemaker — n8n-nodes-base.filemaker", () => {
  beforeEach(() => {
    installFetch([sessionAuthResponse(), sessionDeleteResponse()]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("FileMaker");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.filemaker")).toBe(getExecutor(TYPE));
  });

  describe("create record", () => {
    it("sends POST to create a record with fieldData", async () => {
      responseQueue = [
        sessionAuthResponse(),
        mockResponse({ response: { recordId: "100", modId: "1" } }),
        sessionDeleteResponse(),
      ];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const ctx = makeFileMakerCtx({
        resource: "record",
        operation: "create",
        layout: "Contacts",
        fields: JSON.stringify({ Name: "Alice", Email: "alice@example.com" }),
      });
      const node = ctx.getNode();
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ recordId: "100", modId: "1" });
      const dataCall = calls.find((c) => c.method === "POST" && c.url.includes("/records"));
      expect(dataCall).toBeDefined();
      expect(jsonBody(dataCall!)).toMatchObject({ fieldData: { Name: "Alice", Email: "alice@example.com" } });
    });

    it("evaluates expressions in fields from input item json", async () => {
      responseQueue = [
        sessionAuthResponse(),
        mockResponse({ response: { recordId: "101", modId: "2" } }),
        sessionDeleteResponse(),
      ];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const ctx = makeFileMakerCtx(
        {
          resource: "record",
          operation: "create",
          layout: "Contacts",
          fields: JSON.stringify({ Name: "={{ $json.name }}", Email: "={{ $json.email }}" }),
        },
        [{ json: { name: "Bob", email: "bob@example.com" } }],
      );
      const node = ctx.getNode();
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const dataCall = calls.find((c) => c.method === "POST" && c.url.includes("/records"));
      expect(dataCall).toBeDefined();
      expect(jsonBody(dataCall!)).toMatchObject({ fieldData: { Name: "Bob", Email: "bob@example.com" } });
    });
  });

  describe("get record", () => {
    it("sends GET for a specific recordId", async () => {
      responseQueue = [
        sessionAuthResponse(),
        mockResponse({ response: { data: [{ fieldData: { Name: "Alice" }, recordId: "100", modId: "1" }], dataInfo: { foundCount: 1, returnedCount: 1, totalRecordCount: 1 } } }),
        sessionDeleteResponse(),
      ];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const ctx = makeFileMakerCtx({
        resource: "record",
        operation: "get",
        layout: "Contacts",
        recordId: "100",
      });
      const node = ctx.getNode();
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const getCall = calls.find((c) => c.method === "GET" && c.url.includes("/records/100"));
      expect(getCall).toBeDefined();
      expect(getCall!.url).toContain("/records/100");
    });
  });

  describe("getAll records", () => {
    it("sends GET with limit and offset", async () => {
      responseQueue = [
        sessionAuthResponse(),
        mockResponse({ response: { data: [{ fieldData: { Name: "A" }, recordId: "1", modId: "1" }], dataInfo: { foundCount: 1, returnedCount: 1, totalRecordCount: 10 } } }),
        sessionDeleteResponse(),
      ];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const ctx = makeFileMakerCtx({
        resource: "record",
        operation: "getAll",
        layout: "Contacts",
        limit: 50,
        offset: 1,
      });
      const node = ctx.getNode();
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const getCall = calls.find((c) => c.method === "GET" && c.url.includes("/records?"));
      expect(getCall).toBeDefined();
      expect(getCall!.url).toContain("_limit=50");
      expect(getCall!.url).toContain("_offset=1");
    });
  });

  describe("find records", () => {
    it("sends POST to _find with query", async () => {
      responseQueue = [
        sessionAuthResponse(),
        mockResponse({ response: { data: [{ fieldData: { Email: "alice@example.com" }, recordId: "100", modId: "1" }], dataInfo: { foundCount: 1, returnedCount: 1, totalRecordCount: 1 } } }),
        sessionDeleteResponse(),
      ];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const ctx = makeFileMakerCtx({
        resource: "record",
        operation: "find",
        layout: "Contacts",
        query: JSON.stringify([{ field: "Email", value: "alice@example.com" }]),
      });
      const node = ctx.getNode();
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const findCall = calls.find((c) => c.method === "POST" && c.url.includes("/_find"));
      expect(findCall).toBeDefined();
      expect(jsonBody(findCall!)).toMatchObject({ query: [{ Email: "alice@example.com" }], offset: 1 });
    });
  });

  describe("edit record", () => {
    it("sends PATCH to update a record", async () => {
      responseQueue = [
        sessionAuthResponse(),
        mockResponse({ response: { recordId: "100", modId: "2" } }),
        sessionDeleteResponse(),
      ];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const ctx = makeFileMakerCtx({
        resource: "record",
        operation: "edit",
        layout: "Contacts",
        recordId: "100",
        fields: JSON.stringify({ Name: "Alice Updated" }),
      });
      const node = ctx.getNode();
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const patchCall = calls.find((c) => c.method === "PATCH");
      expect(patchCall).toBeDefined();
      expect(jsonBody(patchCall!)).toMatchObject({ fieldData: { Name: "Alice Updated" } });
    });
  });

  describe("delete record", () => {
    it("sends DELETE for recordId", async () => {
      responseQueue = [
        sessionAuthResponse(),
        mockResponse({ response: {} }, { status: 204 }),
        sessionDeleteResponse(),
      ];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const ctx = makeFileMakerCtx({
        resource: "record",
        operation: "delete",
        layout: "Contacts",
        recordId: "123",
      });
      const node = ctx.getNode();
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      const delCall = calls.find((c) => c.method === "DELETE" && c.url.includes("/records/123"));
      expect(delCall).toBeDefined();
    });
  });

  describe("performScript", () => {
    it("sends GET with script name", async () => {
      responseQueue = [
        sessionAuthResponse(),
        mockResponse({ response: { scriptResult: "done", scriptError: "0" } }),
        sessionDeleteResponse(),
      ];
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const ctx = makeFileMakerCtx({
        resource: "record",
        operation: "performScript",
        layout: "Contacts",
        script: "SendNotification",
        scriptParameter: "Hello",
      });
      const node = ctx.getNode();
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ scriptResult: "done", scriptError: "0" });
      const scriptCall = calls.find((c) => c.method === "GET" && c.url.includes("/script/"));
      expect(scriptCall).toBeDefined();
      expect(scriptCall!.url).toContain("script.param=Hello");
    });
  });

  describe("continueOnFail", () => {
    it("returns error item when credentials are missing", async () => {
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const node = { id: "1", name: "N", type: TYPE, typeVersion: 1, position: [0, 0] as [number, number], parameters: { resource: "record", operation: "create", layout: "Contacts", fields: "{}" } };
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: { message: expect.any(String) } });
    });
  });
});

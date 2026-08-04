import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailerLite";

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

describe("batch-queue mailerLite — n8n-nodes-base.mailerLite", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MailerLite");
  });

  describe("subscriber create", () => {
    it("sends POST to create a subscriber and returns the API response", async () => {
      const apiResponse = {
        data: {
          id: "31897397363737859",
          email: "test@example.com",
          status: "active",
          source: "api",
          sent: 0,
          opens_count: 0,
          clicks_count: 0,
          open_rate: 0,
          click_rate: 0,
          ip_address: null,
          subscribed_at: "2021-08-31 14:22:08",
          unsubscribed_at: null,
          created_at: "2021-08-31 14:22:08",
          updated_at: "2021-08-31 14:22:08",
          fields: { name: "Test", last_name: "User" },
          groups: [],
        },
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "create",
          email: "test@example.com",
          fields: { name: "Test", last_name: "User" },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ email: "test@example.com", status: "active" });
      expect((out[0][0].json as Record<string, unknown>).id).toBeTruthy();
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(new URL(call.url).pathname).toBe("/api/subscribers");
      expect(new URL(call.url).host).toBe("connect.mailerlite.com");
      const body = jsonBody(call) as Record<string, unknown>;
      expect(body.email).toBe("test@example.com");
      expect(body.fields).toMatchObject({ name: "Test", last_name: "User" });
    });
  });

  describe("subscriber get", () => {
    it("sends GET with subscriber ID and returns the subscriber", async () => {
      const apiResponse = {
        data: {
          id: "31986843064993537",
          email: "user@example.com",
          status: "active",
        },
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "get",
          subscriberId: "31986843064993537",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect((out[0][0].json as Record<string, unknown>).id).toBe("31986843064993537");
      expect((out[0][0].json as Record<string, unknown>).email).toBe("user@example.com");
      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(new URL(call.url).pathname).toBe("/api/subscribers/31986843064993537");
    });

    it("returns zero items when subscriber not found (404)", async () => {
      responseQueue = [mockResponse({ message: "Not found" }, { status: 404 })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "get",
          subscriberId: "nonexistent-id",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => ({ apiKey: "test-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(0);
    });
  });

  describe("subscriber get all", () => {
    it("sends GET with limit and returns subscribers", async () => {
      const apiResponse = {
        data: [
          { id: "1", email: "alice@example.com", status: "active" },
          { id: "2", email: "bob@example.com", status: "active" },
        ],
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "getAll",
          returnAll: false,
          limit: 10,
          filters: { status: "active" },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ email: "alice@example.com", status: "active" });
      expect(out[0][1].json).toMatchObject({ email: "bob@example.com", status: "active" });
      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url).toContain("/api/subscribers");
      expect(call.url).toContain("limit=10");
      expect(call.url).toContain("status=active");
    });

    it("returns all subscribers with pagination when returnAll=true", async () => {
      const page1 = {
        data: [
          { id: "1", email: "alice@example.com", status: "active" },
          { id: "2", email: "bob@example.com", status: "active" },
        ],
        meta: {
          links: {
            next: "https://connect.mailerlite.com/api/subscribers?page=2",
          },
        },
      };
      const page2 = {
        data: [
          { id: "3", email: "charlie@example.com", status: "active" },
          { id: "4", email: "dave@example.com", status: "active" },
        ],
        meta: {
          links: {
            next: null,
          },
        },
      };
      responseQueue = [mockResponse(page1), mockResponse(page2)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "getAll",
          returnAll: true,
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(4);
      expect(out[0][0].json).toMatchObject({ email: "alice@example.com" });
      expect(out[0][3].json).toMatchObject({ email: "dave@example.com" });
      expect(calls.length).toBe(2);
    });
  });

  describe("subscriber delete", () => {
    it("sends DELETE and passes through the input item on 204", async () => {
      responseQueue = [mockResponse(null, { status: 204 })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "delete",
          subscriberId: "31986843064993537",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { id: "31986843064993537" } }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "31986843064993537" });
      const call = lastCall();
      expect(call.method).toBe("DELETE");
      expect(new URL(call.url).pathname).toBe("/api/subscribers/31986843064993537");
    });
  });

  describe("subscriber update", () => {
    it("sends PUT and returns updated subscriber", async () => {
      const apiResponse = {
        data: {
          id: "31897397363737859",
          email: "user@example.com",
          status: "active",
          fields: { name: "UpdatedName" },
        },
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "update",
          subscriberId: "31897397363737859",
          fields: { name: "UpdatedName" },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect((out[0][0].json as Record<string, unknown>).id).toBe("31897397363737859");
      const fields = (out[0][0].json as Record<string, unknown>).fields as Record<string, unknown>;
      expect(fields.name).toBe("UpdatedName");
      const call = lastCall();
      expect(call.method).toBe("PUT");
      expect(new URL(call.url).pathname).toBe("/api/subscribers/31897397363737859");
    });
  });

  describe("errors", () => {
    it("throws NodeApiError on API failure", async () => {
      responseQueue = [mockResponse({ message: "Validation failed" }, { status: 422 })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "create",
          email: "",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ apiKey: "test-key" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow();
    });
  });
});

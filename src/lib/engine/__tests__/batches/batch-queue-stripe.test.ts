import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.stripe";

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

describe("batch-queue stripe — n8n-nodes-base.stripe", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Stripe");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.stripe")).toBe(getExecutor(TYPE));
  });

  describe("balance get", () => {
    it("sends GET to /v1/balance and returns balance object", async () => {
      responseQueue = [mockResponse({
        object: "balance",
        available: [{ amount: 10000, currency: "usd" }],
        pending: [{ amount: 500, currency: "usd" }],
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "balance", operation: "get" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ secretKey: "sk_test_123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ object: "balance" });
      expect(Array.isArray((out[0][0].json as Record<string, unknown>).available)).toBe(true);
    });
  });

  describe("charge create", () => {
    it("sends POST to /v1/charges with amount and currency", async () => {
      responseQueue = [mockResponse({
        id: "ch_123456",
        object: "charge",
        amount: 2000,
        currency: "usd",
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "charge",
          operation: "create",
          amount: 2000,
          currency: "usd",
          source: "tok_visa",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ secretKey: "sk_test_123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ object: "charge", id: "ch_123456" });
      const body = lastCall().body ?? "";
      expect(body).toContain("amount=2000");
      expect(body).toContain("currency=usd");
    });
  });

  describe("customer get by id", () => {
    it("sends GET to /v1/customers/:id", async () => {
      responseQueue = [mockResponse({
        id: "cus_xxxxxxxxxxxxx",
        object: "customer",
        email: "test@example.com",
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "customer", operation: "get", customerId: "cus_xxxxxxxxxxxxx" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ secretKey: "sk_test_123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "cus_xxxxxxxxxxxxx", object: "customer" });
    });
  });

  describe("customer getAll with pagination", () => {
    it("sends GET with limit param", async () => {
      responseQueue = [mockResponse({
        object: "list",
        data: [{ id: "cus_1", object: "customer" }, { id: "cus_2", object: "customer" }],
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "customer", operation: "getAll", limit: 10 },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ secretKey: "sk_test_123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(lastCall().url).toContain("limit=10");
      expect(out[0][0].json).toMatchObject({ object: "list" });
    });
  });

  describe("customer delete", () => {
    it("sends DELETE to /v1/customers/:id", async () => {
      responseQueue = [mockResponse({
        id: "cus_del",
        object: "customer",
        deleted: true,
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "customer", operation: "delete", customerId: "cus_del" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ secretKey: "sk_test_123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(lastCall().method).toBe("DELETE");
      expect(out[0][0].json).toMatchObject({ deleted: true });
    });
  });

  describe("meter event create", () => {
    it("sends POST to /v1/meter_events", async () => {
      responseQueue = [mockResponse({
        object: "meter_event",
        event_name: "api_requests",
        value: 1,
      })];
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "meterEvent", operation: "create", eventName: "api_requests", value: 1 },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: false,
        getCredential: async () => ({ secretKey: "sk_test_123" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ object: "meter_event", event_name: "api_requests" });
    });
  });

  describe("continueOnFail", () => {
    it("returns error items when continueOnFail is true and credential is missing", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: { resource: "balance", operation: "get" },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{}],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: "Stripe: secretKey is required" });
    });
  });
});
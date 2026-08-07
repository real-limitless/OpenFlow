import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.magento2";

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
    statusText: status === 200 ? "OK" : "Error",
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

describe("batch-queue magento2 — n8n-nodes-base.magento2", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Magento 2");
  });

  describe("customer create", () => {
    it("sends POST to create a customer and returns the API response", async () => {
      const apiResponse = {
        id: 42,
        email: "jane@example.com",
        firstname: "Jane",
        lastname: "Doe",
        website_id: 1,
        group_id: 1,
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "customer",
          operation: "create",
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ host: "https://magento.example.com", accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 42, email: "jane@example.com", firstname: "Jane", lastname: "Doe" });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/rest/V1/customers");
      expect(call.headers.Authorization).toBe("Bearer test-token");
      const body = jsonBody(call) as Record<string, unknown>;
      expect(body.customer).toMatchObject({ email: "jane@example.com", firstname: "Jane", lastname: "Doe" });
    });

    it("throws when email is missing for customer create", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "customer",
          operation: "create",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ host: "https://magento.example.com", accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow("email, firstName, and lastName are required");
    });
  });

  describe("customer getAll with limit", () => {
    it("sends GET with searchCriteria and returns one item per entity", async () => {
      const apiResponse = {
        items: [
          { id: 1, email: "alice@example.com", firstname: "Alice", lastname: "Smith" },
          { id: 2, email: "bob@example.com", firstname: "Bob", lastname: "Jones" },
        ],
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "customer",
          operation: "getAll",
          returnAll: false,
          limit: 5,
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ host: "https://magento.example.com", accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json).toMatchObject({ id: 1, email: "alice@example.com", firstname: "Alice", lastname: "Smith" });
      expect(out[0][1].json).toMatchObject({ id: 2, email: "bob@example.com", firstname: "Bob", lastname: "Jones" });
      const call = lastCall();
      expect(call.url).toContain("searchCriteria%5BpageSize%5D=5");
      expect(call.url).toContain("searchCriteria%5BcurrentPage%5D=1");
    });
  });

  describe("order cancel", () => {
    it("passes through input on cancel", async () => {
      responseQueue = [mockResponse(true)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "order",
          operation: "cancel",
          orderId: "000000001",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { orderId: "000000001" } }],
        continueOnFail: false,
        getCredential: async () => ({ host: "https://magento.example.com", accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toEqual({ orderId: "000000001" });
      const call = lastCall();
      expect(call.url).toContain("/orders/000000001/cancel");
      expect(call.method).toBe("POST");
    });
  });

  describe("product create", () => {
    it("sends POST to create a product", async () => {
      const apiResponse = {
        sku: "test-sku-001",
        name: "Test Product",
        attribute_set_id: 4,
        price: 19.99,
        type_id: "simple",
        status: 1,
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "product",
          operation: "create",
          sku: "test-sku-001",
          name: "Test Product",
          attributeSetId: 4,
          price: 19.99,
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ host: "https://magento.example.com", accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        sku: "test-sku-001",
        name: "Test Product",
        attribute_set_id: 4,
        price: 19.99,
      });
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/rest/V1/products");
      const body = jsonBody(call) as Record<string, unknown>;
      expect(body.product).toMatchObject({ sku: "test-sku-001", name: "Test Product", price: 19.99 });
    });
  });

  describe("order ship", () => {
    it("sends POST to ship an order with tracks", async () => {
      const apiResponse = {
        entity_id: 100,
        order_id: 1,
        tracks: [{ track_number: "1Z999AA10123456784", carrier_code: "ups", title: "UPS Ground" }],
      };
      responseQueue = [mockResponse(apiResponse)];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "order",
          operation: "ship",
          orderId: "000000001",
          notify: false,
          tracks: {
            values: [
              { trackNumber: "1Z999AA10123456784", carrierCode: "ups", title: "UPS Ground" },
            ],
          },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => ({ host: "https://magento.example.com", accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect((out[0][0].json as Record<string, unknown>).tracks).toBeDefined();
      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/order/000000001/ship");
    });
  });

  describe("continueOnFail", () => {
    it("returns error items on missing required parameters", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "customer",
          operation: "create",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => ({ host: "https://magento.example.com", accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: expect.objectContaining({ message: expect.stringContaining("required") }) });
    });
  });

  describe("empty input with fallback", () => {
    it("returns one fallback item for no input", async () => {
      responseQueue = [mockResponse({ id: 1, email: "test@example.com", firstname: "Test", lastname: "User" })];

      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "customer",
          operation: "create",
          email: "test@example.com",
          firstName: "Test",
          lastName: "User",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [],
        continueOnFail: false,
        getCredential: async () => ({ host: "https://magento.example.com", accessToken: "test-token" }),
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
    });
  });
});

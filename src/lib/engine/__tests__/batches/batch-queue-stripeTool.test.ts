import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.stripeTool";

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

let responseQueue: ReturnType<typeof mockResponse>[];

function installFetch() {
  responseQueue = [];
  vi.stubGlobal("fetch", vi.fn(async () => {
    return responseQueue.shift() ?? mockResponse({});
  }));
}

describe("batch-queue stripeTool — n8n-nodes-base.stripeTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Stripe (AI Tool)");
  });

  it("resolves the same executor under the shorthand type", () => {
    expect(getExecutor("nodes-base.stripeTool")).toBe(getExecutor(TYPE));
  });

  describe("model gets balance", () => {
    it("returns balance object when resource=balance, operation=get", async () => {
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
    });
  });

  describe("model creates a charge", () => {
    it("creates a charge with amount and currency", async () => {
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
    });
  });

  describe("model gets a customer", () => {
    it("returns customer by id", async () => {
      responseQueue = [mockResponse({
        id: "cus_xxxxxxxxxxxxx",
        object: "customer",
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

  describe("model creates a meter event", () => {
    it("creates a meter event with event_name and value", async () => {
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
    it("returns error when credential is missing and continueOnFail is true", async () => {
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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dhl";

const TRACKING_RESPONSE = {
  shipments: [
    {
      id: "1234567890",
      service: "express",
      origin: { address: { countryCode: "DE" } },
      destination: { address: { countryCode: "US" } },
      status: { timestamp: "2024-01-15T10:00:00Z", location: { address: { addressLocality: "Frankfurt" } }, statusCode: "pre-registered" },
      estimatedTimeOfDelivery: "2024-01-17T18:00:00Z",
      events: [
        { timestamp: "2024-01-15T10:00:00Z", location: { address: { addressLocality: "Frankfurt" } }, statusCode: "pre-registered" },
      ],
    },
  ],
};

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

let calls: FetchCall[];
let responseQueue: Array<{ status: number; body: unknown }>;

function mockResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
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

function installFetch(
  responses: { status: number; body: unknown } | Array<{ status: number; body: unknown }> = { status: 200, body: TRACKING_RESPONSE },
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
    });
    const next = responseQueue.shift() ?? { status: 200, body: {} };
    return mockResponse(next.body, next.status);
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

describe("batch-queue dhl — n8n-nodes-base.dhl", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("DHL");
  });

  it("resolves the same executor under the canonical type string", () => {
    expect(getExecutor("nodes-base.dhl")).toBe(getExecutor(TYPE));
  });

  describe("get tracking details — single shipment", () => {
    it("calls DHL API and returns shipment items", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "shipment",
          operation: "get",
          trackingNumber: "1234567890",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { trackingNumber: "1234567890" } }],
        continueOnFail: false,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: "1234567890", service: "express" });
      expect(lastCall().url).toContain("trackingNumber=1234567890");
    });
  });

  describe("get tracking details — missing tracking number", () => {
    it("throws when trackingNumber is empty", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "shipment",
          operation: "get",
          trackingNumber: "",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: false,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow(/trackingNumber is required/);
    });

    it("returns error item when continueOnFail is true", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "shipment",
          operation: "get",
          trackingNumber: "",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: {} }],
        continueOnFail: true,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      const out = await executor(ctx, node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
    });
  });

  describe("get tracking details — with optional recipient postal code", () => {
    it("includes recipientPostalCode in query string", async () => {
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "shipment",
          operation: "get",
          trackingNumber: "1234567890",
          options: { recipientPostalCode: "12345" },
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { trackingNumber: "1234567890", zip: "12345" } }],
        continueOnFail: false,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await executor(ctx, node);
      const url = lastCall().url;
      expect(url).toContain("trackingNumber=1234567890");
      expect(url).toContain("recipientPostalCode=12345");
    });
  });

  describe("API error handling", () => {
    it("throws NodeApiError when API returns non-2xx", async () => {
      // Don't use installFetch for this test — set up fetch directly
      vi.stubGlobal("fetch", vi.fn(async () => mockResponse({}, 401)));
      const node = makeNode({
        name: "N",
        type: TYPE,
        parameters: {
          resource: "shipment",
          operation: "get",
          trackingNumber: "1234567890",
        },
      });
      const ctx = createExecutionContext({
        node,
        workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
        getNodeInputItems: () => [{ json: { trackingNumber: "1234567890" } }],
        continueOnFail: false,
        getCredential: async () => null,
      });
      const executor = getExecutor(TYPE);
      if (!executor) throw new Error("no executor");
      await expect(executor(ctx, node)).rejects.toThrow(/DHL API returned status 401/);
    });
  });
});

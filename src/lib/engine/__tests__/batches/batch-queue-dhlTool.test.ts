import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import type { INode } from "@/lib/workflow/types";
import { createExecutionContext } from "@/sdk";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dhlTool";

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

describe("batch-queue dhlTool — n8n-nodes-base.dhlTool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => mockResponse(TRACKING_RESPONSE)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("DHL (AI Tool)");
  });

  it("shares the same executor as the base DHL node", () => {
    expect(getExecutor("n8n-nodes-base.dhl")).toBe(getExecutor(TYPE));
  });

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
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE);
    if (!executor) throw new Error("no executor");
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "1234567890", service: "express" });
  });

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

  it("returns error item when continueOnFail is true and trackingNumber is missing", async () => {
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

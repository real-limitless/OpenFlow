import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.uptimeRobotTool";

interface MockResponse {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponse = {}) {
  const status = init.status ?? 200;
  const text = JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get() { return null; } },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function makeMockGetAllMonitorsResponse(count: number) {
  const monitors: Record<string, unknown>[] = [];
  for (let i = 1; i <= count; i++) {
    monitors.push({
      id: i,
      friendly_name: `Monitor ${i}`,
      url: `https://example${i}.com`,
      type: 1,
      status: 2,
    });
  }
  return mockResponse({
    stat: "ok",
    pagination: { offset: 0, limit: count, total: count },
    monitors,
  });
}

let fetchCalls: Array<{ url: string; method: string; body?: string }> = [];

function installFetch(responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>>) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return queue.shift() ?? mockResponse({ stat: "ok" });
  }));
}

function buildCtx(items: INodeExecutionData[], params: Record<string, unknown>) {
  const node = makeNode({ name: "N", type: TYPE, parameters: params });
  return createExecutionContext({
    node,
    workflow: { id: "test", name: "test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items,
    continueOnFail: false,
    getCredential: async () => ({ apiKey: "test-api-key" }),
  });
}

describe("batch-queue uptimeRobotTool — n8n-nodes-base.uptimeRobotTool", () => {
  beforeEach(() => {
    installFetch(makeMockGetAllMonitorsResponse(3));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("UptimeRobot (AI Tool)");
  });

  it("resolves under n8n-nodes-base.uptimeRobotTool", () => {
    expect(getExecutor(TYPE)).toBeDefined();
  });

  describe("Account Get", () => {
    it("returns account details", async () => {
      installFetch(mockResponse({
        stat: "ok",
        account: {
          email: "test@example.com",
          monitor_limit: 50,
          up_monitors: 10,
          down_monitors: 2,
          paused_monitors: 1,
        },
      }));
      const ctx = buildCtx([{ json: {} }], {
        resource: "Account",
        operation: "Get",
      });
      const executor = getExecutor(TYPE)!;
      const out = await executor(ctx, ctx.node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({
        email: "test@example.com",
        monitor_limit: 50,
      });
    });
  });

  describe("Monitor Get All", () => {
    it("returns one output item per monitor", async () => {
      installFetch(makeMockGetAllMonitorsResponse(3));
      const ctx = buildCtx([{ json: {} }], {
        resource: "Monitor",
        operation: "Get All",
        limit: 10,
      });
      const executor = getExecutor(TYPE)!;
      const out = await executor(ctx, ctx.node);
      expect(out[0]).toHaveLength(3);
      expect(out[0][0].json).toMatchObject({ id: 1, friendly_name: "Monitor 1" });
      expect(out[0][1].json).toMatchObject({ id: 2 });
      expect(out[0][2].json).toMatchObject({ id: 3 });
    });
  });

  describe("Monitor Create", () => {
    it("creates a monitor and returns its id", async () => {
      installFetch(mockResponse({
        stat: "ok",
        monitor: { id: 999, friendly_name: "Example Site", url: "https://example.com", type: 1, status: 2 },
      }));
      const ctx = buildCtx([{ json: { siteUrl: "https://example.com" } }], {
        resource: "Monitor",
        operation: "Create",
        friendlyName: "Example Site",
        url: "={{ $json.siteUrl }}",
        monitorType: 1,
        interval: 300,
      });
      const executor = getExecutor(TYPE)!;
      const out = await executor(ctx, ctx.node);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toMatchObject({ id: 999, friendly_name: "Example Site" });
    });
  });

  describe("Error handling", () => {
    it("throws on API error stat=fail", async () => {
      installFetch(mockResponse({ stat: "fail", error: { message: "invalid_api_key", code: "invalid_api_key" } }));
      const ctx = buildCtx([{ json: {} }], {
        resource: "Account",
        operation: "Get",
      });
      const executor = getExecutor(TYPE)!;
      await expect(executor(ctx, ctx.node)).rejects.toThrow(/UptimeRobot API error/);
    });
  });
});

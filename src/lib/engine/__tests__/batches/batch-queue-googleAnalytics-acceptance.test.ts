import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleAnalytics";
const CREDS = { googleAnalyticsOAuth2Api: { accessToken: "tok_ga" } };

function mockResponse(body: unknown, status = 200) {
  const text = body === undefined || body === null ? "" : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "OK",
    headers: { get: () => "application/json" },
    async json() {
      return text ? JSON.parse(text) : {};
    },
    async text() {
      return text;
    },
  };
}

type Handler = (
  url: string,
  method: string,
  body?: unknown,
) => ReturnType<typeof mockResponse>;
let handler: Handler;
let lastBody: unknown;
let lastUrl: string;
let lastMethod: string;

function installFetch(h: Handler) {
  handler = h;
  lastBody = undefined;
  lastUrl = "";
  lastMethod = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      let body: unknown;
      if (init?.body && typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      lastBody = body;
      lastUrl = String(url);
      lastMethod = init?.method ?? "GET";
      return handler(String(url), init?.method ?? "GET", body);
    }),
  );
}

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleAnalyticsOAuth2Api: { name: "googleAnalyticsOAuth2Api" } },
  });
  const items: INodeExecutionData[] = inputItems.map((j) => ({ json: j }));
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  installFetch(() => mockResponse({}));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("googleAnalytics executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("UA report get with simple output", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("analyticsreporting.googleapis.com/v4/reports:batchGet")) {
        return mockResponse({
          reports: [{
            columnHeader: {
              dimensions: ["ga:date"],
              metricHeader: { metricHeaderEntries: [{ name: "ga:users" }] },
            },
            data: {
              rows: [
                { dimensions: ["20260724"], metrics: [{ values: ["42"] }] },
                { dimensions: ["20260725"], metrics: [{ values: ["55"] }] },
              ],
            },
          }],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "report",
      operation: "get",
      propertyType: "universal",
      viewId: { mode: "id", value: "12345678" },
      dateRange: "last7days",
      metricsUA: { metricValues: [{ listName: "ga:users" }] },
      dimensionsUA: { dimensionValues: [{ listName: "ga:date" }] },
      returnAll: false,
      limit: 10,
      simple: true,
    });

    const rows = out[0][0].json as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toMatchObject({ "ga:date": "20260724", "ga:users": "42" });
    expect(rows[1]).toMatchObject({ "ga:date": "20260725", "ga:users": "55" });
    expect(lastMethod).toBe("POST");
    expect(lastUrl).toContain("/v4/reports:batchGet");
  });

  it("GA4 report get with custom date range", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("analyticsadmin.googleapis.com/v1beta/properties/123456:runReport")) {
        return mockResponse({
          dimensionHeaders: [{ name: "date" }, { name: "country" }],
          metricHeaders: [{ name: "totalUsers" }, { name: "sessions" }],
          rows: [
            { dimensionValues: [{ value: "20260701" }, { value: "US" }], metricValues: [{ value: "100" }, { value: "50" }] },
            { dimensionValues: [{ value: "20260702" }, { value: "CA" }], metricValues: [{ value: "75" }, { value: "30" }] },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "report",
      operation: "get",
      propertyType: "ga4",
      propertyId: { mode: "id", value: "123456" },
      dateRange: "custom",
      startDate: "2026-07-01T00:00:00Z",
      endDate: "2026-07-07T00:00:00Z",
      metricsGA4: { metricValues: [{ listName: "totalUsers" }, { listName: "sessions" }] },
      dimensionsGA4: { dimensionValues: [{ listName: "date" }, { listName: "country" }] },
      returnAll: false,
      limit: 5,
      simple: true,
    });

    const rows = out[0][0].json as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toMatchObject({ date: "20260701", country: "US", totalUsers: "100", sessions: "50" });
    expect(rows[1]).toMatchObject({ date: "20260702", country: "CA", totalUsers: "75", sessions: "30" });
    expect(lastUrl).toContain("/v1beta/properties/123456:runReport");
  });

  it("user activity search", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("analyticsreporting.googleapis.com/v4/userActivity:search")) {
        return mockResponse({
          sessions: [
            { sessionDate: "20260724", activityTypes: ["PAGEVIEW", "EVENT"] },
            { sessionDate: "20260725", activityTypes: ["PAGEVIEW"] },
          ],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "userActivity",
      operation: "search",
      viewId: { mode: "id", value: "12345678" },
      userId: "user_abc_123",
      returnAll: false,
      limit: 50,
      additionalFields: { activityTypes: ["PAGEVIEW", "EVENT"] },
    });

    const sessions = out[0][0].json as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(2);
    expect(sessions[0]).toMatchObject({ sessionDate: "20260724" });
    expect(lastUrl).toContain("/v4/userActivity:search");
  });

  it("GA4 report with raw output (simple=false)", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes(":runReport")) {
        return mockResponse({
          dimensionHeaders: [{ name: "deviceCategory" }],
          metricHeaders: [{ name: "eventCount" }],
          rows: [
            { dimensionValues: [{ value: "desktop" }], metricValues: [{ value: "500" }] },
          ],
          totals: [{ metricValues: [{ value: "500" }] }],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "report",
      operation: "get",
      propertyType: "ga4",
      propertyId: { mode: "id", value: "123456" },
      dateRange: "last30days",
      metricsGA4: { metricValues: [{ listName: "eventCount" }] },
      dimensionsGA4: { dimensionValues: [{ listName: "deviceCategory" }] },
      returnAll: true,
      simple: false,
      additionalFields: {
        keepEmptyRows: true,
        metricAggregations: ["TOTAL"],
      },
    });

    const rows = out[0][0].json as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row.dimensionValues).toBeDefined();
    expect(row.metricValues).toBeDefined();
  });

  it("V1 node compatibility (UA report, no propertyType)", async () => {
    installFetch((url, method) => {
      if (method === "POST" && url.includes("reports:batchGet")) {
        return mockResponse({
          reports: [{
            columnHeader: {
              dimensions: ["ga:sourceMedium"],
              metricHeader: { metricHeaderEntries: [{ name: "ga:sessions" }] },
            },
            data: {
              rows: [
                { dimensions: ["google / organic"], metrics: [{ values: ["120"] }] },
              ],
            },
          }],
        });
      }
      return mockResponse({});
    });

    const out = await run({
      resource: "report",
      operation: "get",
      viewId: "12345678",
      dateRange: "yesterday",
      metricsUA: { metricValues: [{ listName: "ga:sessions" }] },
      dimensionsUA: { dimensionValues: [{ listName: "ga:sourceMedium" }] },
      returnAll: false,
      limit: 25,
      simple: true,
    });

    const rows = out[0][0].json as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toMatchObject({ "ga:sourceMedium": "google / organic", "ga:sessions": "120" });
  });

  it("continueOnFail returns error json", async () => {
    installFetch(() => mockResponse({ error: { message: "Invalid credentials" } }, 401));
    const out = await run(
      {
        resource: "report",
        operation: "get",
        propertyType: "universal",
        viewId: { mode: "id", value: "12345678" },
        dateRange: "last7days",
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Invalid credentials") });
  });
});
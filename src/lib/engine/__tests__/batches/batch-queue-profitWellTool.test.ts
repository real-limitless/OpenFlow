import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.profitWellTool";

const CREDS = { profitWellApi: { apiToken: "test_token" } };

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

let calls: Array<{ url: string; method?: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key, method: opts?.method });
      if (!(key in routes)) {
        return mockJsonResponse({ error: "not found" }, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue profitWellTool — n8n-nodes-base.profitWellTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ProfitWell (AI Tool)");
  });

  it("resolves the same executor under canonical + short type strings", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("n8n-nodes-base.profitWellTool")).toBe(canonical);
  });

  it("get company settings returns expected shape", async () => {
    const fakeSettings = {
      id: "comp_abc123",
      name: "Test Company",
      timezone: "America/New_York",
      currency: "USD",
    };
    installFetch({
      "https://api.profitwell.com/v2/company/settings/": fakeSettings,
    });
    const out = await runNode(
      TYPE,
      { resource: "company", operation: "getSetting" },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("comp_abc123");
    expect(out[0][0].json.name).toBe("Test Company");
    expect(out[0][0].json.timezone).toBe("America/New_York");
    expect(out[0][0].json.currency).toBe("USD");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
  });

  it("get daily metrics (simple=true) returns simplified data object", async () => {
    const fakeMetrics = {
      data: {
        recurring_revenue: [
          { date: "2024-01-01", value: 55000.0 },
        ],
      },
    };
    installFetch({
      "https://api.profitwell.com/v2/metrics/daily/?month=2024-01": fakeMetrics,
    });
    const out = await runNode(
      TYPE,
      { resource: "metric", operation: "get", type: "daily", month: "2024-01", simple: true },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.data).toBeDefined();
    expect(out[0][0].json.data.recurring_revenue).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("get daily metrics filtered by plan and specific metrics", async () => {
    const fakeMetrics = {
      data: {
        recurring_revenue: [{ date: "2024-01-01", value: 55000.0 }],
        new_customers: [{ date: "2024-01-01", value: 10 }],
      },
    };
    const expectedUrl =
      "https://api.profitwell.com/v2/metrics/daily/?month=2024-01&plan_id=plan_foo&metrics=recurring_revenue%2Cnew_customers";
    installFetch({
      [expectedUrl]: fakeMetrics,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "metric", operation: "get", type: "daily", month: "2024-01",
        simple: true,
        options: { plan_id: "plan_foo", dailyMetrics: ["recurring_revenue", "new_customers"] },
      },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(Object.keys(out[0][0].json.data)).toEqual([
      "recurring_revenue",
      "new_customers",
    ]);
    expect(calls).toHaveLength(1);
  });

  it("get monthly metrics returns raw response", async () => {
    const fakeMonthly = {
      data: { recurring_revenue: 55000, new_customers: 100 },
    };
    installFetch({
      "https://api.profitwell.com/v2/metrics/monthly/": fakeMonthly,
    });
    const out = await runNode(
      TYPE,
      { resource: "metric", operation: "get", type: "monthly", simple: true },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("missing credential throws error", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "company", operation: "getSetting" }, [{}]),
    ).rejects.toThrow(/credential is not configured/i);
  });

  it("API error propagates", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "company", operation: "getSetting" }, [{}], { credentials: CREDS }),
    ).rejects.toThrow(/not found/i);
  });

  it("continueOnFail with API error yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "company", operation: "getSetting", continueOnFail: true },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });
});

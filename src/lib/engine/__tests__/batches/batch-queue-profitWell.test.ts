import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.profitWell";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
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

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue profitWell — n8n-nodes-base.profitWell", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("ProfitWell");
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
      { resource: "company", operation: "getSettings" },
      [{}],
      { credentials: { profitWellApi: { apiToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("comp_abc123");
    expect(out[0][0].json.name).toBe("Test Company");
    expect(out[0][0].json.timezone).toBe("America/New_York");
    expect(out[0][0].json.currency).toBe("USD");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
  });

  it("get daily metrics returns data object", async () => {
    const fakeMetrics = {
      data: {
        recurring_revenue: [
          { date: "2024-01-01", value: 55000.0 },
          { date: "2024-01-02", value: 55200.0 },
        ],
      },
    };
    installFetch({
      "https://api.profitwell.com/v2/metrics/daily/?month=2024-01": fakeMetrics,
    });
    const out = await runNode(
      TYPE,
      { resource: "metric", operation: "daily", month: "2024-01" },
      [{}],
      { credentials: { profitWellApi: { apiToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.data).toBeDefined();
    expect(out[0][0].json.data.recurring_revenue).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it("get daily metrics filters by plan and specific metrics", async () => {
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
        resource: "metric",
        operation: "daily",
        month: "2024-01",
        planId: "plan_foo",
        metrics: "recurring_revenue,new_customers",
      },
      [{}],
      { credentials: { profitWellApi: { apiToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(Object.keys(out[0][0].json.data)).toEqual([
      "recurring_revenue",
      "new_customers",
    ]);
    expect(calls).toHaveLength(1);
  });

  it("missing credential throws error", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "company", operation: "getSettings" }, [{}]),
    ).rejects.toThrow(/credential is not configured/i);
  });

  it("API error propagates", async () => {
    installFetch({});
    await expect(
      runNode(
        TYPE,
        { resource: "company", operation: "getSettings" },
        [{}],
        { credentials: { profitWellApi: { apiToken: "bad" } } },
      ),
    ).rejects.toThrow(/not found/i);
  });

  it("continueOnFail with API error yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "company", operation: "getSettings", continueOnFail: true },
      [{}],
      { continueOnFail: true, credentials: { profitWellApi: { apiToken: "bad" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });
});

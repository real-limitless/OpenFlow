import { describe, it, expect, vi } from "vitest";
import { createExecutionContext, type ExecutionContext, type INodeExecutionData } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleAnalyticsTool";

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

function installFetch(result: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, _init?: RequestInit) => mockResponse(result, status)),
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
    getCredential: async () => ({ accessToken: "tok_ga" }),
  });
  const { defaultExecutors } = await import("@/lib/engine/node-runtime");
  const executor = defaultExecutors[TYPE];
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("googleAnalyticsTool", () => {
  it("report - basic", async () => {
    installFetch({
      dimensionHeaders: [{ name: "country" }],
      metricHeaders: [{ name: "activeUsers" }, { name: "sessions" }],
      rows: [
        {
          dimensionValues: [{ value: "United States" }],
          metricValues: [{ value: "1234" }, { value: "567" }],
        },
      ],
      rowCount: 1,
      metadata: { dataLossFromOtherRow: false },
    });
    const [out] = await run({
      resource: "report",
      propertyId: "123456789",
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      dimensions: [{ name: "country" }],
      limit: 10,
    });
    expect(out).toHaveLength(1);
    const report = out[0].json.report as Record<string, unknown>;
    expect(report.rows).toBeDefined();
    expect((report.rows as Array<unknown>).length).toBe(1);
    expect(report.rowCount).toBe(1);
    expect((report as Record<string, unknown>).metadata).toBeDefined();
    const row = (report.rows as Array<Record<string, unknown>>)[0];
    expect(row.dimensionValues).toBeDefined();
    expect(row.metricValues).toBeDefined();
    expect(row.dimensionValues).toHaveLength(1);
    expect(row.metricValues).toHaveLength(2);
  });

  it("report - missing propertyId throws", async () => {
    await expect(
      run({
        resource: "report",
        propertyId: "",
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [{ name: "activeUsers" }],
      }),
    ).rejects.toThrow("propertyId is required");
  });

  it("userActivity - search", async () => {
    installFetch({
      userActivity: [
        {
          activityType: "EVENT",
          activityTimestamp: "2024-01-15T10:30:00Z",
          activityName: "purchase",
          event: { eventName: "purchase", eventParams: {} },
        },
      ],
      nextPageToken: "",
    });
    const [out] = await run({
      resource: "userActivity",
      propertyId: "123456789",
      userId: "user-abc-123",
      activityTypes: ["EVENT"],
    });
    expect(out).toHaveLength(1);
    const ua = out[0].json.userActivity as Record<string, unknown>;
    expect(ua.activities).toBeDefined();
    expect((ua.activities as Array<unknown>).length).toBe(1);
    const activity = (ua.activities as Array<Record<string, unknown>>)[0];
    expect(activity.activityType).toBe("EVENT");
    expect(activity.activityTimestamp).toBe("2024-01-15T10:30:00Z");
  });

  it("continueOnFail - empty output on error", async () => {
    installFetch({ error: { message: "API error" } }, 400);
    const [out] = await run(
      {
        resource: "report",
        propertyId: "123456789",
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [{ name: "activeUsers" }],
      },
      [{}],
      { continueOnFail: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toHaveProperty("error");
  });
});
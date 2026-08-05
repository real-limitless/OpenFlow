import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.beeminderTool";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return status === 200 ? "" : JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string; method: string; body?: string }> = [];

function installFetch(routes: Record<string, unknown>, methods?: Record<string, string>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, opts?: RequestInit) => {
      const key = typeof url === "string" ? url.split("?")[0] : String(url).split("?")[0];
      const method = (opts?.method as string) ?? "GET";
      calls.push({ url: key, method, body: opts?.body as string | undefined });
      const matchedKey = Object.keys(routes).find((k) => key.endsWith(k));
      if (!matchedKey) {
        return mockJsonResponse(null, 404);
      }
      const body = routes[matchedKey];
      if (body === null) return mockJsonResponse(null, 404);
      return mockJsonResponse(body);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue beeminder-tool — n8n-nodes-base.beeminderTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Beeminder (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.beeminderTool")).toBe(canonical);
  });

  it("datapoint — create returns created datapoint", async () => {
    const fakeDatapoint = {
      id: "4f9dd9fd86f22478d3",
      timestamp: 1700000000,
      daystamp: "20231114",
      value: 72.5,
      comment: "Morning weigh-in",
      updated_at: 1700000000,
      requestid: null,
    };
    installFetch({
      "/api/v1/users/testuser/goals/weight/datapoints.json": fakeDatapoint,
    });
    const out = await runNode(
      TYPE,
      { resource: "datapoint", operation: "create", goalName: "weight", value: 72.5, comment: "Morning weigh-in", timestamp: "1700000000" },
      [{}],
      { credentials: { beeminderApi: { accessToken: "test_token", username: "testuser" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeDatapoint);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("goal — getAll returns goal list", async () => {
    const fakeGoals = [
      {
        slug: "weight",
        title: "Weight Loss",
        goal_type: "fatloser",
        losedate: 1700000000,
        goaldate: 1702598400,
        goalval: 70,
        rate: -0.5,
        updated_at: 1699900000,
        queued: false,
      },
    ];
    installFetch({
      "/api/v1/users/testuser/goals.json": fakeGoals,
    });
    const out = await runNode(
      TYPE,
      { resource: "goal", operation: "getAll", additionalFields: { emaciated: true } },
      [{}],
      { credentials: { beeminderApi: { accessToken: "test_token", username: "testuser" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeGoals);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("user — get returns user profile", async () => {
    const fakeUser = {
      username: "alice",
      timezone: "America/Los_Angeles",
      updated_at: 1700000000,
      goals: [
        {
          slug: "weight",
          title: "Weight Loss",
          goal_type: "fatloser",
          last_datapoint: { timestamp: 1699900000, value: 71.0, comment: "evening", id: "5f9d79fd86f33468d4" },
          losedate: 1700000000,
          updated_at: 1700000000,
        },
      ],
    };
    installFetch({
      "/api/v1/users/alice.json": fakeUser,
    });
    const out = await runNode(
      TYPE,
      { resource: "user", operation: "get", additionalFields: { skinny: true, diff_since: "1690000000" } },
      [{}],
      { credentials: { beeminderApi: { accessToken: "test_token", username: "alice" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeUser);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("datapoint — delete returns updated goal", async () => {
    const fakeUpdatedGoal = { slug: "weight", title: "Weight Loss" };
    installFetch({
      "/api/v1/users/testuser/goals/weight/datapoints/dp123.json": fakeUpdatedGoal,
    });
    const out = await runNode(
      TYPE,
      { resource: "datapoint", operation: "delete", goalName: "weight", datapointId: "dp123" },
      [{}],
      { credentials: { beeminderApi: { accessToken: "test_token", username: "testuser" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeUpdatedGoal);
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("goal — shortCircuit returns updated goal", async () => {
    const fakeGoal = { slug: "weight", pledge: 10 };
    installFetch({
      "/api/v1/users/testuser/goals/weight/short_circuit.json": fakeGoal,
    });
    const out = await runNode(
      TYPE,
      { resource: "goal", operation: "shortCircuit", goalName: "weight" },
      [{}],
      { credentials: { beeminderApi: { accessToken: "test_token", username: "testuser" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeGoal);
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeGoal = { slug: "weight" };
    installFetch({
      "/api/v1/users/testuser/goals/weight/refresh.json": fakeGoal,
    });
    const out = await runNode(
      TYPE,
      { resource: "goal", operation: "refresh", goalName: "weight" },
      [{}, {}],
      { credentials: { beeminderApi: { accessToken: "test_token", username: "testuser" } } },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual(fakeGoal);
    expect(out[0][1].json).toEqual(fakeGoal);
  });

  it("missing required params throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "datapoint", operation: "create" }, [{}]),
    ).rejects.toThrow();
  });

  it("unsupported resource/operation throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "user", operation: "create" }, [{}]),
    ).rejects.toThrow(/unsupported/i);
  });

  it("continueOnFail with invalid params yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "datapoint", operation: "create" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("charge — create", async () => {
    const fakeCharge = { id: "ch_1", amount: 10, note: "test" };
    installFetch({
      "/api/v1/users/testuser/charges.json": fakeCharge,
    });
    const out = await runNode(
      TYPE,
      { resource: "charge", operation: "create", amount: 10, additionalFields: { note: "test" } },
      [{}],
      { credentials: { beeminderApi: { accessToken: "test_token", username: "testuser" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeCharge);
  });

  it("datapoint — getAll returns datapoint array", async () => {
    const fakeDatapoints = [{ id: "dp1", value: 10 }, { id: "dp2", value: 20 }];
    installFetch({
      "/api/v1/users/testuser/goals/weight/datapoints.json": fakeDatapoints,
    });
    const out = await runNode(
      TYPE,
      { resource: "datapoint", operation: "getAll", goalName: "weight" },
      [{}],
      { credentials: { beeminderApi: { accessToken: "test_token", username: "testuser" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeDatapoints);
  });
});

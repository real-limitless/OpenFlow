import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.stravaTool";

function mockJsonResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: new Map(Object.entries({ "content-type": "application/json" })),
    async json() { return body; },
    async text() { return text; },
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
      if (!matchedKey) return mockJsonResponse(null, 404);
      const body = routes[matchedKey];
      if (body === null) return mockJsonResponse(null, 404);
      return mockJsonResponse(body);
    }),
  );
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue stravaTool — n8n-nodes-base.stravaTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Strava (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.stravaTool")).toBe(canonical);
  });

  it("create — returns created activity", async () => {
    const fakeActivity = { id: 123, name: "Morning Run", type: "Run", elapsed_time: 3600, distance: 5000, manual: true };
    installFetch({ "/activities": fakeActivity });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "create", name: "Morning Run", startDate: "2024-03-15T07:00:00Z", elapsedTime: 3600, additionalFields: { distance: 5000 } },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeActivity);
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });

  it("get — returns activity by ID", async () => {
    const fakeActivity = { id: "1234567890", name: "Test Activity" };
    installFetch({ "/activities/1234567890": fakeActivity });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "get", activityId: "1234567890" },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeActivity);
  });

  it("getAll — returns list of activities", async () => {
    const fakeActivities = [
      { id: 1, name: "Run 1", distance: 5000, moving_time: 1800, type: "Run" },
      { id: 2, name: "Run 2", distance: 10000, moving_time: 3600, type: "Run" },
    ];
    installFetch({ "/athlete/activities": fakeActivities });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "getAll", returnAll: false, limit: 5 },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeActivities);
  });

  it("update — returns updated activity", async () => {
    const fakeUpdated = { id: "1234567890", name: "Updated Name", description: "Changed the description" };
    installFetch({ "/activities/1234567890": fakeUpdated });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "update", activityId: "1234567890", updateFields: { name: "Updated Name", description: "Changed the description" } },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeUpdated);
    expect(calls.some((c) => c.method === "PUT")).toBe(true);
  });

  it("getStreams — returns stream data", async () => {
    const fakeStreams = { time: { type: "time", data: [0, 10, 20], series_type: "time", original_size: 3, resolution: "high" } };
    installFetch({ "/activities/1234567890/streams": fakeStreams });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "getStreams", activityId: "1234567890", keys: ["time", "distance"] },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeStreams);
  });

  it("missing required params throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "activity", operation: "create" }, [{}], { credentials: { stravaOAuth2Api: { accessToken: "t" } } }),
    ).rejects.toThrow();
  });

  it("unsupported operation throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "activity", operation: "nonexistent" }, [{}], { credentials: { stravaOAuth2Api: { accessToken: "t" } } }),
    ).rejects.toThrow(/unsupported/i);
  });

  it("continueOnFail with invalid params yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "activity", operation: "create" },
      [{}],
      { continueOnFail: true, credentials: { stravaOAuth2Api: { accessToken: "t" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fake = { id: 1, name: "Test" };
    installFetch({ "/activities/1": fake });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "get", activityId: "1" },
      [{}, {}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual(fake);
    expect(out[0][1].json).toEqual(fake);
  });

  it("getComments — returns comment list", async () => {
    const comments = [{ id: 1, text: "Nice run!", activity_id: 123, created_at: "2024-01-01T00:00:00Z", athlete: { firstname: "John", lastname: "Doe" } }];
    installFetch({ "/activities/123/comments": comments });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "getComments", activityId: "123" },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0][0].json).toEqual(comments);
  });

  it("getKudos — returns athlete list", async () => {
    const kudos = [{ firstname: "Jane", lastname: "Smith" }];
    installFetch({ "/activities/123/kudos": kudos });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "getKudos", activityId: "123" },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0][0].json).toEqual(kudos);
  });

  it("getLaps — returns lap list", async () => {
    const laps = [{ id: 1, lap_index: 1, elapsed_time: 300, distance: 1000 }];
    installFetch({ "/activities/123/laps": laps });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "getLaps", activityId: "123" },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0][0].json).toEqual(laps);
  });

  it("getZones — returns zone list", async () => {
    const zones = [{ score: 50, type: "heartrate", sensor_based: true }];
    installFetch({ "/activities/123/zones": zones });
    const out = await runNode(
      TYPE,
      { resource: "activity", operation: "getZones", activityId: "123" },
      [{}],
      { credentials: { stravaOAuth2Api: { accessToken: "test_token" } } },
    );
    expect(out[0][0].json).toEqual(zones);
  });
});

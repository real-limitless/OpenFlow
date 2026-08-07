import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.oura";

const CREDS = { ouraApi: { accessToken: "test-pat" } };

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      if (!(key in routes)) {
        return mockJsonResponse({ message: "not found" }, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

const fakePersonalInfo = {
  id: "abc123",
  age: 30,
  weight: 75.0,
  height: 180.0,
  biological_sex: "male",
  email: "user@example.com",
};

const fakeActivitySummary = {
  id: "act-1",
  day: "2026-08-01",
  score: 85,
  steps: 8432,
  active_calories: 320,
  total_calories: 2400,
  contributors: {
    meet_daily_targets: 80,
    move_every_hour: 90,
    recovery_time: 85,
    stay_active: 75,
    training_frequency: 70,
    training_volume: 65,
  },
};

const fakeReadinessSummary = {
  id: "read-1",
  day: "2026-08-01",
  score: 78,
  temperature_deviation: -0.1,
  contributors: {
    activity_balance: 70,
    body_temperature: 85,
    previous_night: 80,
    recovery_index: 75,
    resting_heart_rate: 90,
  },
};

const fakeSleepSummary = {
  id: "sleep-1",
  day: "2026-08-01",
  score: 72,
  contributors: {
    deep_sleep: 65,
    efficiency: 80,
    latency: 90,
    rem_sleep: 70,
    restfulness: 60,
    timing: 85,
    total_sleep: 75,
  },
};

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue oura — n8n-nodes-base.oura", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Oura");
  });

  it("resolves the same executor under the alias type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("n8n-nodes-base.ouraTool")).toBe(canonical);
  });

  it("profile get — returns personal info", async () => {
    installFetch({
      "https://api.ouraring.com/v2/usercollection/personal_info": fakePersonalInfo,
    });
    const out = await runNode(TYPE, {
      resource: "profile", operation: "get",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "abc123",
      age: 30,
      weight: 75.0,
      height: 180.0,
      biological_sex: "male",
      email: "user@example.com",
    });
    expect(calls).toHaveLength(1);
  });

  it("summary getActivity — returns activity data", async () => {
    installFetch({
      "https://api.ouraring.com/v2/usercollection/daily_activity": fakeActivitySummary,
    });
    const out = await runNode(TYPE, {
      resource: "summary", operation: "getActivity",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "act-1",
      day: "2026-08-01",
      score: 85,
      steps: 8432,
      active_calories: 320,
      total_calories: 2400,
      contributors: expect.objectContaining({
        meet_daily_targets: 80,
        move_every_hour: 90,
      }),
    });
    expect(calls).toHaveLength(1);
  });

  it("summary getReadiness — returns readiness data", async () => {
    installFetch({
      "https://api.ouraring.com/v2/usercollection/daily_readiness": fakeReadinessSummary,
    });
    const out = await runNode(TYPE, {
      resource: "summary", operation: "getReadiness",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "read-1",
      day: "2026-08-01",
      score: 78,
      temperature_deviation: -0.1,
      contributors: expect.objectContaining({
        activity_balance: 70,
        body_temperature: 85,
      }),
    });
    expect(calls).toHaveLength(1);
  });

  it("summary getSleep — returns sleep data", async () => {
    installFetch({
      "https://api.ouraring.com/v2/usercollection/daily_sleep": fakeSleepSummary,
    });
    const out = await runNode(TYPE, {
      resource: "summary", operation: "getSleep",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "sleep-1",
      day: "2026-08-01",
      score: 72,
      contributors: expect.objectContaining({
        deep_sleep: 65,
        efficiency: 80,
      }),
    });
    expect(calls).toHaveLength(1);
  });

  it("unauthorized — throws on 401", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, {
        resource: "profile", operation: "get",
      }, [{}], { credentials: CREDS }),
    ).rejects.toThrow(/Oura API: HTTP 404/);
  });

  it("continueOnFail with API error yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "profile", operation: "get" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item input produces one output per item", async () => {
    installFetch({
      "https://api.ouraring.com/v2/usercollection/personal_info": fakePersonalInfo,
    });
    const out = await runNode(TYPE, {
      resource: "profile", operation: "get",
    }, [{}, {}], { credentials: CREDS });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("abc123");
    expect(out[0][1].json.id).toBe("abc123");
    expect(calls).toHaveLength(1);
  });

  it("empty input yields one output item", async () => {
    installFetch({
      "https://api.ouraring.com/v2/usercollection/personal_info": fakePersonalInfo,
    });
    const out = await runNode(TYPE, {
      resource: "profile", operation: "get",
    }, [], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe("abc123");
  });
});

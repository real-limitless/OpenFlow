import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.strava";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: u,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    if (u.includes("/activities/1234567890") && init?.method !== "PUT") {
      return mockResponse({ id: 1234567890, name: "Morning Run", type: "Run", sport_type: "Run" });
    }
    if (u.includes("/athlete/activities")) {
      return mockResponse([
        { id: 1, name: "Run", type: "Run", sport_type: "Run" },
        { id: 2, name: "Ride", type: "Ride", sport_type: "Ride" },
      ]);
    }
    if (u.includes("/activities/99/comments")) {
      return mockResponse([
        { id: 1, text: "Nice!", athlete: { id: 100 } },
        { id: 2, text: "Great", athlete: { id: 101 } },
      ]);
    }
    if (u.includes("/activities/99/kudos")) {
      return mockResponse([
        { id: 100, firstname: "Alice", lastname: "A" },
        { id: 101, firstname: "Bob", lastname: "B" },
      ]);
    }
    if (u.includes("/activities/99/laps")) {
      return mockResponse([
        { id: 1, lap_index: 1, elapsed_time: 300 },
      ]);
    }
    if (u.includes("/activities/99/zones")) {
      return mockResponse([
        { type: "heartrate", points: [100, 120] },
      ]);
    }
    if (u.includes("/activities/99/streams")) {
      return mockResponse({
        time: { data: [0, 10, 20], series_type: "time", original_size: 3, resolution: "high" },
        distance: { data: [0, 50, 100], series_type: "distance", original_size: 3, resolution: "high" },
      });
    }
    if (u.includes("/activities") && init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      return mockResponse({
        id: 42, name: body.name, type: body.sport_type, sport_type: body.sport_type,
      }, 201);
    }
    if (u.includes("/activities") && init?.method === "PUT") {
      return mockResponse({
        id: 1234567890, name: "Updated Run", type: "Run", sport_type: "Run",
      });
    }
    return mockResponse({ message: "Not found" }, 404);
  }));
}

async function runStrava(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
): Promise<INodeExecutionData[][]> {
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  const node: INode = { id: "1", name: "Strava", type: TYPE, typeVersion: 1, position: [0, 0], parameters: params };
  const ctx = createExecutionContext({
    node,
    workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => inputItems.map((j) => ({ json: j })),
    continueOnFail: false,
    getCredential: async () => ({ accessToken: "test-token" }),
  });
  return executor(ctx, node);
}

describe("n8n-nodes-base.strava", () => {
  beforeEach(() => installFetch());
  afterEach(() => vi.unstubAllGlobals());

  it("has executor and description registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE)).toBeTruthy();
  });

  it("create activity", async () => {
    const [[out]] = await runStrava({
      resource: "activity",
      operation: "create",
      name: "Morning Run",
      sport_type: "Run",
      startDate: "2026-08-03T07:00:00",
      elapsedTime: 1800,
      additionalFields: { commute: false },
    });
    expect(out.json).toHaveProperty("id", 42);
    expect(out.json).toHaveProperty("name", "Morning Run");
    expect(out.json).toHaveProperty("sport_type", "Run");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body).toHaveProperty("sport_type", "Run");
    expect(body).toHaveProperty("start_date_local", "2026-08-03T07:00:00");
    expect(body).toHaveProperty("elapsed_time", 1800);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/api/v3/activities");
  });

  it("create activity with legacy param names", async () => {
    const [[out]] = await runStrava({
      resource: "activity",
      operation: "create",
      name: "Legacy Run",
      sportType: "Run",
      startDateLocal: "2026-08-03T07:00:00",
      elapsedTime: 900,
    });
    expect(out.json).toHaveProperty("id", 42);
    expect(out.json).toHaveProperty("name", "Legacy Run");
    expect(calls[0].method).toBe("POST");
  });

  it("get activity by ID", async () => {
    const [[out]] = await runStrava({
      resource: "activity",
      operation: "get",
      activityId: "1234567890",
    }, [{ activityId: "1234567890" }]);
    expect(out.json).toHaveProperty("id", 1234567890);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/api/v3/activities/1234567890");
  });

  it("getAll activities (paginated)", async () => {
    const out = await runStrava({
      resource: "activity",
      operation: "getAll",
      returnAll: false,
      limit: 5,
    });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("name", "Run");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/athlete/activities");
  });

  it("get activity streams", async () => {
    const [[out]] = await runStrava({
      resource: "activity",
      operation: "getStreams",
      activityId: "99",
      keys: ["time", "distance"],
    });
    expect(out.json).toHaveProperty("time");
    expect(out.json).toHaveProperty("distance");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/activities/99/streams");
  });

  it("get activity comments", async () => {
    const out = await runStrava({
      resource: "activity",
      operation: "getComments",
      activityId: "99",
      returnAll: false,
      limit: 5,
    });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("text", "Nice!");
  });

  it("get activity kudos", async () => {
    const out = await runStrava({
      resource: "activity",
      operation: "getKudos",
      activityId: "99",
      returnAll: false,
      limit: 5,
    });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("firstname", "Alice");
  });

  it("get activity laps", async () => {
    const out = await runStrava({
      resource: "activity",
      operation: "getLaps",
      activityId: "99",
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("lap_index", 1);
  });

  it("get activity zones", async () => {
    const out = await runStrava({
      resource: "activity",
      operation: "getZones",
      activityId: "99",
    });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("type", "heartrate");
  });

  it("update activity", async () => {
    const [[out]] = await runStrava({
      resource: "activity",
      operation: "update",
      activityId: "1234567890",
      updateFields: { description: "Updated description", commute: true },
    }, [{ activityId: "1234567890" }]);
    expect(out.json).toHaveProperty("id", 1234567890);
    expect(calls[0].method).toBe("PUT");
    const putBody = JSON.parse(calls[0].body ?? "{}");
    expect(putBody).toHaveProperty("description", "Updated description");
    expect(putBody).toHaveProperty("commute", true);
  });

  it("throws on unsupported operation", async () => {
    await expect(runStrava({
      resource: "activity",
      operation: "delete",
    })).rejects.toThrow("Strava: unknown operation");
  });
});
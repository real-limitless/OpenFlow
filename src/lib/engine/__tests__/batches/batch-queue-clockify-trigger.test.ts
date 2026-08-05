import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

const TYPE = "n8n-nodes-base.clockifyTrigger";

const fakeEntries = [
  {
    id: "entry_1",
    description: "Morning standup",
    workspaceId: "ws_abc123",
    userId: "user_1",
    start: new Date(Date.now() - 60_000).toISOString(),
    end: null,
    timeInterval: {
      start: new Date(Date.now() - 60_000).toISOString(),
      end: null,
      duration: null,
    },
  },
  {
    id: "entry_2",
    description: "Code review",
    workspaceId: "ws_abc123",
    userId: "user_1",
    start: new Date(Date.now() - 120_000).toISOString(),
    end: new Date(Date.now() - 30_000).toISOString(),
    timeInterval: {
      start: new Date(Date.now() - 120_000).toISOString(),
      end: new Date(Date.now() - 30_000).toISOString(),
      duration: "PT1M30S",
    },
  },
];

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
    const urlStr = typeof url === "string" ? url : url.toString();

    if (urlStr.includes("/api/v1/user")) {
      return new Response(JSON.stringify({ id: "user_1", activeWorkspace: "ws_abc123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.includes("/user/user_1/time-entries")) {
      return new Response(JSON.stringify(fakeEntries), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("batch-queue clockifyTrigger — n8n-nodes-base.clockifyTrigger", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Clockify Trigger");
  });

  it("emits items when time entries are started (happy path)", async () => {
    const out = await runNode(
      TYPE,
      { workspaceId: "ws_abc123", event: "timeEntry.started" },
      [],
      {
        credentials: {
          clockifyApi: { apiKey: "test-api-key" },
        },
      },
    );

    expect(out).toHaveLength(1);
    expect(out[0].length).toBeGreaterThanOrEqual(1);
    expect(out[0][0].json.id).toBeDefined();
    expect(out[0][0].json.workspaceId).toBe("ws_abc123");
    expect(out[0][0].json.start).toBeDefined();
    expect(out[0][0].json.timeInterval).toBeDefined();
  });

  it("emits items when time entries are ended", async () => {
    const out = await runNode(
      TYPE,
      { workspaceId: "ws_abc123", event: "timeEntry.ended" },
      [],
      {
        credentials: {
          clockifyApi: { apiKey: "test-api-key" },
        },
      },
    );

    expect(out).toHaveLength(1);
    expect(out[0].length).toBeGreaterThanOrEqual(1);
    expect(out[0][0].json.end).toBeTruthy();
  });

  it("emits no items when no matching time entries exist", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/api/v1/user")) {
        return new Response(JSON.stringify({ id: "user_1", activeWorkspace: "ws_abc123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("/user/user_1/time-entries")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const out = await runNode(
      TYPE,
      { workspaceId: "ws_abc123", event: "timeEntry.started" },
      [],
      {
        credentials: {
          clockifyApi: { apiKey: "test-api-key" },
        },
      },
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(0);
  });

  it("throws when no workspaceId is configured (edge)", async () => {
    await expect(
      runNode(TYPE, { event: "timeEntry.started" }, [], {
        credentials: { clockifyApi: { apiKey: "test-api-key" } },
      }),
    ).rejects.toThrow(/workspaceId is required/);
  });

  it("throws when clockifyApi credential is missing (edge)", async () => {
    await expect(
      runNode(TYPE, { workspaceId: "ws_abc123", event: "timeEntry.started" }, []),
    ).rejects.toThrow(/clockifyApi credential is not configured/);
  });
});

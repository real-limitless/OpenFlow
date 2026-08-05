import { describe, it, expect, vi } from "vitest";
import { sdkHttpRequest } from "@/sdk/helpers/http";
import { seedBuiltinExecutors } from "@/lib/engine";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";
import type { INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.demio";

vi.mock("@/sdk/helpers/http", () => ({
  sdkHttpRequest: vi.fn(async (options: any) => {
    if (options.method === "GET" && typeof options.url === "string" && options.url.includes("/event/")) {
      return { status: 200, body: { id: "abc123", title: "Test Webinar", status: "upcoming", date: "2026-01-15" } };
    }
    if (options.method === "GET" && options.url.includes("/events")) {
      return {
        status: 200,
        body: [
          { id: "evt_1", title: "Webinar 1", status: "upcoming" },
          { id: "evt_2", title: "Webinar 2", status: "upcoming" },
        ],
      };
    }
    if (options.method === "PUT" && typeof options.url === "string" && options.url.includes("/event/")) {
      return { status: 200, body: { join_link: "https://my.demio.com/join/abc", status: "registered" } };
    }
    if (options.method === "GET" && typeof options.url === "string" && options.url.includes("/report/")) {
      return { status: 200, body: [{ id: 1, status: "attended", email: "user@example.com" }] };
    }
    return { status: 200, body: {} };
  }),
}));

function toItems(input: Array<Record<string, unknown>>): INodeExecutionData[] {
  return input.map((i) => ({ json: i }));
}

function runDemio(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  credentials?: Record<string, Record<string, unknown>>,
) {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  const items = toItems(inputItems);
  const defaultCreds = {
    demioApi: { apiKey: "test-key", apiSecret: "test-secret" },
  };
  const ctx = makeCtx(items, node, false, credentials ?? defaultCreds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

describe("batch-queue demio — n8n-nodes-base.demio", () => {
  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Demio");
  });

  it("gets a single event by ID", async () => {
    const out = await runDemio({ resource: "event", operation: "get", eventId: "abc123" });
    expect(out[0][0].json).toHaveProperty("id", "abc123");
  });

  it("lists events with limit", async () => {
    const out = await runDemio({
      resource: "event",
      operation: "getAll",
      returnAll: false,
      limit: 10,
      filters: { type: "upcoming" },
    });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("title");
  });

  it("registers an attendee", async () => {
    const out = await runDemio(
      {
        resource: "event",
        operation: "register",
        eventId: "evt_456",
        email: "test@example.com",
        firstName: "Jane",
        additionalFields: { last_name: "Doe" },
      },
      [{ json: {} }],
    );
    expect(out[0][0].json).toHaveProperty("join_link");
    expect(out[0][0].json).toHaveProperty("status", "registered");
    const calls = vi.mocked(sdkHttpRequest).mock.calls;
    const putCall = calls.find((c) => c[0].method === "PUT");
    expect(putCall).toBeDefined();
    expect(putCall![0].body).toMatchObject({ email: "test@example.com", first_name: "Jane", last_name: "Doe" });
  });

  it("gets event by ID with additionalFields (active, date_id) in query", async () => {
    vi.mocked(sdkHttpRequest).mockClear();
    const out = await runDemio({
      resource: "event",
      operation: "get",
      eventId: "evt_789",
      additionalFields: { active: true, date_id: "sched_001" },
    });
    expect(out[0][0].json).toHaveProperty("id");
    const calls = vi.mocked(sdkHttpRequest).mock.calls;
    const getCall = calls.find((c) => c[0].url?.includes("/event/evt_789"));
    expect(getCall).toBeDefined();
    expect(getCall![0].url).toContain("active=1");
    expect(getCall![0].url).toContain("date_id=sched_001");
  });

  it("gets a report with attendance filter and dateId", async () => {
    vi.mocked(sdkHttpRequest).mockClear();
    const out = await runDemio({
      resource: "report",
      operation: "get",
      eventId: "abc123",
      dateId: "sched_002",
      filters: { status: "attended" },
    });
    expect(out[0][0].json).toHaveProperty("status", "attended");
    const calls = vi.mocked(sdkHttpRequest).mock.calls;
    const reportCall = calls.find((c) => c[0].url?.includes("/report/abc123"));
    expect(reportCall).toBeDefined();
    expect(reportCall![0].url).toContain("date_id=sched_002");
    expect(reportCall![0].url).toContain("status=attended");
  });

  it("fails when required eventId is missing", async () => {
    await expect(
      runDemio({ resource: "event", operation: "get" }),
    ).rejects.toThrow(/eventId is required/);
  });

  it("fails when required email is missing on register", async () => {
    await expect(
      runDemio({ resource: "event", operation: "register", eventId: "evt_1" }),
    ).rejects.toThrow(/email is required/);
  });

  it("returns error items on continueOnFail", async () => {
    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: { resource: "event", operation: "get", eventId: "x" },
    });
    const ctx = makeCtx(
      [{ json: {} }],
      { ...node, parameters: { resource: "event", operation: "get", eventId: "x" } },
      true,
      {},
    );
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0][0].json).toHaveProperty("error");
  });
});

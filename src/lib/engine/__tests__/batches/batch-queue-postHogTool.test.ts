import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.postHogTool";

function mockFetch(status = 200, body: unknown = { status: "ok" }): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Map([["content-type", "application/json"]]),
    async text() {
      return JSON.stringify(body);
    },
  } as unknown as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("n8n-nodes-base.postHogTool", () => {
  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("creates an event via API", async () => {
    mockFetch();

    const [out] = await runNode(
      TYPE,
      {
        resource: "Event",
        operation: "Create an event",
        eventName: "user_signup",
        distinctId: "user_123",
      },
      [{}],
      {
        credentials: {
          posthogApi: { apiKey: "phc_test", url: "https://app.posthog.com" },
        },
      },
    );

    expect(out).toHaveLength(1);
    expect((out[0] as INodeExecutionData).json).toEqual({ status: "ok" });
  });

  it("creates an alias with static params", async () => {
    mockFetch();

    const [out] = await runNode(
      TYPE,
      {
        resource: "Alias",
        operation: "Create an alias",
        distinctId: "old_user_id",
        alias: "new_user_id",
      },
      [{}],
      {
        credentials: {
          posthogApi: { apiKey: "phc_test" },
        },
      },
    );

    expect(out).toHaveLength(1);
    expect((out[0] as INodeExecutionData).json).toEqual({ status: "ok" });
  });

  it("sets identity person properties", async () => {
    mockFetch();

    const [out] = await runNode(
      TYPE,
      {
        resource: "Identity",
        operation: "Create",
        distinctId: "user_abc",
        propertiesToSet: { plan: "enterprise" },
      },
      [{}],
      {
        credentials: {
          posthogApi: { apiKey: "phc_test" },
        },
      },
    );

    expect(out).toHaveLength(1);
    expect((out[0] as INodeExecutionData).json).toEqual({ status: "ok" });
  });

  it("tracks a page view", async () => {
    mockFetch();

    const [out] = await runNode(
      TYPE,
      {
        resource: "Track",
        operation: "Track a page",
        distinctId: "user_abc",
        pageName: "/pricing",
      },
      [{}],
      {
        credentials: {
          posthogApi: { apiKey: "phc_test" },
        },
      },
    );

    expect(out).toHaveLength(1);
    expect((out[0] as INodeExecutionData).json).toEqual({ status: "ok" });
  });

  it("tracks a screen view", async () => {
    mockFetch();

    const [out] = await runNode(
      TYPE,
      {
        resource: "Track",
        operation: "Track a screen",
        distinctId: "user_abc",
        screenName: "Settings",
      },
      [{}],
      {
        credentials: {
          posthogApi: { apiKey: "phc_test" },
        },
      },
    );

    expect(out).toHaveLength(1);
    expect((out[0] as INodeExecutionData).json).toEqual({ status: "ok" });
  });

  it("throws when distinct ID is missing", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "Event", operation: "Create an event", eventName: "test" },
        [{}],
        { credentials: { posthogApi: { apiKey: "phc_test" } } },
      ),
    ).rejects.toThrow("Distinct ID is required");
  });

  it("throws when event name is missing", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "Event", operation: "Create an event", distinctId: "u1" },
        [{}],
        { credentials: { posthogApi: { apiKey: "phc_test" } } },
      ),
    ).rejects.toThrow("Event Name is required");
  });

  it("handles continueOnFail on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const [out] = await runNode(
      TYPE,
      {
        resource: "Event",
        operation: "Create an event",
        eventName: "test",
        distinctId: "u1",
      },
      [{}],
      {
        continueOnFail: true,
        credentials: { posthogApi: { apiKey: "phc_test" } },
      },
    );

    expect(out).toHaveLength(1);
    expect((out[0] as INodeExecutionData).json).toHaveProperty("error");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { NodeExecutor, ExecutionContext } from "@/sdk";
import { _clearStaticDataForTest } from "../../executors/google-business-profile-trigger";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleBusinessProfileTrigger";

function mockResponse(body: unknown, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const map = new Map<string, string>([["content-type", "application/json"]]);
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

function makeCtxWithCred(
  node: Parameters<typeof makeNode>[0],
  token: string | null,
  active = true,
): ExecutionContext {
  const n = makeNode(node);
  return {
    node: n,
    getParam: (name: string, def?: unknown) => {
      const val = (n.parameters as Record<string, unknown>)[name];
      return val !== undefined ? val : def;
    },
    getParams: () => n.parameters as Record<string, unknown>,
    getCredential: async () => (token ? { accessToken: token } : null),
    getInputItems: () => [],
    getNode: () => n,
    getWorkflow: () => ({ id: "test", name: "test", active, nodes: [n], connections: {}, settings: {} }),
    continueOnFail: () => false,
    evaluate: (expr: string) => expr,
    setCustomData: () => {},
    getCustomData: () => undefined,
    getAllCustomData: () => ({}),
    getNodeInputItems: () => [],
  } as unknown as ExecutionContext;
}

function makeReview(id: string, createTime: string, starRating = "FIVE") {
  return {
    name: `accounts/123/locations/456/reviews/${id}`,
    reviewId: id,
    reviewer: { displayName: `User ${id}`, profilePhotoUrl: "" },
    starRating,
    comment: `Review ${id} text`,
    createTime,
    updateTime: createTime,
  };
}

const defaultParams = {
  events: ["reviewAdded"],
  accountId: { mode: "list", value: "accounts/123" },
  locationId: { mode: "list", value: "accounts/123/locations/456" },
};

const mockAccountsResponse = {
  accounts: [{ name: "accounts/123", accountName: "Test Account" }],
};

const mockLocationsResponse = {
  locations: [{ name: "accounts/123/locations/456", locationName: "Test Location" }],
};

function mockFetchSequence(...responses: ReturnType<typeof mockResponse>[]) {
  let i = 0;
  return vi.fn(async () => responses[i++]);
}

describe("googleBusinessProfileTrigger", () => {
  beforeEach(() => {
    _clearStaticDataForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("returns empty output on first poll (seed state)", async () => {
    vi.stubGlobal("fetch", mockFetchSequence(
      mockResponse(mockAccountsResponse),
      mockResponse(mockLocationsResponse),
      mockResponse({ reviews: [makeReview("rev1", "2026-06-01T00:00:00Z")] }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "GBP Trigger", type: TYPE, parameters: defaultParams });
    const ctx = makeCtxWithCred(node, "test-token");

    const result = await executor(ctx, node);
    expect(result).toEqual([[]]);
  });

  it("emits one item when a new review is detected between polls", async () => {
    vi.stubGlobal("fetch", mockFetchSequence(
      mockResponse(mockAccountsResponse),
      mockResponse(mockLocationsResponse),
      mockResponse({ reviews: [makeReview("rev1", "2026-06-01T00:00:00Z")] }),
      mockResponse(mockAccountsResponse),
      mockResponse(mockLocationsResponse),
      mockResponse({ reviews: [
        makeReview("rev1", "2026-06-01T00:00:00Z"),
        makeReview("rev2", "2026-06-15T12:00:30Z"),
      ] }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "GBP Trigger", type: TYPE, parameters: defaultParams });

    await executor(makeCtxWithCred(node, "test-token"), node);

    const result = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.reviewId).toBe("rev2");
    expect(result[0][0].json.starRating).toBe("FIVE");
    expect(result[0][0].json.comment).toBe("Review rev2 text");
  });

  it("emits zero items when no new reviews since last poll", async () => {
    vi.stubGlobal("fetch", mockFetchSequence(
      mockResponse(mockAccountsResponse),
      mockResponse(mockLocationsResponse),
      mockResponse({ reviews: [makeReview("rev1", "2026-06-01T00:00:00Z")] }),
      mockResponse(mockAccountsResponse),
      mockResponse(mockLocationsResponse),
      mockResponse({ reviews: [makeReview("rev1", "2026-06-01T00:00:00Z")] }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "GBP Trigger", type: TYPE, parameters: defaultParams });

    await executor(makeCtxWithCred(node, "test-token"), node);
    const result = await executor(makeCtxWithCred(node, "test-token"), node);
    expect(result).toEqual([[]]);
  });

  it("throws on missing credential", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("should not fetch"); }));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "GBP Trigger", type: TYPE, parameters: defaultParams });
    const ctx = makeCtxWithCred(node, null);

    await expect(executor(ctx, node)).rejects.toThrow("credential");
  });

  it("manual execution returns the latest review", async () => {
    vi.stubGlobal("fetch", mockFetchSequence(
      mockResponse(mockAccountsResponse),
      mockResponse(mockLocationsResponse),
      mockResponse({ reviews: [
        makeReview("rev1", "2026-01-01T00:00:00Z", "FOUR"),
        makeReview("rev2", "2026-06-01T00:00:00Z", "FIVE"),
      ] }),
    ));

    const executor = getExecutor(TYPE) as NodeExecutor;
    const node = makeNode({ name: "GBP Trigger", type: TYPE, parameters: defaultParams });

    const result = await executor(makeCtxWithCred(node, "test-token", false), node);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.reviewId).toBe("rev2");
    expect(result[0][0].json.starRating).toBe("FIVE");
  });
});

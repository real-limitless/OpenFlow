import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";
import { _clearStaticDataForTest } from "../../executors/google-business-profile-trigger";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googleBusinessProfileTrigger";
const CREDS = { googleBusinessProfileOAuth2Api: { accessToken: "tok_gbp" } };

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

type Handler = (url: string) => ReturnType<typeof mockResponse>;
let handler: Handler;

function installFetch(h: Handler) {
  handler = h;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => handler(String(url))),
  );
}

async function run(
  parameters: Record<string, unknown>,
  active = false,
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: { googleBusinessProfileOAuth2Api: { name: "googleBusinessProfileOAuth2Api" } },
  });
  const ctx: ExecutionContext = createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "T",
      active,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => [],
    continueOnFail: false,
    getCredential: async (name) => CREDS[name as keyof typeof CREDS] ?? null,
  });
  return getExecutor(TYPE)!(ctx, node);
}

beforeEach(() => {
  _clearStaticDataForTest();
  installFetch(() => mockResponse({}));
});

afterEach(() => {
  vi.unstubAllGlobals();
  _clearStaticDataForTest();
});

describe("googleBusinessProfileTrigger executor – acceptance tests", () => {
  it("is registered", () => {
    expect(getExecutor(TYPE)).toBeTypeOf("function");
  });

  it("manual execution returns the most recent review", async () => {
    installFetch((url) => {
      if (url.includes("/locations?")) {
        return mockResponse({
          locations: [{ name: "accounts/123/locations/loc-1" }],
        });
      }
      if (url.includes("/reviews?")) {
        return mockResponse({
          reviews: [
            {
              reviewId: "rev-1",
              starRating: "FIVE",
              comment: "Great!",
              createTime: "2026-07-01T10:00:00Z",
              reviewer: { displayName: "Alice" },
            },
            {
              reviewId: "rev-2",
              starRating: "FOUR",
              comment: "Good service!",
              createTime: "2026-07-02T10:00:00Z",
              reviewer: { displayName: "Bob" },
            },
          ],
        });
      }
      if (url.includes("/accounts")) {
        return mockResponse({
          accounts: [{ name: "accounts/123" }],
        });
      }
      return mockResponse({});
    });
    const [out] = await run({ event: "reviewAdded" });
    expect(out).toHaveLength(1);
    expect(out[0].json.reviewId).toBe("rev-2");
    expect(out[0].json.starRating).toBe("FOUR");
    expect(out[0].json.comment).toBe("Good service!");
  });

  it("manual execution with no reviews throws", async () => {
    installFetch((url) => {
      if (url.includes("/locations?")) {
        return mockResponse({ locations: [{ name: "accounts/123/locations/loc-1" }] });
      }
      if (url.includes("/reviews?")) {
        return mockResponse({ reviews: [] });
      }
      if (url.includes("/accounts")) {
        return mockResponse({ accounts: [{ name: "accounts/123" }] });
      }
      return mockResponse({});
    });
    await expect(run({ event: "reviewAdded" })).rejects.toThrow(
      "no matching review found",
    );
  });

  it("published trigger: first tick returns zero items (initializes seen state)", async () => {
    installFetch((url) => {
      if (url.includes("/locations?")) {
        return mockResponse({ locations: [{ name: "accounts/123/locations/loc-1" }] });
      }
      if (url.includes("/reviews?")) {
        return mockResponse({ reviews: [] });
      }
      if (url.includes("/accounts")) {
        return mockResponse({ accounts: [{ name: "accounts/123" }] });
      }
      return mockResponse({});
    });
    const [out] = await run({ event: "reviewAdded" }, true);
    expect(out).toHaveLength(0);
  });

  it("published trigger: new review between ticks produces one item", async () => {
    type RunSet = { accounts: unknown; locations: unknown; reviews: unknown };
    const runs: RunSet[] = [
      {
        accounts: { accounts: [{ name: "accounts/123" }] },
        locations: { locations: [{ name: "accounts/123/locations/loc-1" }] },
        reviews: { reviews: [] },
      },
      {
        accounts: { accounts: [{ name: "accounts/123" }] },
        locations: { locations: [{ name: "accounts/123/locations/loc-1" }] },
        reviews: {
          reviews: [
            {
              reviewId: "rev-new",
              starRating: "FOUR",
              comment: "Great service!",
              createTime: new Date(Date.now() - 1000).toISOString(),
              reviewer: { displayName: "Charlie" },
            },
          ],
        },
      },
    ];
    let runIndex = -1;
    let fetchCallCount = 0;
    installFetch((url) => {
      if (fetchCallCount === 0) runIndex++;
      fetchCallCount++;
      const set = runs[Math.min(runIndex, runs.length - 1)];
      if (url.includes("/reviews?")) return mockResponse(set.reviews);
      if (url.includes("/locations?")) return mockResponse(set.locations);
      if (url.includes("/accounts")) return mockResponse(set.accounts);
      return mockResponse({});
    });
    const [tick1] = await run({ event: "reviewAdded" }, true);
    expect(tick1).toHaveLength(0);
    fetchCallCount = 0;
    const [tick2] = await run({ event: "reviewAdded" }, true);
    expect(tick2).toHaveLength(1);
    expect(tick2[0].json.reviewId).toBe("rev-new");
    expect(tick2[0].json.comment).toBe("Great service!");
  });

  it("published trigger: no new reviews returns zero items", async () => {
    const accountResponse = { accounts: [{ name: "accounts/123" }] };
    const locationResponse = { locations: [{ name: "accounts/123/locations/loc-1" }] };
    const reviewsResponse = { reviews: [] };
    installFetch((url) => {
      if (url.includes("/reviews?")) return mockResponse(reviewsResponse);
      if (url.includes("/locations?")) return mockResponse(locationResponse);
      if (url.includes("/accounts")) return mockResponse(accountResponse);
      return mockResponse({});
    });
    const [tick1] = await run({ event: "reviewAdded" }, true);
    expect(tick1).toHaveLength(0);
    const [tick2] = await run({ event: "reviewAdded" }, true);
    expect(tick2).toHaveLength(0);
  });
});

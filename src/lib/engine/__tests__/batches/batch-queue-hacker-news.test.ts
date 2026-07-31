import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.hackerNews";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
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
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue hacker-news — n8n-nodes-base.hackerNews", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Hacker News");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.hackerNews")).toBe(canonical);
  });

  it("all — getAll returns hits array from Algolia", async () => {
    const fakeHits = [
      { objectID: "1", author: "pg", title: "Test", url: "https://example.com", points: 10, num_comments: 3, created_at: "2024-01-01T00:00:00Z" },
    ];
    installFetch({
      "https://hn.algolia.com/api/v1/search_by_date?tags=story": { hits: fakeHits },
    });
    const out = await runNode(TYPE, { resource: "all", operation: "getAll" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.hits).toEqual(fakeHits);
    expect(calls).toHaveLength(1);
  });

  it("article — get by ID returns item from Firebase", async () => {
    const fakeItem = { id: 8863, title: "Test Story", by: "pg", score: 100, descendants: 25, time: 1175714200, type: "story" };
    installFetch({
      "https://hacker-news.firebaseio.com/v0/item/8863.json": fakeItem,
    });
    const out = await runNode(TYPE, { resource: "article", operation: "get", articleId: "8863" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeItem);
    expect(calls).toHaveLength(1);
  });

  it("user — get by username returns user from Firebase", async () => {
    const fakeUser = { id: "pg", karma: 5000, created: 1160418111 };
    installFetch({
      "https://hacker-news.firebaseio.com/v0/user/pg.json": fakeUser,
    });
    const out = await runNode(TYPE, { resource: "user", operation: "get", userId: "pg" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual(fakeUser);
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with invalid articleId yields error item", async () => {
    installFetch({
      "https://hacker-news.firebaseio.com/v0/item/invalid.json": null,
    });
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "article", operation: "get", articleId: "invalid", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeHits = [{ objectID: "1", author: "pg", title: "A" }];
    installFetch({
      "https://hn.algolia.com/api/v1/search_by_date?tags=story": { hits: fakeHits },
    });
    const out = await runNode(TYPE, { resource: "all", operation: "getAll" }, [{}, {}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.hits).toEqual(fakeHits);
    expect(out[0][1].json.hits).toEqual(fakeHits);
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "all", operation: "getAll" }, [{}]),
    ).rejects.toThrow();
  });

  it("missing articleId throws descriptive error", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "article", operation: "get", articleId: "" }, [{}]),
    ).rejects.toThrow(/articleId is required/i);
  });

  it("missing userId throws descriptive error", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "user", operation: "get", userId: "" }, [{}]),
    ).rejects.toThrow(/userId is required/i);
  });
});
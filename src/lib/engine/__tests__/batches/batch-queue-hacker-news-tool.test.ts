import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.hackerNewsTool";

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

describe("batch-queue hacker-news-tool — n8n-nodes-base.hackerNewsTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Hacker News (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.hackerNewsTool")).toBe(canonical);
  });

  it("all — getAll returns results with nbPages", async () => {
    const fakeHits = [
      { objectID: "1", title: "Test Story", author: "pg", points: 10, num_comments: 3, created_at: "2024-01-01T00:00:00Z", url: "https://example.com" },
    ];
    installFetch({
      "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=5": { hits: fakeHits, nbPages: 1 },
    });
    const out = await runNode(TYPE, { resource: "all", operation: "getAll", limit: 5 }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.results).toEqual(fakeHits);
    expect(out[0][0].json.nbPages).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("article — get by ID returns normalized article", async () => {
    const fakeItem = { id: 8863, title: "Test Story", author: "pg", points: 100, num_comments: 25, created_at: "2006-10-09T18:21:51Z", url: "https://example.com", children: [1, 2] };
    installFetch({
      "https://hn.algolia.com/api/v1/items/8863": fakeItem,
    });
    const out = await runNode(TYPE, { resource: "article", operation: "get", articleId: "8863" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(8863);
    expect(out[0][0].json.author).toBe("pg");
    expect(out[0][0].json.title).toBe("Test Story");
    expect(out[0][0].json.children).toEqual([1, 2]);
    expect(calls).toHaveLength(1);
  });

  it("user — get by username returns normalized user", async () => {
    const fakeUser = { id: "pg", about: "Paul Graham", karma: 5000, created: 1160418111, submitted: [1, 2, 3] };
    installFetch({
      "https://hacker-news.firebaseio.com/v0/user/pg.json": fakeUser,
    });
    const out = await runNode(TYPE, { resource: "user", operation: "get", userId: "pg" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.username).toBe("pg");
    expect(out[0][0].json.about).toBe("Paul Graham");
    expect(out[0][0].json.karma).toBe(5000);
    expect(out[0][0].json.created_at).toBe("2006-10-09T18:21:51.000Z");
    expect(out[0][0].json.submissions).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(1);
  });

  it("invalid articleId throws", async () => {
    installFetch({
      "https://hn.algolia.com/api/v1/items/0": null,
    });
    await expect(
      runNode(TYPE, { resource: "article", operation: "get", articleId: "0" }, [{}]),
    ).rejects.toThrow(/not found/i);
  });

  it("articleId from input expression resolves correctly", async () => {
    const fakeItem = { id: 9876543, title: "From Expression", author: "test" };
    installFetch({
      "https://hn.algolia.com/api/v1/items/9876543": fakeItem,
    });
    const out = await runNode(
      TYPE,
      { resource: "article", operation: "get", articleId: "={{ $json.storyId }}" },
      [{ json: { storyId: "9876543" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.id).toBe(9876543);
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with invalid articleId yields error item", async () => {
    installFetch({
      "https://hn.algolia.com/api/v1/items/invalid": null,
    });
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "article", operation: "get", articleId: "invalid" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeHits = [{ objectID: "1", title: "A", author: "pg" }];
    installFetch({
      "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20": { hits: fakeHits, nbPages: 1 },
    });
    const out = await runNode(TYPE, { resource: "all", operation: "getAll", limit: 20 }, [{}, {}]);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.results).toEqual(fakeHits);
    expect(out[0][1].json.results).toEqual(fakeHits);
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "all", operation: "getAll", limit: 20 }, [{}]),
    ).rejects.toThrow();
  });

  it("unsupported resource/operation throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "all", operation: "get", limit: 20 }, [{}]),
    ).rejects.toThrow(/unsupported/i);
  });
});

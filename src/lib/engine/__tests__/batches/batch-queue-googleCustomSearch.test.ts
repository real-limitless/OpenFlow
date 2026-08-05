import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.googleCustomSearch";

function mockSearchResponse(items: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    kind: "customsearch#search",
    url: { type: "application/json", template: "https://customsearch.googleapis.com/customsearch/v1?q={q}" },
    queries: { request: [{ title: "Google Custom Search", totalResults: String(items.length), count: items.length, startIndex: 1 }] },
    searchInformation: { searchTime: 0.12, formattedSearchTime: "0.12", totalResults: String(items.length), formattedTotalResults: String(items.length) },
    items,
    ...overrides,
  });
}

function makeResponse(body: string, status = 200) {
  return {
    status,
    statusText: status === 400 ? "Bad Request" : "OK",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map([["content-type", "application/json"]]).entries() },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(response?: { status?: number; body?: string }) {
  calls = [];
  const defaultBody = mockSearchResponse([
    { kind: "customsearch#result", title: "Result 1", link: "https://example.com/1", displayLink: "example.com", snippet: "Description 1" },
    { kind: "customsearch#result", title: "Result 2", link: "https://example.com/2", displayLink: "example.com", snippet: "Description 2" },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push({ url: String(url) });
      return makeResponse(response?.body ?? defaultBody, response?.status ?? 200);
    }),
  );
}

const creds = {
  googleApi: { apiKey: "test-api-key" } as Record<string, unknown>,
};

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue googleCustomSearch — n8n-nodes-base.googleCustomSearch", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Google Custom Search");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.googleCustomSearch")).toBe(canonical);
  });

  it("basic web search returns kind=customsearch#search with items", async () => {
    installFetch();
    const out = await runNode(TYPE, { cx: "test:cx", query: "quantum computing" }, [{}], { credentials: creds });
    expect(out[0]).toHaveLength(1);
    const item = out[0][0].json;
    expect(item.kind).toBe("customsearch#search");
    expect(Array.isArray(item.items)).toBe(true);
    expect(item.items.length).toBeGreaterThan(0);
    expect(item.items[0]).toHaveProperty("kind", "customsearch#result");
    expect(item.items[0]).toHaveProperty("title");
    expect(item.items[0]).toHaveProperty("link");
    expect(item.items[0]).toHaveProperty("displayLink");
    expect(item.items[0]).toHaveProperty("snippet");
    expect(item.searchInformation.totalResults).toBeDefined();
    expect(item.queries.request).toHaveLength(1);
  });

  it("includes API key in query string", async () => {
    installFetch();
    await runNode(TYPE, { cx: "test:cx", query: "test" }, [{}], { credentials: creds });
    expect(calls[0].url).toContain("key=test-api-key");
    expect(calls[0].url).toContain("cx=test%3Acx");
    expect(calls[0].url).toContain("q=test");
  });

  it("image search returns items", async () => {
    installFetch();
    const out = await runNode(TYPE, {
      cx: "test:cx",
      query: "aurora borealis",
      options: { searchType: "image", imgSize: "large", safe: "active" },
    }, [{}], { credentials: creds });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.items.length).toBeGreaterThan(0);
  });

  it("site-restricted search filters via URL params", async () => {
    installFetch();
    await runNode(TYPE, {
      cx: "test:cx",
      query: "api reference",
      options: { siteSearch: "developers.google.com", siteSearchFilter: "i" },
    }, [{}], { credentials: creds });
    expect(calls[0].url).toContain("siteSearch=developers.google.com");
    expect(calls[0].url).toContain("siteSearchFilter=i");
  });

  it("throws on invalid CX", async () => {
    installFetch({ status: 400, body: JSON.stringify({ error: { message: "Invalid search engine ID", code: 400, status: "INVALID_ARGUMENT" } }) });
    await expect(
      runNode(TYPE, { cx: "invalid:cx", query: "test" }, [{}], { credentials: creds }),
    ).rejects.toThrow(/Invalid search engine ID/i);
  });

  it("throws on missing credential", async () => {
    installFetch();
    await expect(
      runNode(TYPE, { cx: "test:cx", query: "test" }, [{}]),
    ).rejects.toThrow(/Missing Google API key/i);
  });

  it("paginates with returnAll and limit", async () => {
    const page1 = Array.from({ length: 10 }, (_, i) => ({
      kind: "customsearch#result",
      title: `Result ${i + 1}`,
      link: `https://example.com/${i + 1}`,
      displayLink: "example.com",
      snippet: `Description ${i + 1}`,
    }));
    const page2 = Array.from({ length: 10 }, (_, i) => ({
      kind: "customsearch#result",
      title: `Result ${i + 11}`,
      link: `https://example.com/${i + 11}`,
      displayLink: "example.com",
      snippet: `Description ${i + 11}`,
    }));

    let callCount = 0;
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push({ url: String(url) });
        callCount++;
        const body = callCount === 1
          ? mockSearchResponse(page1, {
              queries: {
                request: [{ title: "Google Custom Search", totalResults: "20", count: 10, startIndex: 1 }],
                nextPage: [{ title: "Google Custom Search", totalResults: "20", count: 10, startIndex: 11 }],
              },
            })
          : mockSearchResponse(page2);
        return makeResponse(body);
      }),
    );

    const out = await runNode(TYPE, { cx: "test:cx", query: "machine learning", returnAll: true, limit: 25 }, [{}], { credentials: creds });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.items.length).toBeGreaterThanOrEqual(11);
    expect(calls.length).toBeGreaterThan(1);
  });

  it("continueOnFail with error returns error output", async () => {
    installFetch({ status: 400, body: JSON.stringify({ error: { message: "Invalid CX", code: 400, status: "INVALID_ARGUMENT" } }) });
    const { out } = await runNodeWithCtx(
      TYPE,
      { cx: "invalid:cx", query: "test" },
      [{}],
      { continueOnFail: true, credentials: creds },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeDefined();
  });
});

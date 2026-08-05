import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.webSearch";

interface MockResponseInit {
  status?: number;
  body?: string;
}

function mockSearchResponse(
  items: Array<{ title: string; link: string; snippet: string }>,
) {
  return JSON.stringify({ items });
}

function mockResponse(body: string, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  return {
    status,
    statusText: status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get: () => "application/json",
      entries: () => new Map([["content-type", "application/json"]]).entries(),
    },
    async text() { return body; },
    async json() { return JSON.parse(body); },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push({ url: String(url) });
      return mockResponse(
        mockSearchResponse([
          { title: "Result 1", link: "https://example.com/1", snippet: "Description 1" },
          { title: "Result 2", link: "https://example.com/2", snippet: "Description 2" },
        ]),
      );
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue webSearch — n8n-nodes-base.webSearch", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Web Search");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.webSearch")).toBe(canonical);
  });

  it("basic search returns results with title, url, snippet", async () => {
    installFetch();
    const out = await runNode(TYPE, { query: "n8n workflow automation", resultLimit: 5 }, [{}]);
    expect(out[0]).toHaveLength(1);
    const item = out[0][0].json;
    expect(item.query).toBe("n8n workflow automation");
    expect(Array.isArray(item.results)).toBe(true);
    expect(item.results.length).toBeGreaterThan(0);
    expect(item.results[0]).toHaveProperty("title");
    expect(item.results[0]).toHaveProperty("url");
    expect(item.results[0]).toHaveProperty("snippet");
    expect(item.totalResults).toBeGreaterThan(0);
  });

  it("empty query with continueOnFail returns empty results", async () => {
    installFetch();
    const { out } = await runNodeWithCtx(
      TYPE,
      { query: "", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.results).toEqual([]);
    expect(out[0][0].json.totalResults).toBe(0);
  });

  it("custom endpoint sends request with query and apiKey", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { query: "test", searchEngine: "custom", customEndpoint: "https://example.com/search", apiKey: "test-key" },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(calls[0].url).toContain("https://example.com/search");
    expect(calls[0].url).toContain("q=test");
    expect(calls[0].url).toContain("apiKey=test-key");
  });

  it("missing query throws", async () => {
    installFetch();
    await expect(runNode(TYPE, { query: "" }, [{}])).rejects.toThrow();
  });

  it("fetch failure without continueOnFail throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Network error");
    }));
    await expect(
      runNode(TYPE, { query: "fail" }, [{}]),
    ).rejects.toThrow();
  });

  it("continueOnFail returns empty results on error", async () => {
    installFetch();
    const { out } = await runNodeWithCtx(
      TYPE,
      { query: "", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.results).toEqual([]);
  });
});

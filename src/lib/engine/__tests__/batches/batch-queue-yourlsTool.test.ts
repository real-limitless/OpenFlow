import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.yourlsTool";

const CREDS = {
  yourlsApi: {
    signature: "test-signature",
    url: "https://sho.rt",
  },
};

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push({ url });
      const entry = routes[url];
      if (entry === undefined) {
        return mockJsonResponse({ status: "fail", message: "not found" }, 404);
      }
      return mockJsonResponse(entry);
    }),
  );
}

const fakeShortenResponse = {
  url: { keyword: "abc", url: "https://example.com/very-long-page", title: "", date: "2024-01-01 00:00:00", ip: "127.0.0.1" },
  status: "success",
  message: "URL shortened",
  title: "",
  shorturl: "https://sho.rt/abc",
  statusCode: "200",
};

const fakeExpandResponse = {
  keyword: "abc",
  shorturl: "https://sho.rt/abc",
  longurl: "https://example.com/very-long-page",
  message: "success",
  statusCode: "200",
};

const fakeStatsResponse = {
  link: {
    keyword: "abc",
    shorturl: "https://sho.rt/abc",
    longurl: "https://example.com/very-long-page",
    title: "Example Page",
    timestamp: "2024-01-01 00:00:00",
    clicks: 42,
    link: { url: "https://example.com/very-long-page" },
  },
};

function buildApiUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `https://sho.rt/yourls-api.php?${qs}`;
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue yourlsTool — n8n-nodes-base.yourlsTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Yourls (AI Tool)");
  });

  it("resolves the same executor under shortened type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.yourlsTool")).toBe(canonical);
  });

  it("shorten a URL", async () => {
    const apiUrl = buildApiUrl({
      action: "shorturl",
      signature: "test-signature",
      format: "json",
      url: "https://example.com/very-long-page",
    });
    installFetch({ [apiUrl]: fakeShortenResponse });
    const out = await runNode(TYPE, {
      resource: "url",
      operation: "shorten",
      url: "https://example.com/very-long-page",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      shorturl: expect.any(String),
      status: "success",
      url: expect.objectContaining({ keyword: expect.any(String) }),
    });
    expect(calls).toHaveLength(1);
  });

  it("expand a short URL", async () => {
    const apiUrl = buildApiUrl({
      action: "expand",
      signature: "test-signature",
      format: "json",
      shorturl: "https://sho.rt/abc",
    });
    installFetch({ [apiUrl]: fakeExpandResponse });
    const out = await runNode(TYPE, {
      resource: "url",
      operation: "expand",
      shortUrl: "https://sho.rt/abc",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      longurl: expect.any(String),
      shorturl: expect.any(String),
      statusCode: "200",
      keyword: expect.any(String),
    });
    expect(calls).toHaveLength(1);
  });

  it("get stats for a short URL", async () => {
    const apiUrl = buildApiUrl({
      action: "url-stats",
      signature: "test-signature",
      format: "json",
      shorturl: "abc",
    });
    installFetch({ [apiUrl]: fakeStatsResponse });
    const out = await runNode(TYPE, {
      resource: "url",
      operation: "stats",
      shortUrl: "abc",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      clicks: expect.any(Number),
      keyword: expect.any(String),
      shorturl: expect.any(String),
      longurl: expect.any(String),
      title: expect.any(String),
    });
    expect(calls).toHaveLength(1);
  });

  it("error on API failure throws", async () => {
    const apiUrl = buildApiUrl({
      action: "shorturl",
      signature: "test-signature",
      format: "json",
      url: "https://example.com/fail",
    });
    installFetch({
      [apiUrl]: { status: "fail", message: "error occurred" },
    });
    await expect(
      runNode(TYPE, {
        resource: "url",
        operation: "shorten",
        url: "https://example.com/fail",
      }, [{}], { credentials: CREDS }),
    ).rejects.toThrow(/YOURLS API error/);
  });

  it("continueOnFail with API failure yields error item", async () => {
    const apiUrl = buildApiUrl({
      action: "shorturl",
      signature: "test-signature",
      format: "json",
      url: "https://example.com/fail",
    });
    installFetch({
      [apiUrl]: { status: "fail", message: "error occurred" },
    });
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "url", operation: "shorten", url: "https://example.com/fail" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing credential throws", async () => {
    await expect(
      runNode(TYPE, {
        resource: "url",
        operation: "shorten",
        url: "https://example.com",
      }, [{}]),
    ).rejects.toThrow(/yourlsApi credential/);
  });

  it("multi-item produces one output per input", async () => {
    const apiUrl = buildApiUrl({
      action: "shorturl",
      signature: "test-signature",
      format: "json",
      url: "https://example.com/very-long-page",
    });
    installFetch({ [apiUrl]: fakeShortenResponse });
    const out = await runNode(TYPE, {
      resource: "url",
      operation: "shorten",
      url: "https://example.com/very-long-page",
    }, [{}, {}], { credentials: CREDS });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.shorturl).toBeDefined();
    expect(out[0][1].json.shorturl).toBeDefined();
    expect(calls).toHaveLength(2);
  });
});
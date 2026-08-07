import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.urlScanIoTool";
const CREDS = { urlScanIoApi: { apiKey: "test-key" } };
const FAKE_UUID = "0e37e828-a9d9-45c0-ac50-1ca579b86c72";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

type FetchCall = { url: string; init: RequestInit };
let calls: FetchCall[] = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key, init: init ?? {} });
      for (const [pattern, body] of Object.entries(routes)) {
        if (key.includes(pattern)) {
          return mockJsonResponse(body);
        }
      }
      return mockJsonResponse(null, 404);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const FAKE_PERFORM = {
  uuid: FAKE_UUID,
  result: `https://urlscan.io/result/${FAKE_UUID}`,
  api: `https://urlscan.io/api/v1/result/${FAKE_UUID}`,
  visibility: "private",
  url: "https://example.com",
  message: "Submission successful",
  options: { useragent: "n8n" },
  country: "DE",
};

const FAKE_GET_RESULT = {
  task: { url: "https://example.com", uuid: FAKE_UUID },
  page: { country: "DE", server: "ECS/1.0" },
  verdicts: { overall: { malicious: false } },
};

const FAKE_SEARCH = {
  results: [
    { _id: FAKE_UUID, page: { url: "https://example.com" }, task: { url: "https://example.com" }, sort: [1] },
  ],
  total: 1,
};

describe("batch-queue urlScanIoTool — n8n-nodes-base.urlScanIoTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc.placeholder).not.toBe(true);
    expect(desc.displayName).toBe("urlscan.io (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.urlScanIoTool")).toBe(canonical);
  });

  it("Perform operation submits a URL for scanning", async () => {
    installFetch({ "/scan/": FAKE_PERFORM });
    const out = await runNode(
      TYPE,
      { resource: "Scan", operation: "Perform", url: "https://example.com" },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.uuid).toBe(FAKE_UUID);
    expect((out[0][0].json as Record<string, unknown>).message).toBe("Submission successful");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/scan/");
    if (calls[0].init.body) {
      const body = JSON.parse(calls[0].init.body as string);
      expect(body.url).toBe("https://example.com");
    }
  });

  it("Get operation retrieves a scan by ID", async () => {
    installFetch({ "/result/": FAKE_GET_RESULT });
    const out = await runNode(
      TYPE,
      { resource: "Scan", operation: "Get", scanId: FAKE_UUID },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).task).toBeDefined();
    expect(((out[0][0].json as Record<string, unknown>).task as Record<string, unknown>).url).toBe("https://example.com");
    expect(calls).toHaveLength(1);
  });

  it("Get All operation searches scans", async () => {
    installFetch({ "/search/": FAKE_SEARCH });
    const out = await runNode(
      TYPE,
      { resource: "Scan", operation: "Get All", filters: { query: "domain:example.com" }, returnAll: false, limit: 10 },
      [{}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as Record<string, unknown>;
    expect(Array.isArray(result.results)).toBe(true);
    expect((result.results as unknown[]).length).toBeLessThanOrEqual(10);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/search/");
  });

  it("continueOnFail yields error item on invalid scan ID", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "Scan", operation: "Get", scanId: "00000000-0000-0000-0000-000000000000" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    installFetch({ "/scan/": FAKE_PERFORM });
    const out = await runNode(
      TYPE,
      { resource: "Scan", operation: "Perform", url: "https://example.com" },
      [{}, {}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});

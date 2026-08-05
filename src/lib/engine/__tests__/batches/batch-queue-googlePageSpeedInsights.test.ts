import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";
import type { NodeExecutor } from "@/sdk";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.googlePageSpeedInsights";

let executor: NodeExecutor;

beforeEach(() => {
  const e = getExecutor(TYPE);
  if (!e) throw new Error(`Executor not found for ${TYPE}`);
  executor = e;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function installFetch(returnBody: unknown, status = 200) {
  const fn = vi.fn(async () => mockResponse(returnBody, status));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const SAMPLE_RESPONSE = {
  captchaResult: "CAPTCHA_NOT_NEEDED",
  id: "https://web.dev/",
  loadingExperience: {
    metrics: {},
    overall_category: "FAST",
  },
  lighthouseResult: {
    lighthouseVersion: "11.0.0",
    fetchTime: "2025-01-01T00:00:00Z",
    userAgent: "Chrome",
    configSettings: {
      formFactor: "desktop",
      locale: "en-US",
      categories: ["performance"],
    },
    categories: {
      performance: { score: 0.95 },
    },
    audits: {},
    categoryGroups: {},
  },
  analysisUTCTimestamp: "2025-01-01T00:00:00Z",
  version: { major: 5, minor: 0 },
};

describe("googlePageSpeedInsights", () => {
  it("fetches desktop performance report", async () => {
    const fetchFn = installFetch(SAMPLE_RESPONSE);

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        url: "https://web.dev/",
        strategy: "DESKTOP",
        categories: ["PERFORMANCE"],
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => {
        const params: Record<string, unknown> = {
          url: "https://web.dev/",
          strategy: "DESKTOP",
          categories: ["PERFORMANCE"],
        };
        return (name in params ? params[name] : def) as string | string[];
      },
      getCredential: async () => ({ apiKey: "test-key" }),
      continueOnFail: () => false,
    };

    const [out] = await executor(ctx as any, node);
    expect(out).toHaveLength(1);
    expect(out[0].json?.id).toBe("https://web.dev/");
    expect(out[0].json?.lighthouseResult).toBeTruthy();
    expect(out[0].json?.lighthouseResult?.categories?.performance?.score).toBe(0.95);

    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).toContain("url=https%3A%2F%2Fweb.dev%2F");
    expect(calledUrl).toContain("strategy=DESKTOP");
    expect(calledUrl).toContain("category=PERFORMANCE");
    expect(calledUrl).toContain("key=test-key");
  });

  it("throws on API error", async () => {
    installFetch({ error: { message: "Invalid URL" } }, 400);

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        url: "not-a-valid-url",
        strategy: "DESKTOP",
        categories: ["PERFORMANCE"],
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => {
        const params: Record<string, unknown> = {
          url: "not-a-valid-url",
          strategy: "DESKTOP",
          categories: ["PERFORMANCE"],
        };
        return (name in params ? params[name] : def) as string | string[];
      },
      getCredential: async () => ({ apiKey: "test-key" }),
      continueOnFail: () => false,
    };

    await expect(executor(ctx as any, node)).rejects.toThrow();
  });

  it("handles continueOnFail", async () => {
    installFetch({ error: { message: "Bad Request" } }, 400);

    const node = makeNode({
      name: "N",
      type: TYPE,
      parameters: {
        url: "https://example.com/",
        strategy: "MOBILE",
        categories: ["PERFORMANCE", "ACCESSIBILITY"],
      },
    });
    const ctx = {
      getInputItems: () => [{ json: {} }],
      getParam: (name: string, def?: unknown) => {
        const params: Record<string, unknown> = {
          url: "https://example.com/",
          strategy: "MOBILE",
          categories: ["PERFORMANCE", "ACCESSIBILITY"],
        };
        return (name in params ? params[name] : def) as string | string[];
      },
      getCredential: async () => ({ apiKey: "test-key" }),
      continueOnFail: () => true,
    };

    const [out] = await executor(ctx as any, node);
    expect(out).toHaveLength(1);
    expect(out[0].json?.error).toBeTruthy();
  });
});

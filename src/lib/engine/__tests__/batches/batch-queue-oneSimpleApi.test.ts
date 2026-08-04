import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.oneSimpleApi";

const CREDS = { oneSimpleApi: { apiToken: "test-token" } };

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string; method: string }> = [];

function installFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      calls.push({ url: String(url), method: opts?.method ?? "GET" });
      const urlStr = String(url);

      if (urlStr.includes("/exchange_rate")) {
        return mockJsonResponse({ convertedAmount: 93.5, from: "USD", to: "EUR", rate: 0.935 });
      }
      if (urlStr.includes("/qr_code")) {
        return mockJsonResponse({ qr_code: "https://onesimpleapi.com/qr/abc123.png" });
      }
      if (urlStr.includes("/email")) {
        return mockJsonResponse({ valid: true, email: "test@example.com", details: { disposable: false } });
      }
      if (urlStr.includes("/screenshot")) {
        return mockJsonResponse({ screenshot_url: "https://onesimpleapi.com/screenshots/abc.png" });
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

describe("batch-queue oneSimpleApi — n8n-nodes-base.oneSimpleApi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("One Simple API");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.oneSimpleApi")).toBe(canonical);
  });

  it("currency conversion sends GET to /exchange_rate and returns result", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "information", operation: "exchangeRate", value: 100, fromCurrency: "USD", toCurrency: "EUR" },
      [{ json: { amount: 100, source: "USD", target: "EUR" } }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ convertedAmount: 93.5, from: "USD", to: "EUR", rate: 0.935 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/exchange_rate");
    expect(calls[0].url).toContain("value=100");
    expect(calls[0].url).toContain("from=USD");
    expect(calls[0].url).toContain("to=EUR");
    expect(calls[0].method).toBe("GET");
  });

  it("QR code generation sends GET to /qr_code and returns result", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "utility", operation: "qrCode", message: "https://example.com" },
      [{ json: { site: "https://example.com" } }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ qr_code: "https://onesimpleapi.com/qr/abc123.png" });
    expect(calls[0].url).toContain("/qr_code");
    expect(calls[0].url).toContain("message=https%3A%2F%2Fexample.com");
  });

  it("email validation sends GET to /email and returns result", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "utility", operation: "validateEmail", emailAddress: "test@example.com" },
      [{ json: { email: "test@example.com" } }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ valid: true, email: "test@example.com", details: { disposable: false } });
    expect(calls[0].url).toContain("/email");
    expect(calls[0].url).toContain("email=test%40example.com");
  });

  it("website screenshot sends GET to /screenshot and returns result", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "website", operation: "screenshot", link: "https://example.com" },
      [{ json: { page: "https://example.com" } }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ screenshot_url: "https://onesimpleapi.com/screenshots/abc.png" });
    expect(calls[0].url).toContain("/screenshot");
    expect(calls[0].url).toContain("url=https%3A%2F%2Fexample.com");
  });

  it("missing credential throws descriptive error", async () => {
    await expect(
      runNode(TYPE, { resource: "information", operation: "exchangeRate" }, [{}]),
    ).rejects.toThrow(/One Simple API: credential apiToken\/apiKey is required/i);
  });

  it("continueOnFail with failed API returns error item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("API unavailable")),
    );
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "information", operation: "exchangeRate", value: 100, fromCurrency: "USD", toCurrency: "EUR" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item input produces one output per input", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      { resource: "website", operation: "screenshot", link: "https://example.com" },
      [{}, {}],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ screenshot_url: "https://onesimpleapi.com/screenshots/abc.png" });
    expect(out[0][1].json).toEqual({ screenshot_url: "https://onesimpleapi.com/screenshots/abc.png" });
    expect(calls).toHaveLength(2);
  });
});

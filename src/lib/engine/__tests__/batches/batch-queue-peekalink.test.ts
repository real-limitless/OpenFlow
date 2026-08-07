import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.peekalink";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Forbidden",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string; body?: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key, body: typeof opts?.body === "string" ? opts.body : undefined });
      if (!(key in routes)) {
        return mockJsonResponse({ error: "not found" }, 404);
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

describe("batch-queue peekalink — n8n-nodes-base.peekalink", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Peekalink");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.peekalink")).toBe(canonical);
  });

  it("preview operation returns enriched metadata", async () => {
    const fakePreview = {
      url: "https://example.com",
      title: "Example Domain",
      description: "This domain is for use in illustrative examples...",
      domain: "example.com",
      isSafe: true,
      contentType: "website",
    };
    installFetch({
      "https://api.peekalink.io/v2/preview": fakePreview,
    });
    const out = await runNode(
      TYPE,
      { operation: "preview", url: "={{ $json.targetUrl }}" },
      [{ json: { targetUrl: "https://example.com" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("Example Domain");
    expect(out[0][0].json.url).toBe("https://example.com");
    expect(out[0][0].json.targetUrl).toBe("https://example.com");
    expect(calls).toHaveLength(1);
  });

  it("check operation returns availability boolean", async () => {
    installFetch({
      "https://api.peekalink.io/v2/is-available": { isAvailable: true },
    });
    const out = await runNode(
      TYPE,
      { operation: "check", url: "={{ $json.u }}" },
      [{ json: { u: "https://example.com" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.available).toBe(true);
    expect(out[0][0].json.u).toBe("https://example.com");
    expect(calls).toHaveLength(1);
  });

  it("missing URL throws error", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { operation: "preview", url: "" }, [{}]),
    ).rejects.toThrow(/URL is required/i);
  });

  it("continueOnFail with missing URL yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { operation: "preview", url: "", continueOnFail: true },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item produces one output per input", async () => {
    const fakePreview = {
      url: "https://example.com",
      title: "Example Domain",
      domain: "example.com",
    };
    installFetch({
      "https://api.peekalink.io/v2/preview": fakePreview,
    });
    const out = await runNode(
      TYPE,
      { operation: "preview", url: "={{ $json.link }}" },
      [
        { json: { link: "https://example.com" } },
        { json: { link: "https://github.com" } },
      ],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.title).toBe("Example Domain");
    expect(out[0][1].json.title).toBe("Example Domain");
    expect(calls).toHaveLength(2);
  });

  it("API error throws when continueOnFail is false", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { operation: "preview", url: "={{ $json.u }}" }, [
        { json: { u: "https://invalid.example" } },
      ]),
    ).rejects.toThrow(/Peekalink API/i);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.postBinTool";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
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

let calls: Array<{ url: string; method?: string; body?: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key, method: opts?.method, body: typeof opts?.body === "string" ? opts.body : undefined });
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

describe("batch-queue postBinTool — n8n-nodes-base.postBinTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("PostBin Tool");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.postBinTool")).toBe(canonical);
  });

  it("bin create returns bin metadata", async () => {
    const fakeBin = { id: "abc123", binId: "abc123" };
    installFetch({
      "https://www.postb.in/api/bin": fakeBin,
    });
    const out = await runNode(TYPE, { resource: "bin", operation: "create" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.binId).toBe("abc123");
    expect(out[0][0].json.requestUrl).toContain("abc123");
    expect(out[0][0].json.viewUrl).toContain("abc123");
    expect(typeof out[0][0].json.nowTimestamp).toBe("number");
    expect(typeof out[0][0].json.expiresTimestamp).toBe("number");
    expect(calls).toHaveLength(1);
  });

  it("bin get returns bin metadata with valid binId", async () => {
    const fakeBin = { id: "YS4il4gS", created: Date.now() };
    installFetch({
      "https://www.postb.in/api/bin/YS4il4gS": fakeBin,
    });
    const out = await runNode(TYPE, { resource: "bin", operation: "get", binId: "YS4il4gS" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.binId).toBe("YS4il4gS");
    expect(out[0][0].json.requestUrl).toContain("YS4il4gS");
    expect(calls).toHaveLength(1);
  });

  it("bin delete passes through input items", async () => {
    installFetch({
      "https://www.postb.in/api/bin/YS4il4gS": { msg: "Bin Deleted" },
    });
    const out = await runNode(TYPE, { resource: "bin", operation: "delete", binId: "YS4il4gS" }, [{ json: { foo: "bar" } }]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.foo).toBe("bar");
    expect(calls).toHaveLength(1);
  });

  it("request send returns requestId", async () => {
    const fakeSend = { id: "req_789" };
    installFetch({
      "https://www.postb.in/YS4il4gS": fakeSend,
    });
    const out = await runNode(TYPE, { resource: "request", operation: "send", binId: "YS4il4gS", binContent: "hello" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.requestId).toBe("req_789");
    expect(calls).toHaveLength(1);
  });

  it("request get returns request object", async () => {
    const fakeReq = { method: "POST", path: "/", headers: { "content-type": "text/plain" }, body: "hello", binId: "YS4il4gS" };
    installFetch({
      "https://www.postb.in/api/bin/YS4il4gS/req/req_789": fakeReq,
    });
    const out = await runNode(TYPE, { resource: "request", operation: "get", binId: "YS4il4gS", requestId: "req_789" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.method).toBe("POST");
    expect(out[0][0].json.binId).toBe("YS4il4gS");
    expect(calls).toHaveLength(1);
  });

  it("request removeFirst returns request object", async () => {
    const fakeReq = { method: "GET", path: "/test", binId: "YS4il4gS" };
    installFetch({
      "https://www.postb.in/api/bin/YS4il4gS/req/shift": fakeReq,
    });
    const out = await runNode(TYPE, { resource: "request", operation: "removeFirst", binId: "YS4il4gS" }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.method).toBe("GET");
    expect(calls).toHaveLength(1);
  });

  it("invalid binId format throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "bin", operation: "get", binId: "" }, [{}]),
    ).rejects.toThrow(/Bin ID format is not valid/i);
  });

  it("API error throws when continueOnFail is false", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "bin", operation: "create" }, [{}]),
    ).rejects.toThrow(/PostBin API/i);
  });

  it("continueOnFail with API error yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "bin", operation: "create" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });
});

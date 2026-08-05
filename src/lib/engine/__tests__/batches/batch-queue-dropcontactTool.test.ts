import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.dropcontactTool";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async text() {
      return JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string; method?: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key, method: opts?.method ?? "GET" });
      if (key in routes) {
        return mockJsonResponse(routes[key]);
      }
      return mockJsonResponse({ error: "Not found" }, 404);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue dropcontactTool — n8n-nodes-base.dropcontactTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Dropcontact (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.dropcontactTool")).toBe(canonical);
  });

  it("enrich with polling returns enriched contact data", async () => {
    const postResponse = { request_id: "req_123", success: true, credits_left: 42 };
    const getResponse = {
      request_id: "req_123",
      success: true,
      data: [
        {
          first_name: "Peter",
          last_name: "Jackson",
          email: [{ email: "peter.jackson@company.com", qualification: "professional" }],
          company: "Company Inc.",
        },
      ],
    };
    installFetch({
      "https://api.dropcontact.com/v1/enrich/all": postResponse,
      "https://api.dropcontact.com/v1/enrich/all/req_123": getResponse,
    });
    const out = await runNode(
      TYPE,
      {
        operation: "enrich",
        additionalFields: { email: "peter.jackson@company.com" },
        options: { waitTime: 100, language: "en" },
      },
      [{}],
      { credentials: { dropcontactApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.data).toBeDefined();
    expect(out[0][0].json.data[0].first_name).toBe("Peter");
    expect(out[0][0].json.data[0].email[0].email).toBe("peter.jackson@company.com");
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("enrich without waitTime returns immediate POST result", async () => {
    const postResponse = { request_id: "req_456", success: true, credits_left: 42 };
    installFetch({
      "https://api.dropcontact.com/v1/enrich/all": postResponse,
    });
    const out = await runNode(
      TYPE,
      {
        operation: "enrich",
        additionalFields: { email: "test@example.com" },
        options: {},
      },
      [{}],
      { credentials: { dropcontactApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.request_id).toBe("req_456");
    expect(out[0][0].json.success).toBe(true);
    expect(out[0][0].json.credits_left).toBe(42);
    expect(calls).toHaveLength(1);
  });

  it("enrich with simplify flattens data array", async () => {
    const postResponse = {
      request_id: "req_789",
      success: true,
      data: [{ first_name: "Jane", last_name: "Doe" }],
    };
    installFetch({
      "https://api.dropcontact.com/v1/enrich/all": postResponse,
    });
    const out = await runNode(
      TYPE,
      {
        operation: "enrich",
        additionalFields: { email: "jane@example.com" },
        options: {},
        simplify: true,
      },
      [{}],
      { credentials: { dropcontactApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0][0].json.first_name).toBe("Jane");
    expect(out[0][0].json.last_name).toBe("Doe");
  });

  it("fetchRequest returns enriched data by request ID", async () => {
    const getResponse = {
      request_id: "req_abc",
      success: true,
      data: [{ first_name: "John", last_name: "Smith" }],
    };
    installFetch({
      "https://api.dropcontact.com/v1/enrich/all/req_abc": getResponse,
    });
    const out = await runNode(
      TYPE,
      { operation: "fetchRequest", requestId: "req_abc" },
      [{}],
      { credentials: { dropcontactApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.data[0].first_name).toBe("John");
    expect(calls).toHaveLength(1);
  });

  it("throws when credential is missing", async () => {
    await expect(
      runNode(TYPE, { operation: "enrich", additionalFields: { email: "test@example.com" } }, [{}]),
    ).rejects.toThrow(/credential/i);
  });

  it("throws when fetchRequest requestId is empty", async () => {
    await expect(
      runNode(TYPE, { operation: "fetchRequest", requestId: "" }, [{}],
        { credentials: { dropcontactApi: { apiKey: "test-key-123" } } }),
    ).rejects.toThrow(/requestId/i);
  });

  it("continueOnFail with API error yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { operation: "enrich", additionalFields: { email: "test@example.com" }, continueOnFail: true },
      [{}],
      { continueOnFail: true, credentials: { dropcontactApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("multi-item pass-through produces one output per input", async () => {
    const postResponse = { request_id: "req_xyz", success: true, credits_left: 10 };
    installFetch({
      "https://api.dropcontact.com/v1/enrich/all": postResponse,
    });
    const out = await runNode(
      TYPE,
      { operation: "enrich", additionalFields: { email: "test@example.com" }, options: {} },
      [{}, {}],
      { credentials: { dropcontactApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.request_id).toBe("req_xyz");
    expect(out[0][1].json.request_id).toBe("req_xyz");
  });
});

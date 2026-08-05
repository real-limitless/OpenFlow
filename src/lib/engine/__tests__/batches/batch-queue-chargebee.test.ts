import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.chargebee";

const CREDS = { chargebeeApi: { accountName: "test-site", apiKey: "test_api_key_123" } };

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

let calls: Array<{ url: string; method: string; body?: string }> = [];

function installFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      calls.push({ url: String(url), method: opts?.method ?? "GET", body: opts?.body as string | undefined });
      const urlStr = String(url);

      if (urlStr.includes("/customers") && opts?.method === "POST") {
        return mockJsonResponse({ customer: { id: "cbdemo_001", first_name: "Jane", email: "jane@example.com" } });
      }
      if (urlStr.includes("/invoices") && opts?.method === "GET") {
        return mockJsonResponse({
          list: [
            { invoice: { id: "inv_001", amount: 1000, date: 1704067200 } },
            { invoice: { id: "inv_002", amount: 2000, date: 1704153600 } },
          ],
        });
      }
      if (urlStr.includes("/invoices/") && urlStr.includes("/pdf") && opts?.method === "POST") {
        return mockJsonResponse({ download: { download_url: "https://test-site.chargebee.com/download/inv_123.pdf" } });
      }
      if (urlStr.includes("/subscriptions/") && urlStr.includes("/cancel") && opts?.method === "POST") {
        return mockJsonResponse({ subscription: { id: "sub_abc", status: "cancelled" } });
      }
      if (urlStr.includes("/subscriptions/") && urlStr.includes("/delete") && opts?.method === "POST") {
        return mockJsonResponse({ subscription: { id: "sub_abc", status: "deleted" } });
      }

      return mockJsonResponse({ error: "not found" }, 404);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue chargebee — n8n-nodes-base.chargebee", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Chargebee");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.chargebee")).toBe(canonical);
  });

  it("customer — create sends POST to /customers", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "customer",
        operation: "create",
        properties: { first_name: "Jane", email: "jane@example.com" },
      },
      [{ json: {} }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ customer: { id: "cbdemo_001", first_name: "Jane", email: "jane@example.com" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("test-site.chargebee.com/api/v2/customers");
  });

  it("invoice — list with date filter sends GET to /invoices", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "invoice",
        operation: "list",
        maxResults: 5,
        filters: {
          date: [{ operation: "after", value: "2024-01-01T00:00:00Z" }],
        },
      },
      [{ json: {} }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ id: "inv_001", amount: 1000, date: 1704067200 });
    expect(out[0][1].json).toEqual({ id: "inv_002", amount: 2000, date: 1704153600 });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("test-site.chargebee.com/api/v2/invoices");
    expect(calls[0].url).toContain("sort_by%5Bdesc%5D=date");
    expect(calls[0].url).toContain("limit=5");
  });

  it("invoice — pdfUrl sends POST to /invoices/{id}/pdf", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "invoice",
        operation: "pdfUrl",
        invoiceId: "inv_123",
      },
      [{ json: { existingField: "abc" } }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ existingField: "abc", pdfUrl: "https://test-site.chargebee.com/download/inv_123.pdf" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("test-site.chargebee.com/api/v2/invoices/inv_123/pdf");
  });

  it("subscription — cancel (end of term) sends POST to /subscriptions/{id}/cancel", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "subscription",
        operation: "cancel",
        subscriptionId: "sub_abc",
        endOfTerm: true,
      },
      [{ json: {} }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ subscription: { id: "sub_abc", status: "cancelled" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("test-site.chargebee.com/api/v2/subscriptions/sub_abc/cancel");
    expect(calls[0].body).toContain("end_of_term=true");
  });

  it("subscription — delete sends POST to /subscriptions/{id}/delete", async () => {
    installFetch();
    const out = await runNode(
      TYPE,
      {
        resource: "subscription",
        operation: "delete",
        subscriptionId: "sub_abc",
      },
      [{ json: {} }],
      { credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({ subscription: { id: "sub_abc", status: "deleted" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("test-site.chargebee.com/api/v2/subscriptions/sub_abc/delete");
  });

  it("continueOnFail returns error item on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockJsonResponse({ error: "not found" }, 404)),
    );
    const { out } = await runNodeWithCtx(
      TYPE,
      {
        resource: "customer",
        operation: "create",
        properties: { email: "test@example.com" },
      },
      [{ json: {} }],
      { credentials: CREDS, continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});

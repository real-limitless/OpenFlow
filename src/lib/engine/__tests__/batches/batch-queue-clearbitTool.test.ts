import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.clearbitTool";

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

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url).split("?")[0];
      calls.push({ url: String(url) });
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

describe("batch-queue clearbitTool — n8n-nodes-base.clearbitTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Clearbit (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.clearbitTool")).toBe(canonical);
  });

  it("company enrich returns person + company envelope", async () => {
    const fakeResponse = {
      person: { name: { fullName: "Alex" }, email: "alex@stripe.com", employment: { name: "Stripe" } },
      company: { name: "Stripe", domain: "stripe.com", description: "Online payment processing" },
    };
    installFetch({
      "https://api.clearbit.com/v2/combined": fakeResponse,
    });
    const out = await runNode(
      TYPE,
      { resource: "company", operation: "enrich", domain: "stripe.com" },
      [{}],
      { credentials: { clearbitApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.person).toBeDefined();
    expect(out[0][0].json.company).toBeDefined();
    expect(out[0][0].json.person.name.fullName).toBe("Alex");
    expect(out[0][0].json.company.name).toBe("Stripe");
    expect(calls).toHaveLength(1);
  });

  it("company autocomplete returns suggestions", async () => {
    const fakeSuggestions = [
      { name: "Stripe", domain: "stripe.com" },
      { name: "Stripe Press", domain: "stripe.press" },
    ];
    installFetch({
      "https://api.clearbit.com/v2/companies/autocomplete": fakeSuggestions,
    });
    const out = await runNode(
      TYPE,
      { resource: "company", operation: "autocomplete", name: "Stripe" },
      [{}],
      { credentials: { clearbitApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json)).toBe(true);
    expect(out[0][0].json[0].name).toBe("Stripe");
    expect(calls).toHaveLength(1);
  });

  it("person enrich returns person object", async () => {
    const fakePerson = {
      name: { fullName: "Alex Smith" },
      email: "alex@stripe.com",
      employment: { name: "Stripe", domain: "stripe.com" },
    };
    installFetch({
      "https://api.clearbit.com/v2/person": fakePerson,
    });
    const out = await runNode(
      TYPE,
      { resource: "person", operation: "enrich", email: "alex@stripe.com" },
      [{}],
      { credentials: { clearbitApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name.fullName).toBe("Alex Smith");
    expect(out[0][0].json.email).toBe("alex@stripe.com");
    expect(calls).toHaveLength(1);
  });

  it("throws when credential is missing", async () => {
    await expect(
      runNode(TYPE, { resource: "company", operation: "enrich", domain: "stripe.com" }, [{}]),
    ).rejects.toThrow(/credential/i);
  });

  it("continueOnFail with API error yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "person", operation: "enrich", email: "nonexistent@invalid.test", continueOnFail: true },
      [{}],
      { continueOnFail: true, credentials: { clearbitApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeResponse = {
      person: { name: { fullName: "Alex" }, email: "alex@stripe.com" },
      company: { name: "Stripe", domain: "stripe.com" },
    };
    installFetch({
      "https://api.clearbit.com/v2/combined": fakeResponse,
    });
    const out = await runNode(
      TYPE,
      { resource: "company", operation: "enrich", domain: "stripe.com" },
      [{}, {}],
      { credentials: { clearbitApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.company.name).toBe("Stripe");
    expect(out[0][1].json.company.name).toBe("Stripe");
    expect(calls).toHaveLength(2);
  });

  it("multi-item continueOnFail with first error and second success", async () => {
    const fakePerson = {
      name: { fullName: "Alex Stripe" },
      email: "alex@stripe.com",
      employment: { name: "Stripe", domain: "stripe.com" },
    };
    const routeMap: Record<string, unknown> = {};
    routeMap["https://api.clearbit.com/v2/person"] = fakePerson;
    installFetch(routeMap);
    const out = await runNode(
      TYPE,
      { resource: "person", operation: "enrich", email: "{{ $json.email }}" },
      [{ json: { email: "" } }, { json: { email: "alex@stripe.com" } }],
      { continueOnFail: true, credentials: { clearbitApi: { apiKey: "test-key-123" } } },
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][1].json.name.fullName).toBe("Alex Stripe");
    expect(calls).toHaveLength(1);
  });
});

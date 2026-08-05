import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.actionNetworkTool";

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
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

let calls: Array<{ url: string; method: string; body?: string }> = [];

function installFetch(routes: Record<string, { body: unknown; status?: number; method?: string }>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const key = String(url);
      calls.push({ url: key, method: opts?.method as string ?? "GET", body: opts?.body as string | undefined });
      const route = routes[key];
      if (!route) {
        return mockJsonResponse(null, 404);
      }
      return mockJsonResponse(route.body, route.status ?? 200);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue actionNetworkTool — n8n-nodes-base.actionNetworkTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Action Network (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.actionNetworkTool")).toBe(canonical);
  });

  it("person — create sends correct body and returns created person", async () => {
    const fakePerson = {
      identifiers: ["action_network:abc123"],
      email_addresses: [{ address: "test@example.com" }],
      id: "abc123",
    };
    installFetch({
      "https://actionnetwork.org/api/v2/people": {
        body: fakePerson,
        method: "POST",
      },
    });
    const out = await runNode(
      TYPE,
      {
        resource: "Person",
        operation: "Create",
        email: "test@example.com",
        givenName: "Jane",
        familyName: "Doe",
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.identifiers).toContain("action_network:abc123");
    expect(out[0][0].json.email_addresses).toBeDefined();
    expect(out[0][0].json.id).toBe("abc123");
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.method).toBe("POST");
    const parsed = JSON.parse(call.body ?? "{}");
    expect(parsed.email_addresses).toEqual([{ address: "test@example.com" }]);
    expect(parsed.given_name).toBe("Jane");
    expect(parsed.family_name).toBe("Doe");
  });

  it("event — getAll returns results array", async () => {
    const fakeEvents = { _embedded: { items: [{ title: "Test Event", origin_system: "OpenFlow", start_date: "2026-01-01", identifiers: ["action_network:evt1"] }] }, total_items: 1 };
    installFetch({
      "https://actionnetwork.org/api/v2/events?per_page=25": {
        body: fakeEvents,
      },
    });
    const out = await runNode(TYPE, { resource: "Event", operation: "GetAll", returnAll: false }, [{}]);
    expect(out[0]).toHaveLength(1);
    expect(Array.isArray(out[0][0].json.results)).toBe(true);
    expect(out[0][0].json.results[0].title).toBe("Test Event");
    expect(calls).toHaveLength(1);
  });

  it("petition — get by ID returns petition object", async () => {
    const fakePetition = { title: "Sign the Petition", identifiers: ["action_network:pet1"], id: "pet1" };
    installFetch({
      "https://actionnetwork.org/api/v2/petitions/pet1": {
        body: fakePetition,
      },
    });
    const out = await runNode(
      TYPE,
      { resource: "Petition", operation: "Get", petitionId: "pet1" },
      [{ json: { petitionId: "pet1" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.title).toBe("Sign the Petition");
    expect(out[0][0].json.id).toBe("pet1");
    expect(calls).toHaveLength(1);
  });

  it("person — get expression-based personId from input", async () => {
    const fakePerson = { identifiers: ["action_network:person1"], given_name: "Alice", id: "person1" };
    installFetch({
      "https://actionnetwork.org/api/v2/people/person1": {
        body: fakePerson,
      },
    });
    const out = await runNode(
      TYPE,
      { resource: "Person", operation: "Get", personId: "={{ $json.personId }}" },
      [{ json: { personId: "person1" } }],
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.given_name).toBe("Alice");
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with invalid params yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "Person", operation: "Get", personId: "" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakePerson = { id: "abc", identifiers: ["action_network:abc"] };
    installFetch({
      "https://actionnetwork.org/api/v2/people": {
        body: fakePerson,
        method: "POST",
      },
    });
    const out = await runNode(
      TYPE,
      { resource: "Person", operation: "Create", email: "a@b.com" },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.id).toBe("abc");
    expect(out[0][1].json.id).toBe("abc");
    expect(calls).toHaveLength(2);
  });

  it("unsupported resource/operation throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "Person", operation: "Delete" }, [{}]),
    ).rejects.toThrow(/unsupported/i);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, { resource: "Event", operation: "GetAll" }, [{}]),
    ).rejects.toThrow();
  });
});

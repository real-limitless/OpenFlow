import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType } from "@/lib/nodes/registry";
import { runNode, makeNode } from "../helpers";
import { seedBuiltinExecutors } from "../../index";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.freshworksCrm";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

function jsonBody(call: FetchCall): unknown {
  if (!call.body) return undefined;
  try { return JSON.parse(call.body); } catch { return call.body; }
}

describe("batch-queue freshworksCrm — n8n-nodes-base.freshworksCrm", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Freshworks CRM");
  });

  describe("create a contact", () => {
    it("sends POST to create contact with fields and returns the contact object", async () => {
      responseQueue = [mockResponse({
        contact: {
          id: 101,
          first_name: "Alice",
          last_name: "Smith",
          email: "alice@example.com",
          mobile_number: "+1-555-0100",
          display_name: "Alice Smith",
        },
      })];

      const [output] = await runNode(TYPE, {
        resource: "contact",
        operation: "create",
        contactFields: {
          first_name: "Alice",
          last_name: "Smith",
          email: "alice@example.com",
          mobile_number: "+1-555-0100",
        },
      }, [{}], {
        credentials: {
          freshworksCrmApi: {
            domain: "test",
            apiKey: "key-123",
          },
        },
      });

      expect(lastCall().method).toBe("POST");
      expect(lastCall().url).toContain("/api/contacts");
      const body = jsonBody(lastCall()) as Record<string, unknown>;
      expect((body.contact as Record<string, unknown>).first_name).toBe("Alice");

      expect(output[0].json).toMatchObject({
        contact: {
          id: 101,
          first_name: "Alice",
          last_name: "Smith",
          email: "alice@example.com",
          mobile_number: "+1-555-0100",
          display_name: "Alice Smith",
        },
      });
    });
  });

  describe("get all accounts", () => {
    it("sends GET with view and limit, returns account array", async () => {
      responseQueue = [mockResponse({
        accounts: [
          { id: 1, name: "Acme Corp" },
          { id: 2, name: "Globex" },
        ],
      })];

      const [output] = await runNode(TYPE, {
        resource: "account",
        operation: "getAll",
        view: 3,
        limit: 10,
      }, [{}], {
        credentials: { freshworksCrmApi: { domain: "test", apiKey: "key-123" } },
      });

      expect(lastCall().method).toBe("GET");
      expect(lastCall().url).toContain("/api/accounts");
      expect(lastCall().url).toContain("per_page=10");
      expect(lastCall().url).toContain("filter=3");

      expect(Array.isArray(output)).toBe(true);
      expect(output).toHaveLength(2);
      expect(output[0].json).toMatchObject({ id: 1, name: "Acme Corp" });
    });
  });

  describe("delete a deal", () => {
    it("sends DELETE and returns empty object", async () => {
      responseQueue = [mockResponse(null, { status: 204 })];

      const [output] = await runNode(TYPE, {
        resource: "deal",
        operation: "delete",
        dealId: 42,
      }, [{}], {
        credentials: { freshworksCrmApi: { domain: "test", apiKey: "key-123" } },
      });

      expect(lastCall().method).toBe("DELETE");
      expect(lastCall().url).toContain("/api/deals/42");

      expect(output[0].json).toEqual({});
    });
  });

  describe("update a note", () => {
    it("sends PUT with description and returns updated note", async () => {
      responseQueue = [mockResponse({
        note: { id: 7, description: "Updated follow-up summary" },
      })];

      const [output] = await runNode(TYPE, {
        resource: "note",
        operation: "update",
        noteId: 7,
        noteFields: { description: "Updated follow-up summary" },
      }, [{}], {
        credentials: { freshworksCrmApi: { domain: "test", apiKey: "key-123" } },
      });

      expect(lastCall().method).toBe("PUT");
      expect(lastCall().url).toContain("/api/notes/7");
      const body = jsonBody(lastCall()) as Record<string, unknown>;
      expect((body.note as Record<string, unknown>).description).toBe("Updated follow-up summary");

      expect(output[0].json).toMatchObject({
        note: {
          id: 7,
          description: "Updated follow-up summary",
        },
      });
    });
  });

  describe("search across entities", () => {
    it("sends GET search and returns flat results with _type", async () => {
      responseQueue = [mockResponse({
        results: [
          { _type: "contact", id: 10, first_name: "Alice" },
          { _type: "deal", id: 20, deal_name: "Acme Corp Deal" },
        ],
      })];

      const [output] = await runNode(TYPE, {
        resource: "search",
        operation: "search",
        searchTerm: "Acme Corp",
        entities: ["contact", "deal", "account"],
      }, [{}], {
        credentials: { freshworksCrmApi: { domain: "test", apiKey: "key-123" } },
      });

      expect(lastCall().method).toBe("GET");
      expect(lastCall().url).toContain("/api/search");
      expect(lastCall().url).toContain("q=Acme%20Corp");
      expect(lastCall().url).toContain("include=contact,deal,account");

      expect(output).toHaveLength(2);
      expect(output[0].json).toMatchObject({ _type: "contact", id: 10 });
      expect(output[1].json).toMatchObject({ _type: "deal", id: 20 });
    });
  });

  describe("continue on fail", () => {
    it("emits error object when API fails and continueOnFail is set", async () => {
      responseQueue = [mockResponse({ message: "Not found" }, { status: 404 })];

      const [output] = await runNode(TYPE, {
        resource: "contact",
        operation: "get",
        contactId: 999,
      }, [{}], {
        continueOnFail: true,
        credentials: { freshworksCrmApi: { domain: "test", apiKey: "key-123" } },
      });

      expect(output[0].json).toHaveProperty("error");
      expect((output[0].json as { error: { message: string } }).error.message).toContain("404");
    });
  });
});

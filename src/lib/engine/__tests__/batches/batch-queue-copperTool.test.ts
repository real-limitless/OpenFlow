import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.copperTool";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function mockResponse(body: unknown, init: { status?: number; contentType?: string; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
      forEach(fn: (v: string, k: string) => void) { map.forEach((v, k) => fn(v, k)); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
    async arrayBuffer() { return Buffer.from(text); },
  };
}

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url,
      method: (init?.method as string) ?? "GET",
      headers,
      body: init?.body as string | undefined,
    });
    return responseQueue.shift() ?? mockResponse({});
  }));
}

describe("n8n-nodes-base.copperTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  const mockCreds = {
    copperApi: { apiKey: "test-key-123", email: "bot@example.com" },
  };

  it("creates a lead", async () => {
    const expectedResponse = {
      id: 12345,
      name: "Test Lead",
      date_created: 1680000000,
      date_modified: 1680000000,
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "lead",
      operation: "create",
      name: "Test Lead",
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: 12345, name: "Test Lead" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/leads");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.name).toBe("Test Lead");
  });

  it("gets a company by ID", async () => {
    const expectedResponse = { id: 42, name: "Acme Corp" };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "company",
      operation: "get",
      companyId: "42",
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: 42, name: "Acme Corp" });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/companies/42");
  });

  it("lists all customer sources", async () => {
    const expectedResponse = [
      { id: 1, name: "Phone Inquiry" },
      { id: 2, name: "Website" },
    ];
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "customerSource",
      operation: "getAll",
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toEqual(expectedResponse);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/customer_sources");
  });

  it("updates a person", async () => {
    const expectedResponse = { id: "p_1", details: "Updated description" };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "person",
      operation: "update",
      personId: "={{ $json.personId }}",
      updateFields: { details: "Updated description" },
    }, [{ json: { personId: "p_1" } }], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: "p_1", details: "Updated description" });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/people/p_1");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.details).toBe("Updated description");
  });

  it("deletes an opportunity", async () => {
    installFetch(mockResponse({ id: "opp_1" }));

    const out = await runNode(TYPE, {
      resource: "opportunity",
      operation: "delete",
      opportunityId: "={{ $json.opportunityId }}",
    }, [{ json: { opportunityId: "opp_1" } }], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: "opp_1" });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/opportunities/opp_1");
  });

  it("lists tasks with filtering", async () => {
    const expectedResponse = [{ id: 1, name: "Task 1" }, { id: 2, name: "Task 2" }];
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "task",
      operation: "getAll",
      returnAll: false,
      limit: 10,
      filterFields: { assignee_ids: "user_1" },
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toHaveLength(2);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/tasks/search");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.assignee_ids).toEqual(["user_1"]);
    expect(body.page_size).toBe(200);
  });

  it("returns error on continueOnFail", async () => {
    installFetch(mockResponse({ error: "Not found" }, { status: 404 }));

    const out = await runNode(TYPE,
      { resource: "company", operation: "get", companyId: "999" },
      [{}],
      { continueOnFail: true, credentials: mockCreds },
    );

    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toHaveProperty("message");
    expect(out[0][0].json.error).toHaveProperty("statusCode");
  });
});

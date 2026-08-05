import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.copper";

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

describe("n8n-nodes-base.copper", () => {
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
      name: "Jane Doe",
      email: { email: "jane@example.com", category: "work" },
      customer_source_id: 1,
      status: "Contacted",
      tags: ["webinar", "trial"],
      date_created: 1680000000,
      date_modified: 1680000000,
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "Lead",
      operation: "Create",
      additionalFields: {
        name: "Jane Doe",
        email: JSON.stringify({ email: "jane@example.com", category: "work" }),
        customer_source_id: 1,
        status: "Contacted",
        tags: "webinar, trial",
      },
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: 12345,
      name: "Jane Doe",
      status: "Contacted",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/leads");
    expect(calls[0].headers["X-Authorization"]).toBe("Token test-key-123");

    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.name).toBe("Jane Doe");
    expect(body.tags).toEqual(["webinar", "trial"]);
  });

  it("gets a company by ID", async () => {
    const expectedResponse = {
      id: 42,
      name: "Acme Corp",
      assignee_id: 1,
      date_created: 1679000000,
      date_modified: 1679000000,
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "Company",
      operation: "Get",
      companyId: "42",
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: 42, name: "Acme Corp" });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/companies/42");
  });

  it("lists all customer sources", async () => {
    const expectedResponse = [
      { id: 1, name: "Phone Inquiry" },
      { id: 2, name: "Website" },
      { id: 3, name: "Email" },
    ];
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "CustomerSource",
      operation: "GetAll",
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0][0].json).toEqual(expectedResponse);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/customer_sources");
  });

  it("updates an opportunity status", async () => {
    const expectedResponse = {
      id: 77,
      status: "Won",
      monetary_value: 50000,
      date_modified: 1680100000,
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "Opportunity",
      operation: "Update",
      opportunityId: "77",
      additionalFields: {
        status: "Won",
        monetary_value: 50000,
      },
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: 77, status: "Won" });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/opportunities/77");
  });

  it("deletes a task", async () => {
    const expectedResponse = { id: 99, name: "Old Task" };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "Task",
      operation: "Delete",
      taskId: "99",
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: 99, name: "Old Task" });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/tasks/99");
  });

  it("uses expression-bound companyId", async () => {
    const expectedResponse = { id: 42, name: "Acme Corp" };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE,
      {
        resource: "Company",
        operation: "Get",
        companyId: "={{ $json.companyId }}",
      },
      [{ json: { companyId: 42 } }],
      { credentials: mockCreds },
    );

    expect(out[0][0].json).toMatchObject({ id: 42 });
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/companies/42");
  });

  it("returns error object on continueOnFail", async () => {
    installFetch(mockResponse({ error: "Not found" }, { status: 404 }));

    const out = await runNode(TYPE,
      { resource: "Company", operation: "Get", companyId: "999" },
      [{}],
      { continueOnFail: true, credentials: mockCreds },
    );

    expect(out).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toHaveProperty("message");
    expect(out[0][0].json.error).toHaveProperty("statusCode");
  });

  it("gets all leads with search", async () => {
    const expectedResponse = [
      { id: 1, name: "Lead 1" },
      { id: 2, name: "Lead 2" },
    ];
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "Lead",
      operation: "GetAll",
      returnAll: false,
      limit: 10,
      options: { page_size: 200, sort_by: "name", sort_direction: "asc" },
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0][0].json).toHaveLength(2);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.copper.com/developer_api/v1/leads/search");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.page_size).toBe(200);
    expect(body.sort_by).toBe("name");
  });
});

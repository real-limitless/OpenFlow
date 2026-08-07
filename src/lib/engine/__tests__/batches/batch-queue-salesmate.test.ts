import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.salesmate";

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

const mockCreds = {
  salesmateApi: { sessionToken: "tok_abc123", url: "https://api.salesmate.io" },
};

describe("n8n-nodes-base.salesmate", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("creates a company", async () => {
    const expectedResponse = {
      Data: { id: "comp_001", name: "Acme Corp", website: "https://acme.example.com", phone: "+1-555-0100", createdAt: "2024-01-15T10:30:00.000Z", createdBy: "usr_001" },
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "company",
      operation: "create",
      name: "Acme Corp",
      owner: "usr_001",
      additionalFields: { website: "https://acme.example.com", phone: "+1-555-0100" },
    }, [{ json: { companyName: "Acme Corp", website: "https://acme.example.com" } }], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      id: "comp_001",
      name: "Acme Corp",
      website: "https://acme.example.com",
      phone: "+1-555-0100",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/company/add");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.name).toBe("Acme Corp");
    expect(body.website).toBe("https://acme.example.com");
  });

  it("gets a company by ID", async () => {
    const expectedResponse = {
      Data: { id: "12345", name: "Existing Corp", website: "https://existing.com" },
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "company",
      operation: "get",
      companyId: "12345",
    }, [{ json: { companyId: "12345" } }], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: "12345", name: "Existing Corp" });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/company/12345");
  });

  it("creates an activity", async () => {
    const expectedResponse = {
      Data: { id: "act_001", title: "Follow-up call with lead", type: "call", owner: "user_001" },
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "activity",
      operation: "create",
      activityType: "call",
      title: "Follow-up call with lead",
      owner: "user_001",
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({
      id: "act_001",
      title: "Follow-up call with lead",
      type: "call",
      owner: "user_001",
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/activity/add");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.title).toBe("Follow-up call with lead");
    expect(body.type).toBe("call");
    expect(body.owner).toBe("user_001");
  });

  it("lists deals with filters", async () => {
    const expectedResponse = {
      Data: [
        { id: "deal_1", title: "Deal A", createdAt: "2024-03-01T00:00:00.000Z" },
        { id: "deal_2", title: "Deal B", createdAt: "2024-02-15T00:00:00.000Z" },
        { id: "deal_3", title: "Deal C", createdAt: "2024-01-10T00:00:00.000Z" },
      ],
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "deal",
      operation: "getAll",
      returnAll: false,
      limit: 10,
      options: { sortBy: "createdAt", sortOrder: "desc" },
    }, [{}], { credentials: mockCreds });

    expect(out[0]).toHaveLength(3);
    expect(out[0][0].json).toMatchObject({ id: "deal_1", title: "Deal A" });
    expect(out[0][1].json).toMatchObject({ id: "deal_2", title: "Deal B" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/deal/search");
  });

  it("deletes a company", async () => {
    installFetch(mockResponse({ Data: { success: true } }));

    const out = await runNode(TYPE, {
      resource: "company",
      operation: "delete",
      companyId: "12345",
    }, [{ json: { companyId: "12345" } }], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: "12345", success: true });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/company/12345");
  });

  it("throws on missing credential", async () => {
    await expect(runNode(TYPE, { resource: "deal", operation: "create", title: "Test" }, [{}], { credentials: {} }))
      .rejects.toThrow("Salesmate: credential is not configured");
  });

  it("handles continueOnFail on error", async () => {
    installFetch(mockResponse({ Message: "Not found" }, { status: 404 }));

    const out = await runNode(TYPE, {
      resource: "deal",
      operation: "get",
      dealId: "nonexistent",
    }, [{}], { credentials: mockCreds, continueOnFail: true });

    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Salesmate") });
  });
});

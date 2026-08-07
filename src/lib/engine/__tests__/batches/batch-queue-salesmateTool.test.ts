import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.salesmateTool";

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

describe("n8n-nodes-base.salesmateTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  it("creates a deal", async () => {
    const expectedResponse = {
      Data: { id: "deal_456", title: "New Enterprise Deal", owner: "usr_123", dealValue: null, expectedCloseDate: null, createdAt: "2024-01-15T10:30:00.000Z" },
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "deal",
      operation: "create",
      title: "New Enterprise Deal",
      owner: "usr_123",
    }, [{}], { credentials: mockCreds });

    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ id: "deal_456", title: "New Enterprise Deal", owner: "usr_123" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/deal/add");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.title).toBe("New Enterprise Deal");
  });

  it("creates a company (name not title)", async () => {
    const expectedResponse = {
      Data: { id: "comp_new", name: "NewCo Inc", website: "newco.com", createdAt: "2024-02-01T08:00:00.000Z" },
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "company",
      operation: "create",
      title: "NewCo Inc",
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: "comp_new", name: "NewCo Inc" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/company/add");
    const body = JSON.parse(calls[0].body ?? "{}");
    expect(body.name).toBe("NewCo Inc");
    expect(body.title).toBeUndefined();
  });

  it("gets a company by ID", async () => {
    const expectedResponse = {
      Data: { id: "comp_789", name: "Acme Corp", website: "acme.com", email: "info@acme.com", phone: "+1-555-1234", owner: "usr_123", createdAt: "2023-06-01T00:00:00.000Z" },
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "company",
      operation: "get",
      companyId: "comp_789",
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: "comp_789", name: "Acme Corp" });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/company/comp_789");
  });

  it("lists activities with pagination", async () => {
    const expectedResponse = {
      Data: [
        { id: "act_1", title: "Call with client", type: "call", createdAt: "2024-02-10T14:00:00.000Z" },
        { id: "act_2", title: "Follow-up meeting", type: "meeting", createdAt: "2024-02-09T10:00:00.000Z" },
      ],
    };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "activity",
      operation: "getAll",
      returnAll: false,
      limit: 5,
      options: { sortBy: "createdAt", sortOrder: "desc" },
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toHaveLength(2);
    expect(out[0][0].json[0]).toMatchObject({ id: "act_1", title: "Call with client" });
    expect(out[0][0].json[1]).toMatchObject({ id: "act_2", title: "Follow-up meeting" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/activity/search");
  });

  it("updates an activity", async () => {
    const expectedResponse = { Data: { id: "act_1", success: true } };
    installFetch(mockResponse(expectedResponse));

    const out = await runNode(TYPE, {
      resource: "activity",
      operation: "update",
      activityId: "act_1",
      updateFields: { title: "Updated: Call with client", isCompleted: true },
    }, [{ json: { newTitle: "Updated: Call with client" } }], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: "act_1", success: true });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/activity/act_1");
  });

  it("deletes a deal", async () => {
    installFetch(mockResponse({ Data: { success: true } }));

    const out = await runNode(TYPE, {
      resource: "deal",
      operation: "delete",
      dealId: "deal_999",
    }, [{}], { credentials: mockCreds });

    expect(out[0][0].json).toMatchObject({ id: "deal_999", success: true });
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.salesmate.io/v1/deal/deal_999");
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

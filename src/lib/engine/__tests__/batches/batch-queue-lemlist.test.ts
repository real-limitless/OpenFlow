import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.lemlist";

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
    statusText: status === 200 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      forEach(cb: (v: string, k: string) => void) {
        map.forEach(cb);
      },
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response = mockResponse({ data: [] })) {
  nextResponse = response;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers,
      });
      return nextResponse;
    }),
  );
}

function toItems(input: Array<Record<string, unknown> | INodeExecutionData>): INodeExecutionData[] {
  return input.map((i) =>
    i && typeof i === "object" && "json" in i
      ? (i as INodeExecutionData)
      : { json: i as Record<string, unknown> },
  );
}

function makeCtx(
  items: INodeExecutionData[],
  node: INode,
  continueOnFail = false,
  credentials?: Record<string, Record<string, unknown>>,
): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: {
      id: "wf",
      name: "Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () => items,
    continueOnFail,
    getCredential: async (name) => credentials?.[name] ?? null,
  });
}

const CREDS = { lemlistApi: { apiKey: "test-api-key-abc" } };

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: {
    continueOnFail?: boolean;
    credentials?: Record<string, Record<string, unknown>>;
  },
) {
  const creds = opts?.credentials ?? CREDS;
  const node = makeNode({
    name: "N",
    type: TYPE,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue lemlist — n8n-nodes-base.lemlist", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE)).toBeDefined();
  });

  it("activity get many — paginated (returnAll=false)", async () => {
    installFetch(
      mockResponse({
        data: [
          { type: "emailsOpened", campaignId: "camp_1", leadId: "lead_1", createdAt: "2025-01-01T00:00:00Z" },
          { type: "emailsClicked", campaignId: "camp_1", leadId: "lead_2", createdAt: "2025-01-01T01:00:00Z" },
        ],
      }),
    );
    const out = await run({
      resource: "activity",
      operation: "getAll",
      returnAll: false,
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/activities");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toHaveProperty("type");
  });

  it("activity get many — with filters", async () => {
    installFetch(
      mockResponse({
        data: [{ type: "emailsOpened", campaignId: "camp_1", leadId: "lead_1" }],
      }),
    );
    const out = await run({
      resource: "activity",
      operation: "getAll",
      returnAll: false,
      limit: 10,
      filters: { campaignId: "camp_1", type: "emailsOpened" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("campaignId=camp_1");
    expect(calls[0].url).toContain("type=emailsOpened");
    expect(out[0]).toHaveLength(1);
  });

  it("team get credits", async () => {
    installFetch(
      mockResponse({ remaining: 500, total: 1000, used: 500 }),
    );
    const out = await run({
      resource: "team",
      operation: "getCredits",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/team/credits");
    expect(out[0][0].json).toMatchObject({
      remaining: 500,
      total: 1000,
      used: 500,
    });
  });

  it("team get", async () => {
    installFetch(
      mockResponse({ _id: "team_1", name: "My Team", plan: "business" }),
    );
    const out = await run({
      resource: "team",
      operation: "get",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/team");
    expect(out[0][0].json).toHaveProperty("_id");
  });

  it("lead create", async () => {
    installFetch(
      mockResponse({
        _id: "lead_1",
        email: "test@example.com",
        campaignId: "abc-123",
      }),
    );
    const out = await run({
      resource: "lead",
      operation: "create",
      campaignId: "abc-123",
      email: "test@example.com",
      additionalFields: { firstName: "Test", lastName: "User" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/leads");
    expect(calls[0].method).toBe("POST");
    expect(out[0][0].json).toHaveProperty("_id");
    expect((out[0][0].json as Record<string, unknown>).email).toBe("test@example.com");
  });

  it("lead get", async () => {
    installFetch(
      mockResponse({ _id: "lead_1", email: "test@example.com" }),
    );
    const out = await run({
      resource: "lead",
      operation: "get",
      email: "test@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/leads/test%40example.com");
    expect(calls[0].method).toBe("GET");
    expect((out[0][0].json as Record<string, unknown>).email).toBe("test@example.com");
  });

  it("lead delete", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "lead",
      operation: "delete",
      campaignId: "abc-123",
      email: "test@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/leads/abc-123/test%40example.com");
    expect(calls[0].method).toBe("DELETE");
  });

  it("lead unsubscribe", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "lead",
      operation: "unsubscribe",
      campaignId: "abc-123",
      email: "test@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/leads/abc-123/test%40example.com/unsubscribe");
    expect(calls[0].method).toBe("POST");
  });

  it("campaign get many", async () => {
    installFetch(
      mockResponse({
        data: [
          { _id: "camp_1", name: "Campaign 1" },
          { _id: "camp_2", name: "Campaign 2" },
        ],
      }),
    );
    const out = await run({
      resource: "campaign",
      operation: "getAll",
      returnAll: false,
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/campaigns");
    expect(out[0]).toHaveLength(2);
  });

  it("campaign get stats", async () => {
    installFetch(
      mockResponse({ campaignId: "camp_1", sent: 100, opened: 50, replied: 10 }),
    );
    const out = await run({
      resource: "campaign",
      operation: "getStats",
      campaignId: "camp_1",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      timezone: "America/New_York",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/campaigns/camp_1/stats");
    expect((out[0][0].json as Record<string, unknown>).sent).toBe(100);
  });

  it("unsubscribe add", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "unsubscribe",
      operation: "add",
      email: "unsub@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/unsubscribes/unsub%40example.com");
    expect(calls[0].method).toBe("POST");
  });

  it("unsubscribe delete", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "unsubscribe",
      operation: "delete",
      email: "unsub@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/unsubscribes/unsub%40example.com");
    expect(calls[0].method).toBe("DELETE");
  });

  it("unsubscribe get many", async () => {
    installFetch(
      mockResponse({
        data: [
          { email: "a@example.com" },
          { email: "b@example.com" },
        ],
      }),
    );
    const out = await run({
      resource: "unsubscribe",
      operation: "getAll",
      returnAll: false,
      limit: 10,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/unsubscribes");
    expect(out[0]).toHaveLength(2);
  });

  it("enrichment get (fetch result)", async () => {
    installFetch(
      mockResponse({ _id: "enr_1", status: "completed", data: { email: "found@example.com" } }),
    );
    const out = await run({
      resource: "enrichment",
      operation: "get",
      enrichId: "enr_1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/enrichments/enr_1");
    expect((out[0][0].json as Record<string, unknown>)._id).toBe("enr_1");
  });

  it("enrichment enrich lead", async () => {
    installFetch(
      mockResponse({ _id: "enr_1", status: "started" }),
    );
    const out = await run({
      resource: "enrichment",
      operation: "enrichLead",
      leadId: "lead_1",
      additionalFields: { findEmail: true, verifyEmail: true },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.lemlist.com/api/enrichments");
    expect(calls[0].method).toBe("POST");
    expect((out[0][0].json as Record<string, unknown>)._id).toBe("enr_1");
  });

  it("continue on fail — error item emitted", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return mockResponse({}, { status: 403 });
        }
        return mockResponse({ data: [{ type: "emailsOpened" }] });
      }),
    );

    const out = await run(
      {
        resource: "activity",
        operation: "getAll",
        returnAll: false,
        limit: 5,
      },
      [{ json: {} }, { json: {} }],
      { continueOnFail: true, credentials: {} },
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ error: expect.any(String) });
    expect(out[0][1].json).toMatchObject({ error: expect.any(String) });
  });

  it("throws when credentials are missing", async () => {
    await expect(
      run(
        { resource: "team", operation: "get" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow("Lemlist: lemlistApi credential is not configured");
  });

  it("runs end-to-end in a workflow", async () => {
    installFetch(
      mockResponse({ remaining: 500, total: 1000, used: 500 }),
    );

    const node: INode = {
      id: "l1",
      name: "Lemlist",
      type: TYPE,
      typeVersion: 2,
      position: [0, 0],
      parameters: {
        resource: "team",
        operation: "getCredits",
      },
      credentials: { lemlistApi: { name: "lemlistApi" } },
    };

    const wf = makeWorkflow([node], {});
    const wfCtx = createExecutionContext({
      node,
      workflow: wf,
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-key" }),
    });

    const executor = getExecutor(TYPE)!;
    const result = await executor(wfCtx, node);
    expect(result[0][0].json).toMatchObject({
      remaining: 500,
      total: 1000,
      used: 500,
    });
  });
});

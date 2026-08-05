import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.customerIoTool";

interface MockResponseInit {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const ct = init.contentType ?? "application/json";
  const map = new Map<string, string>([["content-type", ct]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) ?? null;
      },
      entries() {
        return map.entries();
      },
    },
    async json() {
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
  };
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

let calls: FetchCall[];
let nextResponse: ReturnType<typeof mockResponse>;

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({})) {
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
        body: typeof init?.body === "string" ? init.body : undefined,
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

const CREDS: Record<string, Record<string, unknown>> = {
  customerIoApi: {
    trackingApiKey: "track-key-123",
    trackingSiteId: "site-456",
    appApiKey: "app-key-789",
    region: "global",
  },
};

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

describe("batch-queue customerIoTool — n8n-nodes-base.customerIoTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("Customer.io (AI Tool)");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.customerIoTool")).toBe(canonical);
  });

  it("creates/updates a customer via Track API", async () => {
    installFetch(mockResponse({ id: "cust_123", status: "success" }));
    const out = await run({
      resource: "customer",
      operation: "upsert",
      id: "cust_123",
      email: "user@example.com",
      customerAttributes: { plan: "premium", signupDate: "2026-01-15" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("/customers/cust_123");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.email).toBe("user@example.com");
    expect(sentBody.attributes).toEqual({ plan: "premium", signupDate: "2026-01-15" });
    expect(out[0][0].json).toMatchObject({ id: "cust_123", status: "success" });
  });

  it("tracks a customer event via Track API", async () => {
    installFetch(mockResponse({ status: "success" }));
    const out = await run(
      {
        resource: "event",
        operation: "track",
        customerId: "{{ $json.customerId }}",
        eventName: "{{ $json.event }}",
        eventAttributes: { value: 49.99, currency: "USD" },
      },
      [{ json: { customerId: "123", event: "purchase_completed" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/events");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.name).toBe("purchase_completed");
    expect(sentBody.customer_id).toBe("123");
    expect(sentBody.data).toEqual({ value: 49.99, currency: "USD" });
  });

  it("tracks an anonymous event via Track API (trackAnonymous)", async () => {
    installFetch(mockResponse({ status: "success" }));
    const out = await run(
      {
        resource: "event",
        operation: "trackAnonymous",
        eventName: "page_view",
        anonymousId: "anon_789",
        eventAttributes: { page: "/home", referrer: "google.com" },
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/events");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.name).toBe("page_view");
    expect(sentBody.anonymous_id).toBe("anon_789");
    expect(sentBody.customer_id).toBeUndefined();
    expect(sentBody.data).toEqual({ page: "/home", referrer: "google.com" });
    expect(out[0][0].json).toMatchObject({ status: "success" });
  });

  it("gets campaign metrics via App API", async () => {
    installFetch(
      mockResponse({
        campaign: { id: "1", name: "Test Campaign" },
        metrics: { sent: 1000, delivered: 950, opened: 500, clicked: 200, bounced: 10 },
      }),
    );
    const out = await run(
      {
        resource: "campaign",
        operation: "getMetrics",
        campaignId: "{{ $json.campaignId }}",
      },
      [{ json: { campaignId: "1" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/campaigns/1/metrics");
    expect(out[0][0].json).toMatchObject({
      campaign: { id: "1" },
      metrics: { sent: 1000 },
    });
  });

  it("adds a customer to a segment", async () => {
    installFetch(mockResponse({ status: "success", action: "added" }));
    const out = await run(
      {
        resource: "segment",
        operation: "add",
        segmentId: "{{ $json.segmentId }}",
        customerId: "{{ $json.customerId }}",
      },
      [{ json: { customerId: "123", segmentId: "seg_456" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/segments/seg_456/memberships");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.customer_id).toBe("123");
    expect(out[0][0].json).toMatchObject({ status: "success" });
  });

  it("gets a campaign via App API ($fromAI mode)", async () => {
    installFetch(
      mockResponse({
        campaign: { id: "camp_789", name: "Launch Campaign", status: "sent" },
      }),
    );
    const out = await run(
      {
        resource: "campaign",
        operation: "get",
        campaignId: "{{ $json.campaignId }}",
      },
      [{ json: { campaignId: "camp_789" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/campaigns/camp_789");
    expect(out[0][0].json).toMatchObject({
      id: "camp_789", name: "Launch Campaign",
    });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "customer", operation: "upsert", id: "123" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/Tracking API Key and Tracking Site ID are required/);
  });

  it("continues on fail when continueOnFail is set", async () => {
    installFetch(mockResponse({ error: "not_found" }, { status: 404 }));
    const out = await run(
      { resource: "customer", operation: "upsert", id: "nonexistent" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0][0].json).toMatchObject({ error: expect.stringContaining("Customer.io API error") });
  });
});

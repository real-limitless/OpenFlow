import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.hubspotTool";

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
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
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

const CREDS = { hubspotApi: { apiKey: "test-api-key" } };

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

describe("batch-queue hubspotTool — n8n-nodes-base.hubspotTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).displayName).toBe("HubSpot (AI Tool)");
  });

  it("upserts a contact via AI agent", async () => {
    installFetch(
      mockResponse({
        id: "123456",
        properties: { email: { value: "jane@example.com" }, firstname: { value: "Jane" }, lastname: { value: "Doe" } },
      }),
    );
    const out = await run({
      resource: "contact",
      operation: "upsert",
      email: "jane@example.com",
      additionalFields: JSON.stringify({ firstname: "Jane", lastname: "Doe", phone: "+12025551234" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/crm/v3/objects/contacts");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.properties.email).toBe("jane@example.com");
    expect(sentBody.properties.firstname).toBe("Jane");
    expect(out[0][0].json).toMatchObject({
      vid: 123456,
      isNew: true,
    });
  });

  it("creates a deal with pipeline and stage", async () => {
    installFetch(
      mockResponse({
        id: "98765",
        portalId: 12345,
        isDeleted: false,
      }),
    );
    const out = await run({
      resource: "deal",
      operation: "create",
      stage: "appointmentscheduled",
      additionalFields: JSON.stringify({ dealname: "New Deal from AI", amount: 5000 }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/crm/v3/objects/deals");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.properties.dealstage).toBe("appointmentscheduled");
    expect(sentBody.properties.dealname).toBe("New Deal from AI");
    expect(out[0][0].json).toMatchObject({
      dealId: 98765,
      portalId: 12345,
      isDeleted: false,
    });
  });

  it("searches contacts by query", async () => {
    installFetch(
      mockResponse({
        results: [
          {
            id: "123456",
            properties: { email: { value: "jane@example.com" }, firstname: { value: "Jane" }, lastname: { value: "Doe" } },
          },
        ],
      }),
    );
    const out = await run({
      resource: "contact",
      operation: "search",
      searchQuery: "jane@example.com",
      limit: 50,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/crm/v3/objects/contacts/search");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.query).toBe("jane@example.com");
    expect(out[0][0].json).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>[])[0]).toMatchObject({
      vid: 123456,
    });
  });

  it("gets all companies with pagination", async () => {
    installFetch(
      mockResponse({
        results: [
          { id: "1", properties: { name: "Acme" }, portalId: 12345 },
          { id: "2", properties: { name: "Beta" }, portalId: 12345 },
        ],
      }),
    );
    const out = await run({
      resource: "company",
      operation: "getAll",
      limit: 5,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/crm/v3/objects/companies");
    const results = out[0][0].json as Record<string, unknown>[];
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ companyId: 1 });
  });

  it("creates an engagement (note) associated with a contact", async () => {
    installFetch(
      mockResponse({
        engagement: { id: 78901, type: "NOTE" },
        associations: { contactIds: [123456] },
      }),
    );
    const out = await run({
      resource: "engagement",
      operation: "create",
      type: "NOTE",
      metadata: JSON.stringify({ body: "Follow-up call scheduled" }),
      additionalFields: JSON.stringify({ contactIds: [123456] }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/engagements/v1/engagements");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.engagement.type).toBe("NOTE");
    expect(sentBody.metadata.body).toBe("Follow-up call scheduled");
    expect(out[0][0].json).toMatchObject({
      engagement: { id: 78901, type: "NOTE" },
      associations: { contactIds: [123456] },
    });
  });

  it("errors on invalid contact ID with continueOnFail", async () => {
    installFetch(
      mockResponse(
        { message: "Not found", error: "Not Found" },
        { status: 404 },
      ),
    );
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "nonexistent-id-99999",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0][0].json).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining("Not found"),
        code: 404,
      }),
    });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        { resource: "contact", operation: "get", contactId: "c-1" },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/No valid credential found/);
  });
});

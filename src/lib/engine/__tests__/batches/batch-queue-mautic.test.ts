import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mautic";

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

function installFetch(
  response: ReturnType<typeof mockResponse> = mockResponse({}),
) {
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

const CREDS = { mauticApi: { url: "https://mautic.example.com", user: "admin", password: "pass123" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mautic — n8n-nodes-base.mautic", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mautic");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.mautic")).toBe(canonical);
  });

  it("creates a contact via POST with requestFields body", async () => {
    installFetch(mockResponse({
      contact: { id: 42, fields: { all: [], core: { firstname: { value: "John" }, lastname: { value: "Doe" }, email: { value: "john@example.com" } } }, points: 0 },
    }));
    const out = await run({
      resource: "contact",
      operation: "create",
      requestFields: JSON.stringify({ firstname: "John", lastname: "Doe", email: "john@example.com" }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/new");
    expect(JSON.parse(calls[0].body!)).toEqual({ firstname: "John", lastname: "Doe", email: "john@example.com" });
    expect(out[0][0].json).toMatchObject({ id: 42 });
  });

  it("gets a contact by ID via GET", async () => {
    installFetch(mockResponse({
      contact: { id: 42, fields: { core: { email: { value: "john@example.com" } } } },
    }));
    const out = await run({
      resource: "contact",
      operation: "get",
      contactId: "42",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/42");
    expect(out[0][0].json).toMatchObject({ id: 42 });
  });

  it("lists contacts with query options", async () => {
    installFetch(mockResponse({
      total: 1,
      contacts: { 42: { id: 42, fields: { core: { email: { value: "john@example.com" } } } } },
    }));
    const out = await run({
      resource: "contact",
      operation: "getAll",
      queryOptions: JSON.stringify({ search: "john@example.com", limit: 10 }),
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts?search=john%40example.com&limit=10");
    expect(out[0][0].json).toMatchObject({ total: 1 });
    expect((out[0][0].json as Record<string, unknown>).contacts).toBeDefined();
  });

  it("adds contact to campaign", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "campaignContact",
      operation: "add",
      campaignId: "5",
      contactId: "42",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/campaigns/5/contact/42/add");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("removes contact from campaign", async () => {
    const out = await run({
      resource: "campaignContact",
      operation: "remove",
      campaignId: "5",
      contactId: "42",
    });

    expect(calls[0].url).toBe("https://mautic.example.com/api/campaigns/5/contact/42/remove");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("manages DNC status (add)", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "contact",
      operation: "manageDnc",
      contactId: "42",
      dncAction: "add",
      dncChannel: "email",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/42/dnc/email/add");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("manages DNC status (remove)", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "contact",
      operation: "manageDnc",
      contactId: "42",
      dncAction: "remove",
      dncChannel: "email",
    });

    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/42/dnc/email/remove");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("edits points on a contact", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "contact",
      operation: "editPoints",
      contactId: "42",
      pointDelta: 10,
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/42/points/10/plus");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("sends email to contact", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "contact",
      operation: "sendEmail",
      contactId: "42",
      emailId: "7",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/42/email/7");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("deletes a contact", async () => {
    installFetch(mockResponse({ contact: { id: 42, isPublished: false } }));
    const out = await run({
      resource: "contact",
      operation: "delete",
      contactId: "42",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/42/delete");
    expect(out[0][0].json).toMatchObject({ id: 42 });
  });

  it("creates a company", async () => {
    installFetch(mockResponse({
      company: { id: 10, fields: { all: [], core: { companyname: { value: "Acme" } } } },
    }));
    const out = await run({
      resource: "company",
      operation: "create",
      requestFields: JSON.stringify({ companyname: "Acme", companycity: "NYC" }),
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/companies/new");
    expect(out[0][0].json).toMatchObject({ id: 10 });
  });

  it("adds contact to company", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "companyContact",
      operation: "add",
      companyId: "10",
      contactId: "42",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/companies/10/contact/42/add");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("adds contact to segment", async () => {
    installFetch(mockResponse({ success: true }));
    const out = await run({
      resource: "contactSegment",
      operation: "add",
      segmentId: "3",
      contactId: "42",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/segments/3/contact/42/add");
    expect(out[0][0].json).toMatchObject({ success: true });
  });

  it("sends segment email", async () => {
    installFetch(mockResponse({ success: true, sentCount: 5, failedCount: 0 }));
    const out = await run({
      resource: "segmentEmail",
      operation: "send",
      segmentId: "3",
      emailId: "7",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://mautic.example.com/api/emails/7/segment/3");
    expect(out[0][0].json).toMatchObject({ success: true, sentCount: 5, failedCount: 0 });
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "contact",
          operation: "get",
          contactId: "42",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/credential is not configured/);
  });

  it("throws when contactId is missing", async () => {
    await expect(
      run(
        {
          resource: "contact",
          operation: "get",
        },
        [{}],
        { credentials: CREDS },
      ),
    ).rejects.toThrow(/contactId is required/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "not found" }, { status: 404 }));
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "999",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json).toHaveProperty("message");
  });

  it("makes one request per input item", async () => {
    await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "={{ $json.id }}",
      },
      [{ id: "1" }, { id: "2" }],
      { credentials: CREDS },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://mautic.example.com/api/contacts/1");
    expect(calls[1].url).toBe("https://mautic.example.com/api/contacts/2");
  });

  it("sends Basic auth header from credential", async () => {
    const expectedAuth = "Basic " + Buffer.from("admin:pass123").toString("base64");
    await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "42",
      },
      [{}],
      { credentials: CREDS },
    );

    expect(calls[0].headers["Authorization"]).toBe(expectedAuth);
  });
});

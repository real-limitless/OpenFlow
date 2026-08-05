import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.intercom";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ ok: true })) {
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

const CREDS = { intercomApi: { accessToken: "intercom-token-123" } };

async function run(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown> | INodeExecutionData> = [{}],
  opts?: { continueOnFail?: boolean; credentials?: Record<string, Record<string, unknown>> },
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

describe("batch-queue intercom — n8n-nodes-base.intercom", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Intercom");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.intercom")).toBe(canonical);
  });

  // --- User: Create ---

  it("creates a user via POST /contacts", async () => {
    installFetch(
      mockResponse({
        type: "contact",
        id: "contact_123",
        email: "test@example.com",
        name: "Test User",
      }),
    );
    const out = await run(
      {
        resource: "user",
        operation: "create",
        identifierType: "email",
        idValue: "={{ $json.userEmail }}",
        email: "={{ $json.userEmail }}",
        name: "={{ $json.userName }}",
      },
      [{ json: { userEmail: "test@example.com", userName: "Test User" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.intercom.io/contacts");
    expect(calls[0].headers["Authorization"]).toBe("Bearer intercom-token-123");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.email).toBe("test@example.com");
    expect(sentBody.name).toBe("Test User");
    expect(out[0][0].json).toMatchObject({
      type: "contact",
      id: "contact_123",
      email: "test@example.com",
      name: "Test User",
    });
  });

  // --- Company: Get ---

  it("fetches a company by external ID via GET /companies", async () => {
    installFetch(
      mockResponse({
        type: "company",
        id: "co_123",
        company_id: "acme_corp_123",
        name: "Acme Corp",
      }),
    );
    const out = await run(
      {
        resource: "company",
        operation: "get",
        selectBy: "companyId",
        value: "={{ $json.companyId }}",
      },
      [{ json: { companyId: "acme_corp_123" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("company_id=acme_corp_123");
    expect(out[0][0].json).toMatchObject({
      type: "company",
      company_id: "acme_corp_123",
    });
  });

  // --- Lead: Get All (paginated) ---

  it("lists leads with limit via GET /contacts", async () => {
    installFetch(
      mockResponse({
        data: [
          { id: "lead_1", type: "contact" },
          { id: "lead_2", type: "contact" },
          { id: "lead_3", type: "contact" },
        ],
        pages: { type: "pages", next: null, page: 1, per_page: 10, total_pages: 1 },
      }),
    );
    const out = await run(
      { resource: "lead", operation: "getAll", returnAll: false, limit: 10 },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/contacts");
    expect(out[0]).toHaveLength(3);
  });

  // --- Lead: Delete by ID ---

  it("deletes a lead by id via DELETE /contacts/:id", async () => {
    installFetch(
      mockResponse({
        type: "contact",
        id: "abc123",
        deleted: true,
      }),
    );
    const out = await run(
      {
        resource: "lead",
        operation: "delete",
        deleteBy: "id",
        value: "={{ $json.leadId }}",
      },
      [{ json: { leadId: "abc123" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.intercom.io/contacts/abc123");
    expect(out[0][0].json).toMatchObject({
      type: "contact",
      id: "abc123",
      deleted: true,
    });
  });

  // --- User: Update custom attributes via POST /contacts ---

  it("updates user custom attributes via POST /contacts", async () => {
    installFetch(
      mockResponse({
        type: "contact",
        id: "usr_123",
        custom_attributes: { plan_tier: "premium" },
      }),
    );
    const out = await run(
      {
        resource: "user",
        operation: "update",
        updateBy: "id",
        value: "={{ $json.userId }}",
        customAttributesUi: {
          customAttributesValues: [
            { name: "plan_tier", value: "={{ $json.planTier }}" },
          ],
        },
      },
      [{ json: { userId: "usr_123", planTier: "premium" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.intercom.io/contacts");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.id).toBe("usr_123");
    expect(sentBody.custom_attributes).toEqual({ plan_tier: "premium" });
    expect(out[0][0].json.custom_attributes.plan_tier).toBe("premium");
  });

  // --- Company: Create / Update with fields ---

  it("creates a company with all fields via POST /companies", async () => {
    installFetch(
      mockResponse({
        type: "company",
        id: "co_new",
        company_id: "my_company",
        name: "My Company",
        monthly_spend: 500,
      }),
    );
    const out = await run(
      {
        resource: "company",
        operation: "create",
        companyId: "my_company",
        name: "My Company",
        plan: "enterprise",
        monthlySpend: 500,
        size: 50,
        website: "https://mycompany.com",
        industry: "Tech",
        customAttributesUi: {
          customAttributesValues: [
            { name: "region", value: "us-east" },
          ],
        },
      },
      [{}],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    const sentBody = JSON.parse(calls[0].body as string);
    expect(sentBody.company_id).toBe("my_company");
    expect(sentBody.name).toBe("My Company");
    expect(sentBody.plan).toBe("enterprise");
    expect(sentBody.monthly_spend).toBe(500);
    expect(sentBody.size).toBe(50);
    expect(sentBody.website).toBe("https://mycompany.com");
    expect(sentBody.industry).toBe("Tech");
    expect(sentBody.custom_attributes).toEqual({ region: "us-east" });
    expect(out[0][0].json.company_id).toBe("my_company");
  });

  // --- Error handling ---

  it("throws on 401 unauthorized", async () => {
    installFetch(
      mockResponse(
        { error: { message: "Unauthorized" } },
        { status: 401 },
      ),
    );
    await expect(
      run(
        { resource: "user", operation: "get", selectBy: "id", value: "usr_1" },
        [{}],
      ),
    ).rejects.toThrow(/Intercom/);
  });

  it("returns error item when continueOnFail is true", async () => {
    installFetch(
      mockResponse(
        { type: "error.list", errors: [{ code: "not_found", message: "Contact not found" }] },
        { status: 404 },
      ),
    );
    const out = await run(
      { resource: "user", operation: "get", selectBy: "id", value: "nonexistent" },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  // --- User: Delete ---

  it("deletes a user by id via DELETE /contacts/:id", async () => {
    installFetch(
      mockResponse({
        type: "contact",
        id: "usr_del",
        deleted: true,
      }),
    );
    const out = await run(
      {
        resource: "user",
        operation: "delete",
        id: "={{ $json.userId }}",
      },
      [{ json: { userId: "usr_del" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.intercom.io/contacts/usr_del");
    expect(out[0][0].json.id).toBe("usr_del");
  });
});

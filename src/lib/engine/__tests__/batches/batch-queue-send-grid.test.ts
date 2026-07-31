import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sendGrid";

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
    statusText: status === 204 ? "No Content" : status === 202 ? "Accepted" : "OK",
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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ success: true })) {
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

const CREDS = { sendGridApi: { apiKey: "SG.test_key_12345" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue sendGrid — n8n-nodes-base.sendGrid", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("SendGrid");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.sendGrid")).toBe(canonical);
  });

  // -----------------------------------------------------------------------
  // Mail
  // -----------------------------------------------------------------------

  it("sends a simple email", async () => {
    installFetch(mockResponse("", { status: 202 }));
    const out = await run({
      resource: "mail",
      operation: "send",
      fromEmail: "orders@example.com",
      fromName: "Example Orders",
      toEmail: "alex@example.com",
      subject: "Your order",
      contentType: "text",
      contentValue: "Hello Alex!",
      dynamicTemplate: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.sendgrid.com/v3/mail/send");

    const body = JSON.parse(calls[0].body!);
    expect(body).toMatchObject({
      personalizations: [{ to: [{ email: "alex@example.com" }] }],
      from: { email: "orders@example.com", name: "Example Orders" },
      subject: "Your order",
      content: [{ type: "text/plain", value: "Hello Alex!" }],
    });

    expect(out[0][0].json).toEqual({ success: true });
  });

  it("sends with dynamic template", async () => {
    installFetch(mockResponse("", { status: 202 }));
    await run({
      resource: "mail",
      operation: "send",
      fromEmail: "orders@example.com",
      toEmail: "alex@example.com",
      dynamicTemplate: true,
      templateId: "d-123abc456def789hij0klm123nop456qrs789tuv0xyz",
      dynamicTemplateFields: {
        values: [
          { key: "customer_name", value: "Alex" },
          { key: "confirmation_number", value: "123456" },
        ],
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body).toMatchObject({
      personalizations: [{
        to: [{ email: "alex@example.com" }],
        dynamic_template_data: { customer_name: "Alex", confirmation_number: "123456" },
      }],
      from: { email: "orders@example.com" },
      template_id: "d-123abc456def789hij0klm123nop456qrs789tuv0xyz",
    });
    expect(body.content).toBeUndefined();
    expect(body.subject).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Contact
  // -----------------------------------------------------------------------

  it("upserts a contact", async () => {
    installFetch(mockResponse({ job_id: "abc12312-x3y4-1234-abcd-123qwe456rty" }, { status: 202 }));
    const out = await run({
      resource: "contact",
      operation: "upsert",
      email: "alex@example.com",
      additionalFields: {
        first_name: "Alex",
        last_name: "Bloggs",
        city: "Port Douglas",
      },
    });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts");
    const body = JSON.parse(calls[0].body!);
    expect(body).toMatchObject({
      contacts: [{
        email: "alex@example.com",
        first_name: "Alex",
        last_name: "Bloggs",
        city: "Port Douglas",
      }],
    });

    expect(out[0][0].json).toMatchObject({ job_id: "abc12312-x3y4-1234-abcd-123qwe456rty" });
  });

  it("deletes contacts by IDs", async () => {
    installFetch(mockResponse({ job_id: "job_xyz" }, { status: 202 }));
    await run({
      resource: "contact",
      operation: "delete",
      by: "ids",
      ids: "id1,id2,id3",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toContain("ids=id1%2Cid2%2Cid3");
    expect(calls[0].url).toContain("/marketing/contacts");
  });

  it("gets a contact by ID", async () => {
    installFetch(mockResponse({ id: "cont_123", email: "alex@example.com" }));
    const out = await run({
      resource: "contact",
      operation: "get",
      contactId: "cont_123",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts/cont_123");
    expect(out[0][0].json).toMatchObject({ id: "cont_123", email: "alex@example.com" });
  });

  it("gets all contacts with limit", async () => {
    installFetch(mockResponse({
      result: [
        { id: "c1", email: "a@example.com" },
        { id: "c2", email: "b@example.com" },
      ],
      _metadata: { next: null },
    }));
    const out = await run({
      resource: "contact",
      operation: "getAll",
      returnAll: false,
      limit: 2,
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/marketing/contacts?page_size=2");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ id: "c1" });
    expect(out[0][1].json).toMatchObject({ id: "c2" });
  });

  // -----------------------------------------------------------------------
  // List
  // -----------------------------------------------------------------------

  it("creates a list", async () => {
    installFetch(mockResponse({
      id: "ca7a3796-e8a8-4029-9ccb-df8937940562",
      name: "Newsletter",
      contact_count: 0,
    }, { status: 201 }));
    const out = await run({
      resource: "list",
      operation: "create",
      name: "Newsletter",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.sendgrid.com/v3/marketing/lists");
    const body = JSON.parse(calls[0].body!);
    expect(body).toEqual({ name: "Newsletter" });
    expect(out[0][0].json).toMatchObject({
      id: "ca7a3796-e8a8-4029-9ccb-df8937940562",
      name: "Newsletter",
      contact_count: 0,
    });
  });

  it("deletes a list without deleting contacts", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      resource: "list",
      operation: "delete",
      listId: "ca7a3796-e8a8-4029-9ccb-df8937940562",
      deleteContacts: false,
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(
      "https://api.sendgrid.com/v3/marketing/lists/ca7a3796-e8a8-4029-9ccb-df8937940562",
    );
    expect(calls[0].body).toBeUndefined();
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("gets all lists with limit", async () => {
    installFetch(mockResponse({
      result: [
        { id: "l1", name: "Newsletter", contact_count: 5 },
        { id: "l2", name: "Updates", contact_count: 10 },
        { id: "l3", name: "Promos", contact_count: 3 },
      ],
      _metadata: { next: null },
    }));
    const out = await run({
      resource: "list",
      operation: "getAll",
      returnAll: false,
      limit: 2,
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/marketing/lists?page_size=2");
    expect(out[0]).toHaveLength(2);
  });

  it("updates a list", async () => {
    installFetch(mockResponse({ id: "l1", name: "Renamed List" }));
    const out = await run({
      resource: "list",
      operation: "update",
      listId: "l1",
      name: "Renamed List",
    });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe("https://api.sendgrid.com/v3/marketing/lists/l1");
    const body = JSON.parse(calls[0].body!);
    expect(body).toEqual({ name: "Renamed List" });
    expect(out[0][0].json).toMatchObject({ id: "l1", name: "Renamed List" });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "list",
          operation: "create",
          name: "Test",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/sendGridApi credential is not configured/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ errors: [{ field: "email", message: "invalid email" }] }, { status: 400 }));
    await expect(
      run({
        resource: "mail",
        operation: "send",
        fromEmail: "bad",
        toEmail: "bad",
        contentValue: "test",
      }),
    ).rejects.toThrow(/invalid email/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ errors: [{ message: "bad request" }] }, { status: 500 }));
    const out = await run(
      {
        resource: "list",
        operation: "create",
        name: "Test",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("sends Bearer auth header from sendGridApi credential", async () => {
    installFetch(mockResponse("", { status: 202 }));
    await run({
      resource: "mail",
      operation: "send",
      fromEmail: "test@example.com",
      toEmail: "test@example.com",
      contentValue: "test",
    });

    expect(calls[0].headers["Authorization"]).toBe("Bearer SG.test_key_12345");
  });

  it("throws when required param is missing (email for contact upsert)", async () => {
    await expect(
      run({
        resource: "contact",
        operation: "upsert",
      }),
    ).rejects.toThrow(/email is required for contact upsert/);
  });
});
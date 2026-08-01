import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.xero";

interface MockResponseInit {
  status?: number;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get() { return "application/json"; },
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

function installFetch(response: ReturnType<typeof mockResponse>) {
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
      return response;
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

const CREDS = { xeroOAuth2Api: { accessToken: "xero_tok_123" } };

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
    credentials: { xeroOAuth2Api: { name: "xeroOAuth2Api" } },
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

beforeEach(() => {
  installFetch(mockResponse({ Contacts: [{ ContactID: "new-001", Name: "John Doe" }] }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue xero — n8n-nodes-base.xero", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Xero");
  });

  it("resolves the executor under canonical and short type strings", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.xero")).toBe(canonical);
  });

  it("creates a contact via POST with wrapped body and expression resolution", async () => {
    installFetch(mockResponse({ Contacts: [{ ContactID: "c-123", Name: "John Doe", EmailAddress: "j.doe@example.com" }] }));
    const out = await run(
      {
        resource: "contact",
        operation: "create",
        additionalFields: {
          Name: "John Doe",
          EmailAddress: "{{ $json.email }}",
        },
      },
      [{ json: { email: "j.doe@example.com" } }],
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.xero.com/api.xro/2.0/Contacts");
    expect(JSON.parse(calls[0].body!)).toEqual({
      Contacts: [{ Name: "John Doe", EmailAddress: "j.doe@example.com" }],
    });
    expect(out[0][0].json).toMatchObject({ Contacts: [{ ContactID: "c-123" }] });
  });

  it("gets a contact by ID via GET", async () => {
    installFetch(mockResponse({ Contacts: [{ ContactID: "abc-123", Name: "Found Contact" }] }));
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "abc-123",
      },
      [{}],
    );

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.xero.com/api.xro/2.0/Contacts/abc-123");
    expect(out[0][0].json).toMatchObject({ Contacts: [{ ContactID: "abc-123" }] });
  });

  it("gets all invoices with query params", async () => {
    installFetch(mockResponse({ Invoices: [{ InvoiceID: "inv-1" }, { InvoiceID: "inv-2" }] }));
    const out = await run(
      {
        resource: "invoice",
        operation: "getAll",
        returnAll: false,
        limit: 50,
        queryParams: {
          where: 'Status=="AUTHORISED"',
          order: "Date DESC",
        },
      },
      [{}],
    );

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("Invoices?");
    expect(calls[0].url).toContain(encodeURIComponent('Status=="AUTHORISED"'));
    expect(calls[0].url).toContain(encodeURIComponent("Date DESC"));
    expect(calls[0].url).toContain("page=1");
    expect(calls[0].url).toContain("pageSize=50");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ InvoiceID: "inv-1" });
  });

  it("updates an invoice via POST with updateFields body", async () => {
    installFetch(mockResponse({ Invoices: [{ InvoiceID: "inv-456", Status: "DELETED" }] }));
    const out = await run(
      {
        resource: "invoice",
        operation: "update",
        invoiceId: "inv-456",
        updateFields: { Status: "DELETED" },
      },
      [{}],
    );

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.xero.com/api.xro/2.0/Invoices/inv-456");
    expect(JSON.parse(calls[0].body!)).toEqual({
      Invoices: [{ Status: "DELETED" }],
    });
    expect(out[0][0].json).toMatchObject({ Invoices: [{ InvoiceID: "inv-456" }] });
  });

  it("returns empty array for getAll when Xero returns zero results", async () => {
    installFetch(mockResponse({ Contacts: [] }));
    const out = await run(
      {
        resource: "contact",
        operation: "getAll",
        queryParams: { where: 'Name=="NonexistentName"' },
      },
      [{}],
    );

    expect(out[0]).toHaveLength(0);
  });

  it("sends Bearer token from xeroOAuth2Api credential", async () => {
    await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "abc-123",
      },
      [{}],
    );

    expect(calls[0].headers["Authorization"]).toBe("Bearer xero_tok_123");
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "contact",
          operation: "get",
          contactId: "abc-123",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/xeroOAuth2Api credential is not configured/);
  });

  it("throws when contactId is missing for get", async () => {
    await expect(
      run(
        { resource: "contact", operation: "get" },
        [{}],
      ),
    ).rejects.toThrow(/contactId is required/);
  });

  it("throws when invoiceId is missing for update", async () => {
    await expect(
      run(
        { resource: "invoice", operation: "update", updateFields: { Status: "PAID" } },
        [{}],
      ),
    ).rejects.toThrow(/invoiceId is required/);
  });

  it("emits error item when continueOnFail is on", async () => {
    installFetch(mockResponse({ Message: "bad" }, { status: 500 }));
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "bad-id",
      },
      [{}],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("makes one request per input item", async () => {
    installFetch(mockResponse({ Contacts: [{ ContactID: "c-1" }] }));
    await run(
      {
        resource: "contact",
        operation: "get",
        contactId: "={{ $json.id }}",
      },
      [{ id: "item_a" }, { id: "item_b" }],
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.xero.com/api.xro/2.0/Contacts/item_a");
    expect(calls[1].url).toBe("https://api.xero.com/api.xro/2.0/Contacts/item_b");
  });
});

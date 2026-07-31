import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.sendInBlue";

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
    statusText: status === 204 ? "No Content" : "OK",
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

const CREDS = { sendInBlueApi: { apiKey: "xkeysib-test-key-12345" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue sendInBlue — n8n-nodes-base.sendInBlue", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Brevo");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.sendInBlue")).toBe(canonical);
  });

  // -----------------------------------------------------------------------
  // Contact
  // -----------------------------------------------------------------------

  it("create contact", async () => {
    installFetch(mockResponse({ id: 21 }));
    const out = await run({
      resource: "contact",
      operation: "create",
      email: "jane@example.com",
      attributes: {
        attributesValues: {
          attributes: [
            { fieldName: "FNAME", fieldValue: "Jane" },
          ],
        },
      },
      listIds: "4",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.brevo.com/v3/contacts");

    const body = JSON.parse(calls[0].body!);
    expect(body.email).toBe("jane@example.com");
    expect(body.attributes).toEqual({ FNAME: "Jane" });
    expect(body.listIds).toEqual([4]);

    expect(out[0][0].json).toEqual({ id: 21 });
  });

  it("create or update contact (upsert)", async () => {
    installFetch(mockResponse({ id: 21 }));
    const out = await run({
      resource: "contact",
      operation: "upsert",
      email: "jane@example.com",
      updateEnabled: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.brevo.com/v3/contacts");

    const body = JSON.parse(calls[0].body!);
    expect(body.email).toBe("jane@example.com");
    expect(body.updateEnabled).toBe(true);

    expect(out[0][0].json).toEqual({ id: 21 });
  });

  it("get all contacts", async () => {
    const contacts = [
      { id: 1, email: "alice@example.com" },
      { id: 2, email: "bob@example.com" },
    ];
    installFetch(mockResponse({ contacts }));
    const out = await run({
      resource: "contact",
      operation: "getAll",
      returnAll: false,
      limit: 25,
      sort: "desc",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/contacts?limit=25&offset=0&sort=desc");

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toEqual({ id: 1, email: "alice@example.com" });
    expect(out[0][1].json).toEqual({ id: 2, email: "bob@example.com" });
  });

  it("get contact", async () => {
    installFetch(mockResponse({ id: 21, email: "jane@example.com" }));
    const out = await run({
      resource: "contact",
      operation: "get",
      identifier: "jane@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.brevo.com/v3/contacts/jane%40example.com");
    expect(out[0][0].json).toMatchObject({ id: 21, email: "jane@example.com" });
  });

  it("update contact returns success", async () => {
    installFetch(mockResponse(null, { status: 204 }));
    const out = await run({
      resource: "contact",
      operation: "update",
      identifier: "jane@example.com",
      attributes: {
        attributesValues: {
          attributes: [{ fieldName: "FNAME", fieldValue: "Jane" }],
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("delete contact returns success", async () => {
    installFetch(mockResponse(null, { status: 204 }));
    const out = await run({
      resource: "contact",
      operation: "delete",
      identifier: "jane@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(out[0][0].json).toEqual({ success: true });
  });

  // -----------------------------------------------------------------------
  // Email
  // -----------------------------------------------------------------------

  it("send transactional email (HTML)", async () => {
    installFetch(mockResponse({ messageId: "<msgid@relay.brevo.com>" }));
    const out = await run({
      resource: "email",
      operation: "send",
      sendHTML: true,
      subject: "Welcome",
      htmlContent: "<h1>Hi</h1>",
      sender: "no-reply@example.com",
      recipients: "jane@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.brevo.com/v3/smtp/email");

    const body = JSON.parse(calls[0].body!);
    expect(body.subject).toBe("Welcome");
    expect(body.sender).toEqual({ email: "no-reply@example.com" });
    expect(body.to).toEqual([{ email: "jane@example.com" }]);
    expect(body.htmlContent).toBe("<h1>Hi</h1>");

    expect(out[0][0].json.messageId).toBe("<msgid@relay.brevo.com>");
  });

  it("send transactional email (plain text)", async () => {
    installFetch(mockResponse({ messageId: "<msgid@relay.brevo.com>" }));
    await run({
      resource: "email",
      operation: "send",
      sendHTML: false,
      subject: "Welcome",
      textContent: "Hi there!",
      sender: "no-reply@example.com",
      recipients: "jane@example.com",
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.textContent).toBe("Hi there!");
    expect(body.htmlContent).toBeUndefined();
  });

  it("send template email", async () => {
    installFetch(mockResponse({ messageId: "<msgid@relay.brevo.com>" }));
    const out = await run({
      resource: "email",
      operation: "sendTemplate",
      templateId: 7,
      recipients: "jane@example.com",
      additionalFields: {
        templateParameters: {
          parameterValues: { parameters: "orderNo=123" },
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.brevo.com/v3/smtp/email");

    const body = JSON.parse(calls[0].body!);
    expect(body.templateId).toBe(7);
    expect(body.to).toEqual([{ email: "jane@example.com" }]);
    expect(body.params).toEqual({ orderNo: "123" });

    expect(out[0][0].json.messageId).toBe("<msgid@relay.brevo.com>");
  });

  // -----------------------------------------------------------------------
  // Contact Attribute
  // -----------------------------------------------------------------------

  it("create contact attribute (empty 2xx -> success)", async () => {
    installFetch(mockResponse(null, { status: 204 }));
    const out = await run({
      resource: "attribute",
      operation: "create",
      attributeCategory: "normal",
      attributeName: "COMPANY",
      attributeType: "text",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.brevo.com/v3/contacts/attributes/normal/COMPANY");

    const body = JSON.parse(calls[0].body!);
    expect(body.type).toBe("text");

    expect(out[0][0].json).toEqual({ success: true });
  });

  // -----------------------------------------------------------------------
  // Sender
  // -----------------------------------------------------------------------

  it("create sender", async () => {
    installFetch(mockResponse({ id: 5, name: "Support", email: "support@example.com" }));
    const out = await run({
      resource: "sender",
      operation: "create",
      name: "Support",
      email: "support@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.brevo.com/v3/senders");

    const body = JSON.parse(calls[0].body!);
    expect(body.name).toBe("Support");
    expect(body.email).toBe("support@example.com");

    expect(out[0][0].json.id).toBe(5);
  });

  // -----------------------------------------------------------------------
  // Errors
  // -----------------------------------------------------------------------

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "contact",
          operation: "create",
          email: "test@example.com",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/sendInBlueApi credential is not configured/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ code: "unauthorized", message: "Invalid API key" }, { status: 401 }));
    await expect(
      run({
        resource: "contact",
        operation: "get",
        identifier: "test@example.com",
      }),
    ).rejects.toThrow(/Invalid API key/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ code: "not_found", message: "Contact not found" }, { status: 404 }));
    const out = await run(
      {
        resource: "contact",
        operation: "get",
        identifier: "missing@example.com",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("sends api-key auth header from sendInBlueApi credential", async () => {
    installFetch(mockResponse({ id: 21 }));
    await run({
      resource: "contact",
      operation: "create",
      email: "test@example.com",
    });

    expect(calls[0].headers["api-key"]).toBe("xkeysib-test-key-12345");
  });

  it("throws when required param is missing (email for contact create)", async () => {
    await expect(
      run({
        resource: "contact",
        operation: "create",
      }),
    ).rejects.toThrow(/email is required for contact create/);
  });
});
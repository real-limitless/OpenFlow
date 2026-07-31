import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailjet";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ Messages: [{ Status: "success", To: [{ Email: "recipient@example.com", MessageID: 12345 }] }] })) {
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
  const creds = opts?.credentials ?? EMAIL_CREDS;
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

const EMAIL_CREDS = { mailjetEmailApi: { apiKey: "test_api_key", secretKey: "test_secret_key", sandboxMode: true } };
const SMS_CREDS = { mailjetSmsApi: { token: "test_sms_token" } };

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mailjet — n8n-nodes-base.mailjet", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mailjet");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.mailjet")).toBe(canonical);
  });

  it("sends an email via POST with JSON body", async () => {
    installFetch(mockResponse({ Messages: [{ Status: "success", To: [{ Email: "recipient@example.com", MessageID: 12345 }] }] }));
    const out = await run({
      resource: "email",
      operation: "send",
      fromEmail: "sender@example.com",
      toEmail: "recipient@example.com",
      subject: "Hello",
      text: "Plain text body",
      html: "<p>HTML body</p>",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.mailjet.com/v3/send");
    const body = JSON.parse(calls[0].body!);
    expect(body.Messages).toHaveLength(1);
    expect(body.Messages[0].From.Email).toBe("sender@example.com");
    expect(body.Messages[0].To).toEqual([{ Email: "recipient@example.com" }]);
    expect(body.Messages[0].Subject).toBe("Hello");
    expect(body.Messages[0].TextPart).toBe("Plain text body");
    expect(body.Messages[0].HTMLPart).toBe("<p>HTML body</p>");
    expect(body.Messages[0].SandboxMode).toBe(true);
    expect(out[0][0].json).toMatchObject({ Messages: [{ Status: "success" }] });
  });

  it("sends email with multiple recipients and CC", async () => {
    await run({
      resource: "email",
      operation: "send",
      fromEmail: "sender@example.com",
      toEmail: "a@example.com,b@example.com",
      subject: "Group message",
      text: "Hello all",
      additionalFields: {
        ccAddresses: "cc@example.com",
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.Messages[0].To).toEqual([{ Email: "a@example.com" }, { Email: "b@example.com" }]);
    expect(body.Messages[0].Cc).toEqual([{ Email: "cc@example.com" }]);
  });

  it("sends email with template", async () => {
    installFetch(mockResponse({ Messages: [{ Status: "success" }] }));
    const out = await run({
      resource: "email",
      operation: "sendTemplate",
      fromEmail: "sender@example.com",
      toEmail: "recipient@example.com",
      templateId: "12345",
      additionalFields: {
        templateLanguage: true,
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.Messages[0].TemplateID).toBe(12345);
    expect(body.Messages[0].TemplateLanguage).toBe(true);
    expect(body.Messages[0].HTMLPart).toBeUndefined();
    expect(body.Messages[0].TextPart).toBeUndefined();
    expect(out[0][0].json).toBeDefined();
  });

  it("sends SMS via POST", async () => {
    installFetch(mockResponse({ MessageID: "sms_123", Status: "sent" }));
    const out = await run({
      resource: "sms",
      operation: "send",
      from: "MyApp",
      to: "+33612345678",
      text: "Your verification code is 1234",
    }, [{}], { credentials: SMS_CREDS });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.mailjet.com/sms/send");
    const body = JSON.parse(calls[0].body!);
    expect(body.From).toBe("MyApp");
    expect(body.To).toBe("+33612345678");
    expect(body.Text).toBe("Your verification code is 1234");
    expect(out[0][0].json).toMatchObject({ MessageID: "sms_123", Status: "sent" });
  });

  it("sends email with variables from UI", async () => {
    await run({
      resource: "email",
      operation: "send",
      fromEmail: "sender@example.com",
      toEmail: "user@example.com",
      subject: "Hi {{name}}",
      html: "<p>Your code is {{code}}</p>",
      jsonParameters: false,
      variablesUi: {
        variablesValues: [
          { name: "name", value: "Alice" },
          { name: "code", value: "9876" },
        ],
      },
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.Messages[0].Variables).toEqual({ name: "Alice", code: "9876" });
  });

  it("sends email with variables from JSON", async () => {
    await run({
      resource: "email",
      operation: "send",
      fromEmail: "sender@example.com",
      toEmail: "user@example.com",
      subject: "Hello",
      html: "<p>Test</p>",
      jsonParameters: true,
      variablesJson: '{"name":"Bob","code":"1234"}',
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.Messages[0].Variables).toEqual({ name: "Bob", code: "1234" });
  });

  it("throws on invalid variables JSON", async () => {
    await expect(
      run({
        resource: "email",
        operation: "send",
        fromEmail: "sender@example.com",
        toEmail: "user@example.com",
        subject: "Hello",
        html: "<p>Test</p>",
        jsonParameters: true,
        variablesJson: "not valid json",
      }),
    ).rejects.toThrow(/invalid JSON/);
  });

  it("sends Basic Auth header from mailjetEmailApi credential", async () => {
    await run({
      resource: "email",
      operation: "send",
      fromEmail: "sender@example.com",
      toEmail: "recipient@example.com",
      subject: "Hello",
      text: "Test",
    });

    const expected = "Basic " + btoa("test_api_key:test_secret_key");
    expect(calls[0].headers["Authorization"]).toBe(expected);
  });

  it("sends Bearer token from mailjetSmsApi credential", async () => {
    await run({
      resource: "sms",
      operation: "send",
      from: "MyApp",
      to: "+33612345678",
      text: "Test",
    }, [{}], { credentials: SMS_CREDS });

    expect(calls[0].headers["Authorization"]).toBe("Bearer test_sms_token");
  });

  it("throws when email credential is missing", async () => {
    await expect(
      run(
        {
          resource: "email",
          operation: "send",
          fromEmail: "sender@example.com",
          toEmail: "recipient@example.com",
          subject: "Hello",
          text: "Test",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/mailjetEmailApi credential is not configured/);
  });

  it("throws when SMS credential is missing", async () => {
    await expect(
      run(
        {
          resource: "sms",
          operation: "send",
          from: "MyApp",
          to: "+33612345678",
          text: "Test",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/mailjetSmsApi credential is not configured/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ errorMessage: "bad request" }, { status: 400 }));
    await expect(
      run({
        resource: "email",
        operation: "send",
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
        subject: "Hello",
        text: "Test",
      }),
    ).rejects.toThrow(/bad request/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ errorMessage: "bad" }, { status: 500 }));
    const out = await run(
      {
        resource: "email",
        operation: "send",
        fromEmail: "sender@example.com",
        toEmail: "recipient@example.com",
        subject: "Hello",
        text: "Test",
      },
      [{}],
      { continueOnFail: true, credentials: EMAIL_CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("throws when fromEmail is missing", async () => {
    await expect(
      run({
        resource: "email",
        operation: "send",
        toEmail: "recipient@example.com",
        subject: "Hello",
        text: "Test",
      }),
    ).rejects.toThrow(/fromEmail and toEmail are required/);
  });

  it("makes one request per input item with expression resolution", async () => {
    await run(
      {
        resource: "email",
        operation: "send",
        fromEmail: "sender@example.com",
        toEmail: "={{ $json.to }}",
        subject: "Hi {{ $json.name }}",
        text: "Message",
      },
      [
        { to: "a@example.com", name: "Alice" },
        { to: "b@example.com", name: "Bob" },
      ],
    );

    expect(calls).toHaveLength(2);
    const body0 = JSON.parse(calls[0].body!);
    const body1 = JSON.parse(calls[1].body!);
    expect(body0.Messages[0].To).toEqual([{ Email: "a@example.com" }]);
    expect(body0.Messages[0].Subject).toBe("Hi Alice");
    expect(body1.Messages[0].To).toEqual([{ Email: "b@example.com" }]);
    expect(body1.Messages[0].Subject).toBe("Hi Bob");
  });
});
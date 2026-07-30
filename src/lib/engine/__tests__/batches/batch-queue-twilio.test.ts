import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.twilio";

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

function installFetch(response: ReturnType<typeof mockResponse> = mockResponse({ sid: "SM1" })) {
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

const CREDS = { twilioApi: { accountSid: "AC_test_sid_123", authToken: "test_token_456" } };

const SMS_RESPONSE = {
  sid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  status: "queued",
  from: "+15551234567",
  to: "+15557654321",
  body: "Hello from n8n!",
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue twilio — n8n-nodes-base.twilio", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Twilio");
  });

  it("resolves the executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.twilio")).toBe(canonical);
  });

  it("sends an SMS via POST with form-encoded body", async () => {
    installFetch(mockResponse(SMS_RESPONSE));
    const out = await run({
      resource: "sms",
      operation: "send",
      fromNumber: "+15551234567",
      toNumber: "+15557654321",
      message: "Hello from n8n!",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC_test_sid_123/Messages.json",
    );
    expect(calls[0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(calls[0].body!);
    expect(params.get("To")).toBe("+15557654321");
    expect(params.get("From")).toBe("+15551234567");
    expect(params.get("Body")).toBe("Hello from n8n!");
    expect(out[0][0].json).toMatchObject({ sid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", status: "queued" });
  });

  it("sends an MMS with media URL", async () => {
    installFetch(mockResponse({ ...SMS_RESPONSE, num_media: "1" }));
    await run({
      resource: "sms",
      operation: "send",
      fromNumber: "+15551234567",
      toNumber: "+15557654321",
      message: "See this image",
      additionalFields: { mediaUrl: "https://example.com/image.png" },
    });

    const params = new URLSearchParams(calls[0].body!);
    expect(params.get("MediaUrl")).toBe("https://example.com/image.png");
  });

  it("makes a call with inline TwiML", async () => {
    installFetch(mockResponse({ sid: "CAxxx", status: "queued", from: "+15551234567", to: "+15557654321" }));
    const out = await run({
      resource: "call",
      operation: "make",
      fromNumber: "+15551234567",
      toNumber: "+15557654321",
      twimlMessage: "<Response><Say>Hello from n8n!</Say></Response>",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC_test_sid_123/Calls.json",
    );
    const params = new URLSearchParams(calls[0].body!);
    expect(params.get("Twiml")).toBe("<Response><Say>Hello from n8n!</Say></Response>");
    expect(params.get("To")).toBe("+15557654321");
    expect(out[0][0].json).toMatchObject({ sid: "CAxxx", status: "queued" });
  });

  it("makes a call with TwiML URL", async () => {
    installFetch(mockResponse({ sid: "CAxxx", status: "queued" }));
    await run({
      resource: "call",
      operation: "make",
      fromNumber: "+15551234567",
      toNumber: "+15557654321",
      twimlUrl: "https://example.com/twiml.xml",
    });

    const params = new URLSearchParams(calls[0].body!);
    expect(params.get("Url")).toBe("https://example.com/twiml.xml");
    expect(params.get("Twiml")).toBeNull();
  });

  it("throws when neither twimlUrl nor twimlMessage is provided for a call", async () => {
    await expect(
      run({
        resource: "call",
        operation: "make",
        fromNumber: "+15551234567",
        toNumber: "+15557654321",
      }),
    ).rejects.toThrow(/twimlUrl or twimlMessage is required/);
  });

  it("gets a message by SID via GET", async () => {
    installFetch(mockResponse({ sid: "SMxxx", status: "delivered", body: "Hello" }));
    const out = await run({
      resource: "message",
      operation: "get",
      messageId: "SMxxx",
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC_test_sid_123/Messages/SMxxx.json",
    );
    expect(out[0][0].json).toMatchObject({ sid: "SMxxx", status: "delivered" });
  });

  it("deletes a message via DELETE", async () => {
    installFetch(mockResponse("", { status: 204 }));
    const out = await run({
      resource: "message",
      operation: "delete",
      messageId: "SMxxx",
    });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC_test_sid_123/Messages/SMxxx.json",
    );
    expect(out[0][0].json).toEqual({ success: true });
  });

  it("gets all messages with limit", async () => {
    installFetch(
      mockResponse({
        messages: [
          { sid: "SMaaa", status: "delivered", body: "First" },
          { sid: "SMbbb", status: "sent", body: "Second" },
        ],
        next_page_uri: null,
      }),
    );
    const out = await run({
      resource: "message",
      operation: "getAll",
      returnAll: false,
      limit: 2,
    });

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain("/Messages.json?");
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("PageSize")).toBe("2");
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json).toMatchObject({ sid: "SMaaa" });
    expect(out[0][1].json).toMatchObject({ sid: "SMbbb" });
  });

  it("sends Basic Auth header from twilioApi credential", async () => {
    await run({
      resource: "sms",
      operation: "send",
      fromNumber: "+15551234567",
      toNumber: "+15557654321",
      message: "Hi",
    });

    const expected = "Basic " + btoa("AC_test_sid_123:test_token_456");
    expect(calls[0].headers["Authorization"]).toBe(expected);
  });

  it("throws when credential is missing", async () => {
    await expect(
      run(
        {
          resource: "sms",
          operation: "send",
          fromNumber: "+15551234567",
          toNumber: "+15557654321",
          message: "Hi",
        },
        [{}],
        { credentials: {} },
      ),
    ).rejects.toThrow(/twilioApi credential is not configured/);
  });

  it("throws on HTTP error", async () => {
    installFetch(mockResponse({ message: "bad request", code: 21211 }, { status: 400 }));
    await expect(
      run({
        resource: "sms",
        operation: "send",
        fromNumber: "+15551234567",
        toNumber: "+15557654321",
        message: "Hi",
      }),
    ).rejects.toThrow(/bad request/);
  });

  it("emits error item instead of throwing when continueOnFail is on", async () => {
    installFetch(mockResponse({ message: "bad" }, { status: 500 }));
    const out = await run(
      {
        resource: "sms",
        operation: "send",
        fromNumber: "+15551234567",
        toNumber: "+15557654321",
        message: "Hi",
      },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });

  it("throws when fromNumber is missing", async () => {
    await expect(
      run({
        resource: "sms",
        operation: "send",
        toNumber: "+15557654321",
        message: "Hi",
      }),
    ).rejects.toThrow(/fromNumber is required/);
  });

  it("makes one request per input item with expression resolution", async () => {
    await run(
      {
        resource: "sms",
        operation: "send",
        fromNumber: "+15551234567",
        toNumber: "={{ $json.phone }}",
        message: "Hi {{ $json.name }}",
      },
      [
        { phone: "+15551111111", name: "Alice" },
        { phone: "+15552222222", name: "Bob" },
      ],
    );

    expect(calls).toHaveLength(2);
    const params0 = new URLSearchParams(calls[0].body!);
    const params1 = new URLSearchParams(calls[1].body!);
    expect(params0.get("To")).toBe("+15551111111");
    expect(params0.get("Body")).toBe("Hi Alice");
    expect(params1.get("To")).toBe("+15552222222");
    expect(params1.get("Body")).toBe("Hi Bob");
  });
});
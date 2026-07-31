import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.messageBird";

interface MockResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function mockResponse(body: unknown, init: MockResponseInit = {}) {
  const status = init.status ?? 200;
  const map = new Map<string, string>([["content-type", "application/json"]]);
  for (const [k, v] of Object.entries(init.headers ?? {})) map.set(k.toLowerCase(), v);
  const text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body);
  return {
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) { return map.get(name.toLowerCase()) ?? null; },
      entries() { return map.entries(); },
    },
    async json() { return text ? JSON.parse(text) : null; },
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
let routeMap: Record<string, ReturnType<typeof mockResponse>>;
let defaultResponse: ReturnType<typeof mockResponse>;

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse({}),
) {
  routeMap = routes;
  defaultResponse = fallback;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit | undefined) => {
      const headers: Record<string, string> = {};
      const h = init?.headers as Record<string, string> | undefined;
      if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        url: String(url),
        method,
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      const key = `${method} ${url}`;
      return routeMap[key] ?? defaultResponse;
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
    typeVersion: 1,
    parameters,
    credentials: Object.fromEntries(Object.entries(creds).map(([k]) => [k, { name: k }])),
  });
  const ctx = makeCtx(toItems(inputItems), node, opts?.continueOnFail, creds);
  const executor = getExecutor(TYPE)!;
  return executor(ctx, node);
}

const CREDS = {
  messageBirdApi: {
    apiKey: "test-api-key-123",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue messageBird — n8n-nodes-base.messageBird", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("MessageBird");
  });

  describe("sms send", () => {
    it("sends an SMS via the MessageBird API", async () => {
      const apiResponse = {
        id: "msg-abc-123",
        direction: "mt",
        type: "sms",
        originator: "14155551234",
        body: "Hello from OpenFlow",
        recipients: { totalCount: 1, totalDeliveredCount: 0, items: [{ recipient: 14155559876, status: "sent" }] },
        status: "sent",
      };
      installFetch({
        "POST https://rest.messagebird.com/messages": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "sms",
        operation: "send",
        originator: "14155551234",
        recipients: "+14155559876",
        message: "Hello from OpenFlow",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://rest.messagebird.com/messages");
      expect(calls[0].headers["Authorization"]).toBe("AccessKey test-api-key-123");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({
        originator: "14155551234",
        recipients: "+14155559876",
        body: "Hello from OpenFlow",
      });
      expect(out[0][0].json).toMatchObject({
        id: "msg-abc-123",
        status: "sent",
      });
    });

    it("passes through input item json data", async () => {
      const apiResponse = { id: "msg-pass", status: "sent" };
      installFetch({
        "POST https://rest.messagebird.com/messages": mockResponse(apiResponse),
      });
      const out = await run(
        {
          resource: "sms",
          operation: "send",
          originator: "14155551234",
          recipients: "+14155559876",
          message: "Order 42 ready",
        },
        [{ json: { orderId: 42 } }],
      );
      expect(out[0][0].json).toMatchObject({
        orderId: 42,
        id: "msg-pass",
        status: "sent",
      });
    });

    it("sends additional fields (reference)", async () => {
      const apiResponse = { id: "msg-ref", status: "sent" };
      installFetch({
        "POST https://rest.messagebird.com/messages": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "sms",
        operation: "send",
        originator: "14155551234",
        recipients: "+14155559876",
        message: "Hello",
        additionalFields: { reference: "ORD-42" },
      });
      const sent = JSON.parse(calls[0].body as string);
      expect(sent.reference).toBe("ORD-42");
      expect(out[0][0].json).toMatchObject({ id: "msg-ref", status: "sent" });
    });
  });

  describe("balance get", () => {
    it("gets account balance", async () => {
      const apiResponse = { payment: "prepaid", balance: 42.5, currency: "EUR" };
      installFetch({
        "GET https://rest.messagebird.com/balance": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "balance",
        operation: "get",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://rest.messagebird.com/balance");
      expect(out[0][0].json).toMatchObject({
        payment: "prepaid",
        balance: 42.5,
        currency: "EUR",
      });
    });
  });

  describe("errors", () => {
    it("throws on missing credential", async () => {
      await expect(
        run(
          { resource: "sms", operation: "send", originator: "1415", recipients: "+1415", message: "Hi" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow("MessageBird: messageBirdApi credential is required");
    });

    it("continueOnFail returns error items", async () => {
      installFetch({
        "POST https://rest.messagebird.com/messages": mockResponse(
          { error: "invalid originator" },
          { status: 400 },
        ),
      });
      const out = await run(
        {
          resource: "sms",
          operation: "send",
          originator: "",
          recipients: "",
          message: "",
        },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({
        message: expect.stringContaining("invalid originator"),
      });
    });
  });
});
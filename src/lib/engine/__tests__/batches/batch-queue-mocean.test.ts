import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mocean";

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

function installFetch(
  routes: Record<string, ReturnType<typeof mockResponse>> = {},
  fallback: ReturnType<typeof mockResponse> = mockResponse({}),
) {
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
      return routes[key] ?? fallback;
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
  moceanApi: {
    apiKey: "test-api-key",
    apiSecret: "test-api-secret",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue mocean — n8n-nodes-base.mocean", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Mocean");
  });

  describe("send SMS", () => {
    it("sends an SMS via the Mocean API", async () => {
      const apiResponse = { messages: { status: 0 } };
      installFetch({
        "POST https://rest.moceanapi.com/rest/2/sms/send": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "sms",
        operation: "send",
        from: "AcmeInc",
        to: "+1234567890",
        message: "Hello from Mocean",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://rest.moceanapi.com/rest/2/sms/send");
      const sent = new URLSearchParams(calls[0].body as string);
      expect(sent.get("mocean-api-key")).toBe("test-api-key");
      expect(sent.get("mocean-api-secret")).toBe("test-api-secret");
      expect(sent.get("mocean-resp-format")).toBe("JSON");
      expect(sent.get("mocean-from")).toBe("AcmeInc");
      expect(sent.get("mocean-to")).toBe("+1234567890");
      expect(sent.get("mocean-text")).toBe("Hello from Mocean");
      expect(out[0][0].json).toMatchObject({ messages: { status: 0 } });
    });

    it("passes through input item json data", async () => {
      const apiResponse = { messages: { status: 0 } };
      installFetch({
        "POST https://rest.moceanapi.com/rest/2/sms/send": mockResponse(apiResponse),
      });
      const out = await run(
        {
          resource: "sms",
          operation: "send",
          from: "AcmeInc",
          to: "+1234567890",
          message: "Alert!",
        },
        [{ json: { orderId: 42 } }],
      );
      expect(out[0][0].json).toMatchObject({
        orderId: 42,
        messages: { status: 0 },
      });
    });

    it("sends options (dlrUrl)", async () => {
      const apiResponse = { messages: { status: 0 } };
      installFetch({
        "POST https://rest.moceanapi.com/rest/2/sms/send": mockResponse(apiResponse),
      });
      await run({
        resource: "sms",
        operation: "send",
        from: "AcmeInc",
        to: "+1234567890",
        message: "With DLR",
        options: { dlrUrl: "https://example.com/dlr" },
      });
      const sent = new URLSearchParams(calls[0].body as string);
      expect(sent.get("mocean-dlr-url")).toBe("https://example.com/dlr");
    });
  });

  describe("send voice message", () => {
    it("sends a voice TTS message with language", async () => {
      const apiResponse = { messages: { status: 0 } };
      installFetch({
        "POST https://rest.moceanapi.com/rest/2/sms/send": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "voice",
        operation: "send",
        from: "AcmeInc",
        to: "+1234567890",
        message: "This is a voice message",
        language: "en-US",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://rest.moceanapi.com/rest/2/sms/send");
      const sent = new URLSearchParams(calls[0].body as string);
      expect(sent.get("mocean-command")).toBeDefined();
      const command = JSON.parse(sent.get("mocean-command")!);
      expect(command).toMatchObject({
        "mocean-tts-lang": "en-US",
        "mocean-tts-text": "This is a voice message",
      });
      expect(out[0][0].json).toMatchObject({ messages: { status: 0 } });
    });
  });

  describe("errors", () => {
    it("throws on missing credential", async () => {
      await expect(
        run(
          { resource: "sms", operation: "send", from: "AcmeInc", to: "+123", message: "Hi" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow("Mocean: moceanApi credential is required");
    });

    it("throws on missing required parameter", async () => {
      await expect(
        run({ resource: "sms", operation: "send", from: "", to: "", message: "" }),
      ).rejects.toThrow("Mocean: 'from' parameter is required");
    });

    it("continueOnFail returns error items", async () => {
      installFetch({
        "POST https://rest.moceanapi.com/rest/2/sms/send": mockResponse(
          { error: { message: "invalid credentials" } },
          { status: 400 },
        ),
      });
      const out = await run(
        { resource: "sms", operation: "send", from: "X", to: "+123", message: "Test" },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({
        message: expect.stringContaining("invalid credentials"),
      });
    });
  });
});

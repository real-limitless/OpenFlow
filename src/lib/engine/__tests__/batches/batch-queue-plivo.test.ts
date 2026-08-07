import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext, type ExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.plivo";

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
  plivoApi: {
    authId: "MA123456789",
    authToken: "test-token-abc",
  },
};

beforeEach(() => {
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue plivo — n8n-nodes-base.plivo", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getExecutor(TYPE)).toBeDefined();
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Plivo");
  });

  describe("sms send", () => {
    it("sends an SMS via the Plivo API", async () => {
      const apiResponse = {
        api_id: "abc123",
        message: "message(s) queued",
        message_uuid: ["msg-uuid-1"],
      };
      installFetch({
        "POST https://api.plivo.com/v1/Account/MA123456789/Message/": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "sms",
        operation: "send",
        from: "+14156667777",
        to: "+14156667778",
        message: "Hello from Plivo",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("POST");
      expect(calls[0].url).toBe("https://api.plivo.com/v1/Account/MA123456789/Message/");
      expect(calls[0].headers["Authorization"]).toContain("Basic");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({
        src: "+14156667777",
        dst: "+14156667778",
        text: "Hello from Plivo",
      });
      expect(out[0][0].json).toMatchObject({
        api_id: "abc123",
        message: "message(s) queued",
        message_uuid: ["msg-uuid-1"],
      });
    });
  });

  describe("mms send with media", () => {
    it("sends an MMS with media URLs", async () => {
      const apiResponse = {
        api_id: "mms456",
        message: "message(s) queued",
        message_uuid: ["mms-uuid-1"],
      };
      installFetch({
        "POST https://api.plivo.com/v1/Account/MA123456789/Message/": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "mms",
        operation: "send",
        from: "+14156667777",
        to: "+14156667778",
        message: "Check this out",
        media_urls: "https://example.com/image.png",
      });
      expect(calls).toHaveLength(1);
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({
        src: "+14156667777",
        dst: "+14156667778",
        text: "Check this out",
        type: "mms",
        media_urls: "https://example.com/image.png",
      });
      expect(out[0][0].json).toMatchObject({
        api_id: "mms456",
        message_uuid: ["mms-uuid-1"],
      });
    });
  });

  describe("call make", () => {
    it("makes a voice call", async () => {
      const apiResponse = {
        api_id: "call789",
        message: "call fired",
        request_uuid: "req-uuid-1",
      };
      installFetch({
        "POST https://api.plivo.com/v1/Account/MA123456789/Call/": mockResponse(apiResponse),
      });
      const out = await run({
        resource: "call",
        operation: "make",
        from: "+14156667777",
        to: "+14156667778",
        answer_url: "https://example.com/answer.xml",
        answer_method: "GET",
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.plivo.com/v1/Account/MA123456789/Call/");
      const sent = JSON.parse(calls[0].body as string);
      expect(sent).toMatchObject({
        from: "+14156667777",
        to: "+14156667778",
        answer_url: "https://example.com/answer.xml",
        answer_method: "GET",
      });
      expect(out[0][0].json).toMatchObject({
        message: "call fired",
        request_uuid: "req-uuid-1",
      });
    });
  });

  describe("errors", () => {
    it("throws on missing credential", async () => {
      await expect(
        run(
          { resource: "sms", operation: "send", from: "+1415", to: "+1415", message: "Hi" },
          [{}],
          { credentials: {} },
        ),
      ).rejects.toThrow("Plivo: plivoApi credential is required");
    });

    it("continueOnFail returns error items", async () => {
      installFetch({
        "POST https://api.plivo.com/v1/Account/MA123456789/Message/": mockResponse(
          { error: "invalid number" },
          { status: 400 },
        ),
      });
      const out = await run(
        {
          resource: "sms",
          operation: "send",
          from: "",
          to: "",
          message: "",
        },
        [{}],
        { continueOnFail: true },
      );
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json).toHaveProperty("error");
      expect((out[0][0].json as Record<string, unknown>).error).toMatchObject({
        message: expect.stringContaining("invalid number"),
      });
    });
  });
});
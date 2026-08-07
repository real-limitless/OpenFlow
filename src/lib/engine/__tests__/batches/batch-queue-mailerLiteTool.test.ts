import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeCtx } from "../helpers";
import type { INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.mailerLiteTool";

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
let responseQueue: Array<ReturnType<typeof mockResponse>>;

function installFetch(
  responses: ReturnType<typeof mockResponse> | Array<ReturnType<typeof mockResponse>> = mockResponse({}),
) {
  responseQueue = Array.isArray(responses) ? [...responses] : [responses];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit | undefined) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k] = v;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

function lastCall(): FetchCall {
  return calls[calls.length - 1];
}

function jsonBody(call: FetchCall): unknown {
  if (!call.body) return undefined;
  try { return JSON.parse(call.body); } catch { return call.body; }
}

describe("batch-queue mailerLiteTool — n8n-nodes-base.mailerLiteTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
  });

  describe("subscriber create", () => {
    it("emits the created subscriber", async () => {
      const apiResponse = {
        data: { id: "31897397363737859", email: "test@example.com", status: "active" },
      };
      installFetch(mockResponse(apiResponse));

      const executor = getExecutor(TYPE)!;
      const node = makeNode({
        name: "ML Tool",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "create",
          email: "test@example.com",
          additionalFields: { status: "active" },
        },
      });
      const ctx = makeCtx([{}], node, false, { mailerLiteApi: { apiKey: "test-key-123" } });
      const out = await executor(ctx, node);
      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.id).toBe("31897397363737859");
      expect(out[0][0].json.email).toBe("test@example.com");
      expect(out[0][0].json.status).toBe("active");

      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url).toContain("/subscribers");
      expect(jsonBody(call)).toMatchObject({ email: "test@example.com", status: "active" });
    });
  });

  describe("subscriber get", () => {
    it("fetches a subscriber by email and returns the data", async () => {
      const apiResponse = {
        data: { id: "123", email: "existing@example.com", status: "active" },
      };
      installFetch(mockResponse(apiResponse));

      const executor = getExecutor(TYPE)!;
      const node = makeNode({
        name: "ML Tool",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "get",
          subscriberId: "existing@example.com",
        },
      });
      const ctx = makeCtx(
        [{ json: { subscriberEmail: "existing@example.com" } }],
        node,
        false,
        { mailerLiteApi: { apiKey: "test-key-123" } },
      );
      const out = await executor(ctx, node);
      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.id).toBe("123");
      expect(out[0][0].json.email).toBe("existing@example.com");

      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url).toContain("/subscribers/existing%40example.com");
    });

    it("returns zero items on 404 with continueOnFail", async () => {
      installFetch(mockResponse({}, { status: 404 }));

      const executor = getExecutor(TYPE)!;
      const node = makeNode({
        name: "ML Tool",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "get",
          subscriberId: "nonexistent@example.com",
        },
      });
      const ctx = makeCtx([{}], node, true, { mailerLiteApi: { apiKey: "test-key-123" } });
      const out = await executor(ctx, node);
      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(0);
    });
  });

  describe("subscriber update", () => {
    it("updates subscriber status", async () => {
      const apiResponse = {
        data: { id: "123", email: "test@example.com", status: "unsubscribed" },
      };
      installFetch(mockResponse(apiResponse));

      const executor = getExecutor(TYPE)!;
      const node = makeNode({
        name: "ML Tool",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "update",
          subscriberId: "test@example.com",
          additionalFields: { status: "unsubscribed" },
        },
      });
      const ctx = makeCtx(
        [{ json: { email: "test@example.com" } }],
        node,
        false,
        { mailerLiteApi: { apiKey: "test-key-123" } },
      );
      const out = await executor(ctx, node);
      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.status).toBe("unsubscribed");

      const call = lastCall();
      expect(call.method).toBe("PUT");
      expect(call.url).toContain("/subscribers/test%40example.com");
      expect(jsonBody(call)).toMatchObject({ status: "unsubscribed" });
    });
  });

  describe("subscriber getAll", () => {
    it("fetches all subscribers with cursor pagination", async () => {
      const page1 = {
        data: [
          { id: "1", email: "a@example.com", status: "active" },
          { id: "2", email: "b@example.com", status: "active" },
        ],
        meta: { links: { next: "https://connect.mailerlite.com/api/subscribers?page=2" } },
      };
      const page2 = {
        data: [
          { id: "3", email: "c@example.com", status: "active" },
        ],
        meta: { links: { next: null } },
      };
      installFetch([mockResponse(page1), mockResponse(page2)]);

      const executor = getExecutor(TYPE)!;
      const node = makeNode({
        name: "ML Tool",
        type: TYPE,
        parameters: {
          resource: "subscriber",
          operation: "getAll",
          returnAll: true,
        },
      });
      const ctx = makeCtx([{}], node, false, { mailerLiteApi: { apiKey: "test-key-123" } });
      const out = await executor(ctx, node);
      expect(out).toHaveLength(1);
      expect(out[0]).toHaveLength(3);
    });
  });
});

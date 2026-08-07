import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, makeNode } from "../helpers";
import type { INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.paddleTool";

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
    statusText: status === 200 ? "OK" : status === 400 ? "Bad Request" : "Error",
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

describe("batch-queue paddleTool — n8n-nodes-base.paddleTool", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers executor and description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
    expect(desc?.displayName).toBe("Paddle Tool");
    expect(desc?.category).toBe("Sales");
  });

  it("coupon — create calls Paddle API and returns response", async () => {
    const apiResponse = { success: true, response: { coupon: { id: "CPN-123" } } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "coupon", operation: "create" },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123", sandbox: true },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(apiResponse);
    const call = lastCall();
    expect(call.url).toContain("sandbox-api.paddle.com");
    expect(call.url).toContain("vendor_auth_code=abc");
    expect(call.url).toContain("vendor_id=123");
  });

  it("payment — getAll returns payment list", async () => {
    const apiResponse = { success: true, response: { payments: [] } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "payment", operation: "getAll" },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123", sandbox: true },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(apiResponse);
  });

  it("plan — get returns plan with planId from input", async () => {
    const apiResponse = {
      success: true,
      response: { plan: { id: "12345", name: "Monthly", billing_type: "monthly" } },
    };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "plan", operation: "get", planId: "12345" },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123", sandbox: true },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(apiResponse);
  });

  it("user — getAll returns user collection", async () => {
    const apiResponse = { success: true, response: { users: [{ id: 1, email: "test@example.com" }] } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "user", operation: "getAll" },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123", sandbox: true },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(apiResponse);
  });

  it("payment — reschedule throws NodeOperationError when paymentId missing", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "payment", operation: "reschedule", date: "2025-01-01" },
        [{ json: { paymentId: "" } }],
        {
          credentials: {
            paddleApi: { vendorAuthCode: "abc", vendorId: "123", sandbox: true },
          },
        },
      ),
    ).rejects.toThrow("Payment ID is required for reschedule operation");
  });

  it("continueOnFail returns empty item on error", async () => {
    const [out] = await runNode(
      TYPE,
      { resource: "coupon", operation: "create" },
      [{}],
      {
        continueOnFail: true,
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123", sandbox: true },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual({});
  });
});

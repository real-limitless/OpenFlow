import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, makeNode } from "../helpers";
import type { INodeExecutionData } from "@/lib/workflow/types";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.paddle";

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

function bodyParams(call: FetchCall): URLSearchParams {
  return new URLSearchParams(call.body ?? "");
}

function formBody(call: FetchCall): URLSearchParams {
  return bodyParams(call);
}

describe("batch-queue paddle — n8n-nodes-base.paddle", () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc).toBeTruthy();
    expect(desc?.name).toBe(TYPE);
    expect(desc?.displayName).toBe("Paddle");
    expect(desc?.category).toBe("Sales");
  });

  it("product — getAll returns products list", async () => {
    const apiResponse = { success: true, response: { products: [{ id: 1, name: "Test Product" }] } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "product", operation: "getAll" },
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
    expect(call.url).toContain("sandbox-vendors.paddle.com");
    expect(call.url).toContain("/api/2.0/product/get_products");
    const params = formBody(call);
    expect(params.get("vendor_auth_code")).toBe("abc");
    expect(params.get("vendor_id")).toBe("123");
  });

  it("plan — getAll returns plans list", async () => {
    const apiResponse = { success: true, response: { plans: [{ id: "plan_1", name: "Monthly" }] } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "plan", operation: "getAll" },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123", sandbox: true },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(apiResponse);
    expect(lastCall().url).toContain("/api/2.0/subscription/plans");
  });

  it("plan — get single plan by id", async () => {
    const apiResponse = { success: true, response: { plan: { id: "12345", name: "Monthly" } } };
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
    const call = lastCall();
    expect(call.url).toContain("/api/2.0/subscription/plans");
    const params = formBody(call);
    expect(params.get("plan")).toBe("12345");
  });

  it("coupon — create sends coupon params and returns result", async () => {
    const apiResponse = { success: true, response: { coupon: { id: "CPN-001" } } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      {
        resource: "coupon",
        operation: "create",
        additionalFields: {
          couponCode: "TEST-10",
          discountType: "percentage",
          discountValue: 10,
          couponType: "single",
        },
      },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123" },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(apiResponse);
    const params = formBody(lastCall());
    expect(params.get("couponCode")).toBe("TEST-10");
    expect(params.get("discountType")).toBe("percentage");
  });

  it("coupon — update requires couponId and sends it", async () => {
    const apiResponse = { success: true, response: { coupon: { id: "CPN-001", discount_value: 20 } } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "coupon", operation: "update", couponId: "CPN-001", additionalFields: { discountValue: 20 } },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123" },
        },
      },
    );
    expect(out).toHaveLength(1);
    const params = formBody(lastCall());
    expect(params.get("coupon_id")).toBe("CPN-001");
    expect(params.get("discountValue")).toBe("20");
  });

  it("coupon — update throws when couponId missing", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "coupon", operation: "update" },
        [{}],
        {
          credentials: {
            paddleApi: { vendorAuthCode: "abc", vendorId: "123" },
          },
        },
      ),
    ).rejects.toThrow("Coupon ID is required for update operation");
  });

  it("payment — getAll returns payments", async () => {
    const apiResponse = { success: true, response: { payments: [] } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "payment", operation: "getAll" },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123" },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(apiResponse);
  });

  it("payment — reschedule requires paymentId and date", async () => {
    const apiResponse = { success: true, response: { payment: { id: 1, new_date: "2025-01-15" } } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "payment", operation: "reschedule", paymentId: "1", date: "2025-01-15" },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123" },
        },
      },
    );
    expect(out).toHaveLength(1);
    const params = formBody(lastCall());
    expect(params.get("payment_id")).toBe("1");
    expect(params.get("date")).toBe("2025-01-15");
  });

  it("payment — reschedule throws when paymentId missing", async () => {
    await expect(
      runNode(
        TYPE,
        { resource: "payment", operation: "reschedule", date: "2025-01-01" },
        [{ json: { paymentId: "" } }],
        {
          credentials: {
            paddleApi: { vendorAuthCode: "abc", vendorId: "123" },
          },
        },
      ),
    ).rejects.toThrow("Payment ID is required for reschedule operation");
  });

  it("user — getAll returns users with total", async () => {
    const apiResponse = { success: true, response: { users: [], total: 0 } };
    responseQueue = [mockResponse(apiResponse)];

    const [out] = await runNode(
      TYPE,
      { resource: "user", operation: "getAll" },
      [{}],
      {
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123" },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual(apiResponse);
  });

  it("continueOnFail returns empty item on error", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failure")));

    const [out] = await runNode(
      TYPE,
      { resource: "product", operation: "getAll" },
      [{}],
      {
        continueOnFail: true,
        credentials: {
          paddleApi: { vendorAuthCode: "abc", vendorId: "123" },
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].json).toEqual({});
  });
});

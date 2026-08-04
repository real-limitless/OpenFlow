import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";
import type { NodeExecutor } from "@/sdk";
import { sdkHttpRequest } from "@/sdk";

vi.mock("@/sdk", async () => {
  const actual = await vi.importActual("@/sdk");
  return {
    ...(actual as Record<string, unknown>),
    sdkHttpRequest: vi.fn(),
  };
});

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.oneSimpleApi";

let mockSdkHttpRequest: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  mockSdkHttpRequest = sdkHttpRequest as unknown as ReturnType<typeof vi.fn>;
  mockSdkHttpRequest.mockReset();
});

async function runOneSimpleApi(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>>,
  credentials: Record<string, Record<string, unknown>> = {},
) {
  const node = makeNode({
    name: "N",
    type: TYPE,
    typeVersion: 1,
    parameters,
  });
  const executor = getExecutor(TYPE) as NodeExecutor;
  if (!executor) throw new Error(`Executor for ${TYPE} not found`);

  const { createExecutionContext } = await import("@/sdk");
  const items = inputItems.map((j) => ({ json: j }));
  const ctx = createExecutionContext({
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
    continueOnFail: false,
    getCredential: async (name) => credentials[name] ?? null,
  });

  return executor(ctx, node as never);
}

describe("batch-queue one-simple-api — n8n-nodes-base.oneSimpleApi", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    const desc = getNodeType(TYPE);
    expect(desc).toBeDefined();
    expect(desc.displayName).toBe("One Simple API");
  });

  it("resolves the executor under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.oneSimpleApi")).toBe(canonical);
  });

  it("returns empty output when no input items", async () => {
    const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters: {} });
    const { createExecutionContext } = await import("@/sdk");
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => [],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE) as NodeExecutor;
    const out = await executor(ctx, node as never);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toEqual({});
  });

  it("throws when credential is missing", async () => {
    mockSdkHttpRequest.mockRejectedValue(new Error("credential apiToken/apiKey is required"));
    await expect(
      runOneSimpleApi(
        { resource: "information", operation: "exchangeRate", value: 100, fromCurrency: "USD", toCurrency: "EUR" },
        [{}],
        {},
      ),
    ).rejects.toThrow();
  });

  it("throws for unknown resource/operation combination", async () => {
    await expect(
      runOneSimpleApi(
        { resource: "bogus", operation: "nonexistent" },
        [{}],
        { oneSimpleApi: { apiToken: "test-token" } },
      ),
    ).rejects.toThrow(/unknown resource/);
  });

  it("calls the exchange rate API", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { result: 92.5, from: "USD", to: "EUR", amount: 100 },
    });

    const out = await runOneSimpleApi(
      {
        resource: "information",
        operation: "exchangeRate",
        value: 100,
        fromCurrency: "USD",
        toCurrency: "EUR",
      },
      [{ amount: 100, source: "USD", target: "EUR" }],
      { oneSimpleApi: { apiToken: "test-token" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("result");
    expect(out[0][0].json).toMatchObject({ result: 92.5 });

    expect(mockSdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: expect.stringContaining("/exchange_rate"),
      }),
    );
  });

  it("calls the QR code API", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: {},
      body: { qrCode: "https://onesimpleapi.com/qr/abc123" },
    });

    const out = await runOneSimpleApi(
      {
        resource: "utility",
        operation: "qrCode",
        message: "https://example.com",
      },
      [{ site: "https://example.com" }],
      { oneSimpleApi: { apiToken: "test-token" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("qrCode");

    expect(mockSdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: expect.stringContaining("/qr_code"),
      }),
    );
  });

  it("calls the email validation API", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: {},
      body: { valid: true, email: "test@example.com" },
    });

    const out = await runOneSimpleApi(
      {
        resource: "utility",
        operation: "validateEmail",
        emailAddress: "test@example.com",
      },
      [{ email: "test@example.com" }],
      { oneSimpleApi: { apiToken: "test-token" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({ valid: true });

    expect(mockSdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: expect.stringContaining("/email"),
      }),
    );
  });

  it("calls the website screenshot API", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: {},
      body: { screenshotUrl: "https://onesimpleapi.com/screenshots/abc.png" },
    });

    const out = await runOneSimpleApi(
      {
        resource: "website",
        operation: "screenshot",
        link: "https://example.com",
      },
      [{ page: "https://example.com" }],
      { oneSimpleApi: { apiToken: "test-token" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("screenshotUrl");

    expect(mockSdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: expect.stringContaining("/screenshot"),
      }),
    );
  });

  it("processes multiple items", async () => {
    mockSdkHttpRequest
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: { result: 92.5 },
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: { result: 110.0 },
      });

    const out = await runOneSimpleApi(
      {
        resource: "information",
        operation: "exchangeRate",
        value: "={{ $json.amount }}",
        fromCurrency: "={{ $json.source }}",
        toCurrency: "={{ $json.target }}",
      },
      [
        { amount: 100, source: "USD", target: "EUR" },
        { amount: 200, source: "GBP", target: "USD" },
      ],
      { oneSimpleApi: { apiToken: "test-token" } },
    );

    expect(out[0]).toHaveLength(2);
    expect(mockSdkHttpRequest).toHaveBeenCalledTimes(2);
  });

  it("handles API error with continueOnFail", async () => {
    mockSdkHttpRequest.mockRejectedValue(new Error("Rate limited"));

    const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters: { resource: "information", operation: "exchangeRate" } });
    const { createExecutionContext } = await import("@/sdk");
    const items = [{ json: { amount: 100 } }];
    const ctx = createExecutionContext({
      node,
      workflow: { id: "wf", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
      getNodeInputItems: () => items,
      continueOnFail: true,
      getCredential: async () => ({ apiToken: "test-token" }),
    });

    const executor = getExecutor(TYPE) as NodeExecutor;
    const out = await executor(ctx, node as never);

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
  });
});

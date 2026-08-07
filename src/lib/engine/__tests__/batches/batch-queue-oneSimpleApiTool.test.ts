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

const TYPE = "n8n-nodes-base.oneSimpleApiTool";

let mockSdkHttpRequest: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  mockSdkHttpRequest = sdkHttpRequest as unknown as ReturnType<typeof vi.fn>;
  mockSdkHttpRequest.mockReset();
});

async function runTool(
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

describe("batch-queue oneSimpleApiTool — n8n-nodes-base.oneSimpleApiTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("One Simple API Tool");
  });

  it("resolves the same executor under canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.oneSimpleApiTool")).toBe(canonical);
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
      runTool(
        { resource: "information", operation: "currencyConversion", amount: 100, fromCurrency: "USD", toCurrency: "EUR" },
        [{}],
        {},
      ),
    ).rejects.toThrow();
  });

  it("throws for unknown resource/operation combination", async () => {
    await expect(
      runTool(
        { resource: "bogus", operation: "nonexistent" },
        [{}],
        { oneSimpleApiApi: { apiToken: "test-token" } },
      ),
    ).rejects.toThrow(/unknown resource/);
  });

  it("currency conversion (acceptance)", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { result: 92.5, from: "USD", to: "EUR", amount: 100 },
    });

    const out = await runTool(
      { resource: "information", operation: "currencyConversion", amount: 100, fromCurrency: "USD", toCurrency: "EUR" },
      [{}],
      { oneSimpleApiApi: { apiToken: "test-token" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("result");

    expect(mockSdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: expect.stringContaining("/exchange_rate"),
      }),
    );
  });

  it("QR code generation with expression (acceptance)", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: {},
      body: { qrCode: "https://onesimpleapi.com/qr/abc123" },
    });

    const out = await runTool(
      { resource: "utility", operation: "qrCode", content: "={{ $json.link }}" },
      [{ link: "https://example.com" }],
      { oneSimpleApiApi: { apiToken: "test-token" } },
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

  it("email validation (acceptance)", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: {},
      body: { valid: true, email: "test@example.com" },
    });

    const out = await runTool(
      { resource: "utility", operation: "emailValidation", emailAddress: "={{ $json.email }}" },
      [{ email: "test@example.com" }],
      { oneSimpleApiApi: { apiToken: "test-token" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("valid");

    expect(mockSdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: expect.stringContaining("/email"),
      }),
    );
  });

  it("URL expansion (acceptance)", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: {},
      body: { url: "https://example.com" },
    });

    const out = await runTool(
      { resource: "utility", operation: "expandUrl", shortUrl: "={{ $json.url }}" },
      [{ url: "https://bit.ly/3xyz" }],
      { oneSimpleApiApi: { apiToken: "test-token" } },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("url");

    expect(mockSdkHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: expect.stringContaining("/unshorten"),
      }),
    );
  });

  it("website screenshot (acceptance)", async () => {
    mockSdkHttpRequest.mockResolvedValue({
      status: 200,
      headers: {},
      body: { screenshotUrl: "https://onesimpleapi.com/screenshots/abc.png" },
    });

    const out = await runTool(
      { resource: "website", operation: "screenshot", webpageUrl: "https://example.com" },
      [{}],
      { oneSimpleApiApi: { apiToken: "test-token" } },
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

  it("handles API error with continueOnFail", async () => {
    mockSdkHttpRequest.mockRejectedValue(new Error("Rate limited"));

    const node = makeNode({ name: "N", type: TYPE, typeVersion: 1, parameters: { resource: "information", operation: "currencyConversion" } });
    const { createExecutionContext } = await import("@/sdk");
    const items = [{ json: {} }];
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

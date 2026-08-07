import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import type { INode, INodeExecutionData } from "@/lib/workflow/types";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.wise";

function mockResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const ct = "application/json";
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const headerMap = new Map([["content-type", ct]]);
  return {
    status,
    statusText: status === 204 ? "No Content" : status === 404 ? "Not Found" : "OK",
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        const lower = name.toLowerCase();
        for (const [k, v] of headerMap) { if (k.toLowerCase() === lower) return v; }
        return null;
      },
      forEach(fn: (v: string, k: string) => void) {
        headerMap.forEach((v, k) => fn(v, k));
      },
      entries() { return headerMap.entries(); },
    },
    async json() { return JSON.parse(text); },
    async text() { return text; },
  };
}

interface FetchCall { url: string; method: string; headers: Record<string, string>; body: string | undefined; }

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
    calls.push({ url: String(url), method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? init.body : undefined });
    const next = responseQueue.shift() ?? mockResponse({});
    return next;
  }));
}

beforeEach(() => { installFetch(); });
afterEach(() => { vi.unstubAllGlobals(); });

async function runNode(
  params: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
  opts?: { continueOnFail?: boolean },
): Promise<INodeExecutionData[][]> {
  const node = makeNode({ name: "Wise", type: TYPE, parameters: params });
  const ctx = createExecutionContext({
    node,
    workflow: {
      id: "wf-wise",
      name: "Wise Test",
      active: false,
      nodes: [node],
      connections: {},
      settings: {},
    },
    getNodeInputItems: () =>
      inputItems.map((item): INodeExecutionData =>
        item && typeof item === "object" && "json" in item
          ? (item as unknown as INodeExecutionData)
          : { json: item as Record<string, unknown> },
      ),
    continueOnFail: opts?.continueOnFail ?? false,
    getCredential: async () => ({ apiToken: "test-api-token" }),
  });
  const executor = getExecutor(TYPE);
  if (!executor) throw new Error(`No executor for ${TYPE}`);
  return executor(ctx, node);
}

describe("n8n-nodes-base.wise", () => {
  it("registers executor and node type", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE)).toBeTruthy();
  });

  // --- Profile ---

  it("profile → getAll returns all profiles", async () => {
    const mockProfiles = [
      { id: 1, type: "personal", firstName: "John", lastName: "Doe" },
      { id: 2, type: "business", name: "Acme Ltd" },
    ];
    installFetch(mockResponse(mockProfiles));
    const [out] = await runNode({ resource: "profile", operation: "getAll" });
    expect(out).toHaveLength(2);
    expect((out[0].json as Record<string, unknown>).type).toBe("personal");
    expect(calls[0].url).toContain("/v1/profiles");
  });

  it("profile → get returns single profile", async () => {
    const mockProfile = { id: 123, type: "personal", firstName: "Jane", lastName: "Doe" };
    installFetch(mockResponse(mockProfile));
    const [out] = await runNode(
      { resource: "profile", operation: "get", profileId: "123" },
      [{ json: { profileId: 123 } }],
    );
    expect(out).toHaveLength(1);
    expect((out[0].json as Record<string, unknown>).id).toBe(123);
    expect(calls[0].url).toContain("/v1/profiles/123");
  });

  // --- Account ---

  it("account → getBalances returns balances", async () => {
    const mockBalances = [
      { currency: "USD", amount: { value: 1000 }, type: "STANDARD" },
      { currency: "EUR", amount: { value: 500 }, type: "STANDARD" },
    ];
    installFetch(mockResponse(mockBalances));
    const [out] = await runNode(
      { resource: "account", operation: "getBalances", profileId: "12345" },
      [{ json: { profileId: 12345 } }],
    );
    expect(out).toHaveLength(2);
    const json0 = out[0].json as Record<string, unknown>;
    expect(json0.currency).toBe("USD");
    expect(calls[0].url).toContain("/v1/profiles/12345/balances");
  });

  // --- Exchange Rate ---

  it("exchangeRate → get returns rate", async () => {
    const mockRates = [
      { rate: 0.92, rateType: "STANDARD", source: "USD", target: "EUR", time: "2024-01-01T00:00:00.000Z", value: 0.92 },
    ];
    installFetch(mockResponse(mockRates));
    const [out] = await runNode({ resource: "exchangeRate", operation: "get", source: "USD", target: "EUR" });
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.rate).toBe(0.92);
    expect(json.source).toBe("USD");
    expect(json.target).toBe("EUR");
    expect(calls[0].url).toContain("/v1/rates");
    expect(calls[0].url).toContain("source=USD");
    expect(calls[0].url).toContain("target=EUR");
  });

  // --- Recipient ---

  it("recipient → getAll returns recipients", async () => {
    const mockRecipients = [
      { id: 100, accountHolderName: "John Doe", currency: "EUR" },
      { id: 200, accountHolderName: "Jane Smith", currency: "GBP" },
    ];
    installFetch(mockResponse(mockRecipients));
    const [out] = await runNode(
      { resource: "recipient", operation: "getAll", profileId: "12345" },
      [{ json: { profileId: 12345 } }],
    );
    expect(out).toHaveLength(2);
    expect(calls[0].url).toContain("/v1/accounts");
    expect(calls[0].url).toContain("profileId=12345");
  });

  // --- Quote ---

  it("quote → create creates a quote", async () => {
    const mockQuote = { id: 5000, rate: 0.92, sourceAmount: 200, targetAmount: 184, fee: { amount: 2.5 } };
    installFetch(mockResponse(mockQuote));
    const [out] = await runNode(
      { resource: "quote", operation: "create", profileId: "12345", sourceCurrency: "USD", targetCurrency: "EUR", amount: 200 },
      [{ json: { profileId: 12345 } }],
    );
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.id).toBe(5000);
    expect(json.sourceAmount).toBe(200);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/v2/profiles/12345/quotes");
    expect(calls[0].body).toContain("sourceCurrency");
  });

  // --- Transfer ---

  it("transfer → create creates a transfer", async () => {
    const mockTransfer = { id: 7000, status: "processing", sourceCurrency: "USD", targetCurrency: "EUR", sourceValue: 200, targetValue: 184 };
    installFetch(mockResponse(mockTransfer));
    const [out] = await runNode(
      { resource: "transfer", operation: "create", profileId: "12345", quoteId: "uuid-abc", targetAccount: "67890", reference: "Invoice 123" },
      [{ json: { profileId: 12345, recipientId: 67890 } }],
    );
    expect(out).toHaveLength(1);
    const json = out[0].json as Record<string, unknown>;
    expect(json.id).toBe(7000);
    expect(json.status).toBe("processing");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/v1/profiles/12345/transfers");
    expect(calls[0].body).toContain("targetAccount");
    expect(calls[0].body).toContain("quoteUuid");
  });

  it("transfer → getAll returns transfers", async () => {
    const mockTransfers = [
      { id: 1, status: "processing", sourceCurrency: "USD", targetCurrency: "EUR", sourceValue: 200, targetValue: 184 },
    ];
    installFetch(mockResponse(mockTransfers));
    const [out] = await runNode(
      { resource: "transfer", operation: "getAll", profileId: "12345" },
      [{ json: { profileId: 12345 } }],
    );
    expect(out).toHaveLength(1);
    expect(calls[0].url).toContain("/v1/profiles/12345/transfers");
  });

  // --- Errors ---

  it("throws on API error", async () => {
    installFetch(mockResponse({ error: "Not Found" }, { status: 404 }));
    await expect(runNode({ resource: "profile", operation: "getAll" })).rejects.toThrow("Wise API error");
  });

  it("continueOnFail suppresses error", async () => {
    installFetch([
      mockResponse({ error: "Not Found" }, { status: 404 }),
      mockResponse([{ id: 1, type: "personal" }]),
    ]);
    const [out] = await runNode(
      { resource: "profile", operation: "getAll" },
      [{}, {}],
      { continueOnFail: true },
    );
    expect(out).toHaveLength(2);
    expect((out[0].json as Record<string, unknown>).error).toBeTruthy();
    expect((out[1].json as Record<string, unknown>).id).toBe(1);
  });
});

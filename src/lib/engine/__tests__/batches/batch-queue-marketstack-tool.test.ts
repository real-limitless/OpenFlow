import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecutionContext, type ExecutionContext, type INode } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor } from "@/lib/engine/node-runtime";
import { makeNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.marketstackTool";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, status = 200) {
  return {
    status,
    text: async () => JSON.stringify(data),
  };
}

const CREDS = { marketstackApi: { apiKey: "test-key-123", useHttps: true } };

function makeNodeWithParams(params: Record<string, unknown>): INode {
  return makeNode({ name: "N", type: TYPE, parameters: params }) as INode;
}

function makeCtx(items: Array<Record<string, unknown>>, node: INode): ExecutionContext {
  return createExecutionContext({
    node,
    workflow: { id: "wf-test", name: "Test", active: false, nodes: [node], connections: {}, settings: {} },
    getNodeInputItems: () => items.map((json) => ({ json })),
    continueOnFail: false,
    getCredential: async () => CREDS.marketstackApi,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("marketstackTool", () => {
  it("should fetch end-of-day data for a single ticker", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        pagination: { limit: 5, offset: 0, count: 5, total: 100 },
        data: [
          { open: 150, high: 155, low: 148, close: 152, volume: 10000000, symbol: "AAPL", exchange: "XNAS", date: "2024-01-01" },
          { open: 151, high: 156, low: 149, close: 153, volume: 10000001, symbol: "AAPL", exchange: "XNAS", date: "2024-01-02" },
          { open: 152, high: 157, low: 150, close: 154, volume: 10000002, symbol: "AAPL", exchange: "XNAS", date: "2024-01-03" },
          { open: 153, high: 158, low: 151, close: 155, volume: 10000003, symbol: "AAPL", exchange: "XNAS", date: "2024-01-04" },
          { open: 154, high: 159, low: 152, close: 156, volume: 10000004, symbol: "AAPL", exchange: "XNAS", date: "2024-01-05" },
        ],
      }),
    );

    const node = makeNodeWithParams({ resource: "endOfDayData", operation: "getAll", symbols: "AAPL", returnAll: false, limit: 5, filters: {} });
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    const json = output[0].json;
    const data = json.data as Record<string, unknown>[];
    expect(data).toHaveLength(5);
    expect(data[0]).toHaveProperty("open");
    expect(data[0]).toHaveProperty("high");
    expect(data[0]).toHaveProperty("low");
    expect(data[0]).toHaveProperty("close");
    expect(data[0]).toHaveProperty("volume");
    expect(data[0]).toHaveProperty("symbol", "AAPL");
    expect(data[0]).toHaveProperty("date");
    expect(json).toHaveProperty("pagination");
  });

  it("should fetch exchange details", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        name: "NASDAQ Stock Exchange", acronym: "NASDAQ", mic: "XNAS",
        country: "United States", country_code: "US", city: "New York",
        website: "www.nasdaq.com", timezone: "America/New_York",
      }),
    );

    const node = makeNodeWithParams({ resource: "exchange", operation: "get", exchange: "XNAS" });
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    const json = output[0].json;
    expect(json).toHaveProperty("name");
    expect(json).toHaveProperty("mic", "XNAS");
    expect(json).toHaveProperty("country");
  });

  it("should fetch ticker information", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        symbol: "AAPL", name: "Apple Inc.", has_intraday: false, has_eod: true,
        country: "United States", stock_exchange: { name: "NASDAQ", mic: "XNAS", country: "US" },
      }),
    );

    const node = makeNodeWithParams({ resource: "ticker", operation: "get", symbol: "AAPL" });
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    const [output] = await executor(ctx, node);

    expect(output).toHaveLength(1);
    const json = output[0].json;
    expect(json).toHaveProperty("symbol", "AAPL");
    expect(json).toHaveProperty("name");
    expect(json).toHaveProperty("stock_exchange");
  });

  it("should throw on missing symbols", async () => {
    const node = makeNodeWithParams({ resource: "endOfDayData", operation: "getAll", symbols: "" });
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow("symbols");
  });

  it("should throw on missing exchange", async () => {
    const node = makeNodeWithParams({ resource: "exchange", operation: "get", exchange: "" });
    const ctx = makeCtx([{}], node);
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow("exchange");
  });
});
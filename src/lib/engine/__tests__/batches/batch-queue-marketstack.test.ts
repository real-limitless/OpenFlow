import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.marketstack";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url).split("?")[0];
      calls.push({ url: String(url) });
      for (const [route, data] of Object.entries(routes)) {
        if (key.includes(route)) {
          return mockJsonResponse(data, 200);
        }
      }
      return mockJsonResponse({ error: "not_found" }, 404);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue marketstack — n8n-nodes-base.marketstack", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Marketstack");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.marketstack")).toBe(canonical);
  });

  it("EndOfDayData — getAll returns pagination and data array", async () => {
    const fakeResponse = {
      pagination: { limit: 5, offset: 0, count: 1, total: 1 },
      data: [
        {
          open: 150.25,
          high: 152.10,
          low: 149.80,
          close: 151.50,
          volume: 75000000,
          symbol: "AAPL",
          exchange: "XNAS",
          date: "2024-06-14T00:00:00+0000",
        },
      ],
    };
    installFetch({ "/eod": fakeResponse });
    const out = await runNode(
      TYPE,
      { resource: "EndOfDayData", operation: "getAll", symbol: "AAPL", limit: 5 },
      [{}],
      { credentials: { marketstackApi: { apiKey: "test_key" } } },
    );
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.pagination as Record<string, unknown>).count).toBe(1);
    expect((json.data as Array<Record<string, unknown>>)[0].symbol).toBe("AAPL");
    expect((json.data as Array<Record<string, unknown>>)[0].close).toBe(151.50);
    expect(calls).toHaveLength(1);
  });

  it("Exchange — get returns exchange details", async () => {
    const fakeResponse = {
      data: {
        name: "New York Stock Exchange",
        acronym: "NYSE",
        mic: "XNYS",
        country: "US",
        country_code: "US",
        city: "New York",
        website: "www.nyse.com",
        timezone: "America/New_York",
      },
    };
    installFetch({ "/exchanges/XNYS": fakeResponse });
    const out = await runNode(
      TYPE,
      { resource: "Exchange", operation: "get", exchange: "XNYS" },
      [{}],
      { credentials: { marketstackApi: { apiKey: "test_key" } } },
    );
    expect(out[0]).toHaveLength(1);
    const data = (out[0][0].json as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.name).toBe("New York Stock Exchange");
    expect(data.mic).toBe("XNYS");
    expect(data.country).toBe("US");
    expect(calls).toHaveLength(1);
  });

  it("Ticker — get returns ticker metadata", async () => {
    const fakeResponse = {
      data: {
        name: "Microsoft Corporation",
        symbol: "MSFT",
        has_intraday: false,
        has_eod: true,
        country: "US",
        stock_exchange: {
          name: "Nasdaq Stock Market",
          acronym: "NASDAQ",
          mic: "XNAS",
          country: "US",
          country_code: "US",
          city: "New York",
          website: "www.nasdaq.com",
          timezone: "America/New_York",
        },
      },
    };
    installFetch({ "/tickers/MSFT": fakeResponse });
    const out = await runNode(
      TYPE,
      { resource: "Ticker", operation: "get", symbol: "MSFT" },
      [{}],
      { credentials: { marketstackApi: { apiKey: "test_key" } } },
    );
    expect(out[0]).toHaveLength(1);
    const data = (out[0][0].json as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.name).toBe("Microsoft Corporation");
    expect(data.symbol).toBe("MSFT");
    expect((data.stock_exchange as Record<string, unknown>).mic).toBe("XNAS");
    expect(calls).toHaveLength(1);
  });

  it("missing symbol throws for EndOfDayData", async () => {
    await expect(
      runNode(TYPE, { resource: "EndOfDayData", operation: "getAll", symbol: "" }, [{}], {
        credentials: { marketstackApi: { apiKey: "test_key" } },
      }),
    ).rejects.toThrow(/symbol parameter is required/i);
  });

  it("continueOnFail with invalid symbol yields error item", async () => {
    installFetch({ "/eod": { error: { message: "Invalid symbol" } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockJsonResponse({ error: { message: "Invalid symbol" } }, 400)),
    );
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "EndOfDayData", operation: "getAll", symbol: "NONEXISTENT", continueOnFail: true },
      [{}],
      { continueOnFail: true, credentials: { marketstackApi: { apiKey: "test_key" } } },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeResponse = {
      pagination: { limit: 1, offset: 0, count: 1, total: 1 },
      data: [{ open: 150, high: 152, low: 149, close: 151, volume: 100, symbol: "AAPL", exchange: "XNAS", date: "2024-01-01T00:00:00+0000" }],
    };
    installFetch({ "/eod": fakeResponse });
    const out = await runNode(
      TYPE,
      { resource: "EndOfDayData", operation: "getAll", symbol: "AAPL", limit: 1 },
      [{}, {}],
      { credentials: { marketstackApi: { apiKey: "test_key" } } },
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockJsonResponse({ error: "server_error" }, 500)));
    await expect(
      runNode(TYPE, { resource: "EndOfDayData", operation: "getAll", symbol: "AAPL" }, [{}], {
        credentials: { marketstackApi: { apiKey: "test_key" } },
      }),
    ).rejects.toThrow();
  });
});

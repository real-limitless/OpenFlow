import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.coinGecko";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Too Many Requests",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
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
      if (!(key in routes)) {
        return mockJsonResponse({ error: "not found" }, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch-queue coinGecko — n8n-nodes-base.coinGecko", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("CoinGecko");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.coinGecko")).toBe(canonical);
  });

  it("coin — get returns bitcoin data", async () => {
    const fakeCoin = {
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "btc",
      market_data: { current_price: { usd: 50000 } },
    };
    installFetch({
      "https://api.coingecko.com/api/v3/coins/bitcoin": fakeCoin,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "coin",
        operation: "get",
        coinId: "bitcoin",
        localization: false,
        tickers: false,
        marketData: true,
        communityData: false,
        developerData: false,
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).id).toBe("bitcoin");
    expect(calls).toHaveLength(1);
  });

  it("coin — price returns rates for bitcoin and ethereum", async () => {
    const fakePrice = {
      bitcoin: { usd: 50000, usd_market_cap: 1e12 },
      ethereum: { usd: 3000, usd_market_cap: 3e11 },
    };
    installFetch({
      "https://api.coingecko.com/api/v3/simple/price": fakePrice,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "coin",
        operation: "price",
        coinIds: "bitcoin,ethereum",
        baseCurrency: "usd",
        includeMarketCap: true,
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.bitcoin as Record<string, unknown>).usd).toBe(50000);
    expect(calls).toHaveLength(1);
  });

  it("coin — getAll returns paginated coin list", async () => {
    const fakeMarkets = Array.from({ length: 10 }, (_, i) => ({
      id: `coin-${i}`,
      symbol: `c${i}`,
      name: `Coin ${i}`,
      current_price: i * 100,
    }));
    installFetch({
      "https://api.coingecko.com/api/v3/coins/markets": fakeMarkets,
    });
    const out = await runNode(
      TYPE,
      { resource: "coin", operation: "getAll", perPage: 10, page: 1 },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as unknown as unknown[];
    expect(result).toHaveLength(10);
    expect((result[0] as Record<string, unknown>).id).toBe("coin-0");
    expect(calls).toHaveLength(1);
  });

  it("coin — candlestick returns OHLC arrays", async () => {
    const fakeOhlc = [
      [1700000000000, 40000, 41000, 39000, 40500],
      [1700086400000, 40500, 41500, 40000, 41000],
    ];
    installFetch({
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc": fakeOhlc,
    });
    const out = await runNode(
      TYPE,
      { resource: "coin", operation: "candlestick", coinId: "bitcoin", baseCurrency: "usd", days: 7 },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as unknown as unknown[];
    expect(result).toHaveLength(2);
    expect((result[0] as number[])).toHaveLength(5);
    expect(calls).toHaveLength(1);
  });

  it("event — getAll returns event objects", async () => {
    const fakeEvents = {
      data: [
        { id: "1", title: "Event 1", date: "2024-01-01", type: "Conference", country: "US" },
      ],
    };
    installFetch({
      "https://api.coingecko.com/api/v3/events": fakeEvents,
    });
    const out = await runNode(
      TYPE,
      { resource: "event", operation: "getAll", upComingEventsOnly: true },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.data as unknown[])).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("continueOnFail with missing coinId yields error item", async () => {
    const { out } = await runNodeWithCtx(
      TYPE,
      { resource: "coin", operation: "get", coinId: "" },
      [{}],
      { continueOnFail: true },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    const fakeCoin = { id: "bitcoin", name: "Bitcoin" };
    installFetch({
      "https://api.coingecko.com/api/v3/coins/bitcoin": fakeCoin,
    });
    const out = await runNode(
      TYPE,
      { resource: "coin", operation: "get", coinId: "bitcoin" },
      [{}, {}],
    );
    expect(out[0]).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});

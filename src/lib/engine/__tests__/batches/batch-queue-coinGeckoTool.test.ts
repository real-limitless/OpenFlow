import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor, getExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.coinGeckoTool";

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

describe("batch-queue coinGeckoTool — n8n-nodes-base.coinGeckoTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("CoinGecko (AI Tool)");
  });

  it("resolves the same executor as coinGecko under the canonical type string", () => {
    const toolExecutor = getExecutor(TYPE);
    const coinGeckoExecutor = getExecutor("n8n-nodes-base.coinGecko");
    expect(toolExecutor).toBeDefined();
    expect(coinGeckoExecutor).toBeDefined();
    expect(toolExecutor).toBe(coinGeckoExecutor);
  });

  it("coin — price returns bitcoin price (acceptance: AI agent queries bitcoin price)", async () => {
    const fakePrice = { bitcoin: { usd: 50000 } };
    installFetch({
      "https://api.coingecko.com/api/v3/simple/price": fakePrice,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "coin",
        operation: "price",
        coinIds: "bitcoin",
        baseCurrency: "usd",
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect((json.bitcoin as Record<string, unknown>).usd).toBe(50000);
    expect((json.bitcoin as Record<string, unknown>).usd).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });

  it("coin — getAll returns top coins by market cap (acceptance: AI agent lists top coins)", async () => {
    const fakeMarkets = Array.from({ length: 5 }, (_, i) => ({
      id: `coin-${i}`,
      symbol: `c${i}`,
      name: `Coin ${i}`,
      current_price: (5 - i) * 1000,
    }));
    installFetch({
      "https://api.coingecko.com/api/v3/coins/markets": fakeMarkets,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "coin",
        operation: "getAll",
        perPage: 5,
        page: 1,
        order: "market_cap_desc",
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as unknown as unknown[];
    expect(result).toHaveLength(5);
    for (const item of result as Array<Record<string, unknown>>) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("symbol");
      expect(item).toHaveProperty("name");
    }
    expect(calls).toHaveLength(1);
  });

  it("coin — get returns coin details (acceptance: AI agent gets coin details)", async () => {
    const fakeCoin = { id: "ethereum", name: "Ethereum", symbol: "eth" };
    installFetch({
      "https://api.coingecko.com/api/v3/coins/ethereum": fakeCoin,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "coin",
        operation: "get",
        coinId: "ethereum",
        localization: false,
        tickers: false,
        marketData: false,
        communityData: false,
        developerData: false,
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("ethereum");
    expect(json.name).toBe("Ethereum");
    expect(calls).toHaveLength(1);
  });

  it("coin — market returns market data array", async () => {
    const fakeMarkets = [
      { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 50000 },
    ];
    installFetch({
      "https://api.coingecko.com/api/v3/coins/markets": fakeMarkets,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "coin",
        operation: "market",
        baseCurrency: "usd",
        coinIds: "bitcoin",
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const result = out[0][0].json as unknown as unknown[];
    expect(result).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("coin — history returns historical data", async () => {
    const fakeHistory = { id: "bitcoin", name: "Bitcoin", market_data: {} };
    installFetch({
      "https://api.coingecko.com/api/v3/coins/bitcoin/history": fakeHistory,
    });
    const out = await runNode(
      TYPE,
      {
        resource: "coin",
        operation: "history",
        coinId: "bitcoin",
        date: "01-01-2024",
      },
      [{}],
    );
    expect(out[0]).toHaveLength(1);
    const json = out[0][0].json as Record<string, unknown>;
    expect(json.id).toBe("bitcoin");
    expect(calls).toHaveLength(1);
  });

  it("event — getAll returns event objects", async () => {
    const fakeEvents = {
      data: [
        { id: "1", title: "Conference", date: "2024-06-15", type: "Conference", country: "US" },
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

  it("unsupported resource/operation throws error", async () => {
    await expect(
      runNode(TYPE, { resource: "coin", operation: "invalid" }, [{}]),
    ).rejects.toThrow();
  });
});

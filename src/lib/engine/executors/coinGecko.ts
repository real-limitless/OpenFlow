import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const BASE_URL = "https://api.coingecko.com/api/v3";

export const coinGeckoExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "coin");
  const operation = ctx.getParam<string>("operation", "get");
  const continueOnFail = ctx.continueOnFail();

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      if (resource === "coin") {
        switch (operation) {
          case "get":
            result = await getCoin(ctx);
            break;
          case "getAll":
            result = await getAllCoins(ctx);
            break;
          case "price":
            result = await getPrice(ctx);
            break;
          case "market":
            result = await getMarket(ctx);
            break;
          case "history":
            result = await getHistory(ctx);
            break;
          case "marketChart":
            result = await getMarketChart(ctx);
            break;
          case "candlestick":
            result = await getCandlestick(ctx);
            break;
          case "ticker":
            result = await getTicker(ctx);
            break;
          default:
            throw new Error(`CoinGecko: unsupported operation: ${operation}`);
        }
      } else if (resource === "event" && operation === "getAll") {
        result = await getEvents(ctx);
      } else {
        throw new Error(
          `CoinGecko: unsupported resource/operation: ${resource}/${operation}`,
        );
      }

      out.push({
        json: result as Record<string, unknown>,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

async function apiFetch(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `CoinGecko API: HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return res.json();
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

async function getCoin(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const coinId = ctx.getParam<string>("coinId", "");
  if (!coinId) throw new Error("CoinGecko: coinId is required");

  const params = {
    localization: ctx.getParam<boolean>("localization", false),
    tickers: ctx.getParam<boolean>("tickers", true),
    market_data: ctx.getParam<boolean>("marketData", true),
    community_data: ctx.getParam<boolean>("communityData", true),
    developer_data: ctx.getParam<boolean>("developerData", true),
    sparkline: ctx.getParam<boolean>("sparkline", false),
  };
  return apiFetch(`/coins/${encodeURIComponent(coinId)}${buildQuery(params)}`);
}

async function getAllCoins(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const params = {
    vs_currency: ctx.getParam<string>("baseCurrency", "usd"),
    order: ctx.getParam<string>("order", "market_cap_desc"),
    per_page: ctx.getParam<number>("perPage", 100),
    page: ctx.getParam<number>("page", 1),
    sparkline: ctx.getParam<boolean>("sparkline", false),
    price_change_percentage: ctx.getParam<string>("priceChangePeriod", "24h"),
  };
  return apiFetch(`/coins/markets${buildQuery(params)}`);
}

async function getPrice(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const coinIds = ctx.getParam<string>("coinIds", "");
  if (!coinIds) throw new Error("CoinGecko: coinIds is required");

  const params = {
    ids: coinIds,
    vs_currencies: ctx.getParam<string>("baseCurrency", "usd"),
    include_market_cap: ctx.getParam<boolean>("includeMarketCap", false),
    include_24hr_vol: ctx.getParam<boolean>("include24hrVol", false),
    include_24hr_change: ctx.getParam<boolean>("include24hrChange", false),
    include_last_updated_at: ctx.getParam<boolean>("includeLastUpdatedAt", false),
  };
  return apiFetch(`/simple/price${buildQuery(params)}`);
}

async function getMarket(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const params: Record<string, string | number | boolean | undefined> = {
    vs_currency: ctx.getParam<string>("baseCurrency", "usd"),
    order: ctx.getParam<string>("order", "market_cap_desc"),
    per_page: ctx.getParam<number>("perPage", 100),
    page: ctx.getParam<number>("page", 1),
    sparkline: ctx.getParam<boolean>("sparkline", false),
    price_change_percentage: ctx.getParam<string>("priceChangePeriod", "24h"),
  };
  const coinIds = ctx.getParam<string>("coinIds", "");
  if (coinIds) params.ids = coinIds;
  return apiFetch(`/coins/markets${buildQuery(params)}`);
}

async function getHistory(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const coinId = ctx.getParam<string>("coinId", "");
  if (!coinId) throw new Error("CoinGecko: coinId is required");
  const date = ctx.getParam<string>("date", "");
  if (!date) throw new Error("CoinGecko: date is required");

  const params = {
    date,
    localization: ctx.getParam<boolean>("localization", false),
  };
  return apiFetch(`/coins/${encodeURIComponent(coinId)}/history${buildQuery(params)}`);
}

async function getMarketChart(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const coinId = ctx.getParam<string>("coinId", "");
  if (!coinId) throw new Error("CoinGecko: coinId is required");

  const params = {
    vs_currency: ctx.getParam<string>("baseCurrency", "usd"),
    days: ctx.getParam<number>("days", 7),
    interval: ctx.getParam<string>("interval", "daily"),
  };
  return apiFetch(`/coins/${encodeURIComponent(coinId)}/market_chart${buildQuery(params)}`);
}

async function getCandlestick(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const coinId = ctx.getParam<string>("coinId", "");
  if (!coinId) throw new Error("CoinGecko: coinId is required");

  const params = {
    vs_currency: ctx.getParam<string>("baseCurrency", "usd"),
    days: ctx.getParam<number>("days", 7),
  };
  return apiFetch(`/coins/${encodeURIComponent(coinId)}/ohlc${buildQuery(params)}`);
}

async function getTicker(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const coinId = ctx.getParam<string>("coinId", "");
  if (!coinId) throw new Error("CoinGecko: coinId is required");

  const params: Record<string, string | number | boolean | undefined> = {
    page: ctx.getParam<number>("page", 1),
    order: ctx.getParam<string>("order", "trust_score_desc"),
  };
  const exchangeIds = ctx.getParam<string>("exchangeIds", "");
  if (exchangeIds) params.exchange_ids = exchangeIds;
  return apiFetch(`/coins/${encodeURIComponent(coinId)}/tickers${buildQuery(params)}`);
}

async function getEvents(ctx: { getParam: <T>(name: string, defaultVal?: T) => T }): Promise<unknown> {
  const params: Record<string, string | number | boolean | undefined> = {
    page: ctx.getParam<number>("page", 1),
    up_coming_events_only: ctx.getParam<boolean>("upComingEventsOnly", true),
  };
  const countryCode = ctx.getParam<string>("countryCode", "");
  if (countryCode) params.country_code = countryCode;
  const type = ctx.getParam<string>("type", "");
  if (type) params.type = type;
  const fromDate = ctx.getParam<string>("fromDate", "");
  if (fromDate) params.from_date = fromDate;
  const toDate = ctx.getParam<string>("toDate", "");
  if (toDate) params.to_date = toDate;
  return apiFetch(`/events${buildQuery(params)}`);
}

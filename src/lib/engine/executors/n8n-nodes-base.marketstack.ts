import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const BASE_URL = "https://api.marketstack.com/v1";

export const marketstackExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "EndOfDayData");
  const operation = ctx.getParam<string>("operation", "getAll");
  const continueOnFail = ctx.continueOnFail();

  const credential = await ctx.getCredential("marketstackApi");
  const apiKey =
    (credential?.apiKey as string | undefined) ?? (credential?.accessKey as string | undefined) ?? "";
  const useHttps = (credential?.useHttps as boolean | undefined) ?? true;
  const protocol = useHttps ? "https" : "http";

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let result: unknown;

      if (resource === "EndOfDayData" && operation === "getAll") {
        result = await fetchEndOfDayData(apiKey, protocol, ctx);
      } else if (resource === "Exchange" && operation === "get") {
        result = await fetchExchange(apiKey, protocol, ctx);
      } else if (resource === "Ticker" && operation === "get") {
        result = await fetchTicker(apiKey, protocol, ctx);
      } else {
        throw new Error(
          `Marketstack: unsupported resource/operation combination: ${resource}/${operation}`,
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

function buildBaseUrl(protocol: string): string {
  return `${protocol}://${BASE_URL.replace("https://", "")}`;
}

async function fetchEndOfDayData(
  apiKey: string,
  protocol: string,
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
): Promise<Record<string, unknown>> {
  if (!apiKey) throw new Error("Marketstack: API key is required");

  const symbol = ctx.getParam<string>("symbol", "");
  if (!symbol || symbol.trim() === "") {
    throw new Error("Marketstack: symbol parameter is required for EndOfDayData");
  }

  const base = buildBaseUrl(protocol);
  const params = new URLSearchParams({ access_key: apiKey, symbols: symbol });

  const dateFrom = ctx.getParam<string>("dateFrom", "");
  if (dateFrom) params.set("date_from", dateFrom);

  const dateTo = ctx.getParam<string>("dateTo", "");
  if (dateTo) params.set("date_to", dateTo);

  const latest = ctx.getParam<boolean>("latest", false);
  if (latest) params.set("latest", "1");

  const exchange = ctx.getParam<string>("exchange", "");
  if (exchange) params.set("exchange", exchange);

  const sort = ctx.getParam<string>("sort", "");
  if (sort) params.set("sort", sort);

  const limit = ctx.getParam<number>("limit", 0);
  if (limit > 0) params.set("limit", String(limit));

  const offset = ctx.getParam<number>("offset", 0);
  if (offset > 0) params.set("offset", String(offset));

  const url = `${base}/eod?${params.toString()}`;
  return apiFetch(url);
}

async function fetchExchange(
  apiKey: string,
  protocol: string,
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
): Promise<Record<string, unknown>> {
  if (!apiKey) throw new Error("Marketstack: API key is required");

  const exchange = ctx.getParam<string>("exchange", "");
  if (!exchange || exchange.trim() === "") {
    throw new Error("Marketstack: exchange parameter is required");
  }

  const base = buildBaseUrl(protocol);
  const url = `${base}/exchanges/${encodeURIComponent(exchange)}?access_key=${encodeURIComponent(apiKey)}`;
  return apiFetch(url);
}

async function fetchTicker(
  apiKey: string,
  protocol: string,
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
): Promise<Record<string, unknown>> {
  if (!apiKey) throw new Error("Marketstack: API key is required");

  const symbol = ctx.getParam<string>("symbol", "");
  if (!symbol || symbol.trim() === "") {
    throw new Error("Marketstack: symbol parameter is required for Ticker");
  }

  const base = buildBaseUrl(protocol);
  const url = `${base}/tickers/${encodeURIComponent(symbol)}?access_key=${encodeURIComponent(apiKey)}`;
  return apiFetch(url);
}

async function apiFetch(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const errMsg =
      (body.error as { message?: string } | undefined)?.message ??
      (body.error as string | undefined) ??
      `Marketstack API: HTTP ${res.status}`;
    throw new Error(String(errMsg));
  }
  return body;
}

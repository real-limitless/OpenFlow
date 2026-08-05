import type { NodeExecutor, INodeExecutionData, INode } from "@/sdk";
import { ensureItems } from "@/sdk";

const API_BASE = "https://api.marketstack.com/v1";
const API_BASE_HTTP = "http://api.marketstack.com/v1";

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return { data: body };
}

async function marketstackRequest(
  url: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch { }
    return { status: response.status, body: parsed };
  } catch (err) {
    throw new Error(`Marketstack request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function processError(body: unknown, status: number): Error {
  const obj = asObj(body);
  const error = obj.error && typeof obj.error === "object" ? obj.error as Record<string, unknown> : null;
  const code = error ? error.code : undefined;
  const message = error ? error.message : obj.message;
  return new Error(`Marketstack: ${typeof message === "string" ? message : `HTTP ${status}`}${code ? ` (code: ${code})` : ""}`);
}

async function requestOk(url: string): Promise<Record<string, unknown>> {
  const res = await marketstackRequest(url);
  if (res.status < 200 || res.status >= 300) throw processError(res.body, res.status);
  return asObj(res.body);
}

function buildBaseUrl(useHttps: boolean): string {
  return useHttps ? API_BASE : API_BASE_HTTP;
}

export const marketstackToolExecutor: NodeExecutor = async (ctx, node) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const resource = String((node.parameters as Record<string, unknown>).resource ?? "endOfDayData");
  const operation = String((node.parameters as Record<string, unknown>).operation ?? "getAll");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("marketstackApi");
  const apiKey = cred ? String((cred as Record<string, unknown>).apiKey ?? "") : "";
  const useHttps = cred ? Boolean((cred as Record<string, unknown>).useHttps) : true;
  if (!apiKey) throw new Error("Marketstack: marketstackApi credential is not configured");
  const baseUrl = buildBaseUrl(useHttps);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };
    try {
      let result: Record<string, unknown>;

      if (resource === "endOfDayData") {
        const symbols = String((node.parameters as Record<string, unknown>).symbols ?? "");
        if (!symbols) throw new Error("Marketstack: symbols parameter is required for end-of-day data");
        const returnAll = Boolean((node.parameters as Record<string, unknown>).returnAll ?? false);
        const limit = Number((node.parameters as Record<string, unknown>).limit ?? 50);

        const params = new URLSearchParams();
        params.set("access_key", apiKey);
        params.set("symbols", symbols);

        const filtersRaw = (node.parameters as Record<string, unknown>).filters as Record<string, unknown> | undefined;
        if (filtersRaw) {
          if (filtersRaw.exchange) params.set("exchange", String(filtersRaw.exchange));
          if (filtersRaw.latest) params.set("latest", String(filtersRaw.latest));
          if (filtersRaw.dateFrom || filtersRaw.specificDate) {
            params.set("date_from", String(filtersRaw.dateFrom ?? filtersRaw.specificDate));
          }
          if (filtersRaw.dateTo) params.set("date_to", String(filtersRaw.dateTo));
          if (filtersRaw.sort) params.set("sort", String(filtersRaw.sort).toLowerCase());
        }

        if (!returnAll) {
          params.set("limit", String(Math.max(limit, 1)));
        }

        result = await requestOk(`${baseUrl}/eod?${params.toString()}`);

        const data = Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
        if (!returnAll && limit > 0) {
          result.data = data.slice(0, limit);
        }
      } else if (resource === "exchange") {
        const exchange = String((node.parameters as Record<string, unknown>).exchange ?? "");
        if (!exchange) throw new Error("Marketstack: exchange parameter is required");
        const params = new URLSearchParams({ access_key: apiKey });
        result = await requestOk(`${baseUrl}/exchanges/${exchange}?${params.toString()}`);
      } else if (resource === "ticker") {
        const symbol = String((node.parameters as Record<string, unknown>).symbol ?? "");
        if (!symbol) throw new Error("Marketstack: symbol parameter is required");
        const params = new URLSearchParams({ access_key: apiKey });
        result = await requestOk(`${baseUrl}/tickers/${symbol}?${params.toString()}`);
      } else {
        throw new Error(`Marketstack: unsupported resource "${resource}"`);
      }

      out.push({ json: result, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
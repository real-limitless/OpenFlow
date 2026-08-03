import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { requireCredential } from "@/sdk/helpers/credentials";

const BASE_URL = "https://api.openweathermap.org/data/2.5";

export const openWeatherMapExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const operation = ctx.getParam<string>("operation", "currentWeather");
  const locationType = ctx.getParam<string>("locationType", "coordinates");
  const units = ctx.getParam<string>("units", "standard");
  const language = ctx.getParam<string>("language", "en");
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "openWeatherMapApi");
  const apiKey = (cred as Record<string, string>)?.apiKey;
  if (!apiKey) {
    throw new Error("OpenWeatherMap: API key is missing from credential");
  }

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const endpoint = operation === "forecast" ? "forecast" : "weather";
      const params = new URLSearchParams({
        appid: apiKey,
        units,
        lang: language,
      });

      if (locationType === "coordinates") {
        const lat = ctx.getParam<number>("latitude", 0);
        const lon = ctx.getParam<number>("longitude", 0);
        params.set("lat", String(lat));
        params.set("lon", String(lon));
      } else {
        const cityName = ctx.getParam<string>("cityName", "");
        if (!cityName || cityName.trim() === "") {
          throw new Error("OpenWeatherMap: cityName is required when locationType is cityName");
        }
        params.set("q", cityName.trim());
      }

      const url = `${BASE_URL}/${endpoint}?${params.toString()}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(
          `OpenWeatherMap API: HTTP ${res.status} ${res.statusText ?? ""}${errorBody ? ` - ${errorBody}` : ""}`,
        );
      }

      const data = (await res.json()) as Record<string, unknown>;
      out.push({
        json: data,
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

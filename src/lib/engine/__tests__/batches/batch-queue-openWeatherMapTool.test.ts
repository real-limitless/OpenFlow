import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { runNode, runNodeWithCtx } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.openWeatherMapTool";

// requireCredential("openWeatherMapApi") runs before any request, and the
// expected URLs below embed this key as the appid query parameter.
const CREDS = { openWeatherMapApi: { apiKey: "test-api-key" } };

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

let calls: Array<{ url: string }> = [];

function installFetch(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url);
      calls.push({ url: key });
      if (!(key in routes)) {
        return mockJsonResponse({ cod: 404, message: "not found" }, 404);
      }
      return mockJsonResponse(routes[key]);
    }),
  );
}

const fakeCurrentWeather = {
  coord: { lon: -0.13, lat: 51.51 },
  weather: [{ id: 800, main: "Clear", description: "clear sky", icon: "01d" }],
  main: { temp: 285.15, feels_like: 283.15, temp_min: 284.15, temp_max: 286.15, pressure: 1013, humidity: 60 },
  visibility: 10000,
  wind: { speed: 4.1, deg: 230 },
  clouds: { all: 0 },
  dt: 1700000000,
  sys: { country: "GB", sunrise: 1699950000, sunset: 1699980000 },
  timezone: 0,
  id: 2643743,
  name: "London",
  cod: 200,
};

const fakeForecast = {
  cod: "200",
  cnt: 40,
  list: [{
    dt: 1700000000,
    main: { temp: 285.15, feels_like: 283.15, temp_min: 284.15, temp_max: 286.15, pressure: 1013, humidity: 60 },
    weather: [{ id: 800, main: "Clear", description: "clear sky", icon: "01d" }],
    clouds: { all: 0 },
    wind: { speed: 4.1, deg: 230 },
    visibility: 10000,
    pop: 0,
    dt_txt: "2024-01-01 00:00:00",
  }],
  city: { id: 2643743, name: "London", coord: { lat: 51.51, lon: -0.13 }, country: "GB", population: 8982000, timezone: 0 },
};

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue openWeatherMapTool — n8n-nodes-base.openWeatherMapTool", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("OpenWeatherMap (AI Tool)");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.openWeatherMapTool")).toBe(canonical);
  });

  it("currentWeather — by coordinates (metric) returns weather data", async () => {
    const urlPattern = "weather";
    installFetch({
      "https://api.openweathermap.org/data/2.5/weather?appid=test-api-key&units=metric&lang=en&lat=51.51&lon=-0.13": fakeCurrentWeather,
    });
    const out = await runNode(TYPE, {
      operation: "currentWeather", locationType: "coordinates",
      latitude: 51.51, longitude: -0.13, units: "metric", language: "en",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toMatchObject({
      coord: expect.objectContaining({ lon: -0.13, lat: 51.51 }),
      weather: expect.arrayContaining([expect.objectContaining({ main: "Clear" })]),
      main: expect.objectContaining({ temp: expect.any(Number), pressure: expect.any(Number), humidity: expect.any(Number) }),
      name: "London",
    });
    expect(calls).toHaveLength(1);
  });

  it("currentWeather — by city name", async () => {
    installFetch({
      "https://api.openweathermap.org/data/2.5/weather?appid=test-api-key&units=standard&lang=en&q=Tokyo%2CJP": {
        ...fakeCurrentWeather, name: "Tokyo", sys: { country: "JP" },
      },
    });
    const out = await runNode(TYPE, {
      operation: "currentWeather", locationType: "cityName",
      cityName: "Tokyo,JP", units: "standard", language: "en",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("Tokyo");
    expect((out[0][0].json as Record<string, unknown>).sys).toMatchObject({ country: "JP" });
    expect(calls).toHaveLength(1);
  });

  it("forecast — by coordinates returns list with forecast entries", async () => {
    installFetch({
      "https://api.openweathermap.org/data/2.5/forecast?appid=test-api-key&units=metric&lang=en&lat=35.68&lon=139.69": fakeForecast,
    });
    const out = await runNode(TYPE, {
      operation: "forecast", locationType: "coordinates",
      latitude: 35.68, longitude: 139.69, units: "metric",
    }, [{}], { credentials: CREDS });
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).cnt).toBe(40);
    expect((out[0][0].json as Record<string, unknown>).list).toBeInstanceOf(Array);
    expect(calls).toHaveLength(1);
  });

  it("invalid location throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, {
        operation: "currentWeather", locationType: "cityName",
        cityName: "NonExistentCityXYZ", units: "metric",
      }, [{}], { credentials: CREDS }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("continueOnFail with invalid location yields error item", async () => {
    installFetch({});
    const { out } = await runNodeWithCtx(
      TYPE,
      { operation: "currentWeather", locationType: "cityName",
        cityName: "NonExistentCityXYZ", units: "metric" },
      [{}],
      { continueOnFail: true, credentials: CREDS },
    );
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("multi-item pass-through produces one output per input", async () => {
    installFetch({
      "https://api.openweathermap.org/data/2.5/weather?appid=test-api-key&units=standard&lang=en&lat=51.51&lon=-0.13": fakeCurrentWeather,
    });
    const out = await runNode(TYPE, {
      operation: "currentWeather", locationType: "coordinates",
      latitude: 51.51, longitude: -0.13, units: "standard",
    }, [{}, {}], { credentials: CREDS });
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.name).toBe("London");
    expect(out[0][1].json.name).toBe("London");
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installFetch({});
    await expect(
      runNode(TYPE, {
        operation: "currentWeather", locationType: "coordinates",
        latitude: 0, longitude: 0,
      }, [{}], { credentials: CREDS }),
    ).rejects.toThrow();
  });
});

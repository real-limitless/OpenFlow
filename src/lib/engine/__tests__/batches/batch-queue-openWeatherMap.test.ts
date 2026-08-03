import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createExecutionContext } from "@/sdk";
import { seedBuiltinExecutors } from "../../index";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import { makeNode, makeWorkflow } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.openWeatherMap";

function mockJsonResponse(body: unknown, status = 200) {
  return {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json", entries: () => new Map() },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

interface FetchCall { url: string }

let calls: FetchCall[] = [];

function installMockFetch(routeMatcher?: (url: string) => boolean, response?: unknown) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push({ url: String(url) });
    if (routeMatcher && !routeMatcher(String(url))) {
      return mockJsonResponse({ cod: 404, message: "not found" }, 404);
    }
    return mockJsonResponse(response ?? {});
  }));
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

function buildCtx(
  parameters: Record<string, unknown>,
  inputItems: Array<Record<string, unknown>> = [{}],
): ReturnType<typeof createExecutionContext> {
  const node = makeNode({ name: "N", type: TYPE, parameters });
  return createExecutionContext({
    node,
    workflow: makeWorkflow([node]),
    getNodeInputItems: () => inputItems.map((json) => ({ json })),
    continueOnFail: false,
    getCredential: async () => ({ apiKey: "test-api-key" }),
  });
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("batch-queue openWeatherMap — n8n-nodes-base.openWeatherMap", () => {
  it("is registered as executor + description", () => {
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("OpenWeatherMap");
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.openWeatherMap")).toBe(canonical);
  });

  it("currentWeather — by coordinates (metric) returns weather data", async () => {
    installMockFetch(
      (url) => url.includes("lat=51.51") && url.includes("lon=-0.13"),
      fakeCurrentWeather,
    );
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({
      operation: "currentWeather", locationType: "coordinates",
      latitude: 51.51, longitude: -0.13, units: "metric", language: "en",
    });
    const out = await executor(ctx, ctx.node);
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
    installMockFetch(
      (url) => url.includes("q=Tokyo%2CJP"),
      { ...fakeCurrentWeather, name: "Tokyo", sys: { country: "JP" } },
    );
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({
      operation: "currentWeather", locationType: "cityName",
      cityName: "Tokyo,JP", units: "standard", language: "en",
    });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.name).toBe("Tokyo");
    expect((out[0][0].json as Record<string, unknown>).sys).toMatchObject({ country: "JP" });
    expect(calls).toHaveLength(1);
  });

  it("forecast — by coordinates returns list with forecast entries", async () => {
    installMockFetch((url) => url.includes("forecast"), fakeForecast);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({
      operation: "forecast", locationType: "coordinates",
      latitude: 35.68, longitude: 139.69, units: "metric",
    });
    const out = await executor(ctx, ctx.node);
    expect(out[0]).toHaveLength(1);
    expect((out[0][0].json as Record<string, unknown>).cnt).toBe(40);
    expect((out[0][0].json as Record<string, unknown>).list).toBeInstanceOf(Array);
    expect((out[0][0].json as Record<string, unknown>).city).toMatchObject({ name: "London" });
    expect(calls).toHaveLength(1);
  });

  it("invalid location throws", async () => {
    installMockFetch(() => false, undefined);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({
      operation: "currentWeather", locationType: "cityName",
      cityName: "NonExistentCityXYZ", units: "metric",
    });
    await expect(executor(ctx, ctx.node)).rejects.toThrow(/HTTP 404/);
  });

  it("continueOnFail with invalid location yields error item", async () => {
    installMockFetch(() => false, undefined);
    const node = makeNode({ name: "N", type: TYPE, parameters: {
      operation: "currentWeather", locationType: "cityName",
      cityName: "NonExistentCityXYZ", units: "metric",
    }});
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: true,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json.error).toBeTruthy();
  });

  it("missing API key credential throws", async () => {
    installMockFetch(() => false, undefined);
    const node = makeNode({ name: "N", type: TYPE, parameters: {
      operation: "currentWeather", locationType: "coordinates",
      latitude: 0, longitude: 0,
    }});
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }],
      continueOnFail: false,
      getCredential: async () => null,
    });
    const executor = getExecutor(TYPE)!;
    await expect(executor(ctx, node)).rejects.toThrow(/Credential/);
  });

  it("multi-item pass-through produces one output per input", async () => {
    installMockFetch(
      (url) => url.includes("lat=51.51"),
      fakeCurrentWeather,
    );
    const node = makeNode({ name: "N", type: TYPE, parameters: {
      operation: "currentWeather", locationType: "coordinates",
      latitude: 51.51, longitude: -0.13, units: "metric",
    }});
    const ctx = createExecutionContext({
      node,
      workflow: makeWorkflow([node]),
      getNodeInputItems: () => [{ json: {} }, { json: {} }],
      continueOnFail: false,
      getCredential: async () => ({ apiKey: "test-api-key" }),
    });
    const executor = getExecutor(TYPE)!;
    const out = await executor(ctx, node);
    expect(out[0]).toHaveLength(2);
    expect(out[0][0].json.name).toBe("London");
    expect(out[0][1].json.name).toBe("London");
    expect(calls).toHaveLength(2);
  });

  it("fetch failure without continueOnFail throws", async () => {
    installMockFetch(() => false, undefined);
    const executor = getExecutor(TYPE)!;
    const ctx = buildCtx({
      operation: "currentWeather", locationType: "coordinates",
      latitude: 0, longitude: 0,
    });
    await expect(executor(ctx, ctx.node)).rejects.toThrow();
  });
});
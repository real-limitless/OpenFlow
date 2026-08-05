---
type: n8n-nodes-base.openWeatherMapTool
displayName: OpenWeatherMap (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# OpenWeatherMap (AI Tool)

An AI agent tool variant of the OpenWeatherMap node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Shares the same underlying OpenWeatherMap API endpoints as the base `openWeatherMap` node but is surfaced as a distinct type string for the AI Agent tool-selection system.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.openweathermap.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/openweathermap.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://openweathermap.org/current | External API reference |
| https://openweathermap.org/forecast5 | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.openWeatherMapTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `openWeatherMapApi` (required) — API Key authentication (free API token from OpenWeatherMap account)

## Parameters

The node exposes an operation selector that determines which OpenWeatherMap API endpoint to call. When used as an AI tool, parameters can be populated by the AI model at inference time.

### Operation (required)

| Value | Label | Description |
|-------|-------|-------------|
| `currentWeather` | Current Weather | Retrieve current weather conditions for a location |
| `forecast` | Forecast | Retrieve 5-day / 3-hour step weather forecast for a location |

### Location parameters

| name | type | required | notes |
|------|------|----------|-------|
| `locationType` | options | yes | How to specify the location: `coordinates` (lat/lon) or `cityName` (city name with optional country code) |
| `latitude` | number | yes* | Required when `locationType = coordinates`. Decimal degrees. |
| `longitude` | number | yes* | Required when `locationType = coordinates`. Decimal degrees. |
| `cityName` | string | yes* | Required when `locationType = cityName`. City name, optionally with country code (e.g., "London,GB"). |

### Options

| name | type | default | notes |
|------|------|---------|-------|
| `units` | options | `standard` | Unit system: `standard` (Kelvin, m/s), `metric` (Celsius, m/s), `imperial` (Fahrenheit, miles/h) |
| `language` | string | `en` | Language code for city name and weather description localization (e.g., `fr`, `de`, `ja`). ~50 languages supported. |

All parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

## Runtime behavior

### Input

The node accepts items on the `main` input. Each input item can provide values for parameters via expressions. The node processes items sequentially — each input item produces one output item.

### Output

The node passes through the raw OpenWeatherMap API response as the output `json` data. The response shape depends on the operation:

#### Current Weather (`currentWeather`)
Full JSON object from `GET /data/2.5/weather`. Contains `coord`, `weather` (array with id/main/description/icon), `main` (temp/feels_like/pressure/humidity), `visibility`, `wind` (speed/deg/gust), `clouds`, optional `rain`/`snow`, `dt`, `sys` (country/sunrise/sunset), `timezone`, `id`, `name`, `cod`.

#### Forecast (`forecast`)
Full JSON object from `GET /data/2.5/forecast`. Contains `cod`, `cnt`, `list` (array of 3-hour entries with dt/main/weather/clouds/wind/visibility/pop/rain/snow/sys/dt_txt), `city` (id/name/coord/country/population/timezone/sunrise/sunset).

### Errors

- **Authentication errors** (invalid/missing API key): Thrown as `NodeApiError`.
- **Invalid location** (unrecognized city name, out-of-range coordinates): API returns 404; surfaced as `NodeApiError`.
- **Rate limiting:** OpenWeatherMap enforces plan-based limits (free: 60 calls/min); node surfaces HTTP 429 as `NodeApiError`.
- **`continueOnFail` behavior:** When enabled, failed items emit `{ error: <message> }` instead of throwing.

### Expressions

All string parameters (`cityName`, `language`) accept expression strings. Numeric parameters (`latitude`, `longitude`) and options (`units`, `locationType`) accept expressions that resolve to the correct type.

## Acceptance tests

### Test: Current weather by coordinates (AI tool mode)
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "currentWeather",
  "locationType": "coordinates",
  "latitude": 51.51,
  "longitude": -0.13,
  "units": "metric",
  "language": "en"
}
```
**Expect** output[0] contains a `json` object with fields: `coord`, `weather` (array), `main` (with `temp`, `pressure`, `humidity`), `wind`, `name`.

### Test: Forecast by city name
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "forecast",
  "locationType": "cityName",
  "cityName": "Tokyo,JP",
  "units": "metric"
}
```
**Expect** output[0] contains a `json` object with `cnt` > 0, `list` array where each entry has `dt`, `main.temp`, `weather`, `wind`. The `city.name` is populated.

### Test: $fromAI() parameter population
**Given** input items:
```json
[{ "json": { "lat": 40.71, "lon": -74.01 } }]
```
**Parameters:**
```json
{
  "operation": "currentWeather",
  "locationType": "coordinates",
  "latitude": "={{ $json.lat }}",
  "longitude": "={{ $json.lon }}",
  "units": "imperial"
}
```
**Expect** output[0] contains a `json` object with `name` populated (New York City area), `main.temp` interpretable as Fahrenheit.

### Test: Invalid location error
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "currentWeather",
  "locationType": "cityName",
  "cityName": "NonExistentCityXYZ"
}
```
**Expect** a `NodeApiError` is thrown. Under `continueOnFail`, output[0] contains `{ error: <error message> }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core operations (2) | documented | Public n8n docs confirm "Current Weather" and "5-day Forecast" operations |
| Location type options | documented | Public n8n docs and OpenWeatherMap API docs confirm coordinates and city-name query methods |
| Units / language parameters | documented | OpenWeatherMap API docs document `units` (standard/metric/imperial) and `lang` |
| Tool mode (`$fromAI()` support) | documented | n8n docs list this node under "can be used as an AI tool" |
| Output shape | documented | OpenWeatherMap API docs provide complete JSON response field descriptions |
| Exact parameter names | inferred | Based on the base `openWeatherMap` node spec; tool variant uses same names |
| Rate limits | external | OpenWeatherMap enforces plan-based limits (free: 60 calls/min) |

## OpenFlow mapping

- **Definition group:** `core` (AI tool)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.openWeatherMapTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

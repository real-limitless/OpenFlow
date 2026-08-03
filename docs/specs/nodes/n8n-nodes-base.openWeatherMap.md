---
type: n8n-nodes-base.openWeatherMap
displayName: OpenWeatherMap
category: Miscellaneous
versions: [1]
priority: medium
status: specced
---

# OpenWeatherMap

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.openweathermap.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/openweathermap.md | Public docs only |
| https://openweathermap.org/current | External API reference |
| https://openweathermap.org/forecast5 | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.openWeatherMap`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `openWeatherMapApi` (required) — API Key authentication (free API token from OpenWeatherMap account)

## Parameters

### Operation (required)
Select the weather data operation to perform.

| Value | Label | Description |
|-------|-------|-------------|
| `currentWeather` | Current Weather | Retrieve current weather conditions for a location |
| `forecast` | Forecast | Retrieve 5-day / 3-hour step weather forecast for a location |

### Current Weather parameters
Shown when `operation = currentWeather`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `locationType` | options | yes | `coordinates` | How to specify the location: `coordinates` (lat/lon) or `cityName` (city name with optional country code) |
| `latitude` | number | yes* | — | Latitude. Required when `locationType = coordinates`. |
| `longitude` | number | yes* | — | Longitude. Required when `locationType = coordinates`. |
| `cityName` | string | yes* | — | City name, optionally with country code (e.g., "London,GB"). Required when `locationType = cityName`. |
| `units` | options | no | `standard` | Unit system: `standard` (Kelvin, m/s), `metric` (Celsius, m/s), `imperial` (Fahrenheit, miles/h) |
| `language` | string | no | `en` | Language code for city name and weather description localization (e.g., `fr`, `de`, `ja`). Supports ~50 languages. |

### Forecast parameters
Shown when `operation = forecast`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `locationType` | options | yes | `coordinates` | How to specify the location: `coordinates` (lat/lon) or `cityName` (city name with optional country code) |
| `latitude` | number | yes* | — | Latitude. Required when `locationType = coordinates`. |
| `longitude` | number | yes* | — | Longitude. Required when `locationType = coordinates`. |
| `cityName` | string | yes* | — | City name, optionally with country code (e.g., "London,GB"). Required when `locationType = cityName`. |
| `units` | options | no | `standard` | Unit system: `standard`, `metric`, `imperial` |
| `language` | string | no | `en` | Language code for weather description localization |

## Runtime behavior

### Input
The node accepts items on the `main` input. Each input item can provide values for parameters via expressions. The node processes items sequentially — each input item produces one output item.

### Output
The node passes through the raw OpenWeatherMap API response as the output `json` data. The response shape depends on the operation:

#### Current Weather (`currentWeather`)
Output is the full JSON object from the OpenWeatherMap Current Weather API endpoint (`/data/2.5/weather`). Key fields include:
- `coord` — `lon`, `lat`
- `weather` — array of condition objects with `id`, `main`, `description`, `icon`
- `main` — `temp`, `feels_like`, `temp_min`, `temp_max`, `pressure`, `humidity`, `sea_level`, `grnd_level`
- `visibility` — visibility in meters
- `wind` — `speed`, `deg`, `gust`
- `clouds` — `all` (cloudiness %)
- `rain` / `snow` — precipitation volume (optional, present only when applicable)
- `dt` — data calculation time (Unix UTC)
- `sys` — `country`, `sunrise`, `sunset`
- `timezone`, `id`, `name`, `cod`

#### Forecast (`forecast`)
Output is the full JSON object from the OpenWeatherMap 5 Day / 3 Hour Forecast API (`/data/2.5/forecast`). Key fields include:
- `cod` — internal parameter
- `cnt` — number of timestamps returned
- `list` — array of forecast entries, each containing:
  - `dt` — forecast time (Unix UTC)
  - `main` — `temp`, `feels_like`, `temp_min`, `temp_max`, `pressure`, `sea_level`, `grnd_level`, `humidity`, `temp_kf`
  - `weather` — condition array (same shape as current)
  - `clouds.all`
  - `wind.speed`, `wind.deg`, `wind.gust`
  - `visibility` — average visibility in meters
  - `pop` — probability of precipitation (0–1)
  - `rain.3h` / `snow.3h` — precipitation volume (optional)
  - `sys.pod` — part of day (n = night, d = day)
  - `dt_txt` — ISO UTC text
- `city` — `id`, `name`, `coord`, `country`, `population`, `timezone`, `sunrise`, `sunset`

### Errors
- **Authentication errors** (invalid/missing API key): Thrown as `NodeApiError`; not caught by `continueOnFail`.
- **Invalid location** (unrecognized city name, out-of-range coordinates): API returns 404; surfaced as `NodeApiError`.
- **Rate limiting:** OpenWeatherMap enforces plan-based limits; node surfaces HTTP 429 as `NodeApiError`.
- **`continueOnFail` behavior:** When enabled, failed items emit an output item with `{ error: <message> }` instead of throwing. Successful items continue normal output.

### Expressions
All string parameters (`cityName`, `language`) accept expression strings. Numeric parameters (`latitude`, `longitude`) and options (`units`, `locationType`) accept expressions that resolve to the correct type.

## Acceptance tests

### Test: Current Weather — by coordinates (metric)
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
**Expect** output[0] contains a `json` object with fields: `coord`, `weather` (array), `main` (with `temp`, `pressure`, `humidity`), `wind`, `name`. `main.temp` is a number interpretable as Celsius.

### Test: Current Weather — by city name
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "currentWeather",
  "locationType": "cityName",
  "cityName": "Tokyo,JP",
  "units": "standard",
  "language": "en"
}
```
**Expect** output[0] contains a `json` object with `name` equal to "Tokyo" (or transliterated equivalent), `sys.country` equal to "JP".

### Test: Forecast — by coordinates
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "forecast",
  "locationType": "coordinates",
  "latitude": 35.68,
  "longitude": 139.69,
  "units": "metric"
}
```
**Expect** output[0] contains a `json` object with `cnt` > 0, `list` array where each entry has `dt`, `main.temp`, `weather`, `wind`. The `city.name` is populated.

### Test: Invalid location
**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "operation": "currentWeather",
  "locationType": "cityName",
  "cityName": "NonExistentCityXYZ",
  "units": "metric"
}
```
**Expect** a `NodeApiError` is thrown (not caught by standard execution). Under `continueOnFail`, output[0] contains `{ error: <error message> }`.

### Test: Expression-driven parameters
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
**Expect** output[0] contains a `json` object with `name` populated (corresponding to New York City area), `main.temp` interpretable as Fahrenheit.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core operations (2) | documented | Public n8n docs confirm "Current Weather" and "5-day Forecast" operations |
| Location type options | documented | Public n8n docs and OpenWeatherMap API docs confirm coordinates and city-name query methods |
| Units / language parameters | documented | OpenWeatherMap API docs document `units` (standard/metric/imperial) and `lang` |
| Exact parameter names | corpus | `locationType`, `cityName`, `latitude`, `longitude`, `units`, `language` parameter names from CORPUS_DIR |
| Output shape | documented | OpenWeatherMap API docs provide complete JSON response field descriptions |
| Rate limits | external | OpenWeatherMap enforces plan-based limits (free: 60 calls/min); not exposed in node config |
| Tool mode (`usableAsTool`) | inferred | Node JSON does not declare `usableAsTool`; AI tool use is unlikely but n8n docs list this node under "can be used as an AI tool" |
| Deprecated built-in geocoding | external | OpenWeatherMap recommends using their Geocoding API separately; node likely uses standard lat/lon or city name query |

## OpenFlow mapping

- **Definition group:** `core` (app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.openWeatherMap.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.marketstack
displayName: Marketstack
category: Finance
versions: [1]
priority: medium
status: specced
---

# Marketstack

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.marketstack/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/marketstack/ | Public docs only |
| https://marketstack.com/documentation | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.marketstack`
- **Aliases:** `n8n-nodes-base.marketstackTool` (AI tool variant)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `marketstackApi` (required) — API key authentication with an optional HTTPS protocol toggle (free plans use HTTP, paid plans use HTTPS)

## Parameters

The node exposes a resource/operation selection that determines which Marketstack REST API v1 endpoint to invoke. Parameters are documented at the highest abstraction level.

### Resource / Operation pair (required)

| Resource | Operation | Description |
|----------|-----------|-------------|
| `EndOfDayData` | `getAll` | Retrieve end-of-day stock data for one or more ticker symbols, with optional date range, exchange, and pagination |
| `Exchange` | `get` | Look up exchange details by MIC code (e.g. XNAS for Nasdaq) |
| `Ticker` | `get` | Retrieve metadata for a stock ticker symbol |

### End-of-Day Data — GetAll

| name | type | required | notes |
|------|------|----------|-------|
| `symbol` | string | yes | Single or comma-separated stock ticker symbols (max 100). Each symbol consumes one API request. |
| `dateFrom` | string | no | Start of date range in YYYY-MM-DD format. Omit to return the most recent session. |
| `dateTo` | string | no | End of date range in YYYY-MM-DD format. |
| `latest` | boolean | no | When true, returns only the most recent trading day. Overrides date range. |
| `exchange` | string | no | MIC code to filter by exchange (e.g. `XNAS`). |
| `sort` | options (`ASC`, `DESC`) | no | Sort order for results. Default depends on plan configuration. |
| `limit` | number | no | Max results per page. Free plan: 100 max; paid: up to 1000. |
| `offset` | number | no | Pagination offset. Default 0. |

### Exchange — Get

| name | type | required | notes |
|------|------|----------|-------|
| `exchange` | string | yes | Exchange MIC code to look up (e.g. `XNAS`, `XNYS`) |

### Ticker — Get

| name | type | required | notes |
|------|------|----------|-------|
| `symbol` | string | yes | Stock ticker symbol to retrieve metadata for (e.g. `AAPL`) |

All parameters accept expressions. When used as the AI tool variant (`marketstackTool`), parameters also support `$fromAI()` dynamic population.

## Runtime behavior

### Input

The node accepts items on the `main` input. Each input item can provide parameter values via expressions. Items are processed sequentially — each input item produces one output item.

When no input data is needed (parameters are static), the node accepts an empty item `{ "json": {} }`.

### Output

The node passes through the raw Marketstack API response as `json` data. The response shape varies by operation:

#### End-of-Day Data — GetAll

```json
{
  "pagination": { "limit": 100, "offset": 0, "count": 1, "total": 1 },
  "data": [
    {
      "open": 150.25,
      "high": 152.10,
      "low": 149.80,
      "close": 151.50,
      "volume": 75000000,
      "adj_open": 150.25,
      "adj_high": null,
      "adj_low": null,
      "adj_close": 151.50,
      "adj_volume": null,
      "split_factor": 1.0,
      "dividend": 0.0,
      "symbol": "AAPL",
      "exchange": "XNAS",
      "date": "2024-06-14T00:00:00+0000"
    }
  ]
}
```

The `data` array contains one object per ticker per date. `adj_*` fields represent split/dividend-adjusted prices. Index tickers use the `.INDX` suffix (e.g. `DJI.INDX`, `SPX.INDX`).

#### Exchange — Get

```json
{
  "data": {
    "name": "Nasdaq Stock Market",
    "acronym": "NASDAQ",
    "mic": "XNAS",
    "country": "US",
    "country_code": "US",
    "city": "New York",
    "website": "www.nasdaq.com",
    "timezone": "America/New_York"
  }
}
```

#### Ticker — Get

```json
{
  "data": {
    "name": "Apple Inc.",
    "symbol": "AAPL",
    "has_intraday": false,
    "has_eod": true,
    "country": "US",
    "stock_exchange": {
      "name": "Nasdaq Stock Market",
      "acronym": "NASDAQ",
      "mic": "XNAS",
      "country": "US",
      "country_code": "US",
      "city": "New York",
      "website": "www.nasdaq.com",
      "timezone": "America/New_York"
    }
  }
}
```

### Errors

- **Authentication failure:** Invalid or missing API key, or HTTPS enabled on a free plan. Thrown as `NodeApiError`.
- **Invalid symbol / exchange:** API returns an error; surfaced as `NodeApiError`.
- **Rate limiting:** Marketstack enforces plan-based limits (free: 100 requests/month). HTTP 429 is surfaced as `NodeApiError`.
- **`continueOnFail`:** When enabled, failing items emit `{ error: <message> }` instead of throwing.

### Expressions

All string parameters accept expressions. Numeric and boolean parameters accept expressions that resolve to the correct type.

## Acceptance tests

### Test: Single ticker end-of-day data

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "EndOfDayData",
  "operation": "getAll",
  "symbol": "AAPL",
  "latest": true,
  "limit": 1
}
```
**Expect** output[0] contains a `json` object with `pagination` containing `limit` and `count`, and `data` containing at least one entry with `open`, `high`, `low`, `close`, `volume`, `symbol`, `exchange`, `date`.

### Test: Exchange lookup by MIC code

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "Exchange",
  "operation": "get",
  "exchange": "XNYS"
}
```
**Expect** output[0] contains a `json` object with `data` containing `name`, `mic`, `country`, `city`.

### Test: Ticker metadata lookup

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "Ticker",
  "operation": "get",
  "symbol": "MSFT"
}
```
**Expect** output[0] contains a `json` object with `data` containing `name`, `symbol`, `country`, `stock_exchange.mic`.

### Test: Expression-based symbol from input

**Given** input items:
```json
[{ "json": { "ticker": "GOOGL" } }]
```
**Parameters:**
```json
{
  "resource": "Ticker",
  "operation": "get",
  "symbol": "={{ $json.ticker }}"
}
```
**Expect** output[0] contains `data.symbol` equal to `"GOOGL"`.

### Test: Invalid ticker produces error

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "Ticker",
  "operation": "get",
  "symbol": "NONEXISTENT"
}
```
**Expect** a `NodeApiError` is thrown. Under `continueOnFail`, output[0] contains `{ error: <error message> }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core resources/operations (3) | documented | Public n8n docs confirm EndOfDayData (GetAll), Exchange (Get), Ticker (Get) |
| Parameter names | inferred | Based on Marketstack API semantics and typical n8n naming conventions; exact internal parameter names may differ |
| Output shapes | external | Confirmed by Marketstack public API documentation at marketstack.com |
| Credentials | documented | Public n8n docs: API key + optional HTTPS toggle |
| Rate limits | external | Marketstack enforces plan-based limits |
| Market indices | documented | Supported via `.INDX` suffix on ticker symbols per Marketstack API docs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.marketstack.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

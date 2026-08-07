---
type: n8n-nodes-base.marketstackTool
displayName: Marketstack (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Marketstack (AI Tool)

An AI agent tool variant of the Marketstack node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Wraps the same underlying Marketstack REST API endpoints as the base `marketstack` node but is surfaced as a distinct type string for the AI Agent tool-selection system.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.marketstack.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/marketstack.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.marketstackTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `marketstackApi` (required) — API key authentication. Key obtained from marketstack.com dashboard. Optional `useHTTPS` toggle (off for free plans, on for paid plans).

## Parameters

The node exposes an operation selector that determines which Marketstack API endpoint to call. When used as an AI tool, parameters can be populated by the AI model at inference time.

### Operation / Resource pair (required)

| Resource | Operation | Description |
|----------|-----------|-------------|
| `EndOfDayData` | `getAll` | Fetch end-of-day (EOD) stock data for a ticker, optionally filtered by date range, exchange, or time zone |
| `Exchange` | `get` | Retrieve details about a stock exchange by its MIC code |
| `Ticker` | `get` | Retrieve ticker-level information including name, symbol, exchange, and type |

### End-of-Day Data — Get All

| name | type | required | notes |
|------|------|----------|-------|
| `symbol` | string | yes | Stock ticker symbol(s), comma-separated for multiple (e.g. `AAPL` or `AAPL,MSFT,GOOGL`) |
| `dateFrom` | string | no | Start date in YYYY-MM-DD format. When omitted, returns the most recent available session. |
| `dateTo` | string | no | End date in YYYY-MM-DD format. |
| `latest` | boolean | no | When true, returns only the most recent trading day's data for the given symbol(s). Overrides date range. |
| `exchange` | string | no | MIC code to filter results to a specific exchange (e.g. `XNAS` for Nasdaq, `XNYS` for NYSE). |
| `sort` | options | no | Sort order: `ASC` or `DESC` (default depends on plan). |
| `limit` | number | no | Maximum number of results per page. Depends on plan (free: 100, paid: up to 1000). |
| `offset` | number | no | Number of results to skip for pagination. |

### Exchange — Get

| name | type | required | notes |
|------|------|----------|-------|
| `exchange` | string | yes | Exchange MIC code (e.g. `XNAS`, `XNYS`, `XLON`). |

### Ticker — Get

| name | type | required | notes |
|------|------|----------|-------|
| `symbol` | string | yes | Stock ticker symbol (e.g. `AAPL`). |

All parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

## Runtime behavior

### Input

The node accepts items on the `main` input. Each input item can provide values for parameters via expressions. The node processes items sequentially — each input item produces one output item.

### Output

The node passes through the raw Marketstack REST API response as the output `json` data. The response shape varies by operation:

#### End-of-Day Data — Get All

```json
{
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 1,
    "total": 1
  },
  "data": [
    {
      "open": 150.25,
      "high": 152.10,
      "low": 149.80,
      "close": 151.50,
      "volume": 75000000,
      "adj_high": null,
      "adj_low": null,
      "adj_close": 151.50,
      "adj_open": 150.25,
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

- **Authentication errors** (invalid/missing API key, missing HTTPS for free plan): Thrown as `NodeApiError`.
- **Invalid symbol** (unrecognized ticker): API returns error; surfaced as `NodeApiError`.
- **Invalid exchange** (unrecognized MIC code): API returns error; surfaced as `NodeApiError`.
- **Rate limiting:** Marketstack enforces plan-based limits (free: 100 requests/month, paid plans vary). Node surfaces HTTP 429 as `NodeApiError`.
- **`continueOnFail` behavior:** When enabled, failed items emit `{ error: <message> }` instead of throwing.

### Expressions

All string parameters (`symbol`, `dateFrom`, `dateTo`, `exchange`, `sort`) accept expression strings. Numeric parameters (`limit`, `offset`) and boolean parameters (`latest`) accept expressions that resolve to the correct type.

## Acceptance tests

### Test: End-of-day data for a single ticker

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
**Expect** output[0] contains a `json` object with `pagination` and `data` array where each entry has `open`, `high`, `low`, `close`, `volume`, `symbol`, `exchange`, `date`.

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

### Test: Ticker information lookup

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
**Expect** output[0] contains a `json` object with `data` containing `name`, `symbol`, `country`, `stock_exchange`.

### Test: $fromAI() parameter population

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
**Expect** output[0] contains a `json` object with `data.symbol` equal to `"GOOGL"`.

### Test: Invalid symbol error

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
| Core operations (3) | documented | Public n8n docs confirm EOD (Get All), Exchange (Get), Ticker (Get) |
| Parameter names | inferred | Based on Marketstack API semantics and typical n8n node patterns; exact internal names may vary |
| Resource/Operation split | inferred | Tool variants typically mirror the resource/operation structure of the base node |
| Output shape | external | Marketstack API response format is documented at marketstack.com |
| Tool mode (`$fromAI()` support) | documented | n8n docs confirm this node appears under "can be used as an AI tool" |
| Credentials | documented | Marketstack API key with optional HTTPS toggle |
| Rate limits | external | Marketstack enforces plan-based limits (free: 100 req/month) |

## OpenFlow mapping

- **Definition group:** `core` (AI tool)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.marketstackTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

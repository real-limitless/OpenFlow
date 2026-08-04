---
type: n8n-nodes-base.marketstackTool
displayName: Marketstack Tool
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# Marketstack Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.marketstack/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/marketstack/ | Public docs only |
| https://marketstack.com/documentation | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.marketstackTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `marketstackApi` (required)

This is the AI agent tool variant of the Marketstack node. The base Marketstack node declares `usableAsTool: true`, which causes n8n to auto-generate a `*Tool` type string. As a tool, all parameters may be populated dynamically by the AI model via `$fromAI()` when connected to an AI Agent root node.

## Parameters

All parameters are identical to the base `n8n-nodes-base.marketstack` node. The node provides 3 resources, each with a single operation:

### Resource: End-of-Day Data (operation: Get Many)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string: `endOfDayData` | `endOfDayData` | yes | Selects the end-of-day data resource |
| operation | string: `getAll` | `getAll` | yes | Retrieves multiple stock closing records |
| symbols | string | `""` | yes | Comma-separated stock ticker symbols (e.g. `AAPL,MSFT`) |
| returnAll | boolean | `false` | — | Return all results vs limited set |
| limit | number | `50` | — | Max results when returnAll is false |
| filters.exchange | string | `""` | — | Filter by Market Identifier Code (e.g. `XNAS`) |
| filters.latest | boolean | `false` | — | Fetch only the most recent data |
| filters.sort | string: `ASC` or `DESC` | `DESC` | — | Sort order by date |
| filters.specificDate | dateTime | `""` | — | Retrieve data for a specific date (YYYY-MM-DD) |
| filters.dateFrom | dateTime | `""` | — | Timeframe start (inclusive) |
| filters.dateTo | dateTime | `""` | — | Timeframe end (inclusive) |

### Resource: Exchange (operation: Get)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string: `exchange` | `endOfDayData` | yes | Selects the exchange resource |
| operation | string: `get` | `get` | yes | Retrieves a single exchange |
| exchange | string | `""` | yes | Market Identifier Code (e.g. `XNAS`) |

### Resource: Ticker (operation: Get)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string: `ticker` | `endOfDayData` | yes | Selects the ticker resource |
| operation | string: `get` | `get` | yes | Retrieves a single ticker symbol |
| symbol | string | `""` | yes | Stock ticker symbol (e.g. `AAPL`) |

All parameters accept expression strings. The `noDataExpression` flag is set on resource and operation selectors.

## Runtime behavior

### Input

Each incoming item is processed independently. The node uses the item's parameters (fixed or expression-evaluated) to construct and execute one request to the Marketstack REST API per item.

### Output

Produces one output item per input item. The output JSON wraps the Marketstack API response, typically under an `eod` (end-of-day data array) or direct object fields:

- **End-of-Day Data GetAll**: emits items with properties matching the Marketstack EOD response — each result contains `symbol`, `date`, `open`, `high`, `low`, `close`, `volume`, `exchange`, `split_factor`. When `returnAll` is true, the node paginates automatically.
- **Exchange Get**: emits an object with exchange metadata (`mic`, `acronym`, `name`, `country_code`, `city`, `website`).
- **Ticker Get**: emits an object with ticker metadata (`symbol`, `name`, `has_eod`, `has_intraday`, `country`, `stock_exchange`).

### Errors

- API errors (non-2xx responses, invalid symbols, rate limits) produce an error for that item. When `continueOnFail` is enabled, the item is passed to output with an error property instead of halting.
- Missing required parameters (symbols, exchange, symbol) produce a validation error before any request is made.

### Expressions

All scalar parameters accept expressions. Resource and operation selectors do not (they have `noDataExpression: true`).

## Acceptance tests

### Test: end-of-day data with filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "endOfDayData",
  "operation": "getAll",
  "symbols": "AAPL,MSFT",
  "returnAll": false,
  "limit": 5,
  "filters": {
    "exchange": "XNAS",
    "sort": "DESC"
  }
}
```

**Expect** output[0]:
- Has exactly one item
- Item contains an `eod` array with up to 5 records (fewer if none found)
- Each record in `eod` has `symbol`, `date`, `open`, `high`, `low`, `close`, `volume` (numeric types)
- `exchange` field equals `XNAS`

### Test: exchange lookup

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "exchange",
  "operation": "get",
  "exchange": "XNAS"
}
```

**Expect** output[0]:
- Single item with `mic` = `"XNAS"`, `acronym`, `name`, `country_code`, `city`, `website`

### Test: ticker lookup

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "ticker",
  "operation": "get",
  "symbol": "AAPL"
}
```

**Expect** output[0]:
- Single item with `symbol` = `"AAPL"`, `name`, `has_eod`, `has_intraday`, and a `stock_exchange` object containing `mic`, `name`, `acronym`

### Test: invalid symbol returns error

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "ticker",
  "operation": "get",
  "symbol": "NONEXISTENT"
}
```

**Expect**: Execution error or, if `continueOnFail` is enabled, item is passed through with an `error` property.

### Test: missing required symbol

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "endOfDayData",
  "operation": "getAll",
  "symbols": ""
}
```

**Expect**: Validation error — empty `symbols` parameter rejected before API call.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool parameter mapping | documented | `usableAsTool: true` on base node; $fromAI() dynamic population is the standard n8n AI tool pattern |
| Response shape details | inferred | Exact field names and nesting inferred from schema descriptors in package metadata; the API may return additional fields |
| API endpoint URLs | documented | Marketstack API docs at marketstack.com/documentation cover REST endpoints |
| Pagination strategy | inferred | Return All paginates automatically; exact page size and cursor mechanism unspecified |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/marketstackTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

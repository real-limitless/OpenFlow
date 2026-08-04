---
type: n8n-nodes-base.coinGecko
displayName: CoinGecko
category: Finance & Accounting, Productivity
versions: [1]
priority: medium
status: specced
---

# CoinGecko

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.coingecko/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.coingecko.md | Public docs only |
| https://docs.coingecko.com/reference/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.coinGecko`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none — uses the free CoinGecko public API; no authentication required)

## Parameters

### Resource selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `coin`, `event` | `coin` | yes | — | Top-level resource to operate on |

### Operation selector (conditionally shown per resource)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | varies | yes | depends on `resource` | See operation tables below |

### Coin operations

| Operation | Parameter | type | default | required | notes |
|-----------|-----------|------|---------|----------|-------|
| **Get** (current data for a coin) | coinId | loaded-options (string) | — | yes | Loaded from `/coins/list` |
| | localization | boolean | false | no | Include localized descriptions |
| | tickers | boolean | true | no | Include ticker data |
| | marketData | boolean | true | no | Include market stats |
| | communityData | boolean | true | no | Include community stats |
| | developerData | boolean | true | no | Include developer data |
| | sparkline | boolean | false | no | Include 7d sparkline |
| **Get All** (all coins — paginated) | baseCurrency | loaded-options (string) | `usd` | no | Target currency for price |
| | order | options | `market_cap_desc` | no | Sort order |
| | perPage | number | 100 | no | Results per page (max 250) |
| | page | number | 1 | no | Page offset |
| | sparkline | boolean | false | no | Include sparkline |
| | priceChangePeriod | options | `24h` | no | Include price change over this period |
| **Price** (current price of cryptocurrencies) | coinIds | loaded-options (multi-select) | — | yes | One or more coin IDs |
| | baseCurrency | loaded-options (string) | `usd` | no | Comma-separated vs-currencies |
| | includeMarketCap | boolean | false | no | Include market cap |
| | include24hrVol | boolean | false | no | Include 24h volume |
| | include24hrChange | boolean | false | no | Include 24h price change |
| | includeLastUpdatedAt | boolean | false | no | Include last-updated timestamp |
| **Market** (prices + market data for all trading pairs) | baseCurrency | loaded-options (string) | `usd` | no | Target currency |
| | coinIds | loaded-options (multi-select) | — | no | Filter to specific coins |
| | order | options | `market_cap_desc` | no | Sort order |
| | perPage | number | 100 | no | Results per page |
| | page | number | 1 | no | Page offset |
| | sparkline | boolean | false | no | Include sparkline |
| | priceChangePeriod | options | `24h` | no | Price change percentage period |
| **History** (historical data at a date) | coinId | loaded-options (string) | — | yes | Coin to query |
| | date | dateTime | — | yes | Date (dd-mm-yyyy) |
| | localization | boolean | false | no | Include localization |
| **Market Chart** (historical price/market-cap/volume) | coinId | loaded-options (string) | — | yes | Coin to query |
| | baseCurrency | loaded-options (string) | `usd` | no | Currency denomination |
| | days | number | 7 | yes | Days of data (1/7/14/30/90/180/365/max) |
| | interval | options | `daily` | no | Data interval |
| **Candlestick** (OHLC chart) | coinId | loaded-options (string) | — | yes | Coin to query |
| | baseCurrency | loaded-options (string) | `usd` | no | Currency denomination |
| | days | number | 7 | yes | Days of data |
| **Ticker** (exchange tickers) | coinId | loaded-options (string) | — | yes | Coin to query |
| | exchangeIds | loaded-options | — | no | Filter to specific exchanges |
| | page | number | 1 | no | Page offset |
| | order | options | `trust_score_desc` | no | Sort order |

### Event operations

| Operation | Parameter | type | default | required | notes |
|-----------|-----------|------|---------|----------|-------|
| **Get All** (all events) | countryCode | loaded-options | — | no | Filter by country |
| | type | loaded-options | — | no | Filter by event type |
| | page | number | 1 | no | Page offset |
| | upComingEventsOnly | boolean | true | no | Only upcoming events |
| | fromDate | dateTime | — | no | Start date |
| | toDate | dateTime | — | no | End date |

### Options bucket (shared across operations)

Additional options common to most operations:

| name | type | notes |
|------|------|-------|
| baseCurrency | string (loaded) | The fiat or crypto currency to denominate results in |

## Runtime behavior

### Input

Each incoming item is processed independently. The node passes through all input items, using each item's data to supply expression-based parameters.

### Output

The node emits one output item per API response. Responses are placed under the `json` key of each output item. The output shape mirrors the CoinGecko API response structure for the selected endpoint.

- **Coin → Get**: returns a single coin data object (description, image, market_data, links, etc.)
- **Coin → Get All**: returns an array of coin summary objects with `id`, `symbol`, `name`
- **Coin → Price**: returns an object keyed by coin ID with per-currency price data
- **Coin → Market**: returns an array of market-data objects
- **Coin → History**: returns historical data at a given date
- **Coin → Market Chart**: returns an object with `prices`, `market_caps`, `total_volumes` arrays of `[timestamp, value]`
- **Coin → Candlestick**: returns an array of `[timestamp, open, high, low, close]`
- **Coin → Ticker**: returns an array of ticker objects
- **Event → Get All**: returns an array of event objects

### Errors

- API errors (rate limiting, invalid parameters) surface as n8n node errors.
- `continueOnFail`: if enabled, the node produces an error output item instead of throwing, allowing downstream nodes to handle failure gracefully.
- The free CoinGecko API has rate limits (10-30 calls/minute). Implement response handling for HTTP 429.

### Expressions

All parameter values accept expression strings. Dynamic parameter names (e.g. `coinId`) are expected to be resolvable via `$fromAI()` when the node is used as an AI tool.

## Loaded options

The node dynamically loads the following option lists via CoinGecko API calls:

| Loader | Endpoint | Purpose |
|--------|----------|---------|
| `getCoins` | `/coins/list` | Coin IDs for all operations requiring coin selection |
| `getCurrencies` | `/simple/supported_vs_currencies` | Supported vs-currencies |
| `getExchanges` | `/exchanges/list` | Exchange identifiers for ticker filtering |
| `getEventCountryCodes` | `/events/countries` | Country codes for events filter |
| `getEventTypes` | `/events/types` | Event type names for events filter |

## Acceptance tests

### Test: get bitcoin current data

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "coin",
  "operation": "get",
  "coinId": "bitcoin",
  "localization": false,
  "tickers": false,
  "marketData": true,
  "communityData": false,
  "developerData": false
}
```

**Expect** output[0] to contain `json.id === "bitcoin"`, `json.name === "Bitcoin"`, `json.market_data.current_price.usd` (a number > 0).

### Test: get current price of multiple coins

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "coin",
  "operation": "price",
  "coinIds": ["bitcoin", "ethereum"],
  "baseCurrency": "usd",
  "includeMarketCap": true
}
```

**Expect** output[0].json to contain `bitcoin.usd` (number) and `ethereum.usd` (number), `bitcoin.usd_market_cap` (number).

### Test: get all coins (first page)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "coin",
  "operation": "getAll",
  "perPage": 10,
  "page": 1
}
```

**Expect** output[0].json to be an array of exactly 10 objects, each with `id`, `symbol`, `name` string fields.

### Test: get events

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "getAll",
  "upComingEventsOnly": true
}
```

**Expect** output[0].json to be an array of event objects, each with `id`, `title`, `date`, `type`, `country` fields (or their CoinGecko API equivalents).

### Test: get candlestick data

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "coin",
  "operation": "candlestick",
  "coinId": "bitcoin",
  "baseCurrency": "usd",
  "days": 7
}
```

**Expect** output[0].json to be an array of arrays, each with 5 numeric values `[timestamp, open, high, low, close]`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | Public n8n docs list Coin + Event resources with 8 + 1 operations |
| Parameter details | inferred from schema | Exact parameter names, defaults, displayOptions from package JSON schema descriptors |
| Loaded options | inferred from type declarations | 5 loadOptions methods confirmed; endpoints from generic function patterns |
| Credential requirement | inferred | CoinGecko Public API v3 requires no auth for free tier; confirmed no credential class exists in n8n |
| CoinGecko API contract | inferred | Output shapes from schema descriptors; actual API may return additional fields |
| Rate limiting | inferred | Standard CoinGecko free-tier rate limits (10-30 req/min) |
| Error handling patterns | inferred | Standard n8n node behavior |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/coinGecko.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

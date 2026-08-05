---
type: n8n-nodes-base.coinGeckoTool
displayName: CoinGecko Tool
category: Productivity, Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# CoinGecko Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.coingecko/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.coingecko.com/reference/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.coinGeckoTool`
- **Aliases:** (none — shares implementation with `n8n-nodes-base.coinGecko`)
- **Inputs:** `ai_tool` × 1 (connected to an AI Agent root node)
- **Outputs:** `ai_tool` × 1
- **Credentials:** (none — uses the free CoinGecko public API; no authentication required)

## Parameters

The CoinGecko Tool exposes the same resource + operation model as the base CoinGecko app node (see `n8n-nodes-base.coinGecko.md` for complete parameter tables). Key parameters that accept `$fromAI()` dynamic population:

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| resource | options: `coin`, `event` | yes | AI model selects the resource |
| operation | options (varies by resource) | yes | AI model selects the operation |
| coinId | loaded-options (string) | conditional | Required for coin-specific operations; populated via `$fromAI()` |
| coinIds | loaded-options (multi-select) | conditional | Required for Price/Market operations |
| baseCurrency | loaded-options (string) | no | AI model supplies or defaults to `usd` |
| days | number | conditional | Required for Market Chart and Candlestick |
| date | dateTime | conditional | Required for History; AI model supplies dd-mm-yyyy |

The tool inherits all parameters from the base CoinGecko node. When used as a tool, the AI agent dynamically fills parameters using the `$fromAI()` function based on natural-language context.

## Runtime behavior

### Input

Receives a tool-call request from the connected AI Agent via the `ai_tool` input channel. The agent supplies resource, operation, and parameter values either as fixed expressions or via `$fromAI()` dynamic resolution.

### Output

Returns one output item via the `ai_tool` output channel containing the CoinGecko API response data under the `json` key. Output shape matches the selected CoinGecko API endpoint response:

- **Coin → Get**: single coin data object
- **Coin → Get All**: array of coin summary objects
- **Coin → Price**: object keyed by coin IDs
- **Coin → Market**: array of market-data objects
- **Coin → History**: historical data at date
- **Coin → Market Chart**: prices/market_caps/total_volumes arrays
- **Coin → Candlestick**: array of `[timestamp, open, high, low, close]`
- **Coin → Ticker**: array of ticker objects
- **Event → Get All**: array of event objects

### Errors

- API errors (rate limiting, invalid parameters) surface as tool execution errors.
- The AI Agent determines whether to retry, re-prompt, or fail the workflow.
- The free CoinGecko API has rate limits (10-30 calls/minute).

### Expressions

All parameters accept expression strings and `$fromAI()` hints. The tool expects the AI agent to supply parameters dynamically — many fields will use the `$fromAI()` function rather than fixed values.

## Loaded options

Same loaders as the base CoinGecko node — dynamic option lists fetched from CoinGecko API endpoints for coin IDs, currencies, exchanges, event country codes, and event types.

## Acceptance tests

### Test: AI agent queries bitcoin price

**Given** the tool is connected to an AI Agent with the prompt `"What is the current price of Bitcoin in USD?"`

**Parameters** (dynamically populated via AI):
```json
{
  "resource": "coin",
  "operation": "price",
  "coinIds": ["bitcoin"],
  "baseCurrency": "usd"
}
```

**Expect** output to contain `bitcoin.usd` (number > 0).

### Test: AI agent lists top coins

**Given** the tool is connected to an AI Agent with prompt `"List the top 5 cryptocurrencies by market cap"`

**Parameters:**
```json
{
  "resource": "coin",
  "operation": "getAll",
  "perPage": 5,
  "page": 1,
  "order": "market_cap_desc"
}
```

**Expect** output to be an array of 5 objects with `id`, `symbol`, `name` fields.

### Test: AI agent gets coin details

**Given** the tool is connected to an AI Agent with prompt `"Get detailed data for Ethereum"`

**Parameters:**
```json
{
  "resource": "coin",
  "operation": "get",
  "coinId": "ethereum"
}
```

**Expect** output to contain `json.id === "ethereum"`, `json.name === "Ethereum"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string | documented | Public n8n docs confirm `coinGeckoTool` usage as AI tool variant; same implementation as base node |
| Parameter model | inferred | Shares full parameter set with base `n8n-nodes-base.coinGecko`; no separate schema |
| $fromAI() support | documented | Public n8n docs confirm AI parameter population for tool nodes |
| Output format | inferred | Standard n8n tool output — one item per tool invocation with API response under `json` |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/coinGecko.ts` (shared with base CoinGecko node)
- **SDK:** `defineNode` + native `ExecutionContext` only

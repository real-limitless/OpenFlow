---
type: n8n-nodes-base.webSearch
displayName: Web Search
category: Action
versions: [1]
priority: medium
status: specced
---

# Web Search

## Sources

| URL | Source class |
|-----|----------------|
| (no public docs page found — URL returns 404) | Inferred from type string only |
| CORPUS_DIR: n8n-nodes-base@2.15.1 (webSearch not present in package) | Node absent from extracted npm payload |

**Status:** This type string exists in the n8n registry but no corresponding package file, docs page, or known/nodes.json entry was found in n8n-nodes-base@2.15.1. The spec below describes the behavioral contract such a node would satisfy, inferred from patterns of similar "Search" and "Tool" nodes in the n8n ecosystem.

## Wire format

- **Type string:** `n8n-nodes-base.webSearch`
- **Aliases:** (none documented)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none required — uses a public search API or configurable endpoint)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| query | string | — | yes | The search query text. Accepts expressions. |
| resultLimit | number | 10 | no | Maximum number of search results to return. |
| searchEngine | string | "google" | no | Which search provider to use. Options: "google", "bing", "duckduckgo", or "custom". |
| customEndpoint | string | — | no | Base URL for a custom search API (only used when searchEngine is "custom"). |
| apiKey | string | — | no | API key for the chosen or custom search provider. Stored as a credential or inline. |
| additionalOptions | json | "{}" | no | Free-form JSON for provider-specific options (e.g. safe search, language, region, time range). |

## Runtime behavior

### Input

Each input item triggers one search request. The `query` parameter is evaluated per item using expressions. If multiple items arrive, the node sends one search per item.

### Output

Each input item produces one output item containing:

```json
{
  "query": "<original query>",
  "results": [
    {
      "title": "<result title>",
      "url": "<result URL>",
      "snippet": "<result description>"
    }
  ],
  "totalResults": <number>
}
```

If `resultLimit` is set, the `results` array is truncated to that many entries. If the API returns no matches, the `results` array is empty and `totalResults` is 0.

### Errors

- Network errors (DNS, timeout, connection refused) throw a non-retryable error.
- Invalid API key returns an authentication error.
- Rate-limit responses may throw or return an empty result set depending on the provider.
- `continueOnFail` returns the item with an empty results array instead of throwing.

### Expressions

The `query` parameter accepts expression strings. All other parameters can use static values or expressions.

## Acceptance tests

### Test: basic search

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "query": "n8n workflow automation",
  "resultLimit": 5
}
```

**Expect** output[0] to be an array of at most 5 items (one per input), each containing:
- A `query` field equal to `"n8n workflow automation"`
- A non-empty `results` array with at least one result
- Each result has `title`, `url`, and `snippet` as strings
- `totalResults` is a positive number

### Test: empty result

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "query": "zzzxxxxnonexistent999999",
  "resultLimit": 10
}
```

**Expect** output[0] to contain one item where `results` is an empty array and `totalResults` is 0.

### Test: custom endpoint

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "query": "test",
  "searchEngine": "custom",
  "customEndpoint": "https://example.com/search",
  "apiKey": "test-key"
}
```

**Expect** the node to issue an HTTP GET to `https://example.com/search` with query and apiKey parameters, and emit the normalized result array.

### Test: continue on fail

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "query": "",
  "continueOnFail": true
}
```

**Expect** output[0] to contain one item with `results` as an empty array and `totalResults` as 0, rather than throwing an error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string existence | documented (MANIFEST) | Confirmed in factory job manifest |
| Public docs | missing | URL returns 404; no sitemap entry |
| Actual presence in npm | inferred absent | Not found in n8n-nodes-base@2.15.1 extracted files |
| Parameter names and defaults | inferred | Based on patterns from analogous search/tool nodes (RSS Feed Read, Perplexity Search, urlScan.io) |
| Credential requirements | inferred | No dedicated credential type found; likely uses inline key or no auth |
| Output shape | inferred | Standard n8n search-result pattern with title/url/snippet |

**Methodology:** Because the node is absent from the published package and has no docs page, the specification is assembled from:
1. The confirmed type string (`n8n-nodes-base.webSearch`) from the MANIFEST
2. Behavioral patterns observed in similar search-capable n8n core nodes
3. General web search API contracts (query → result list → normalized output)

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/webSearch.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

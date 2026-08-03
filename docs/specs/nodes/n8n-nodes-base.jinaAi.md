---
type: n8n-nodes-base.jinaAi
displayName: Jina AI
category: Miscellaneous
versions: [1]
priority: high
status: specced
---

# Jina AI

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.jinaai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/jinaai.md | Public docs only |
| https://r.jina.ai/docs | Public docs only (Jina Reader API) |
| https://s.jina.ai/docs | Public docs only (Jina Search API) |

## Wire format

- **Type string:** `n8n-nodes-base.jinaAi`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `jinaAiApi` (API key, required)
- **Usable as tool:** yes

## Parameters

The node exposes two resources (Reader and Research) with distinct operations and options. Parameters are divided into visible fields that change based on the selected resource/operation combination, plus a shared set of request-level options.

| name | type | default | required | display context | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `reader`, `research` | `reader` | yes | always | Top-level resource selector |
| operation | options: `read`, `search` | `read` | yes | resource=reader | Reader sub-operation |
| operation | options: `deepResearch` | `deepResearch` | yes | resource=research | Research sub-operation |
| url | string | — | yes | resource=reader, operation=read | Target URL to fetch and convert |
| simplify | boolean | true | no | all operations | When true, extracts the `data` envelope from responses; when false, returns the full API response verbatim |
| searchQuery | string | — | yes | resource=reader, operation=search | Free-text search query sent to the Jina Search API |
| researchQuery | string | — | yes | resource=research, operation=deepResearch | Topic or question the AI should research in depth |
| options.outputFormat | options: `html`, `json`, `markdown`, `screenshot`, `text` | `json` | no | resource=reader, any operation | Desired response format; sent as `X-Return-Format` header |
| options.targetSelector | string | — | no | resource=reader, operation=read | CSS selector to scope content extraction |
| options.excludeSelector | string | — | no | resource=reader, operation=read | CSS selector for elements to strip |
| options.enableImageCaptioning | boolean | false | no | resource=reader, operation=read | Generates captions for images; sent as `X-With-Generated-Alt` header |
| options.waitForSelector | string | — | no | resource=reader, operation=read | CSS selector to wait for before extraction (dynamic pages) |
| options.siteFilter | string | — | no | resource=reader, operation=search | Comma-separated domains to restrict the search to |
| options.pageNumber | number | — | no | resource=reader, operation=search | Page offset for search results |
| options.maxReturnedSources | number | — | no | resource=research, operation=deepResearch | Maximum number of URLs the answer may cite |
| options.prioritizeSources | string | — | no | resource=research, operation=deepResearch | Comma-separated hostnames given higher retrieval priority |
| options.excludeSources | string | — | no | resource=research, operation=deepResearch | Comma-separated hostnames to exclude |
| requestOptions.batching.batchSize | number | 50 | no | always (advanced) | Items per batch; -1 disables batching |
| requestOptions.batching.batchInterval | number | 1000 | no | always (advanced) | Milliseconds between batches |
| requestOptions.allowUnauthorizedCerts | boolean | false | no | always (advanced) | Skip SSL verification |
| requestOptions.proxy | string | — | no | always (advanced) | HTTP proxy URL |
| requestOptions.timeout | number | 10000 | no | always (advanced) | Request timeout in ms |

## Runtime behavior

### Input

Each incoming item is processed independently (unless batching is configured). For `read` and `search` operations, the node issues an HTTP GET. For `deepResearch`, it issues an HTTP POST.

### Output

**Reader → Read:** The node calls `GET https://r.jina.ai/{url}`. The raw response includes `data`, `code`, `status` fields alongside the full page content. When `simplify` is true, only the `data` array is forwarded.

**Reader → Search:** The node calls `GET https://s.jina.ai/?q={query}`. The raw response mirrors the Read shape. When `simplify` is true, only the `data` array is forwarded.

**Research → Deep Research:** The node calls `POST https://deepsearch.jina.ai/v1/chat/completions` with a messages array and optional `max_returned_urls`, `boost_hostnames`, `bad_hostnames`, `only_hostnames` body fields. When `simplify` is true, the response is restructured to extract `content`, `annotations`, and `usage` from the choices envelope.

When `simplify` is false, the full API response object is passed through as-is.

### Errors

- Network errors (timeout, DNS, SSL) produce a `NodeOperationError` per item.
- Non-2xx responses from the Jina API produce a `NodeApiError` with the status code and response body.
- Missing required parameters (`url`, `searchQuery`, `researchQuery`) are caught at the UI level by the `required` flag; the executor should still validate and throw a descriptive error if absent at runtime.
- When `continueOnFail` is enabled, failed items are passed to the error output.

### Expressions

All string parameters accept expressions (`url`, `searchQuery`, `researchQuery`, option fields, proxy, etc.). Boolean and number parameters also accept expressions via `$eval` or `$parameter`.

## Acceptance tests

### Test: Reader → Read — basic URL fetch with simplify

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "reader",
  "operation": "read",
  "url": "https://example.com/",
  "simplify": true
}
```

**Expect** output[0] to contain a `json` object with at least a `data` array of content objects (each with `content`, `url`, `title`, `description`), or an error if the URL is unreachable.

### Test: Reader → Search — web search with site filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "reader",
  "operation": "search",
  "searchQuery": "Jina AI embeddings",
  "options": {
    "siteFilter": "jina.ai"
  },
  "simplify": true
}
```

**Expect** output[0] to contain a `json` object with a `data` array where at least one entry references `jina.ai`.

### Test: Research → Deep Research — generate structured report

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "research",
  "operation": "deepResearch",
  "researchQuery": "What are the latest advances in embedding models?",
  "options": {
    "maxReturnedSources": 5
  },
  "simplify": true
}
```

**Expect** output[0] to contain a `json` object with a `content` string of substantial length and an optional `annotations` array of cited URLs.

### Test: Full raw response passthrough

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "reader",
  "operation": "read",
  "url": "https://example.com/",
  "simplify": false
}
```

**Expect** output[0] to contain a `json` object that includes both `data` and `code` / `status` top-level keys from the Jina API response.

### Test: Missing required parameter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "reader",
  "operation": "read",
  "url": ""
}
```

**Expect** the node to throw a `NodeOperationError` indicating that the URL is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Supported operations (Read, Search, Deep Research) | Public docs | Confirmed at docs.n8n.io |
| Credential shape (API key) | Public docs | Confirmed at docs.n8n.io/integrations/builtin/credentials/jinaai |
| Endpoint URLs (r.jina.ai, s.jina.ai, deepsearch.jina.ai) | Public docs | Referenced at r.jina.ai/docs and s.jina.ai/docs |
| Parameter names and option enums | Corporation extracted from npm package JSON; verified against public docs | The public n8n docs list the three operations at a high level; parameter names (outputFormat, targetSelector, siteFilter, etc.) are extracted from the packaged schema |
| Simplification / output shaping | Corpuses | Extracted from the published npm node descriptor |
| Batching and request options | Corpuses | Standard pattern for HTTP-based n8n nodes |
| Exact response shapes | Inferred from schema + public API | The Jina Read/Search API responses are well documented at r.jina.ai; the detailed envelope is inferred |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/jinaAi.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.jinaAiTool
displayName: Jina AI Tool
category: Miscellaneous
versions: [1]
priority: high
status: specced
---

# Jina AI Tool

AI agent tool variant of the Jina AI node. Exposes the same Reader (Read, Search) and Research (Deep Research) capabilities as `n8n-nodes-base.jinaAi`, but designed to be called by an AI agent with dynamic parameters supplied at runtime via `$fromAI()`.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.jinaai.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/jinaai.md | Public docs only |
| https://r.jina.ai/docs | Public docs only (Jina Reader API) |
| https://s.jina.ai/docs | Public docs only (Jina Search API) |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.jinaAiTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `jinaAiApi` (API key, required)
- **Tool-mode inputs:** The agent model supplies resource, operation, and parameter values dynamically via `$fromAI()`

## Parameters

The tool variant shares the same high-level parameter structure as the base Jina AI node. All parameters support `$fromAI()` expressions so the AI agent can supply values at call time.

| name | type | default | required | display context | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `reader`, `research` | `reader` | yes | always | Top-level resource selector |
| operation | options: `read`, `search` | `read` | yes | resource=reader | Reader sub-operation |
| operation | options: `deepResearch` | `deepResearch` | yes | resource=research | Research sub-operation |
| url | string | — | yes | resource=reader, operation=read | Target URL; supplied by agent via `$fromAI()` |
| simplify | boolean | true | no | all operations | When true, extracts the `data` envelope; when false, returns the full API response |
| searchQuery | string | — | yes | resource=reader, operation=search | Free-text search query; supplied by agent via `$fromAI()` |
| researchQuery | string | — | yes | resource=research, operation=deepResearch | Topic or question; supplied by agent via `$fromAI()` |
| options.outputFormat | options: `html`, `json`, `markdown`, `screenshot`, `text` | `json` | no | resource=reader, any operation | Desired response format; sent as `X-Return-Format` header |
| options.targetSelector | string | — | no | resource=reader, operation=read | CSS selector to scope content extraction |
| options.excludeSelector | string | — | no | resource=reader, operation=read | CSS selector for elements to strip |
| options.enableImageCaptioning | boolean | false | no | resource=reader, operation=read | Generates captions via `X-With-Generated-Alt` header |
| options.waitForSelector | string | — | no | resource=reader, operation=read | CSS selector to wait for before extraction |
| options.siteFilter | string | — | no | resource=reader, operation=search | Comma-separated domains to restrict search to |
| options.pageNumber | number | — | no | resource=reader, operation=search | Page offset for search results |
| options.maxReturnedSources | number | — | no | resource=research, operation=deepResearch | Max URLs the answer may cite |
| options.prioritizeSources | string | — | no | resource=research, operation=deepResearch | Comma-separated hostnames given higher retrieval priority |
| options.excludeSources | string | — | no | resource=research, operation=deepResearch | Comma-separated hostnames to exclude |
| requestOptions.batching.batchSize | number | 50 | no | always (advanced) | Items per batch; -1 disables batching |
| requestOptions.batching.batchInterval | number | 1000 | no | always (advanced) | Milliseconds between batches |
| requestOptions.allowUnauthorizedCerts | boolean | false | no | always (advanced) | Skip SSL verification |
| requestOptions.proxy | string | — | no | always (advanced) | HTTP proxy URL |
| requestOptions.timeout | number | 10000 | no | always (advanced) | Request timeout in ms |

## Runtime behavior

### Input

In AI agent tool mode, the agent model decides which resource/operation to invoke and provides the required parameters (URL, query, etc.) at call time. The node processes each incoming item independently unless batching is configured.

### Output

Output shapes are identical to the base `jinaAi` node:

- **Reader → Read:** `GET https://r.jina.ai/{url}` — returns page content converted to the chosen format. With `simplify=true`, only the `data` array is forwarded.
- **Reader → Search:** `GET https://s.jina.ai/?q={query}` — returns ranked search results. With `simplify=true`, only the `data` array is forwarded.
- **Research → Deep Research:** `POST https://deepsearch.jina.ai/v1/chat/completions` — returns a structured research report with citations. With `simplify=true`, extracts `content`, `annotations`, and `usage` from the choices envelope.

When `simplify=false`, the full API response object is passed through as-is.

### Errors

- Network errors (timeout, DNS, SSL) and non-2xx responses produce standard `NodeOperationError` / `NodeApiError`.
- Missing required parameters produce a descriptive error at runtime.
- `continueOnFail` sends failed items to the error output.

### Expressions

All parameters accept expressions. In tool mode, `$fromAI()` expressions resolve to values supplied by the calling AI agent.

## Acceptance tests

### Test: Reader → Read via agent tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (as populated by `$fromAI()`):
```json
{
  "resource": "reader",
  "operation": "read",
  "url": "https://example.com/",
  "simplify": true
}
```

**Expect** output[0] to contain a `json` object with a `data` array of content objects (each with `content`, `url`, `title`, `description`), or a `NodeOperationError` if the URL is unreachable.

### Test: Reader → Search via agent tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (as populated by `$fromAI()`):
```json
{
  "resource": "reader",
  "operation": "search",
  "searchQuery": "Jina AI embeddings",
  "options": { "siteFilter": "jina.ai" },
  "simplify": true
}
```

**Expect** output[0] to contain a `json` object with a `data` array where at least one entry references `jina.ai`.

### Test: Research → Deep Research via agent tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (as populated by `$fromAI()`):
```json
{
  "resource": "research",
  "operation": "deepResearch",
  "researchQuery": "What are the latest advances in embedding models?",
  "options": { "maxReturnedSources": 5 },
  "simplify": true
}
```

**Expect** output[0] to contain a `json` object with a `content` string of substantial length and an optional `annotations` array of cited URLs.

### Test: Full raw response passthrough

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters**:
```json
{
  "resource": "reader",
  "operation": "read",
  "url": "https://example.com/",
  "simplify": false
}
```

**Expect** output[0] to contain a `json` object that includes top-level keys `data`, `code`, and `status` from the Jina API response envelope.

### Test: Missing required parameter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters**:
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
| Resource and operation listing (Reader → Read/Search, Research → Deep Research) | Public docs | Confirmed at docs.n8n.io |
| Credential shape (API key) | Public docs | Confirmed at docs.n8n.io/integrations/builtin/credentials/jinaai |
| Endpoint URLs (r.jina.ai, s.jina.ai, deepsearch.jina.ai) | Public docs | Referenced at r.jina.ai/docs and s.jina.ai/docs |
| Parameter names and option enums | Corpuses (npm package JSON) | Extracted from the published npm node descriptor; identical to base jinaAi node |
| Tool-mode behavior ($fromAI() support) | Public docs | Standard n8n tool pattern; confirmed at docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md |
| Type string (jinaAiTool vs jinaAi) | Corpuses | The npm package defines only `n8n-nodes-base.jinaAi`; the Tool suffix is inferred as a separate type string for AI-agent tool registration |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/jinaAiTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

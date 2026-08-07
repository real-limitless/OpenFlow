---
type: n8n-nodes-base.urlScanIoTool
displayName: urlscan.io (AI Tool)
category: Utility
versions: [1]
priority: medium
status: specced
---

# urlscan.io (AI Tool)

AI agent tool variant of the urlscan.io node. Wraps the same **Scan** resource with **Perform**, **Get**, and **Get All** operations against the urlscan.io API v1. Designed to be registered in the AI Agent's tool panel with dynamic parameter population via `$fromAI()`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.urlscanio.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/urlscanio.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://urlscan.io/docs/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.urlScanIoTool`
- **Aliases:** `Scrape`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `urlScanIoApi` (API key)

## Parameters

Identical to the base `n8n-nodes-base.urlScanIo` node. Single **Scan** resource with three operations. All parameter values accept `$fromAI()` expressions for dynamic population by the AI agent.

| Operation | Parameter name | type | required | notes |
|-----------|----------------|------|----------|-------|
| Perform | URL | string | yes | Target URL to scan. Supports `$fromAI()`. |
| Perform | Additional Fields | collection | no | Group of optional scan parameters. |
| Perform | Additional Fields → Custom Agent | string | no | Override `User-Agent` header. Supports `$fromAI()`. |
| Perform | Additional Fields → Referer | string | no | Override HTTP referer header. Supports `$fromAI()`. |
| Perform | Additional Fields → Visibility | options | no | One of `private` (default), `public`, `unlisted`. |
| Perform | Additional Fields → Tags | string | no | Comma-separated tags, max 10. Supports `$fromAI()`. |
| Perform | Additional Fields → Override Safety | string | no | Disable PII reclassification for this scan. |
| Get | Scan ID | string | yes | UUID of the completed scan to retrieve. Supports `$fromAI()`. |
| Get All | Return All | boolean | no | Return all results or cap at a limit. |
| Get All | Limit | number | no | Max results (default 50, used when returnAll is false). |
| Get All | Filters → Query | string | no | ElasticSearch Query String query. Supports `$fromAI()`. |

## Runtime behavior

### Input

Same as the base urlscan.io node: each input item is processed independently. When used as an AI tool, parameters may be omitted or partially filled — the AI agent can supply values via `$fromAI()`.

### Output

Same response shapes as the base node:

**Perform:** Returns submission metadata (`uuid`, `result` URL, `api` poll URL, `visibility`, `url`, `message`, `options`, `country`). Does not block on scan completion.

**Get:** Returns the full urlscan.io Result API object for a given UUID (page metadata, requests, console logs, global rankings, verdicts).

**Get All:** Returns search results from the urlscan.io Search API (`_id`, `sort`, `page`, `task` array items).

### Errors

- **Perform:** Throws on invalid URL, blacklisted domain, missing URL, rate-limit (HTTP 400/429). Returns `message` and optional `description`.
- **Get:** Throws on 404 (pending scan) or 410 (deleted result). HTTP 200 returns full result.
- **Get All:** Throws on invalid query syntax or auth errors.
- All operations respect `continueOnFail`.

### Expressions

All parameter values accept `$fromAI()` for AI-agent-driven population, in addition to standard `=...` expression syntax.

## Acceptance tests

### Test: AI agent submits a URL for scanning

**Given** input items:

```json
[{ "json": { "targetUrl": "https://example.com" } }]
```

**Parameters:**

```json
{ "resource": "Scan", "operation": "Perform", "url": "={{ $fromAI() }}" }
```

**Expect** output[0] to contain `json.uuid` matching a UUID v4 pattern, `json.message` equal to `"Submission successful"`, and `json.result` matching the pattern `https://urlscan.io/result/` followed by a UUID.

### Test: AI agent retrieves a scan by ID

**Given** input items:

```json
[{ "json": { "scanUuid": "0e37e828-a9d9-45c0-ac50-1ca579b86c72" } }]
```

**Parameters:**

```json
{ "resource": "Scan", "operation": "Get", "scanId": "={{ $fromAI() }}" }
```

**Expect** output[0] to contain `json.task` with `json.task.url` present.

### Test: AI agent searches scans

**Given** input items:

```json
[{ "json": { "query": "domain:example.com" } }]
```

**Parameters:**

```json
{ "resource": "Scan", "operation": "Get All", "filters": { "query": "={{ $fromAI() }}" }, "returnAll": false, "limit": 10 }
```

**Expect** output[0] to be an array of entries, each containing `_id`, `page`, and `task`. Total count should not exceed 10.

### Test: continue on fail with invalid scan ID

**Given** input items:

```json
[{ "json": { "scanUuid": "00000000-0000-0000-0000-000000000000" } }]
```

**Parameters:**

```json
{ "resource": "Scan", "operation": "Get", "scanId": "={{ $fromAI() }}", "options": { "continueOnFail": true } }
```

**Expect** output[0] to contain `json.error` or `_error` without aborting the workflow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Available operations | documented | Public n8n docs list same 3 operations as base node |
| Parameters per operation | documented | Same parameters as base node, plus `$fromAI()` support |
| Tool-only behavior | inferred | Tool variant registers in AI Agent panel; no separate docs page |
| Credential type | documented | Same `urlScanIoApi` API-key credential |
| Expression support | documented | `$fromAI()` standard for AI tool nodes per n8n docs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.urlScanIoTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

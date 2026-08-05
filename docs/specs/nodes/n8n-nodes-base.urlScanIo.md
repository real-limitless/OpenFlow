---
type: n8n-nodes-base.urlScanIo
displayName: urlscan.io
category: Utility
versions: [1]
priority: medium
status: specced
---

# urlscan.io

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.urlscanio.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/urlscanio.md | Public docs only |
| https://urlscan.io/docs/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.urlScanIo`
- **Aliases:** `Scrape`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `urlScanIoApi` (API key)

## Parameters

The node exposes a single **Scan** resource with three operations:

| Operation | Parameter name | type | required | notes |
|-----------|----------------|------|----------|-------|
| Perform | URL | string | yes | Target URL to scan. Expression-capable. |
| Perform | Additional Fields | collection | no | Group of optional scan parameters (see below). |
| Perform | Additional Fields → Custom Agent | string | no | Override the `User-Agent` header. |
| Perform | Additional Fields → Referer | string | no | Override the HTTP referer header. |
| Perform | Additional Fields → Visibility | options | no | One of `private` (default), `public`, `unlisted`. |
| Perform | Additional Fields → Tags | string | no | Comma-separated tags, max 10. |
| Perform | Additional Fields → Override Safety | string | no | Disable PII reclassification for this scan. |
| Get | Scan ID | string | yes | UUID of the completed scan to retrieve. |
| Get All | Return All | boolean | no | Return all results or cap at a limit. |
| Get All | Limit | number | no | Max results (default 50, used when returnAll is false). |
| Get All | Filters → Query | string | no | ElasticSearch Query String query (e.g. `domain:n8n.io`). |

## Runtime behavior

### Input

Each input item is processed independently. The node sends one urlscan.io API request per input item and collects the responses. All parameter values accept expression strings.

### Output

**Perform:** Submits a URL for scanning via `POST /api/v1/scan/`. The response includes:

- `uuid` — scan UUID for polling
- `result` — URL to the scan result page
- `api` — URL to poll for the JSON result
- `visibility` — the scan visibility level
- `url` — the submitted URL
- `message` — submission status message
- `options` — object with scan options (e.g. useragent)
- `country` — country code the scan originated from

The node does **not** block on scan completion; it emits the submission response immediately. To retrieve scan results downstream, use an HTTP Request node to poll the result API URL returned in `api`.

**Get:** Returns the full scan result for a given UUID via `GET /api/v1/result/{uuid}/`. The shape is that of the urlscan.io Result API, a large JSON object with page metadata, requests, console logs, global rankings, and verdicts. Properties may be absent for any scan; consumers must handle missing keys gracefully.

**Get All:** Queries the urlscan.io Search API via `GET /api/v1/search/` with optional ElasticSearch query. Returns a page of scan summaries matching the query criteria.

### Errors

- **Perform:** Throws on invalid URL, non-resolvable hostname, blacklisted domain, missing URL, or rate-limit exceeded (HTTP 400/429). Returns `message` and optional `description` from the API.
- **Get:** Returns HTTP 404 while the scan is in progress; the node should throw on 404/410 (deleted result). Once the scan completes (HTTP 200), returns the full result object.
- **Get All:** Throws on invalid query syntax or authentication errors.
- All operations respect `continueOnFail` for graceful degradation.

### Expressions

All parameter values accept expression strings (`=...` syntax).

## Acceptance tests

### Test: submit a URL for scanning

**Given** input items:

```json
[{ "json": { "targetUrl": "https://example.com" } }]
```

**Parameters:**

```json
{ "resource": "Scan", "operation": "Perform", "url": "={{ $json.targetUrl }}" }
```

**Expect** output[0] to contain `json.uuid` matching a UUID v4 pattern, `json.message` equal to `"Submission successful"`, and `json.result` matching the pattern `https://urlscan.io/result/` followed by a UUID.

### Test: retrieve a completed scan by ID

**Given** input items:

```json
[{ "json": { "scanUuid": "0e37e828-a9d9-45c0-ac50-1ca579b86c72" } }]
```

**Parameters:**

```json
{ "resource": "Scan", "operation": "Get", "scanId": "={{ $json.scanUuid }}" }
```

**Expect** output[0] to contain `json.scanId` and `json.task` (the scan task object) with `json.task.url` present.

### Test: search scans with a query

**Given** input items:

```json
[{ "json": { "query": "domain:example.com" } }]
```

**Parameters:**

```json
{ "resource": "Scan", "operation": "Get All", "filters": { "query": "={{ $json.query }}" }, "returnAll": false, "limit": 10 }
```

**Expect** output[0] to be an array of result entries, each containing `_id`, `sort`, `page`, and `task` properties. The total count should not exceed 10.

### Test: continue on fail with invalid scan ID

**Given** input items:

```json
[{ "json": { "scanUuid": "00000000-0000-0000-0000-000000000000" } }]
```

**Parameters:**

```json
{ "resource": "Scan", "operation": "Get", "scanId": "={{ $json.scanUuid }}", "options": { "continueOnFail": true } }
```

**Expect** output[0] to contain `json.error` or `_error` indicating the request failure, without aborting the workflow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Available operations | documented | Public n8n docs list Get, Get All, Perform for Scan resource |
| Parameters per operation | documented | Public docs + corpus confirm all parameter names and types |
| Scan submission response shape | documented | urlscan.io Submission API docs specify the exact response fields |
| Result API shape | documented | urlscan.io Result API reference; too large to enumerate in spec |
| Search API shape | documented | urlscan.io Search API docs confirm `_id`, `sort`, `page`, `task` |
| Polling behavior | inferred | Node emits submission result immediately; user must poll separately |
| Credential type | documented | API key credential confirmed by n8n credentials page |
| Expression behavior | documented | Standard n8n expression behavior applies |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.urlScanIo.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

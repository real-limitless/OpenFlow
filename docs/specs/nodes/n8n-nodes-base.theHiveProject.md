---
type: n8n-nodes-base.theHiveProject
displayName: TheHive 5
category: Development
versions: [1]
priority: medium
status: specced
---

# TheHive 5 (TheHive Project API v5)

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.thehive5.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/thehive5.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.thehive5trigger.md | Public docs only |
| https://docs.strangebee.com/thehive/api-docs/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.theHiveProject`
- **Aliases:** `theHiveProject`
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `theHiveProjectApi`

### Credential shape (`theHiveProjectApi`)

| field | type | notes |
|-------|------|-------|
| url | string | TheHive 5 server base URL |
| apiKey | string | API key; orgAdmin accounts generate from Organization > Create API Key, superAdmin from Users > Create API Key |
| ignoreSSLIssues | boolean | Skip SSL certificate validation when enabled |

No `apiVersion` selector — the credential always targets the TheHive 5 (v1) API.

## Parameters

The node exposes a resource selector and an operation selector. The available operations depend on the selected resource.

### Resource

| value | label |
|-------|-------|
| alert | Alert |
| case | Case |
| comment | Comment |
| observable | Observable |
| page | Page |
| query | Query |
| task | Task |
| taskLog | Task Log |

### Operations (per resource)

Each resource supports a subset of Create, Get, Search, Update, Delete plus resource-specific actions as defined by the TheHive v5 REST API.

| Resource | Operations |
|----------|------------|
| Alert | Create, Delete, Execute Responder, Get, Merge Into Case, Promote to Case, Search, Update, Update Status |
| Case | Add Attachment, Create, Delete Attachment, Delete Case, Execute Responder, Get, Get Attachment, Get Timeline, Search, Update |
| Comment | Create, Delete, Search, Update |
| Observable | Create, Delete, Execute Analyzer, Execute Responder, Get, Search, Update |
| Page | Create, Delete, Search, Update |
| Query | Execute Query |
| Task | Create, Delete, Execute Responder, Get, Search, Update |
| Task Log | Add Attachment, Create, Delete, Delete Attachment, Execute Responder, Get, Search |

### Common operational parameters

Each operation accepts:

- **ID** (string, expression) — entity identifier for Get/Update/Delete operations
- **Body / Fields** (JSON or key-value) — entity fields for Create and Update operations
- **Search filters** (key-value or JSON query) — filtering criteria for Search operations
- **Options** (collapsible group):
  - Pagination: limit, offset, sort by field, sort order
  - Additional headers or parameters per the TheHive 5 API contract

The Query resource's Execute Query operation accepts a raw query string or structured query object instead of the standard resource/operation pattern.

## Runtime behavior

### Input

Each input item is processed independently. Expression-based parameter values are resolved against the current item's JSON data.

### Output

Each output item corresponds to the result of one operation. For list/search operations that return multiple results, the node outputs one item per result entity. For single-entity operations (Create, Get, Update, Delete), the node outputs one item containing the API response body. For Delete operations, the output is the deleted entity or an empty confirmation body depending on the API contract.

### Errors

- API errors (4xx/5xx) are surfaced as node-level errors with the upstream status code and message.
- When `continueOnFail` is enabled, failed items produce zero output rather than halting.
- Network errors (connection refused, timeout, DNS failure) throw immediately regardless of `continueOnFail`.

### Expressions

All value-type parameters (ID, body fields, search values) accept expression strings. Option group parameters also accept expressions.

## Acceptance tests

### Test: create an alert

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `alert`
- Operation: `Create`
- Body: `{ "title": "Test alert", "description": "Created by n8n", "severity": 2, "type": "internal" }`

**Expect** output[0] contains `json` with `title` equal to `"Test alert"` and an `id` field (non-empty string).

### Test: search cases

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `case`
- Operation: `Search`
- Search filters: `{ "status": "Open" }`

**Expect** output is one item per matching case. If at least one case matches, `json.id` and `json.title` exist on the first item. Zero items if no matches.

### Test: promote alert to case

**Given** input items:

```json
[{ "json": { "alertId": "~123456" } }]
```

**Parameters:**
- Resource: `alert`
- Operation: `Promote to Case`
- ID: `{{ $json.alertId }}`
- Body: `{ "title": "Promoted case", "tags": ["n8n"] }`

**Expect** output[0] contains `json` with `id` (non-empty string) and a title matching the input.

### Test: execute query

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `query`
- Operation: `Execute Query`
- Query: `{ "query": [{ "_name": "listAlert" }] }`

**Expect** output[0] contains `json` with the query result data. The exact shape depends on the TheHive 5 query API response.

### Test: add attachment to case

**Given** input items:

```json
[{ "json": { "caseId": "~123456", "attachment": { "binaryData": "base64...", "fileName": "report.pdf" } } }]
```

**Parameters:**
- Resource: `case`
- Operation: `Add Attachment`
- ID: `{{ $json.caseId }}`
- Binary attachment data from input item's binary field

**Expect** output[0] contains `json` with `id` (non-empty string) confirming the attachment was added.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact operation list per resource | documented | Public docs enumerate all resources and their operations |
| Exact JSON response shapes | inferred | Response shapes follow the TheHive 5 REST API contract |
| Parameter nesting structure | inferred | The spec abstracts parameter details to common patterns; exact UI grouping may differ |
| Query resource syntax | inferred | The query resource accepts TheHive 5's query language; exact input format depends on the API |
| Task Log resource distinction | inferred | Task Log is a separate resource from Log (which existed in v3/v4), matching the v5 API restructuring |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/theHiveProject.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

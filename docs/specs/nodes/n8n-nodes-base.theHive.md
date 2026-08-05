---
type: n8n-nodes-base.theHive
displayName: TheHive
category: Development
versions: [1]
priority: medium
status: specced
---

# TheHive (v3/v4)

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.thehive.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/thehive.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.thehivetrigger.md | Public docs only |
| https://docs.thehive-project.org/thehive/legacy/thehive3/api/ | Public docs only |
| https://docs.thehive-project.org/thehive/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.theHive`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `theHiveApi`

### Credential shape (`theHiveApi`)

| field | type | notes |
|-------|------|-------|
| url | string | TheHive server base URL |
| apiKey | string | API key generated from Organization > Create API Key |
| apiVersion | enum | `theHive3` (api v0) or `theHive4` (api v1) |
| ignoreSSLIssues | boolean | Skip SSL certificate validation when enabled |

## Parameters

The available resources and operations depend on the selected API version in the credentials. The node offers a single resource selector and an operation selector whose contents are dynamically filtered by the credential's `apiVersion` setting.

### Resource

| value | label |
|-------|-------|
| alert | Alert |
| case | Case |
| log | Log |
| observable | Observable |
| task | Task |

### Operations (per resource)

Each resource supports a shared set of CRUD-like operations. The exact subset available for each resource and API version is determined by the TheHive REST API contract for that version. The executor MUST derive the operation list from the credential's selected API version.

Generally available operation patterns:
- **Create** — POST a new entity to the resource collection
- **Get** — GET a single entity by ID
- **Search** — GET/POST query against the resource collection (filtered by criteria)
- **Update** — PATCH/PUT an existing entity by ID
- **Delete** — DELETE an entity by ID

Additional resource-specific actions (when supported by the API version):
- **Alert**: Promote to Case, Merge Into Case, Execute Responder, Update Status
- **Case**: Add Attachment, Get Attachment, Delete Attachment, Get Timeline, Execute Responder
- **Log**: Add Attachment, Get Attachment, Delete Attachment (shared with Case logs)
- **Observable**: Execute Analyzer, Execute Responder
- **Task**: Execute Responder
- **Case/Alert**: Count (aggregate query returning count of matching entities)

### Common parameters

Each operation accepts:
- **ID** (string, expression) — entity identifier for Get/Update/Delete operations
- **Body** / **Fields** (JSON or key-value) — entity fields for Create/Update operations
- **Search filters** (key-value or JSON query) — filtering criteria for Search operations
- **Options** (collapsible group):
  - Pagination: limit, offset, sort by field, sort order
  - Additional headers or parameters per the TheHive API contract

## Runtime behavior

### Input

Each input item is processed independently. The node resolves all expression-based parameter values against the current item.

### Output

Each output item corresponds to the result of one operation. For list/search operations that return multiple results, the node outputs one item per result entity. For single-entity operations (Create, Get, Update, Delete), the node outputs one item containing the API response body. For Delete operations, the output is the deleted entity or an empty confirmation body depending on the API version.

### Errors

- API errors (4xx/5xx) are surfaced as node-level errors with the upstream status code and message.
- When `continueOnFail` is enabled, failed items produce zero output (skipped) rather than halting execution.
- Network errors (connection refused, timeout, DNS failure) throw immediately regardless of `continueOnFail`.

### Expressions

All value-type parameters (ID, body fields, search values) accept expression strings. The option group parameters also accept expressions.

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

**Expect** output[0] contains `json.alert` with `title` equal to `"Test alert"` and an `id` field (non-empty string).

### Test: search cases

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
- Resource: `case`
- Operation: `Search`
- Search filters: `{ "status": "Open" }`

**Expect** output[0] is a single item per matching case. If at least one case matches, `json.id` and `json.title` exist on the first item. Zero items if no matches.

### Test: get single observable

**Given** input items:

```json
[{ "json": { "observableId": "~123456" } }]
```

**Parameters:**
- Resource: `observable`
- Operation: `Get`
- ID: `{{ $json.observableId }}`

**Expect** output[0] contains `json.observable` with fields `id`, `dataType`, `data`, `message`.

### Test: promote alert to case

**Given** input items:

```json
[{ "json": { "alertId": "~123456" } }]
```

**Parameters:**
- Resource: `alert`
- Operation: `Promote to Case`
- ID: `{{ $json.alertId }}`
- Body (optional for merge/promote): `{ "title": "Promoted case", "tags": ["n8n"] }`

**Expect** output[0] contains `json.case` with `id` (non-empty string) and a title matching the input.

### Test: update task status

**Given** input items:

```json
[{ "json": { "taskId": "~789" } }]
```

**Parameters:**
- Resource: `task`
- Operation: `Update`
- ID: `{{ $json.taskId }}`
- Body: `{ "status": "Completed" }`

**Expect** output[0] contains `json.task` with `status` equal to `"Completed"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact operation list per resource/version | inferred | Public docs state operations depend on API version but do not enumerate the union per resource |
| Exact JSON response shapes | inferred | Response shapes follow the TheHive REST API contract for v3/v4 |
| Parameter nesting structure | inferred | The original node uses version-dependent property filtering; this spec abstracts that to a version-driven operation list |
| Attachment operations | inferred from corpus | Case/Log get/add/delete attachment operations are available but undocumented on the public page |
| Count operations | inferred from corpus | Aggregate count queries exist on Alert/Case but are not in public docs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/theHive.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

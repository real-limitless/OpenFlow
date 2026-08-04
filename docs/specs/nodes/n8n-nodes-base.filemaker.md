---
type: n8n-nodes-base.filemaker
displayName: FileMaker
category: Action
versions: [1]
priority: medium
status: specced
---

# FileMaker

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.filemaker/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/filemaker.md | Public docs only |
| https://help.claris.com/en/data-api-guide/content/index.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.filemaker`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `filemakerApi` (host, database, login, password)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | record | yes | always | Single resource: Record |
| operation | fixed | create | yes | always | One of: create, delete, duplicate, edit, find, get, getAll, performScript |
| layout | string | — | yes | always | FileMaker layout name for the target table context |
| recordId | string | — | conditional (get/delete/duplicate/edit) | operation IN (get, delete, duplicate, edit) | Internal FileMaker record ID |
| fields | object | {} | conditional | operation IN (create, edit, duplicate) | Field name to value mapping for the record |
| query | array | [] | conditional | operation = find | Find request criteria array, each entry a field:value pair with optional omit/related sets |
| script | string | — | conditional | operation = performScript | Name of a FileMaker script to run |
| scriptParameter | string | — | no | operation = performScript | Optional parameter string passed to the script |
| limit | number | 25 | no | operation = getAll | Maximum records to return per page |
| offset | number | 1 | no | operation IN (getAll, find) | Record offset for pagination |
| sort | array | [] | no | operation IN (getAll, find) | Sort criteria: array of { fieldName, sortOrder (ascend/descend) } |
| portal | array | [] | no | operation IN (get, getAll, find) | Portal data to include: array of portal names or { name, limit, offset } |

All string-typed parameters accept expression syntax.

## Runtime behavior

### External API contract

The node communicates with a Claris FileMaker Server or FileMaker Cloud instance via the FileMaker Data API (REST, base path `/fmi/data/v1/databases`). Authentication follows a session-token pattern: POST to `/{database}/sessions` with credentials, then uses the returned token in the `Authorization: Bearer` header on subsequent requests. Token is released via a DELETE to the session endpoint after each operation or on node deactivation.

### Input

Each input item produces one API call. The `fields` parameter is populated from input item data when using expression binding. When the node is used as an AI agent tool, parameters can be populated dynamically via `$fromAI()`.

### Output

Output items contain the JSON response body from the FileMaker Data API:

- **create:** Returns `{ response: { recordId, modId } }` plus the created record data.
- **get / getAll / find:** Returns `{ response: { data: [...], dataInfo: { foundCount, returnedCount, totalRecordCount } } }` where each entry in `data` contains `{ fieldData, portalData, recordId, modId }`.
- **edit:** Returns `{ response: { recordId, modId } }` with the updated record data.
- **duplicate:** Returns `{ response: { recordId, modId } }` with the new record data.
- **delete:** Returns `{ response: {} }` on success (204-style empty body).
- **performScript:** Returns the script result payload wrapped in the standard response envelope `{ response: { scriptResult, scriptError } }`.

When `continueOnFail` is enabled, API errors produce an empty output instead of throwing.

### Errors

- Authentication failure (invalid credentials, expired session) — thrown as `NodeApiError`.
- Record not found (404) — thrown unless `continueOnFail` is set.
- Layout not found — thrown.
- FileMaker script error (non-zero scriptError) — thrown.
- Find with no matches — returns empty `data` array (zero items emitted) rather than error.

### Expressions

All string, number, and object parameters (`fields`, `query`, `script`, `scriptParameter`, `limit`, `offset`, `sort`, `portal`, `recordId`, `layout`) accept expression syntax.

## Acceptance tests

### Test: create a record

**Given** input items:

```json
[{ "json": { "name": "Alice", "email": "alice@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "record",
  "operation": "create",
  "layout": "Contacts",
  "fields": {
    "Name": "={{ $json.name }}",
    "Email": "={{ $json.email }}"
  }
}
```

**Expect** output[0] contains `recordId` and `modId` fields under a top-level key (e.g. `response.recordId`). The node must POST to `/fmi/data/v1/databases/{database}/layouts/Contacts/records` with `fieldData: { Name: "Alice", Email: "alice@example.com" }`.

### Test: find records by field value

**Parameters:**

```json
{
  "resource": "record",
  "operation": "find",
  "layout": "Contacts",
  "query": [{ "field": "Email", "value": "alice@example.com" }]
}
```

**Expect** output[0] contains a response with a `data` array. Each entry has `fieldData`, `recordId`, and `modId`. The node must POST to `/fmi/data/v1/databases/{database}/layouts/Contacts/_find` with `{ query: [{ Email: "alice@example.com" }] }`.

### Test: perform a script

**Parameters:**

```json
{
  "resource": "record",
  "operation": "performScript",
  "layout": "Contacts",
  "script": "SendNotification",
  "scriptParameter": "Hello"
}
```

**Expect** output[0] contains the script result. The node should append `?script=SendNotification&script.param=Hello` to the base layout URL via GET, or use the script-preset form via a POST with a script parameter.

### Test: get all records with pagination

**Parameters:**

```json
{
  "resource": "record",
  "operation": "getAll",
  "layout": "Contacts",
  "limit": 50,
  "offset": 1
}
```

**Expect** output[0] contains a `data` array with up to 50 records plus `dataInfo.foundCount`. The node must GET `/fmi/data/v1/databases/{database}/layouts/Contacts/records?_limit=50&_offset=1`.

### Test: delete a record

**Parameters:**

```json
{
  "resource": "record",
  "operation": "delete",
  "layout": "Contacts",
  "recordId": "123"
}
```

**Expect** output[0] contains a success response. The node must DELETE `/fmi/data/v1/databases/{database}/layouts/Contacts/records/123`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations list | documented | 8 operations confirmed from docs.n8n.io |
| Credential schema | documented | Host, database, login, password from docs |
| Field mapping to API | inferred | `fieldData` mapping from FM Data API docs suggests field names passed as JSON keys |
| Portal/sort/limit structure | inferred | Reasonable from REST API pagination/portal patterns in Claris docs |
| performScript mechanics | inferred | Script name appended as query param per FM Data API convention |
| Container field upload | inferred gap | The Data API supports multipart container uploads; not clear if node exposes this as a distinct operation |
| AI tool mode | documented | `$fromAI()` support confirmed |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/filemaker.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

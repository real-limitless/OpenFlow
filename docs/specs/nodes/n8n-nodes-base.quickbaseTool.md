---
type: n8n-nodes-base.quickbaseTool
displayName: Quick Base Tool
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Quick Base Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbase/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/quickbase/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.quickbaseTool`
- **Aliases:** (none — `quickbaseTool` is the AI-tool alias of `n8n-nodes-base.quickbase`, which bears the alias `n8n-nodes-base.quickbaseTool`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `quickbaseApi` (hostname + user token — API-key authentication against Quick Base REST API)

## Parameters

The tool variant shares the same resource/operation structure as the base Quick Base node but relies on `$fromAI()` for dynamic parameter population instead of static UI fields.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `record` | yes | — | Target entity: `field`, `file`, `record`, `report` |
| operation | string | `create` | yes | — | Action per resource (see Operations below) |
| tableId | string | — | yes | record/file operations | Quick Base table ID (`dbid`); supports `$fromAI()` |
| recordId | string | — | conditional | record get/delete/update, file operations | Identifies a single record; supports `$fromAI()` |
| fields | object | `{}` | conditional | record create/update/upsert | Record field values keyed by field ID (integer keys as strings); supports `$fromAI()` |
| filter | string | — | no | record/getAll | Quick Base query formula string; supports `$fromAI()` |
| limit | number | — | no | record/getAll | Maximum records to return |
| sortBy | string | — | no | record/getAll | Field ID to sort on |
| sortDirection | string | `"ASC"` | no | record/getAll | `ASC` or `DESC` |
| reportId | string | — | yes | report operations | Quick Base report ID; supports `$fromAI()` |
| fieldId | string | — | no | field/getAll | Optional filter for specific field |
| fileId | string | — | yes | file/delete, file/download | File attachment ID; supports `$fromAI()` |
| upsertKey | string | — | no | record/upsert | Comma-separated field IDs for key-based conflict resolution |

### Operations by resource

Same as base Quick Base node:

**Field** — Get all fields (schema metadata for a table)

**File** — Delete / Download (file attachments on records; Download returns binary content)

**Record** — Create / Delete / Get All / Update / Upsert:
- Create inserts a new record with the provided field values
- Delete removes a record by record ID
- Get All queries records with optional filter, limit, and sort
- Update modifies field values on an existing record
- Upsert creates or updates a record based on key field values

**Report** — Get (metadata) / Run (execute and return result rows)

### AI agent integration

When invoked by an AI Agent, the tool receives its parameters via `$fromAI()` dynamic population. The AI Agent model selects the resource, operation, and supplies parameter values based on the user's natural-language request. The executor must accept all parameters as expression-capable strings and resolve them at runtime.

## Runtime behavior

### Input

Each input item is processed independently. The tool processes items sequentially, calling the Quick Base REST API for each item.

### Output

Output shape matches the base Quick Base node:
- **Get All** produces one output item per record with field-ID-keyed properties
- **Report/Run** produces items based on report column configuration
- **Create/Update/Upsert** returns the modified record data
- **Delete** returns a success confirmation
- **File/Download** returns binary data with filename and mime-type metadata

### Errors

- Missing required parameters produce a descriptive validation error
- Quick Base API errors (invalid credentials, table not found, permission denied, malformed query) are surfaced with the Quick Base error message
- `continueOnFail`: when enabled, emit an error item and continue processing remaining items

### Expressions

All string and number parameters accept expressions, including `$fromAI()` for AI-agent-driven tool invocation.

## Acceptance tests

### Test: create a record via AI tool

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "record",
  "operation": "create",
  "tableId": "abcdefg",
  "fields": { "6": "New Customer", "7": "contact@example.com" }
}
```

**Expect** output[0] to contain the created record data with an assigned `recordId` and the submitted field values.

### Test: get all records with filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "record",
  "operation": "getAll",
  "tableId": "abcdefg",
  "filter": "{6.CT.'Customer'}",
  "limit": 50,
  "sortBy": "3",
  "sortDirection": "DESC"
}
```

**Expect** output[0] to contain an array-like collection of record objects with field-ID-keyed properties.

### Test: download a file

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "download",
  "tableId": "abcdefg",
  "recordId": "12345",
  "fileId": "67890"
}
```

**Expect** output[0] to contain binary data (attachment content) with appropriate filename and mime-type metadata.

### Test: $fromAI() dynamic parameter resolution

**Given** input items:

```json
[{ "json": { "aiTable": "my_table_id", "aiName": "AI Corp" } }]
```

**Parameters:**

```json
{
  "resource": "record",
  "operation": "create",
  "tableId": "={{ $json.aiTable }}",
  "fields": "={{ $json.aiName }}"
}
```

**Expect** the executor resolves expressions at runtime, producing a valid API call with `tableId = "my_table_id"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Base operations | documented | Matches the Quick Base app node public docs |
| Parameters | inferred | Tool variant shares all parameters with base node |
| $fromAI() support | inferred | Standard AI-tool convention documented in n8n how-tools-work docs |
| Credentials | documented | `quickbaseApi` — hostname + user token |
| Dynamic option loading | confirmed | `getTableFields` and `getUniqueTableFields` methods exist on base node; tool variant may reuse these or defer to `$fromAI()` |
| No dedicated tool docs page | inferred | quickbaseTool has no standalone docs page; it is the `usableAsTool` alias of the base Quick Base node |

## OpenFlow mapping

- **Definition group:** `data`
- **Executor file:** `src/lib/engine/executors/QuickBaseTool.ts` (or shared executor with `QuickBase.ts` via the base spec)
- **SDK:** `defineNode` + native `ExecutionContext` only

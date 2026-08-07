---
type: n8n-nodes-base.quickbase
displayName: Quick Base
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Quick Base

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbase/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/quickbase/ | Public docs only |
| https://developer.quickbase.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.quickbase`
- **Aliases:** `n8n-nodes-base.quickbaseTool` (usable as AI tool with `$fromAI()` support)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `quickbaseApi` (hostname + user token, API-key style)

## Parameters

The node exposes four target entities (resources), each with a set of operations. Parameters are contextual to the selected resource and operation.

| name | type | required context | notes |
|------|------|------------------|-------|
| Resource | options: `field`, `file`, `record`, `report` | always | Selects the entity to act on |
| Operation | options (per resource) | always | See per-resource list below |
| Return All | boolean | field/getAll, record/getAll | When false, a Limit parameter applies |
| Limit | number (1-100, default 50) | when Return All is false | Max results per page |
| Table ID | string | field, file, record operations | Identifies the Quick Base table (dbid) |
| Record ID | string | file operations, record get/delete/update | Single-record identifier |
| Fields (Map) | key-value map | record create/update/upsert | Field ID (integer as string) → value |
| Filter | string | record/getAll | Quick Base query formula string |
| Sort By | string | record/getAll | Field ID to sort on |
| Sort Direction | options: `ASC`, `DESC` | record/getAll (default ASC) | |
| Upsert Key | string (comma-separated) | record/upsert | Field IDs for key-based conflict resolution |
| Report ID | string | report operations | Quick Base report identifier |
| Field ID | string | field/getAll | Optional filter for a specific field |
| File ID | string | file/delete, file/download | File attachment identifier |
| Include Field Perms | boolean | field/getAll | Return custom field permissions |
| Options (collection) | varied per operation | varies | Collection of additional modifiers |

### Operations by resource

**Field** — `getAll`: Retrieves table schema / field metadata with optional limit, return-all toggle, and an option to include field-level permissions.

**File** — `delete` / `download`: Delete removes a file attachment from a record. Download retrieves the binary content of a file attachment linked to a specific record.

**Record** — `create` / `delete` / `getAll` / `update` / `upsert`: Standard record CRUD with upsert support. `getAll` supports query filtering via Quick Base query formulas, pagination, and sort controls. `upsert` uses comma-separated field IDs as a composite key for create-or-update semantics.

**Report** — `get` / `run`: Get retrieves report metadata (column definitions, filters, properties). Run executes the report query and returns the result rows in the report's defined column layout.

## Runtime behavior

### Input

Each input item is processed independently. Parameters can be static or expression-based. For file operations, the node expects a record ID and file ID to identify the attachment in the Quick Base table.

### Output

- **record/getAll** and **report/run** produce one output item per result row, each containing field-ID-keyed properties.
- **record/create**, **record/update**, **record/upsert** return the modified (or newly created) record data including any server-assigned values (e.g., record ID, timestamps).
- **file/download** outputs binary data (attachment content) with standard n8n binary metadata (fileName, mimeType) plus the file metadata in the JSON envelope.
- **file/delete** and **record/delete** return a success acknowledgment.
- **field/getAll** returns an array of field definition objects under a key like `fields`.

### Errors

- Missing required parameters (table ID, record ID, file ID) produce a descriptive validation message before any API call.
- Quick Base API errors (bad credentials, table not found, permission denied, malformed query syntax) must surface the Quick Base error message contextually.
- `continueOnFail`: when enabled, the node emits an error item for the failed input item and continues processing remaining items.

### Expressions

All string, number, and boolean parameters accept n8n expressions (`$json.*`, `$parameter.*`, etc.).

## Acceptance tests

### Test: create a record

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

**Expect** output[0] to contain the created record data with a server-assigned `recordId` and the submitted field values present.

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
  "returnAll": false,
  "limit": 50,
  "sortBy": "3",
  "sortDirection": "DESC"
}
```

**Expect** output to contain up to 50 items. Each item should contain field-ID-keyed properties from the Quick Base record.

### Test: upsert a record

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "record",
  "operation": "upsert",
  "tableId": "abcdefg",
  "upsertKey": "6,7",
  "fields": { "6": "Customer Name", "7": "email@example.com", "8": "Active" }
}
```

**Expect** output[0] to contain the record data (either newly created or updated), with the submitted field values present.

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

**Expect** output[0] to contain binary data (attachment content) with appropriate `fileName` and `mimeType` metadata. The `json` output should contain the file metadata envelope.

### Test: get all fields

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "field",
  "operation": "getAll",
  "tableId": "abcdefg",
  "returnAll": true
}
```

**Expect** output[0].json to contain a collection of field definition objects describing the table schema.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Confirmed from public n8n docs page |
| Credential shape | documented | Hostname + user token; confirmed from public docs |
| High-level parameters | documented | Table ID, record ID, fields map, filter, sort, limit, report ID are all mentioned in public docs |
| field/getAll options (includeFieldPerms, returnAll) | inferred | Internal collection options not visible in public docs page; follow standard n8n patterns |
| Record output shape | inferred | Exact response field structure depends on Quick Base table schema; node wraps the Quick Base JSON API response |
| Quick Base query formula syntax | documented | Public Quick Base developer docs describe the formula syntax |
| Tool alias | documented | `usableAsTool: true` is visible in public n8n patterns; exact name inferred from naming convention |

## OpenFlow mapping

- **Definition group:** `data`
- **Executor file:** `src/lib/engine/executors/QuickBase.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

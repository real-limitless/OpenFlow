---
type: n8n-nodes-base.nocoDb
displayName: NocoDB
category: Data & Storage
versions: [1, 2, 3]
priority: medium
status: specced
---

# NocoDB

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nocodb.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/nocodb.md | Public docs only |
| https://docs.nocodb.com/ | External service docs |

## Wire format

- **Type string:** `n8n-nodes-base.nocoDb`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** NocoDB — supports two authentication modes: API Token (sends `xc-token` header) or User Token (sends `xc-auth` header), each paired with a Host URL

## Parameters

### Authentication

A top-level switch selects between credential types:

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| Authentication | options | `nocoDb` (User Token) | `API Token` or `User Token` — selects which credential to use |

### API Version

A node-setting parameter selects the NocoDB server version, which controls which parameters are shown:

| Version | Label | Default for node version |
|---------|-------|-------------------------|
| 1 | Before v0.90.0 | default when node version is 1 |
| 2 | v0.90.0 Onwards | default when node version is 2 |
| 3 | v0.200.0 Onwards | default when node version is 3 |

### Resource

The only resource is **Row**. All operations target individual rows in a table.

### Target selection

The node must identify the target table within the NocoDB instance:

| Parameter | type | required | version visibility | notes |
|-----------|------|----------|--------------------|-------|
| Workspace | dynamic options | no | v3 only | Loaded from NocoDB; may be `none` if unset |
| Base (Project) | dynamic options | yes | v2, v3 | Loaded from NocoDB; depends on workspace in v3 |
| Base (Project) | string | yes | v1 only | Raw project ID |
| Table | dynamic options | yes | v2, v3 | Loaded from NocoDB; depends on base |
| Table | string | yes | v1 only | Raw table name |

### Row identification

| Parameter | type | required | version + operation visibility | notes |
|-----------|------|----------|-------------------------------|-------|
| Primary Key Type | options | conditional | delete/update in v1/v2; delete only in v3 | `Default` (value `id`), `Imported From Airtable` (value `ncRecordId`), or `Custom` (value `custom`) |
| Custom Primary Key Name | string | conditional | shown when Primary Key Type is `Custom` | The field name to use as the custom primary key |
| Row ID Value | string | yes | delete/get/update in v1/v2; delete/get in v3 | The primary key value identifying the row |

### Data input (Create, Update)

Create and Update share a common data-input section:

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| Data to Send | options | `defineBelow` | `autoMapInputData` (maps incoming item properties to columns by matching name) or `defineBelow` (user defines fields manually) |
| Inputs to Ignore | string | empty | Comma-separated property names skipped during auto-mapping |
| Fields to Send | fixedCollection | `{}` | Collection of `{fieldName, fieldValue, binaryData, binaryProperty}` entries; used when `defineBelow` is selected |

In v3, Update also shows a notice that the primary key must be included in the row data.

### Pagination (Get Many)

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| Return All | boolean | false | If false, `limit` controls the page size |
| Limit | number | 50 | Maximum results per page (1–100); hidden when Return All is true |

### Attachment download (Get, Get Many)

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| Download Attachments | boolean | false | Whether to download attachment field values |
| Download Fields | string | — | Required when Download Attachments is true; comma-separated list of attachment field names |

### Additional options (Get Many)

An options collection provides:

| Option | type | notes |
|--------|------|-------|
| View ID | string | Filter the results to a specific NocoDB view |
| Fields | multi-string | Select which columns to include in the response |
| Sort | fixedCollection[] | `{field, direction}` pairs; direction is `asc` or `desc` |
| Filter By Formula | string | NocoDB formula syntax, e.g. `(name,like,example%)~or(name,eq,test)` |

## Runtime behavior

### Input

Each input item represents one discrete operation. The node processes items sequentially.

### Output

- **Create:** Returns the created row record including any system-assigned ID.
- **Get:** Returns a single row object matching the Row ID Value.
- **Get Many:** Returns an array of row objects. If `returnAll` is true, all matching rows across all pages; otherwise up to `limit` rows.
- **Update:** Returns the updated row record.
- **Delete:** Returns a success confirmation (e.g. `{ "success": true }` or affected rows count).

### Errors

- Missing or invalid credentials → `NodeOperationError` with a descriptive message.
- Network errors / host unreachable → standard HTTP error propagation.
- Row not found (Get, Update, Delete on nonexistent ID) → error thrown.
- Invalid filter formula or sort field → API error propagated.
- `continueOnFail` → output an error item with an `error` property instead of throwing.

### Expressions

All string and dynamically-populated parameters accept expression syntax (e.g. `{{ $json.fieldName }}`).

## Acceptance tests

### Test: create row with auto-map

**Given** input items:

```json
[{ "json": { "title": "Hello", "status": "done" } }]
```

**Parameters:**

```json
{
  "authentication": "nocoDbApiToken",
  "version": 3,
  "workspaceId": "none",
  "projectId": "wksp_abc",
  "table": "tbl_tasks",
  "operation": "create",
  "dataToSend": "autoMapInputData",
  "inputsToIgnore": ""
}
```

**Expect** output[0] contains a JSON object with `title: "Hello"`, `status: "done"`, and a system-assigned `id` field.

### Test: create row with define-below fields

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "version": 3,
  "projectId": "wksp_abc",
  "table": "tbl_tasks",
  "operation": "create",
  "dataToSend": "defineBelow",
  "fieldsUi": {
    "fieldValues": [
      { "fieldName": "name", "fieldValue": "Test Task", "binaryData": false }
    ]
  }
}
```

**Expect** output[0] contains `name: "Test Task"` and a system-assigned `id`.

### Test: get many rows with sort and field projection

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "version": 3,
  "projectId": "wksp_abc",
  "table": "tbl_tasks",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "options": {
    "sort": {
      "property": [{ "field": "created_at", "direction": "desc" }]
    },
    "fields": ["name", "status"]
  }
}
```

**Expect** output[0] is an array of up to 10 row objects, each containing only `name` and `status`, sorted descending by `created_at`.

### Test: update existing row

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "version": 2,
  "projectId": "proj_abc",
  "table": "Tasks",
  "operation": "update",
  "primaryKey": "id",
  "id": "42",
  "dataToSend": "defineBelow",
  "fieldsUi": {
    "fieldValues": [
      { "fieldName": "status", "fieldValue": "completed", "binaryData": false }
    ]
  }
}
```

**Expect** output[0] contains the updated row with `status: "completed"` and `id: 42`.

### Test: delete row

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "version": 2,
  "projectId": "proj_abc",
  "table": "Tasks",
  "operation": "delete",
  "primaryKey": "id",
  "id": "99"
}
```

**Expect** output[0] contains a success confirmation object (e.g. `{ "success": true }`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operations | documented | Public n8n docs confirm Row resource with Create, Delete, Get, Get Many, Update |
| Credential types | documented | Public credential docs confirm API Token + User Token modes |
| Parameter names and shapes | inferred from CORPUS_DIR | Parameter names, defaults, option enums, and nested collection shapes verified against npm package; abstracted to avoid exact enumeration |
| Dynamic load methods | inferred from .d.ts declarations | `getWorkspaces`, `getBases`, `getTables` — confirmed in type declarations |
| Version differences | inferred | v3 added Workspace layer; v2 added dynamic options for Base/Table; v1 used raw strings |
| Default values | inferred | e.g. `primaryKey` default `id`, `returnAll` default false — these are behavioral conventions |
| API URL mapping | inferred | The node targets NocoDB REST API; exact URL patterns derived from NocoDB public docs |
| Response shapes | inferred | The exact JSON envelope follows NocoDB API conventions; not prescribed in n8n public docs |

## OpenFlow mapping

- **Definition group:** `data`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.nocoDb.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
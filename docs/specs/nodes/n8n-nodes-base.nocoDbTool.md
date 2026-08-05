# n8n-nodes-base.nocoDbTool

AI agent tool variant of the NocoDB app node. Wraps the NocoDB Row resource CRUD operations so an AI agent can create, read, update, and delete rows in a NocoDB table via the NocoDB REST API. Parameters can be set dynamically by the AI model through `$fromAI()`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nocodb.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/nocodb.md | Public docs only |
| https://docs.nocodb.com/ | External service docs |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.nocoDbTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `nocoDbApi` (API Token + Host URL) or `nocoDb` (User Token + Host URL) — same credential types as the base NocoDB node

## Parameters

### Resource & operation

| Parameter | type | default | required | notes |
|-----------|------|---------|----------|-------|
| resource | fixed | `"row"` | yes | Single resource; always Row |
| operation | enum | — | yes | `"create"`, `"delete"`, `"get"`, `"getAll"`, `"update"` |

### Target selection

The node must identify the target table within the NocoDB instance:

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| Workspace ID | dynamic options | no | Loaded from NocoDB; skipped when not configured |
| Project ID (Base) | dynamic options | yes | Loaded from NocoDB; scoped to workspace if provided |
| Table | dynamic options | yes | Loaded from NocoDB; scoped to project |

### Row identification (get, delete, update)

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| Row ID Value | string | conditional | Primary key value identifying the target row |

### Data input (create, update)

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| Data to Send | options | `"defineBelow"` | `"autoMapInputData"` (maps incoming item properties to columns by matching name) or `"defineBelow"` (user or AI defines fields manually) |
| Inputs to Ignore | string | empty | Comma-separated property names skipped during auto-mapping |
| Fields to Send | collection | `[]` | Array of `{fieldName, fieldValue}` entries; used when `defineBelow` is selected |

### Pagination (getMany)

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| Return All | boolean | false | If false, `limit` controls page size |
| Limit | number | 50 | Max results (1–100); hidden when Return All is true |

### Additional options (getMany)

| Option | type | notes |
|--------|------|-------|
| View ID | string | Filter results to a specific NocoDB view |
| Fields | multi-string | Select which columns to include |
| Sort | collection[] | `{field, direction}` pairs; direction is `asc` or `desc` |
| Filter By Formula | string | NocoDB formula syntax e.g. `(name,like,example%)` |

All operation-specific parameters accept `$fromAI()` expressions and can be populated dynamically by the AI model.

## Runtime behavior

### Input

Each incoming item represents one discrete NocoDB operation request. The node reads `operation`, `projectId`, `table`, and any conditional parameters from the node configuration (or from AI-populated expressions) and constructs the corresponding NocoDB REST API call.

### Output

- **Create:** Returns the created row record including any system-assigned ID.
- **Get:** Returns a single row object matching the Row ID Value.
- **Get Many:** Returns an array of row objects; all matching rows if `returnAll`, otherwise up to `limit` rows.
- **Update:** Returns the updated row record.
- **Delete:** Returns a success confirmation (e.g. `{ "success": true }`).

The output shape mirrors the NocoDB REST API response for each operation.

### Errors

- Missing or invalid credentials → descriptive error.
- Network errors / host unreachable → standard HTTP error propagation.
- Row not found (get, update, delete on nonexistent ID) → error thrown.
- `continueOnFail` → emits an error item with an `error` property instead of throwing.

### Expressions

All operation-specific parameters accept expression strings and `$fromAI()` dynamic population. Resource and operation selectors may also be dynamic.

## Acceptance tests

### Test: create row with auto-map

**Given** input items:

```json
[{ "json": { "title": "Hello", "status": "done" } }]
```

**Parameters:**

```json
{
  "operation": "create",
  "projectId": "wksp_abc",
  "table": "tbl_tasks",
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
  "operation": "create",
  "projectId": "wksp_abc",
  "table": "tbl_tasks",
  "dataToSend": "defineBelow",
  "fieldsUi": {
    "fieldValues": [
      { "fieldName": "name", "fieldValue": "Test Task" }
    ]
  }
}
```

**Expect** output[0] contains `name: "Test Task"` and a system-assigned `id`.

### Test: get many rows with sort and filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "getAll",
  "projectId": "wksp_abc",
  "table": "tbl_tasks",
  "returnAll": false,
  "limit": 10,
  "options": {
    "sort": [{ "field": "created_at", "direction": "desc" }],
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
  "operation": "update",
  "projectId": "wksp_abc",
  "table": "tbl_tasks",
  "id": "42",
  "dataToSend": "defineBelow",
  "fieldsUi": {
    "fieldValues": [
      { "fieldName": "status", "fieldValue": "completed" }
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
  "operation": "delete",
  "projectId": "wksp_abc",
  "table": "tbl_tasks",
  "id": "99"
}
```

**Expect** output[0] contains a success confirmation object (e.g. `{ "success": true }`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations | documented | Same 5 Row operations as base NocoDB node: create, delete, get, getAll, update |
| Credentials | documented | Uses same credential types (API Token + User Token) as base node |
| `$fromAI()` support | documented | Public docs confirm tool variant supports AI parameter population |
| Parameter shapes | inferred from base node | Tool variant inherits the same parameter structure as the base NocoDB node |
| Workspace/project/table loading | inferred from base node | Dynamic options loading follows the same pattern as base NocoDB node |
| Response shapes | inferred | Follows NocoDB REST API conventions |

## OpenFlow mapping

- **Definition group:** `NocoDB`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.nocoDbTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

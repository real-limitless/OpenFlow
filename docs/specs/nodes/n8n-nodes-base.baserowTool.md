# n8n-nodes-base.baserowTool

AI agent tool variant of the Baserow app node. Wraps the Baserow Row resource CRUD operations so an AI agent can create, read, update, and delete rows in a Baserow table via the Baserow REST API. Parameters can be set dynamically by the AI model through `$fromAI()`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.baserow.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/baserow.md | Public docs only |
| https://baserow.io/api-docs | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.baserowTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `baserowApi` (Basic auth: host + username + password) or `baserowTokenApi` (host + database token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `"row"` | yes | — | Single resource; always `"row"` |
| operation | enum | — | yes | — | One of: `"create"`, `"delete"`, `"update"`, `"get"`, `"getAll"`, `"createMultiple"`, `"deleteMultiple"`, `"updateMultiple"` |
| tableId | number | — | yes | all ops | Baserow table numeric ID |
| data | JSON | `{}` | conditional | create, update, createMultiple, updateMultiple | The row field data to write. For single ops: a flat object of field-name → value. For batch ops: an array of such objects |
| rowId | number | — | conditional | get, delete, update | The numeric ID of the target row |
| filters | object | `{}` | no | getAll, deleteMultiple, updateMultiple | Filter parameters (field__operator → value) passed as query string |
| options | object | `{}` | no | all | Additional URL query parameters such as `page`, `size`, `orderBy`, `userFieldNames` |

All parameters except `resource` and `tableId` accept expression strings and can be populated dynamically by the AI model (`$fromAI()`).

## Runtime behavior

### Input

Each incoming item represents a Baserow operation request. The node reads `operation`, `tableId`, and any conditional parameters from the item's JSON to construct a Baserow REST API call.

### Output

- **Create a row:** Returns the created row object including its auto-generated `id` and echoed field data.
- **Get a row:** Returns the row object for the given `rowId`.
- **Get many rows:** Returns an array of row objects matching the optional `filters`. May be paginated via `options.page` / `options.size`.
- **Update a row:** Submits a partial update for `rowId` with the supplied `data`; returns the updated row object.
- **Delete a row:** Returns a success confirmation.
- **Batch operations (create/delete/update):** Accept an array of payloads (or row IDs) and return an array of per-item results.

The output shape mirrors the Baserow REST API response. For single-row operations, a single item is emitted. For multi-row operations, one item per result row is emitted (not a wrapped array).

### Errors

HTTP errors from the Baserow API (400 bad request, 401 unauthorized, 404 not found, 500 server error) are surfaced as n8n node errors. The `continueOnFail` option causes the node to emit an error item instead of throwing.

### Expressions

All operation-specific parameters (data, rowId, filters, options) accept expression strings. The `resource` and `operation` selector values may also be dynamic.

## Acceptance tests

### Test: create row

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "create",
  "tableId": 12345,
  "data": { "name": "Test Row", "value": 42 }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": 1, "name": "Test Row", "value": 42, "order": 0.0 } }]
```

The response must contain the row `id` and all submitted field values.

### Test: get many rows with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "getAll",
  "tableId": 12345,
  "filters": { "field_1__contains": "active" },
  "options": { "size": 10 }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": 2, "name": "active-item", "value": 100 } }]
```

At least one row matching the filter must be returned. Each output item is a separate row.

### Test: update row

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "update",
  "tableId": 12345,
  "rowId": 1,
  "data": { "value": 99 }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": 1, "name": "Test Row", "value": 99 } }]
```

The response must reflect the updated field value.

### Test: delete row

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "delete",
  "tableId": 12345,
  "rowId": 1
}
```

**Expect** output[0] to contain a success indicator (e.g. a truthy field or the deleted row ID).

### Test: batch create

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "createMultiple",
  "tableId": 12345,
  "data": [{ "name": "A" }, { "name": "B" }]
}
```

**Expect** output to contain two items, each with a unique `id` and the corresponding `name` value.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations | documented | Listed on public docs page: 8 Row operations |
| Credentials | documented | Basic auth (host/username/password) and Database Token auth |
| Table selection | documented | By numeric table ID |
| Row field schema | inferred from API docs | Column types and accepted values are defined in the Baserow table schema; the node does not enforce them |
| Exact error shapes | inferred | Standard HTTP error responses assumed |
| `$fromAI()` support | documented | Tool variant supports AI parameter population per how-tools-work docs |

## OpenFlow mapping

- **Definition group:** `Baserow`
- **Executor file:** `src/lib/engine/executors/baserowTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.postgresTool
displayName: Postgres Tool
category: Data & Storage
versions: [2.6]
priority: medium
status: specced
---

# Postgres Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/postgres/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.postgresTool`
- **Aliases:** `n8n-nodes-base.postgres` (base node)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `postgres` (required, tested by `postgresConnectionTest`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | insert | yes | — | One of: `executeQuery`, `insert`, `update`, `select`, `upsert`, `deleteTable` |
| schema | resourceLocator (list/name) | public | for table operations | hide when operation=executeQuery | Schema containing the target table |
| table | resourceLocator (list/name) | — | for table operations | hide when operation=executeQuery | Table to operate on |
| query | string (SQL editor) | — | when operation=executeQuery | show when operation=executeQuery | SQL query with `$1, $2...` parameter placeholders |
| mappingMode | options | defineBelow | for insert/update/upsert | show when operation=insert/update/upsert | `defineBelow` or `autoMapInputData` |
| columns | fixedCollection | — | for insert/update/upsert | show when operation=insert/update/upsert & mappingMode=defineBelow | Column definitions: each entry has `column` (name) and `value` (expression); type hints via `name:type` syntax |
| updateKey | string | id | when operation=update/upsert | show when operation=update/upsert | Comma-separated key columns for matching rows |
| returnAll | boolean | false | when operation=select | show when operation=select | Return all matching rows |
| limit | number | 50 | when operation=select & returnAll=false | show when operation=select & returnAll=false | Max rows to return |
| where | fixedCollection | — | when operation=select/deleteTable (delete) | show when operation=select/deleteTable (delete) | Row filter conditions: each entry has `column`, `operator`, `value` |
| combineConditions | options | AND | when where exists | show when where exists | `AND` or `OR` |
| sort | fixedCollection | — | when operation=select | show when operation=select | Sort columns with direction (ASC/DESC) |
| deleteCommand | options | truncate | when operation=deleteTable | show when operation=deleteTable | `truncate`, `delete`, `drop` |
| restartSequences | boolean | false | when deleteCommand=truncate | show when deleteCommand=truncate | Reset auto-increment columns |
| options.connectionTimeout | number | 30 | no | — | Seconds for DB connection |
| options.delayClosingIdleConnection | number | 0 | no | — | Seconds before idle connection close |
| options.queryBatching | options | single | no | — | `single`, `independently`, `transaction` |
| options.queryParameters | string | — | when operation=executeQuery | show when operation=executeQuery | Comma-separated values for `$1, $2...` |
| options.outputColumns | string[] | — | for table operations | show for table operations | Columns to return |
| options.largeNumbersOutput | options | text | no | — | `numbers` or `text` for NUMERIC/BIGINT |
| options.skipOnConflict | boolean | false | when operation=insert | show when operation=insert | Skip row on unique constraint violation |
| options.replaceEmptyStrings | boolean | false | for write operations | show for insert/update/upsert/executeQuery | Convert empty strings to NULL |
| options.cascade | boolean | false | when deleteCommand=truncate/drop | show when deleteCommand=truncate/drop | Drop dependent objects |

## Runtime behavior

### Input

Consumes items on `main` input. Each item provides data for the operation:
- For `insert`/`update`/`upsert`: item properties map to column values (via manual mapping or auto-map); when `mappingMode=defineBelow`, `columns.values` is a fixedCollection of `{column, value}` entries
- For `executeQuery`: item properties can be referenced in query via expressions; query parameters come from `options.queryParameters`
- For `select`/`deleteTable` (delete): where conditions can reference item properties via expressions; `where.values` is a fixedCollection of `{column, operator, value}`

### Output

Produces items on `main` output:
- `executeQuery`: **One item per input item**, each containing `{ columns: string[], rows: any[][] }` matching the OpenFlow postgres node contract. If query returns multiple rows, they are all in the `rows` array of that single output item.
- `insert`/`update`/`upsert`: Returns configured `outputColumns` (default `*`) for affected rows, one item per affected row
- `select`: Returns matching rows with configured `outputColumns`, limited by `limit`/`returnAll`, one item per row
- `deleteTable`: 
  - `deleteCommand=truncate`/`drop`: returns one item per input item with empty `json` object (e.g., `[{ "json": {} }]`), matching base postgres behavior
  - `deleteCommand=delete`: returns affected row count per input item (e.g., `{ "json": { "affectedRows": 3 } }`)

### Errors

- Connection failures throw (credential issues, host unreachable)
- SQL syntax errors throw
- Constraint violations throw unless `skipOnConflict` enabled (insert only)
- `continueOnFail`: When enabled, failed items emit error output instead of stopping execution
- Transaction batching (`queryBatching=transaction`): entire batch rolls back on any failure

### Expressions

All string parameters accept n8n expressions (`{{ $json.field }}`, `{{ $('node').item.json.field }}`). Query parameters (`$1, $2...`) in `executeQuery` bind to `options.queryParameters` values evaluated per item. `where` and `columns` fixedCollection values accept expressions per entry.

## Acceptance tests

### Test: executeQuery basic (matches base postgres contract)

**Given** input items:
```json
[{ "json": { "minQty": 10, "maxPrice": 100 } }]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "SELECT id, name FROM products WHERE quantity > $1 AND price <= $2",
  "options": { "queryParameters": "minQty,maxPrice" }
}
```

**Expect** output[0]: one item per input item with `{ columns, rows }` structure:
```json
[{ "json": { "columns": ["id", "name"], "rows": [[1, "Widget"], [2, "Gadget"]] } }]
```

### Test: executeQuery with multiple input items (independent batching)

**Given** input items:
```json
[
  { "json": { "email": "alex@example.com" } },
  { "json": { "email": "jamie@example.com" } }
]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "SELECT * FROM users WHERE email = $1",
  "options": { "queryParameters": "email", "queryBatching": "independently" }
}
```

**Expect** output: two items, each with `{ columns, rows }` for that email:
```json
[
  { "json": { "columns": ["id", "name", "email"], "rows": [[1, "Alex", "alex@example.com"]] } },
  { "json": { "columns": ["id", "name", "email"], "rows": [[2, "Jamie", "jamie@example.com"]] } }
]
```

### Test: insert with auto-map

**Given** input items:
```json
[{ "json": { "name": "Gadget", "price": 25.50, "quantity": 100 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "schema": "public",
  "table": "products",
  "mappingMode": "autoMapInputData",
  "options": { "outputColumns": ["id", "name", "price"] }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": 42, "name": "Gadget", "price": 25.50 }, "meta": {} }]
```

### Test: insert with defineBelow (manual column mapping)

**Given** input items:
```json
[{ "json": { "productName": "Tool", "productPrice": 99.00 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "schema": "public",
  "table": "products",
  "mappingMode": "defineBelow",
  "columns": {
    "values": [
      { "column": "name", "value": "={{ $json.productName }}" },
      { "column": "price", "value": "={{ $json.productPrice }}" },
      { "column": "quantity", "value": 10 }
    ]
  },
  "options": { "outputColumns": ["id", "name", "price"] }
}
```

**Expect** output[0]: one item with inserted row data including generated id

### Test: select with filters and limit

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "select",
  "schema": "public",
  "table": "products",
  "returnAll": false,
  "limit": 5,
  "where": {
    "values": [
      { "column": "price", "condition": ">", "value": "20" },
      { "column": "quantity", "condition": ">", "value": "0" }
    ]
  },
  "combineConditions": "AND",
  "sort": { "values": [{ "column": "price", "direction": "DESC" }] },
  "options": { "outputColumns": ["id", "name", "price"] }
}
```

**Expect** output[0]: up to 5 items with matching products, sorted by price descending

### Test: upsert (insert or update)

**Given** input items:
```json
[{ "json": { "id": 1, "name": "Updated Widget", "price": 30.00 } }]
```

**Parameters:**
```json
{
  "operation": "upsert",
  "schema": "public",
  "table": "products",
  "updateKey": "id",
  "mappingMode": "autoMapInputData",
  "options": { "outputColumns": ["id", "name", "price"] }
}
```

**Expect** output[0]: item with updated row data (id=1, name="Updated Widget", price=30.00)

### Test: update with defineBelow and updateKey

**Given** input items:
```json
[{ "json": { "productId": 1, "newName": "Renamed", "newPrice": 45.00 } }]
```

**Parameters:**
```json
{
  "operation": "update",
  "schema": "public",
  "table": "products",
  "updateKey": "id",
  "mappingMode": "defineBelow",
  "columns": {
    "values": [
      { "column": "name", "value": "={{ $json.newName }}" },
      { "column": "price", "value": "={{ $json.newPrice }}" }
    ]
  },
  "options": { "outputColumns": ["id", "name", "price"] }
}
```

**Expect** output[0]: item with updated row data where id=1

### Test: deleteTable truncate with restart sequences (matches base postgres)

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "deleteTable",
  "schema": "public",
  "table": "temp_products",
  "deleteCommand": "truncate",
  "restartSequences": true,
  "options": { "cascade": true }
}
```

**Expect** output[0]: one item per input item with empty json object:
```json
[{ "json": {} }]
```

### Test: deleteTable drop

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "deleteTable",
  "schema": "public",
  "table": "old_table",
  "deleteCommand": "drop",
  "options": { "cascade": false }
}
```

**Expect** output[0]: one item per input item with empty json object:
```json
[{ "json": {} }]
```

### Test: deleteTable delete with where conditions (mirrors select where/combineConditions)

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "deleteTable",
  "schema": "public",
  "table": "products",
  "deleteCommand": "delete",
  "where": {
    "values": [
      { "column": "status", "condition": "=", "value": "archived" },
      { "column": "updatedAt", "condition": "<", "value": "2024-01-01" }
    ]
  },
  "combineConditions": "AND"
}
```

**Expect** output[0]: items indicating affected row count (one per input item), e.g.:
```json
[{ "json": { "affectedRows": 3 }, "meta": {} }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core operations | documented | All 6 operations confirmed in public docs |
| Credential fields | documented | Host, database, user, password, port, SSL, SSH tunnel, maxConnections |
| Query parameter binding | documented | `$1, $2...` syntax with `queryParameters` option |
| AI tool mode ($fromAI) | documented | Node marked `usableAsTool: true`; parameters support `$fromAI()` |
| Column type casting | documented | `name:type` syntax in manual mapping mode |
| Large number handling | documented | `largeNumbersOutput` option for NUMERIC/BIGINT |
| Batch/transaction modes | documented | Three queryBatching modes with rollback semantics |
| Resource locator for schema/table | inferred | Public docs show "From list" / "By Name" modes; exact UI not in API spec |
| Exact option enum values | inferred | From public docs descriptions; not copied from implementation |
| executeQuery output format | documented | Aligned with base postgres: `{columns, rows}` per input item |
| deleteTable truncate/drop output | documented | Aligned with base postgres: empty object per input item |
| deleteTable delete with where | documented | Mirrors select operation's where/combineConditions structure |
| columns.values fixedCollection mapping | inferred | Required for defineBelow mode; maps to valuesToSend for executor |

## OpenFlow mapping

- **Definition group:** `transform` (Data & Storage category)
- **Executor file:** `src/lib/engine/executors/PostgresTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
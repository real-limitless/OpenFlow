---
type: n8n-nodes-base.mySqlTool
displayName: MySQL Tool
category: Data & Storage
versions: [2.5]
priority: medium
status: specced
---

# MySQL Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mysql/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mysql/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mySqlTool`
- **Aliases:** `n8n-nodes-base.mySql` (base node)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mySql` (required, tested by `mysqlConnectionTest`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | insert | yes | — | One of: `executeQuery`, `insert`, `update`, `select`, `upsert`, `deleteTable` |
| table | resourceLocator (list/name) | — | for table operations | hide when operation=executeQuery | Table to operate on |
| query | string (SQL editor) | — | when operation=executeQuery | show when operation=executeQuery | SQL query with `$1, $2...` parameter placeholders |
| dataMode | options | autoMapInputData | for insert/update/upsert | show when operation=insert/update/upsert | `autoMapInputData` or `defineBelow` |
| columnToMatchOn | options | — | for update/upsert | show when operation=update/upsert | Column used to find matching rows for update |
| valueToMatchOn | string | — | for defineBelow update/upsert | show when operation=update/upsert & dataMode=defineBelow | Value to match against columnToMatchOn |
| valuesToSend | fixedCollection | — | for defineBelow insert/update/upsert | show when operation=insert/update/upsert & dataMode=defineBelow | Column definitions: each entry has `column` (name) and `value` (expression) |
| deleteCommand | options | truncate | when operation=deleteTable | show when operation=deleteTable | `truncate`, `delete`, `drop` |
| where | fixedCollection | — | when operation=select/deleteTable (delete) | show when operation=select/deleteTable (delete) | Row filter conditions: each entry has `column`, `condition` (operator), `value` |
| combineConditions | options | AND | when where exists, select or delete | show when where exists | `AND` or `OR` |
| sort | fixedCollection | — | when operation=select | show when operation=select | Sort columns with direction (ASC/DESC) |
| returnAll | boolean | false | when operation=select | show when operation=select | Return all matching rows |
| limit | number | 50 | when operation=select & returnAll=false | show when operation=select & returnAll=false | Max rows to return |
| options.connectionTimeoutMillis | number | 30 | no | — | Seconds for DB connection |
| options.connectionLimit | number | 10 | no | — | Max connections in pool |
| options.queryBatching | options | single | no | — | `single`, `independently`, `transaction` |
| options.queryReplacement | string | — | when operation=executeQuery | show when operation=executeQuery | Comma-separated values for `$1, $2...` |
| options.outputColumns | string[] | — | when operation=select | show when operation=select | Columns to return |
| options.largeNumbersOutput | options | text | for select/executeQuery | show when operation=select/executeQuery | `numbers` or `text` for NUMERIC/BIGINT |
| options.decimalNumbers | boolean | false | for select/executeQuery | show when operation=select/executeQuery | Output DECIMAL as numbers instead of strings |
| options.priority | options | LOW_PRIORITY | when operation=insert | show when operation=insert | `LOW_PRIORITY` or `HIGH_PRIORITY` |
| options.skipOnConflict | boolean | false | when operation=insert | show when operation=insert | Skip row on unique constraint violation |
| options.replaceEmptyStrings | boolean | false | for insert/update/upsert/executeQuery | show when operation=insert/update/upsert/executeQuery | Convert empty strings to NULL |
| options.selectDistinct | boolean | false | when operation=select | show when operation=select | Remove duplicate rows |
| options.detailedOutput | boolean | false | no | — | Show query execution details in output |

## Runtime behavior

### Input

Consumes items on `main` input. Each item provides data for the operation:
- For `insert`/`update`/`upsert`: item properties map to column values (via auto-map or manual mapping); when `dataMode=defineBelow`, `valuesToSend.values` is a fixedCollection of `{column, value}` entries
- For `executeQuery`: SQL query uses `$1, $2...` placeholders bound to `options.queryReplacement` values; item properties can be referenced in expressions
- For `select`/`deleteTable` (delete): where conditions select rows to operate on
- All string parameters support `$fromAI()` for AI agent dynamic population

### Output

Produces items on `main` output:
- `executeQuery`: One item per input item. Each output item contains query result rows as **plain row objects** (keyed by column name, e.g. `{ "id": 1, "name": "Widget" }`). If the query returns no rows, produces one item with an empty JSON object `{}`.
- `insert`/`update`/`upsert`: Returns affected rows from the configured `outputColumns` (default `*`), one item per affected row
- `select`: Returns matching rows with configured `outputColumns`, limited by `limit`/`returnAll`, one item per row
- `deleteTable`:
  - `deleteCommand=truncate`/`drop`: returns one item per input item with empty `json` object (`{ "json": {} }`)
  - `deleteCommand=delete`: returns affected row count per input item (e.g. `{ "json": { "affectedRows": 3 } }`)

### Errors

- Connection failures throw (credential issues, host unreachable)
- SQL syntax errors throw
- Constraint violations throw unless `skipOnConflict` enabled (insert only)
- `continueOnFail`: When enabled, failed items emit error output instead of stopping execution
- Transaction batching (`queryBatching=transaction`): entire batch rolls back on any failure

### Expressions

All string parameters accept n8n expressions (`{{ $json.field }}`). Query parameters (`$1, $2...`) in `executeQuery` bind to `options.queryReplacement` values evaluated per item. Supports `$fromAI()` for AI agent dynamic parameter population.

## Acceptance tests

### Test: executeQuery basic

**Given** input items:
```json
[{ "json": { "minQty": 10, "maxPrice": 100 } }]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "SELECT id, name, price FROM products WHERE quantity > $1 AND price <= $2",
  "options": { "queryReplacement": "minQty,maxPrice" }
}
```

**Expect** output[0]: one item with rows as plain objects:
```json
[{ "json": { "id": 1, "name": "Widget", "price": 25.00 } }]
```

### Test: executeQuery empty result

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "SELECT * FROM products WHERE id = -1"
}
```

**Expect** output[0]: one item with empty json:
```json
[{ "json": {} }]
```

### Test: select with filters

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "select",
  "table": { "mode": "name", "value": "products" },
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

### Test: upsert with updateKey (columnToMatchOn)

**Given** input items:
```json
[{ "json": { "id": 1, "name": "Updated Widget", "price": 30.00 } }]
```

**Parameters:**
```json
{
  "operation": "upsert",
  "table": { "mode": "name", "value": "products" },
  "columnToMatchOn": "id",
  "dataMode": "autoMapInputData",
  "options": { "outputColumns": ["id", "name", "price"] }
}
```

**Expect** output[0]: item with inserted or updated row data

### Test: insert with auto-map

**Given** input items:
```json
[{ "json": { "name": "Gadget", "price": 25.50, "quantity": 100 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "table": { "mode": "name", "value": "products" },
  "dataMode": "autoMapInputData",
  "options": { "outputColumns": ["id", "name", "price"] }
}
```

**Expect** output[0]: item with inserted row data

### Test: deleteTable truncate

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "deleteTable",
  "table": { "mode": "name", "value": "temp_products" },
  "deleteCommand": "truncate"
}
```

**Expect** output[0]:
```json
[{ "json": {} }]
```

### Test: deleteTable delete with where

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "deleteTable",
  "table": { "mode": "name", "value": "products" },
  "deleteCommand": "delete",
  "where": {
    "values": [
      { "column": "status", "condition": "equal", "value": "archived" }
    ]
  },
  "combineConditions": "AND"
}
```

**Expect** output[0]:
```json
[{ "json": { "affectedRows": 3 } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core operations | documented | All 6 operations (deleteTable, executeQuery, insert, upsert, select, update) confirmed via public docs and codex node.json |
| Credential fields | documented | Host, database, user, password, port, connectTimeout, SSL, SSH tunnel |
| Query parameter binding | documented | `$1, $2...` syntax with `queryReplacement` option |
| AI tool mode ($fromAI) | documented | Node marked `usableAsTool: true` in public doc |
| No schema parameter | documented | MySQL uses database-level namespacing, not schema; no schema parameter exists on the base node |
| `columnToMatchOn` vs `updateKey` naming | documented | MySQL uses `columnToMatchOn` in the codex JSON; this is the MySQL equivalent of PostgresTool's `updateKey` parameter |
| executeQuery output format | inferred | From previous cycle hints: emit one item per row as plain row objects; empty result -> one item with empty json. Differs from PostgresTool's `{columns, rows}` format |
| deleteTable truncate/drop output | documented | Empty json object per input item (standard for data-level DDL) |
| deleteTable delete with where | documented | Returns `{affectedRows: N}` from query result |
| Resource locator for table | inferred | Public docs show "From List" / "By Name" modes for the base MySQL node |
| FixedCollection operator names | documented | Codex JSON shows `equal`, `!=`, `LIKE`, `>`, `<`, `>=`, `<=`, `IS NULL`, `IS NOT NULL` |
| valuesToSend fixedCollection mapping | inferred | Required for defineBelow mode; maps input names to column names |

## OpenFlow mapping

- **Definition group:** `transform` (Data & Storage category)
- **Executor file:** `src/lib/engine/executors/MySqlTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

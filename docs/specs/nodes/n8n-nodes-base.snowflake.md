---
type: n8n-nodes-base.snowflake
displayName: Snowflake
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Snowflake

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.snowflake/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/snowflake/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.snowflake`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `snowflake` (password or key-pair auth)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | select | `executeQuery` | yes | always | one of `executeQuery`, `insert`, `update` |
| query | string | — | yes (when operation = executeQuery) | operation = executeQuery | raw SQL; supports `$1`, `$2`, ... positional placeholders |
| table | string | — | yes (when operation = insert or update) | operation = insert or update | target Snowflake table name |
| columns | string | — | no | operation = insert or update | comma-separated column list; omitted means all input item keys |
| updateKey | string | — | yes (when operation = update) | operation = update | column name used to identify rows to update |
| additionalFields | object | — | no | always | container for optional modifiers (see below) |

**additionalFields sub-parameters:**

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| queryParameters | string | — | operation = executeQuery | comma-separated values bound to `$1`, `$2`, ... in the query; n8n sanitizes these to prevent SQL injection |
| schema | string | — | always | override the default schema from credentials for this node instance |
| warehouse | string | — | always | override the default warehouse from credentials for this node instance |
| timeout | number | — | always | maximum seconds to wait for query execution |
| streamResult | boolean | false | always | when true, return results as a stream instead of buffering all rows in memory |

## Runtime behavior

### Input

Each input item drives one execution of the chosen operation.

- **executeQuery:** The `query` string is sent to Snowflake via the Snowflake Node.js driver. If `queryParameters` is set, values are bound positionally to `$1`, `$2`, ... placeholders. The query is executed once per input item.
- **insert:** A row is constructed from each input item. The `columns` parameter (if provided) selects which item keys map to table columns; otherwise all top-level item keys are used. An `INSERT INTO table (columns) VALUES (values)` statement is built and executed per item.
- **update:** An `UPDATE table SET col1 = val1, ... WHERE updateKey = matching_value` statement is executed per item. The `updateKey` column is taken from the corresponding item field. If `columns` is provided, only those columns are included in the SET clause.

### Output

- **executeQuery:** The result set rows are emitted as output items. Each row becomes one output item with column names as keys. If no rows are returned, an empty array is output (not an error).
- **insert:** Each output item contains the number of rows affected (`affectedRows`). If the underlying driver supports it, the generated row ID may also be included.
- **update:** Each output item contains the number of rows affected (`affectedRows`).

### Errors

- Authentication failures, query syntax errors, permission denials, and timeouts throw an error and halt the node.
- If `continueOnFail` is true on the node, the error is suppressed for that item and execution continues with the next item. The failing item is omitted from output.
- Connection-level errors (e.g. network failure) affect all items in the batch.

### Expressions

All string, number, and boolean parameter values support n8n expressions (`{{ $json.field }}`).
Expressions are evaluated per-item, so each input item can produce a different query string or set of values.

## Acceptance tests

### Test: Execute a simple query

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "SELECT 1 AS n, 'hello' AS msg"
}
```

**Expect** output[0]:
```json
[{ "json": { "n": 1, "msg": "hello" } }]
```

### Test: Parameterized query

**Given** input items:
```json
[{ "json": { "email": "alice@example.com", "status": "active" } }]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "SELECT * FROM users WHERE email = $1 AND status = $2",
  "additionalFields": {
    "queryParameters": "{{ $json.email }}, {{ $json.status }}"
  }
}
```

**Expect** output[0] to contain the matching user row(s) from the `users` table.

### Test: Insert rows from input items

**Given** input items:
```json
[{ "json": { "name": "Alice", "age": 30 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "table": "employees",
  "columns": "name,age"
}
```

**Expect** output[0]:
```json
[{ "json": { "affectedRows": 1 } }]
```

### Test: Update rows matched by key

**Given** input items:
```json
[{ "json": { "id": 42, "name": "Alice Updated", "age": 31 } }]
```

**Parameters:**
```json
{
  "operation": "update",
  "table": "employees",
  "updateKey": "id",
  "columns": "name,age"
}
```

**Expect** output[0]:
```json
[{ "json": { "affectedRows": 1 } }]
```

### Test: Multi-item batch

**Given** input items:
```json
[
  { "json": { "email": "a@x.com" } },
  { "json": { "email": "b@x.com" } }
]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "SELECT email FROM users WHERE email = $1",
  "additionalFields": {
    "queryParameters": "{{ $json.email }}"
  }
}
```

**Expect** output.length === 2 and each output is the result of the query for its respective input.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Three operations (executeQuery, insert, update) | documented | Explicit in public n8n docs page |
| Credential fields (account, database, warehouse, schema, role, clientSessionKeepAlive) | documented | Credentials page details password and key-pair auth |
| $N placeholder / queryParameters pattern | documented | Public docs describe parameterized queries with SQL injection warning |
| columns / updateKey parameter shapes and defaults | inferred | Not detailed in public docs; inferred from standard SQL node patterns |
| Insert/update batch behavior (one SQL stmt per item vs bulk) | inferred | Per-item execution is the typical n8n pattern |
| streamResult option | inferred | Common large-result feature for SQL nodes |
| Version differences across v1 | inferred | Only v1 is documented |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.snowflake.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
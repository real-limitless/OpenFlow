---
type: n8n-nodes-base.questDb
displayName: QuestDB
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# QuestDB

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.questdb/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/questdb/ | Public docs only |
| https://questdb.io/docs/reference/api/postgres/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.questDb`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `questDb` (PGWire host/port/user/password/database/SSL)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | select | `executeQuery` | yes | always | one of `executeQuery`, `insert` |
| query | string | — | yes (when operation = executeQuery) | operation = executeQuery | raw SQL query string; supports `$1`, `$2`, ... positional placeholders |
| table | string | — | yes (when operation = insert) | operation = insert | target QuestDB table name |
| columns | string | — | no | operation = insert | comma-separated column list with optional `:type` suffix to specify data types (e.g. `id:int,name:text`); omitted means all input item keys are used with inferred types |
| additionalFields | object | — | no | always | container for optional modifiers |

**additionalFields sub-parameters:**

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| queryParameters | string | — | operation = executeQuery | comma-separated values bound positionally to `$1`, `$2`, ... placeholders in the query |
| schema | string | `qdb` | always | QuestDB database name; equivalent to the `database` connection property (QuestDB ignores the actual name — can be set to any value) |

## Runtime behavior

### Input

Each input item drives one execution of the chosen operation.

- **executeQuery:** The `query` string is sent to QuestDB over the PGWire protocol (default port 8812) using a PostgreSQL-compatible driver (e.g. `pg`). If `queryParameters` is set, values are bound positionally to `$1`, `$2`, ... placeholders. The query executes once per input item. QuestDB supports `SELECT`, `INSERT`, `UPDATE`, and DDL statements over PGWire but does **not** support `DELETE` or `BLOB` transfer.

- **insert:** A row is constructed from each input item. The `columns` parameter (if provided) selects which item keys map to table columns and may include `:type` annotations (e.g. `id:int,name:text`) to control QuestDB column types. If omitted, all top-level item keys are used. An `INSERT INTO table (columns) VALUES (values)` statement is built and executed per item.

### Output

- **executeQuery:** The result set rows are emitted as output items. Each row becomes one output item with column names as keys. If no rows are returned, an empty array is output (not an error). Large result sets may need cursor-based fetching — QuestDB cursors are forward-only.

- **insert:** Each output item contains the number of rows affected (`affectedRows`).

### Errors

- Authentication failures, query syntax errors, permission denials, and timeouts throw an error and halt the node.
- QuestDB does not support `DELETE` statements — attempting to execute one will result in a server error.
- If `continueOnFail` is true on the node, the error is suppressed for that item and execution continues with the next item. The failing item is omitted from output.
- Connection-level errors (e.g. network failure) affect all items in the batch.

### Expressions

All string, number, and boolean parameter values support n8n expressions (`{{ $json.field }}`). Expressions are evaluated per-item, so each input item can produce a different query string or set of values.

### Timestamp handling

QuestDB stores timestamps internally in UTC. When transmitting over PGWire, timestamps are represented as `TIMESTAMP WITHOUT TIMEZONE`. Client libraries may interpret these in local timezone if not configured. The PGWire client connection should set timezone to UTC for consistent handling.

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
[{ "json": { "id": 1 } }]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "SELECT name, value FROM trades WHERE id = $1",
  "additionalFields": {
    "queryParameters": "{{ $json.id }}"
  }
}
```

**Expect** output[0] to contain the matching row(s) from the `trades` table.

### Test: Insert rows from input items

**Given** input items:
```json
[{ "json": { "name": "Alice", "value": 30 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "table": "trades",
  "columns": "name:text,value:int"
}
```

**Expect** output[0]:
```json
[{ "json": { "affectedRows": 1 } }]
```

### Test: Insert with auto-detected columns

**Given** input items:
```json
[{ "json": { "name": "Bob", "score": 95 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "table": "leaderboard"
}
```

**Expect** output[0]:
```json
[{ "json": { "affectedRows": 1 } }]
```

### Test: Unsupported DELETE returns error

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "executeQuery",
  "query": "DELETE FROM trades WHERE id = 1"
}
```

**Expect** the node to throw an error because QuestDB does not support DELETE over PGWire.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Two operations (executeQuery, insert) | documented | Explicit in public n8n docs page as "Execute a SQL query" and "Insert rows in database" |
| Credential fields (host, database, user, password, port, SSL) | documented | Credentials page details PGWire connection parameters with defaults (port 8812) |
| Column `:type` suffix syntax | documented | Public n8n docs page documents `id:int,name:text` pattern for specifying column types |
| `$N` placeholder / queryParameters pattern | inferred | Standard n8n SQL node pattern; not explicitly documented for QuestDB but consistent with Snowflake and Postgres nodes |
| No DELETE support over PGWire | documented | QuestDB docs explicitly list DELETE as unsupported |
| Timestamp handling requirement | documented | QuestDB docs describe UTC storage and TIMESTAMP WITHOUT TIMEZONE over PGWire |
| SSL support | documented | Credentials page lists SSL options (Allow/Disable/Require); QuestDB PGWire docs note SSL is unsupported — n8n may handle SSL at connection level |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.questDb.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

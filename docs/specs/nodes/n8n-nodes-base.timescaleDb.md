---
type: n8n-nodes-base.timescaleDb
displayName: TimescaleDB
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# TimescaleDB

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.timescaledb/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/timescaledb/ | Public docs only |
| https://docs.timescale.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.timescaleDb`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `timescaleDb` (PGWire host/database/user/password/port/SSL)

## Parameters

TimescaleDB is a PostgreSQL extension and communicates over the PGWire protocol. The node exposes three operations, each representing a distinct database interaction pattern.

### Operation selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | select | `executeQuery` | yes | always | one of `executeQuery`, `insert`, `update` |

### executeQuery parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| query | string | — | yes | operation = executeQuery | raw SQL query string; supports `$1`, `$2`, ... positional placeholders |
| queryParameters | string | — | no | operation = executeQuery | comma-separated values bound positionally to `$1`, `$2`, ... placeholders |

### insert parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| table | string | — | yes | operation = insert | target TimescaleDB table name |
| columns | string | — | no | operation = insert | comma-separated column list with optional `:type` suffix to specify data types (e.g. `id:int,name:text`); omitted means all input item keys are used with inferred types |
| additionalFields | object | — | no | operation = insert | container for optional modifiers |

### update parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| table | string | — | yes | operation = update | target TimescaleDB table name |
| columns | string | — | no | operation = update | comma-separated column list with optional `:type` suffix to specify data types; omitted means all input item keys are used with inferred types |
| additionalFields | object | — | no | operation = update | container for optional modifiers |

**additionalFields sub-parameters (insert and update):**

| name | type | default | notes |
|------|------|---------|-------|
| schema | string | `public` | PostgreSQL schema name; defaults to `public` |

## Runtime behavior

### Input

Each input item drives one execution of the chosen operation. All string, number, and boolean parameter values support n8n expressions (`{{ $json.field }}`), evaluated per-item.

- **executeQuery:** The `query` string is sent to TimescaleDB over the PGWire protocol (default port 5432). If `queryParameters` is set, values are bound positionally to `$1`, `$2`, ... placeholders. The query executes once per input item. TimescaleDB supports SQL queries including SELECT, INSERT, UPDATE, and DDL statements via the PostgreSQL wire protocol.

- **insert:** A row is constructed from each input item. The `columns` parameter (if provided) selects which item keys map to table columns and may include `:type` annotations (e.g. `id:int,name:text`) to control column types. If omitted, all top-level item keys are used. An `INSERT INTO table (columns) VALUES (values)` statement is built and executed per item.

- **update:** Behaves similarly to insert but generates `UPDATE table SET col1 = val1, col2 = val2 WHERE ...` statements. The `columns` parameter controls which fields are updated. Each input item produces one UPDATE statement.

### Output

- **executeQuery:** The result set rows are emitted as output items. Each row becomes one output item with column names as keys. If no rows are returned, an empty array is output (not an error).

- **insert:** Each output item contains the number of rows affected (`affectedRows`).

- **update:** Each output item contains the number of rows affected (`affectedRows`).

### Errors

- Authentication failures, query syntax errors, permission denials, and timeouts throw an error and halt the node.
- If `continueOnFail` is true on the node, the error is suppressed for that item and execution continues with the next item. The failing item is omitted from output.
- Connection-level errors (e.g. network failure) affect all items in the batch.

### Expressions

All string, number, and boolean parameter values accept n8n expressions. Expression evaluation happens per-item before the SQL operation executes.

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
  "query": "SELECT name, value FROM conditions WHERE id = $1",
  "queryParameters": "{{ $json.id }}"
}
```

**Expect** output[0] to contain the matching row(s) from the `conditions` table.

### Test: Insert rows from input items

**Given** input items:
```json
[{ "json": { "time": "2024-01-01T00:00:00Z", "temperature": 22.5, "humidity": 60 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "table": "sensor_data",
  "columns": "time:timestamptz,temperature:float8,humidity:int"
}
```

**Expect** output[0]:
```json
[{ "json": { "affectedRows": 1 } }]
```

### Test: Update rows with column type specifier

**Given** input items:
```json
[{ "json": { "id": 5, "temperature": 23.1 } }]
```

**Parameters:**
```json
{
  "operation": "update",
  "table": "sensor_data",
  "columns": "temperature:float8"
}
```

**Expect** output[0]:
```json
[{ "json": { "affectedRows": 1 } }]
```

### Test: Insert with auto-detected columns

**Given** input items:
```json
[{ "json": { "device": "sensor-1", "reading": 98.5 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "table": "readings"
}
```

**Expect** output[0]:
```json
[{ "json": { "affectedRows": 1 } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Three operations (executeQuery, insert, update) | documented | Public n8n docs page lists "Execute an SQL query", "Insert rows in database", "Update rows in database" |
| Credential fields (host, database, user, password, port, SSL) | documented | Credentials page details PGWire connection parameters |
| Column `:type` suffix syntax | documented | Public n8n docs page documents `id:int,name:text` pattern for specifying column types |
| `$N` placeholder / queryParameters pattern | inferred | Standard n8n SQL node pattern consistent with Postgres, QuestDB, and Snowflake nodes |
| schema parameter default (`public`) | inferred | TimescaleDB is a PostgreSQL extension — `public` is the standard schema; consistent with QuestDB and Postgres nodes |
| Insert and update produce `affectedRows` in output | inferred | Consistent with all other n8n database nodes (Postgres, QuestDB, MySQL, Snowflake) |
| Port default (5432) | inferred | Standard PostgreSQL port; TimescaleDB is built on PostgreSQL |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.timescaleDb.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

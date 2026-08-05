---
type: n8n-nodes-base.crateDb
displayName: CrateDB
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# CrateDB

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cratedb/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/cratedb/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.crateDb`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `crateDb` (host, database, user, password, port, SSL mode)
- **Usable as tool:** yes

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | select | `insert` | yes | always | one of `executeQuery`, `insert`, `update` |
| query | string | — | yes (when operation = executeQuery) | operation = executeQuery | raw SQL with `$1`, `$2`, ... positional placeholders; uses a SQL editor with PostgreSQL dialect |
| schema | string | `doc` | yes (when operation = insert or update) | operation = insert or update | target CrateDB schema name |
| table | string | — | yes (when operation = insert or update) | operation = insert or update | target CrateDB table name |
| columns | string | — | no | operation = insert or update | comma-separated column list; column data types can be specified by appending `:type` suffix (e.g. `id:int,name:text`) |
| updateKey | string | `id` | yes (when operation = update) | operation = update | comma-separated list of columns that identify which rows to update |
| returnFields | string | `*` | no | operation = insert or update | comma-separated list of fields the operation should return |
| additionalFields | collection | — | no | always | container for optional modifiers (see below) |

**additionalFields sub-parameters:**

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| mode | select | `multiple` | always | `multiple` (batches queries) or `independently` (one at a time); affects `continueOnFail` behavior |
| queryParams | string | — | operation = executeQuery | comma-separated list of properties used as query parameters bound to `$1`, `$2`, ... |

## Runtime behavior

### Input

Each input item drives one execution of the chosen operation.

- **executeQuery:** The raw SQL string is sent to CrateDB via the pg-promise driver (CrateDB uses the PostgreSQL wire protocol). If `queryParams` is set, corresponding values from each input item are bound positionally to `$1`, `$2`, ... placeholders. The query is executed once per input item.
- **insert:** An `INSERT INTO "schema"."table" (columns) VALUES (values) RETURNING returnFields` statement is built per input item. The `columns` parameter selects which item keys map to table columns. Column data types can be hinted with `:type` suffix in the columns string.
- **update:** All items are processed in a single batch (default `multiple` mode) or independently. An `UPDATE "schema"."table" SET col1 = val1, ... WHERE updateKey1 = val1 AND updateKey2 = val2 RETURNING returnFields` statement is built. In `multiple` mode, all queries are concatenated and sent as a single batch. In `independently` mode, each item is executed as a separate transaction.

### Output

- **executeQuery:** The result set rows are emitted as output items. Each row becomes one output item with column names as keys.
- **insert:** Each output item contains the inserted row data (as determined by `returnFields`). If no fields match, affected-rows metadata may be returned.
- **update:** Each output item contains the updated row data (as determined by `returnFields`).

### Errors

- Authentication failures, query syntax errors, and permission denials throw and halt execution.
- If `continueOnFail` is true, individual item errors are suppressed and execution continues with remaining items.
- Connection failures affect all items in the batch.

### Expressions

String, number, and boolean parameters support n8n expressions (`{{ $json.field }}`). Column values for insert/update are drawn from input item JSON properties.

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
    "queryParams": "email,status"
  }
}
```

**Expect** output[0] to contain the matching user row(s) from the `users` table with their `email` equal to `alice@example.com`.

### Test: Insert rows from input items

**Given** input items:
```json
[{ "json": { "name": "Alice", "age": 30 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "schema": "doc",
  "table": "employees",
  "columns": "name,age"
}
```

**Expect** output[0]:
```json
[{ "json": { "name": "Alice", "age": 30 } }]
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
  "schema": "doc",
  "table": "employees",
  "updateKey": "id",
  "columns": "name,age",
  "returnFields": "*"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": 42, "name": "Alice Updated", "age": 31 } }]
```

### Test: Column type hint in insert

**Given** input items:
```json
[{ "json": { "id": 1, "name": "Widget", "price": 9.99 } }]
```

**Parameters:**
```json
{
  "operation": "insert",
  "schema": "doc",
  "table": "products",
  "columns": "id:int,name:text,price:float"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": 1, "name": "Widget", "price": 9.99 } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Three operations (executeQuery, insert, update) | documented | Explicit in public n8n docs page |
| Credential fields (host, database, user, password, port, SSL) | documented | Public credentials page details all fields with Allow/Disable/Require SSL options |
| Column type hinting via `:type` suffix | documented | Explicitly documented on the n8n CrateDB node reference page |
| Underlying driver uses pg-promise over PostgreSQL wire protocol | inferred | CrateDB speaks PostgreSQL wire protocol; pg-promise dependency visible from corpus |
| Return fields behavior with insert/update | inferred | Reuses Postgres helpers; returnFields defaults to `*` |
| `mode` (multiple/independently) affects batch behavior | inferred | Visible from corpus as additionalFields; affects query concatenation for updates |
| `queryParams` vs `queryParameters` naming | inferred | Internal parameter name `queryParams` for executeQuery |
| Per-item SQL execution vs bulk | inferred | Standard n8n SQL node pattern: one statement per input item, optionally batched |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.crateDb.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

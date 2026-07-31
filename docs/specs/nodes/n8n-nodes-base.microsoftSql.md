---
type: n8n-nodes-base.microsoftSql
displayName: Microsoft SQL
category: Action
versions: [1]
priority: medium
status: specced
---

# Microsoft SQL

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftsql/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoftsql/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftSql`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftSql` (required; SQL database connection)

## Parameters

### Resource and operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | hidden | `database` | ✓ | Always `database`; single-resource node |
| operation | options | `executeQuery` | ✓ | `executeQuery`, `insert`, `update`, `delete` |

### Shared parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| table | string | `''` | conditionally | hidden for executeQuery | Table name for insert, update, delete |

### executeQuery

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| query | string | `''` | ✓ | SQL query string; supports `@paramName` or `$1`, `$2` positional parameters |

### insert

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataMode | options | `autoMapInputData` | — | `autoMapInputData`, `defineBelow` |
| columns | resourceMapper | auto-map | — | Auto-map incoming item fields to table columns, or define manually |
| valuesToSend | fixedCollection | `{}` | — | Manual mode: column + value per row |

### update

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataMode | options | `autoMapInputData` | — | `autoMapInputData`, `defineBelow` |
| columns | resourceMapper | auto-map | — | Auto-map or manual column/value pairs |
| columnToMatchOn | options | `''` | ✓ | Column to identify rows to update |
| valueToMatchOn | string | `''` | — | Value to match on (can use expression) |
| valuesToSend | fixedCollection | `{}` | — | Manual mode: column + value per row |

### delete

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataMode | options | `autoMapInputData` | — | `autoMapInputData`, `defineBelow` |
| columnToMatchOn | options | `''` | ✓ | Column to identify rows to delete |
| valueToMatchOn | string | `''` | — | Value to match on (can use expression) |

### Options collection

Displayed as "Options" collection, default `{}`:

| name | type | default | notes |
|------|------|---------|-------|
| action | options | `none` | `none`, `updateRows`, `insertRows`, `deleteRows`, `updateOrInsertRows` |
| additionalFields | collection | `{}` | Column-value pairs for action mode |
| outputLargeNumbersAsText | boolean | `true` | Output large numbers as strings to avoid precision loss |
| outputColumns | string | `'*'` | Comma-separated columns to return |
| queryBatching | options | `single` | `single`, `independently`, `transaction` |
| queryReplacement | string | `''` | Comma-separated query parameter values for `@paramName` or `$1`, `$2` placeholders |
| timeout | number | `30000` | Query timeout in milliseconds |

## Runtime behavior

### Input

Each input item represents one database operation. For executeQuery, each item produces a separate query execution. For insert/update/delete with auto-map, item properties are mapped to column values.

### Output

Output items contain the result rows from the database. For select/executeQuery, the result set is returned as an array of objects with column names as keys. For insert/update/delete, affected row count or success indicator is returned.

When `outputLargeNumbersAsText` is enabled (default), large numeric values are returned as strings to avoid JavaScript precision loss.

### Query batching modes

- **Single Query**: A single query is built from all input items.
- **Independent**: One query per input item, executed independently.
- **Transaction**: All queries wrapped in a `BEGIN`/`COMMIT`; rollback on any failure.

### Expressions

The following parameters accept expression strings:
- Query (executeQuery) -- supports `@paramName` or `$1`, `$2` positional parameters
- Value (valuesToSend, valueToMatchOn)
- table name

### AI tool usage

The node has `usableAsTool: true`. When used as an AI agent tool, parameters can be set automatically by the LLM.

### Errors

- Connection failures throw an error.
- SQL execution failures throw by default; with `continueOnFail` the error item is returned with `{ json: { error } }`.
- Large numbers are returned as strings by default to avoid precision loss; disable `outputLargeNumbersAsText` to override.

## Acceptance tests

### Test: executeQuery with parameters

**Given** input items:

```json
[
  { "json": { "email": "user@example.com", "name": "User" } }
]
```

**Parameters:**

```json
{
  "operation": "executeQuery",
  "query": "SELECT * FROM users WHERE email = @email;"
}
```

**Expect** output[0]:

```json
[
  { "json": { "id": 1, "name": "User", "email": "user@example.com" } }
]
```

### Test: insert with auto-map

**Given** input items:

```json
[
  { "json": { "name": "Widget", "price": 9.99, "category": "tools" } }
]
```

**Parameters:**

```json
{
  "operation": "insert",
  "table": "products",
  "dataMode": "autoMapInputData"
}
```

**Expect** output[0]:

```json
[
  { "json": { "name": "Widget", "price": 9.99, "category": "tools" } }
]
```

### Test: update rows

**Given** input items:

```json
[
  { "json": { "id": 1, "status": "shipped" } }
]
```

**Parameters:**

```json
{
  "operation": "update",
  "table": "orders",
  "columnToMatchOn": "id",
  "valueToMatchOn": "1",
  "dataMode": "autoMapInputData"
}
```

**Expect** output[0]:

```json
[
  { "json": { "id": 1, "status": "shipped" } }
]
```

### Test: delete rows

**Given** input items:

```json
[
  { "json": { "id": 42 } }
]
```

**Parameters:**

```json
{
  "operation": "delete",
  "table": "orders",
  "columnToMatchOn": "id",
  "valueToMatchOn": "42"
}
```

**Expect** output[0]:

```json
[
  { "json": { "success": true } }
]
```

### Test: large numbers output as text

**Given** input items:

```json
[
  { "json": {} }
]
```

**Parameters:**

```json
{
  "operation": "executeQuery",
  "query": "SELECT * FROM financials"
}
```

**Expect** output[0]:

```json
[
  { "json": { "amount": "9999999999999999", "rate": "0.075" } }
]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Output shape for executeQuery | inferred | Returns column-mapped objects from the TDS driver |
| Resource mapper mode internals | inferred | Uses loadOptionsDependsOn for column discovery |
| credential fields | documented | Server, Database, User, Password, Port, Domain, TLS, Ignore SSL Issues, Connect Timeout, Request Timeout, TDS Version |
| No separate select operation | documented | Use executeQuery for SELECT queries |
| Node version spread | inferred | Single version 1; v2 may exist in newer packages |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/microsoftSql.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
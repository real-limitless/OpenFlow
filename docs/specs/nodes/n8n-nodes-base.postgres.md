---
type: n8n-nodes-base.postgres
displayName: Postgres
category: Action
versions: [1, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6]
priority: high
status: implemented
---

# Postgres

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/postgres/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.postgres`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `postgres` (required; tested by `postgresConnectionTest`)

## Parameters

### Shared parameters (all v2 operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | hidden | `database` | ✓ | — | Always `database`; single-resource node |
| operation | options | `select` | ✓ | — | `deleteTable`, `executeQuery`, `insert`, `select`, `update`, `upsert` |
| schema | resourceLocator | `{ mode: 'list', value: 'public' }` | ✓ | — | Two modes: `list` (from DB) or `name` (enter text) |
| table | resourceLocator | `{ mode: 'list', value: '' }` | ✓ | — | Two modes: `list` (from DB) or `name` (enter text) |

### Options collection (shared across v2 operations)

Displayed as "Options" collection, default `{}`. Fields:

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| connectionTimeout | number | `30` | — | Seconds reserved for connecting |
| delayClosingIdleConnection | number | `0` | — | Seconds before idle connection eligible for closing |
| queryBatching | options | `single` | — | `single`, `independently`, `transaction` |
| largeNumbersOutput | options | `text` | — | `numbers`, `text` (text recommended for >16-digit) |
| queryReplacement | string | `''` | executeQuery only | Comma-separated query parameter values |
| treatQueryParametersInSingleQuotesAsText | boolean | `false` | executeQuery only | Treat `'$1'` as text literal |
| outputColumns | multiOptions | `[]` | select/insert/update/upsert | Choose columns or expression IDs |
| skipOnConflict | boolean | `false` | insert only | Skip row if unique/exclusion constraint violated |
| replaceEmptyStrings | boolean | `false` | executeQuery/insert/update/upsert | Replace empty strings with NULL |
| cascade | boolean | `false` | deleteTable (truncate/drop) | Drop dependent objects |

### Operation-specific parameters

#### deleteTable (`n8n-nodes-base.postgres`, version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| deleteCommand | options | `truncate` | ✓ | `truncate`, `delete`, `drop` |
| restartSequences | boolean | `false` | — | Reset auto-increment (truncate only) |
| where (fixedCollection) | fixedCollection | `{}` | — | Select Rows: column + operator + value (delete command only) |
| combineConditions | options | `AND` | — | `AND`, `OR` (delete command only) |

#### executeQuery (version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| query | string | `''` | ✓ | SQL with `$1`, `$2` positional params |

#### insert (version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataMode | options | `autoMapInputData` | — | `autoMapInputData`, `defineBelow` |
| columns | resourceMapper | `{ mappingMode: 'defineBelow', value: null }` | ✓ | Auto-map or manual column/value pairs |
| valuesToSend | fixedCollection | `{}` | — | Manual mode: column + value per row |

#### update (version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataMode | options | `autoMapInputData` | — | `autoMapInputData`, `defineBelow` |
| columns | resourceMapper | `{ mappingMode: 'defineBelow', value: null }` | ✓ | Auto-map or manual column/value pairs |
| columnToMatchOn | options | `''` | ✓ | Column to identify rows to update |
| valueToMatchOn | string | `''` | — | Value to match on (can use expression) |
| valuesToSend | fixedCollection | `{}` | — | Manual mode: column + value per row |

#### upsert (version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataMode | options | `autoMapInputData` | — | `autoMapInputData`, `defineBelow` |
| columns | resourceMapper | `{ mappingMode: 'defineBelow', value: null }` | ✓ | Auto-map or manual column/value pairs |
| columnToMatchOn | options | `''` | ✓ | Unique column to identify existing rows |
| valueToMatchOn | string | `''` | — | Value to match on (can use expression) |
| valuesToSend | fixedCollection | `{}` | — | Manual mode: column + value per row |

#### select (version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | `false` | — | Return all results or limit |
| limit | number | `50` | — | Max rows when returnAll is false |
| where (fixedCollection) | fixedCollection | `{}` | — | Select Rows: column + operator + value |
| combineConditions | options | `AND` | — | `AND`, `OR` |
| sort (fixedCollection) | fixedCollection | `{}` | — | Sort: column + direction (`ASC`/`DESC`) |

### Where clause operators

| value | display name |
|-------|--------------|
| `equal` | Equal |
| `!=` | Not Equal |
| `LIKE` | Like |
| `>` | Greater Than |
| `<` | Less Than |
| `>=` | Greater Than Or Equal |
| `<=` | Less Than Or Equal |
| `IS NULL` | Is Null |
| `IS NOT NULL` | Is Not Null |

### V1 parameters (legacy, version 1 only)

V1 uses plain string fields for schema/table/columns instead of resourceLocator/resourceMapper:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | `insert` | ✓ | `executeQuery`, `insert`, `update` |
| query | string | `''` | ✓ | executeQuery only |
| schema | string | `'public'` | ✓ | insert/update |
| table | string | `''` | ✓ | insert/update |
| columns | string | `''` | — | Comma-separated with optional type cast `col:type` |
| updateKey | string | `'id'` | ✓ | update only; comma-separated key columns |
| returnFields | string | `'*'` | — | Comma-separated return columns |
| additionalFields.mode | options | `multiple` | — | `independently`, `multiple`, `transaction` |
| additionalFields.queryParams | string | `''` | — | Comma-separated property names |
| additionalFields.largeNumbersOutput | options | `text` | — | `numbers`, `text` |

## Runtime behavior

### Input

Each input item represents one database operation. For insert/update/upsert, item properties are mapped to column values (auto or manual). For executeQuery, each item produces a separate query execution.

### Output

Output items contain the result rows from the database. For insert/update/upsert with `outputColumns` specified, only selected columns are returned. For executeQuery, the raw result set is returned. For deleteTable/truncate, an empty result array is returned on success.

Output fields are shaped by the database response — column names become JSON keys.

### Query batching modes

- **Single Query**: A single query is built from all input items.
- **Independent**: One query per input item, executed independently.
- **Transaction**: All queries wrapped in a `BEGIN`/`COMMIT`; rollback on any failure.

### Expressions

The following parameters accept expression strings:
- Query (executeQuery) — supports `$1`, `$2` positional parameters
- Value (where clause, valuesToSend, valueToMatchOn)
- Limit
- schema/table name mode (when using "By Name" mode)
- queryReplacement (query parameters)

### AI tool usage

The node has `usableAsTool: true`. When used as an AI agent tool, parameters can be set automatically by the LLM.

### Errors

- Connection failures throw an error.
- SQL execution failures throw by default; with `continueOnFail` the error item is returned with `{ json: { error } }`.
- Insert violating unique constraint throws unless `skipOnConflict` is enabled.
- Unsafe queries without query parameters produce a hint recommending prepared statements.

## Acceptance tests

### Test: executeQuery with parameters

**Given** input items:

```json
[
  { "json": { "email": "alex@example.com", "name": "Alex", "age": 21 } },
  { "json": { "email": "jamie@example.com", "name": "Jamie", "age": 33 } }
]
```

**Parameters:**

```json
{
  "operation": "executeQuery",
  "query": "SELECT * FROM $1:name WHERE email = $2;",
  "options": {
    "queryReplacement": "{{ ['users', $json.email] }}",
    "queryBatching": "independently"
  }
}
```

**Expect** output[0]:

```json
[
  { "json": { "columns": ["id", "name", "email", "age"], "rows": [[1, "Alex", "alex@example.com", 21]] } },
  { "json": { "columns": ["id", "name", "email", "age"], "rows": [[2, "Jamie", "jamie@example.com", 33]] } }
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
  "schema": { "mode": "name", "value": "public" },
  "table": { "mode": "name", "value": "products" },
  "dataMode": "autoMapInputData"
}
```

**Expect** output[0]:

```json
[
  { "json": { "name": "Widget", "price": 9.99, "category": "tools" } }
]
```

### Test: select with where clause

**Given** input items:

```json
[
  { "json": {} }
]
```

**Parameters:**

```json
{
  "operation": "select",
  "schema": { "mode": "name", "value": "public" },
  "table": { "mode": "name", "value": "products" },
  "returnAll": false,
  "limit": 10,
  "where": {
    "values": [
      { "column": "category", "condition": "equal", "value": "tools" }
    ]
  },
  "combineConditions": "AND"
}
```

**Expect** output[0]:

```json
[
  { "json": { "id": 1, "name": "Widget", "price": 9.99, "category": "tools" } }
]
```

### Test: deleteTable truncate

**Given** input items:

```json
[
  { "json": {} }
]
```

**Parameters:**

```json
{
  "operation": "deleteTable",
  "schema": { "mode": "name", "value": "public" },
  "table": { "mode": "name", "value": "temp_data" },
  "deleteCommand": "truncate",
  "options": {
    "cascade": false
  }
}
```

**Expect** output[0]:

```json
[
  { "json": {} }
]
```

### Test: upsert with match column

**Given** input items:

```json
[
  { "json": { "email": "alex@example.com", "name": "Alex Smith", "age": 22 } }
]
```

**Parameters:**

```json
{
  "operation": "upsert",
  "schema": { "mode": "name", "value": "public" },
  "table": { "mode": "name", "value": "users" },
  "dataMode": "autoMapInputData",
  "columnToMatchOn": "email"
}
```

**Expect** output[0]:

```json
[
  { "json": { "email": "alex@example.com", "name": "Alex Smith", "age": 22 } }
]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Output shape for executeQuery | inferred | Returns `{ columns, rows }` shaped objects from pg-promise |
| Output shape for insert/update/upsert | documented | Returns the inserted/updated rows (affected by outputColumns) |
| OutputColumns default (all columns) | inferred | Empty array likely returns all columns |
| Resource mapper mode internals | inferred | Uses loadOptionsDependsOn for column discovery |
| V1 operation params | documented | Legacy string-based interface; v2 supersedes |
| Credential SSL/TLS options | documented | Supports `disable`, `allow`, `require`, `verify`, `verify-full` + SSH tunnel |
| Node version spread | documented | v1 → v2+; v2 spans versions 2–2.6 |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/postgres.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.mySql
displayName: MySQL
category: Action
versions: [1, 2, 2.1, 2.2, 2.3, 2.4, 2.5]
priority: high
status: implemented
---

# MySQL

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mysql.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mysql.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mysql/common-issues.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.mySql`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mySql` (required; tested by `mysqlConnectionTest`)

## Parameters

### Shared parameters (all v2 operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | hidden | `database` | ✓ | — | Always `database`; single-resource node |
| operation | options | `insert` | ✓ | — | `deleteTable`, `executeQuery`, `insert`, `select`, `update`, `upsert` |
| table | resourceLocator | `{ mode: 'list', value: '' }` | ✓ | hidden for executeQuery | Two modes: `list` (from DB) or `name` (enter text) |

### Options collection (shared across v2 operations)

Displayed as "Options" collection, default `{}`. Fields conditionally shown per operation:

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| connectionTimeoutMillis | number | `30` | — | Seconds reserved for connecting |
| connectionLimit | number | `10` | — | Max connections to the database pool |
| queryBatching | options | `single` | — | `single`, `independently`, `transaction` |
| queryReplacement | string | `''` | executeQuery only | Comma-separated query parameter values referenced as `$1`, `$2` |
| outputColumns | multiOptions | `[]` | select only | Choose columns or expression IDs |
| largeNumbersOutput | options | `text` | select, executeQuery | `numbers`, `text` (text recommended for >16-digit) |
| decimalNumbers | boolean | `false` | select, executeQuery | Output DECIMAL types as numbers instead of strings |
| priority | options | `LOW_PRIORITY` | insert only | `LOW_PRIORITY`, `HIGH_PRIORITY` |
| replaceEmptyStrings | boolean | `false` | insert, update, upsert, executeQuery | Replace empty strings with NULL |
| selectDistinct | boolean | `false` | select only | Remove duplicate rows |
| detailedOutput | boolean | `false` | — | Show executed query details in output |
| skipOnConflict | boolean | `false` | insert only | Skip row if unique constraint violated |

### Operation-specific parameters

#### deleteTable (version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| deleteCommand | options | `truncate` | ✓ | `truncate`, `delete`, `drop` |
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
| columns | resourceMapper | auto-map | — | Auto-map or manual column/value pairs |
| valuesToSend | fixedCollection | `{}` | — | Manual mode: column + value per row |

#### update (version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataMode | options | `autoMapInputData` | — | `autoMapInputData`, `defineBelow` |
| columns | resourceMapper | auto-map | — | Auto-map or manual column/value pairs |
| columnToMatchOn | options | `''` | ✓ | Column to identify rows to update |
| valueToMatchOn | string | `''` | — | Value to match on (can use expression) |
| valuesToSend | fixedCollection | `{}` | — | Manual mode: column + value per row |

#### upsert (version 2+)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dataMode | options | `autoMapInputData` | — | `autoMapInputData`, `defineBelow` |
| columns | resourceMapper | auto-map | — | Auto-map or manual column/value pairs |
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

V1 uses plain string fields instead of resourceLocator/resourceMapper:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | `executeQuery` | ✓ | `executeQuery`, `insert`, `update` |
| query | string | `''` | ✓ | executeQuery only |
| table | string | `''` | ✓ | insert/update |
| columns | string | `''` | — | Comma-separated columns with optional type cast `column:type` |
| updateKey | string | `'id'` | ✓ | update only; comma-separated key columns |
| returnFields | string | `'*'` | — | Comma-separated return columns |
| additionalFields.mode | options | `multiple` | — | `independently`, `multiple`, `transaction` |
| additionalFields.queryParams | string | `''` | — | Comma-separated property names |

## Runtime behavior

### Input

Each input item represents one database operation. For insert/update/upsert, item properties are mapped to column values (auto or manual). For executeQuery, each item produces a separate query execution.

### Output

Output items contain the result rows from the database. For select, the result set is returned as an array of objects with column names as keys. For insert/update/upsert with `outputColumns` specified (select only), only selected columns are returned. For executeQuery, the raw result set is returned.

For deleteTable/truncate/drop, an empty result or success indicator is returned.

When `detailedOutput` is enabled, the output includes query execution metadata. When `decimalNumbers` is disabled (default), DECIMAL values are returned as strings to avoid JavaScript precision loss.

Output fields are shaped by the database response -- column names become JSON keys.

### Query batching modes

- **Single Query**: A single query is built from all input items.
- **Independent**: One query per input item, executed independently.
- **Transaction**: All queries wrapped in a `BEGIN`/`COMMIT`; rollback on any failure.

### Expressions

The following parameters accept expression strings:
- Query (executeQuery) -- supports `$1`, `$2` positional parameters
- Value (where clause, valuesToSend, valueToMatchOn)
- Limit
- table name (when using "By Name" mode)
- queryReplacement (query parameters)

### AI tool usage

The node has `usableAsTool: true`. When used as an AI agent tool, parameters can be set automatically by the LLM.

### Errors

- Connection failures throw an error.
- SQL execution failures throw by default; with `continueOnFail` the error item is returned with `{ json: { error } }`.
- Insert violating unique constraint throws unless `skipOnConflict` is enabled.
- Unsafe queries without query parameters produce a hint recommending prepared statements.
- Decimal values are returned as strings by default to avoid precision loss; enable `decimalNumbers` to override.

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
  "table": { "mode": "name", "value": "temp_data" },
  "deleteCommand": "truncate"
}
```

**Expect** output[0]:

```json
[
  { "json": { "success": true } }
]
```

### Test: decimal output as string

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
  "table": { "mode": "name", "value": "financials" },
  "returnAll": true
}
```

**Expect** output[0]:

```json
[
  { "json": { "amount": "19.99", "rate": "0.075" } }
]
```

(DECIMAL values returned as strings by default; numbers returned when `decimalNumbers` is true.)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Output shape for executeQuery | inferred | Returns `{ columns, rows }` shaped objects from mysql2 |
| Output shape for insert/update/upsert | documented | Returns the inserted/updated rows |
| OutputColumns default (all columns) | inferred | Empty array likely returns all columns |
| Resource mapper mode internals | inferred | Uses loadOptionsDependsOn for column discovery |
| V1 operation params | documented | Legacy string-based interface; v2 supersedes |
| Credential SSL/TLS options | documented | Supports caCertificate/clientCertificate/clientPrivateKey + SSH tunnel |
| Node version spread | documented | v1 is legacy; v2 spans versions 2-2.5; defaultVersion is 2.5 |
| No schema parameter (unlike Postgres) | documented | MySQL uses database-level namespacing, no schema selector needed |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/mySql.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

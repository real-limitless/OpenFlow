---
type: n8n-nodes-base.snowflake
displayName: Snowflake
category: Data & Storage
versions: [1]
priority: medium
status: spec_complete
---

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.snowflake/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/snowflake/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.snowflake`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Requires a credential of type `snowflake` (name to be configured).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string (options) | `insert` | true | (options: Execute Query, Insert, Update) | selects operation mode |
| query | string | `''` | false | shown when operation = executeQuery | SQL query to execute |
| table | string | `''` | true when operation = insert or update | shown when operation = insert or update | target table name |
| columns | string | `''` | true when operation = insert or update | shown when operation = insert or update | comma-separated list of columns |
| updateKey | string | `id` | true when operation = update | shown when operation = update | key used for row matching |

## Runtime behavior

### Input
- **Main input:** Array of items on the `main` input port.
- **Operation selection:** The `operation` parameter determines the mode:
  - `executeQuery`: Run a SQL query.
  - `insert`: Insert rows into the specified table.
  - `update`: Update rows matching `updateKey` in the specified table.
- **Credentials:** Uses the configured `snowflake` credential for connection.

### Output
- **Main output:** Array of items on the `main` output port.
- **Execute Query:** Returns query result rows.
- **Insert / Update:** Returns confirmation of affected rows/inserted IDs.
- **Errors:** Throws on API errors unless `continueOnFail` is true; otherwise may produce empty output.

### Errors
- API errors (authentication, query syntax, permission, quota) propagate as failures unless `continueOnFail` is true.
- Invalid operation configuration (e.g., missing query for executeQuery) results in validation error.

### Expressions
- All string parameters support n8n expressions (`{{ $json.field }}`).
- Expression evaluation occurs per-item, but `documentId` and `table` are evaluated once per workflow.

## Acceptance tests

### Test: Execute Query (basic)
Given input items:
```json
[{ "json": {} }]
```
Parameters:
```json
{
  "operation": "executeQuery",
  "query": "SELECT 1 as test_value"
}
```
Expect output[0]:
```json
[{ "json": { "test_value": 1 } }]
```

### Test: Insert (basic)
Given input items:
```json
[{ "json": { "name": "Alice", "age": 30 } }]
```
Parameters:
```json
{
  "operation": "insert",
  "table": "users",
  "columns": "name,age"
}
```
Expect output[0] contains update metadata indicating a row was inserted.

### Test: Update (basic)
Given input items:
```json
[{ "json": { "id": "row-1", "name": "Alice Updated", "age": 31 } }]
```
Parameters:
```json
{
  "operation": "update",
  "table": "users",
  "updateKey": "id",
  "columns": "name,age",
  "documentId": { "mode": "id", "value": "row-1" }
}
```
Expect output[0] contains update metadata.

### Test: Execute Query with Multiple Rows
Given input items:
```json
[{ "json": {} }, { "json": {} }]
```
Parameters:
```json
{
  "operation": "executeQuery",
  "query": "SELECT {{ $json.count }} as count"
}
```
Expect output array length matches input count, each item includes `count`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation options (`executeQuery`, `insert`, `update`) | documented | From public node description and descriptor metadata |
| Parameter names (`operation`, `query`, `table`, `columns`, `updateKey`) | documented | Directly from node configuration |
| Default values (`insert`, `id`) | documented | From node static properties |
| Credential requirement (`snowflake`) | documented | From `credentials` array |
| Input/output behavior (main port) | documented | Node signature |
| Expressions support | inferred | From generic n8n parameter expression support |
| Version differences (v1 vs v2 parameter shapes) | inferred | Based on package descriptor metadata |
| Detailed SQL parsing behavior | inferred | Not fully described in public docs |

## OpenFlow mapping
- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.snowflake.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
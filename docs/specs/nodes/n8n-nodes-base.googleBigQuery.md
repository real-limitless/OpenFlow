---
type: n8n-nodes-base.googleBigQuery
displayName: Google BigQuery
category: Data & Storage
versions: [1, 2, 2.1]
priority: medium
status: specced
---

# Google BigQuery

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebigquery.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/service-account.md | Public docs only |
| https://cloud.google.com/bigquery/docs/reference/rest | Third-party API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.googleBigQuery`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleBigQueryOAuth2Api` (extends `googleOAuth2Api`), or service account via `googleApi`
  - OAuth2 scopes: `https://www.googleapis.com/auth/bigquery`, `https://www.googleapis.com/auth/cloud-platform`, `https://www.googleapis.com/auth/drive`
  - Service account: `googleApi` credential (private key + service account email)

## Parameters

### Resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `database` | ✓ | (always) | V1 uses `record`; V2/V2.1 uses `database` |

### Operation

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | `executeQuery` | ✓ | resource=database | `executeQuery` or `insert` |

### Authentication

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | string | `oAuth2` | | (always) | `oAuth2` or `serviceAccount` |

### Resource locators

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| projectId | resourceLocator | | ✓ | operation=executeQuery,insert | Modes: list, url, id (expression also accepted) |
| datasetId | resourceLocator | | ✓ | operation=insert | Modes: list, id (expression also accepted) |
| tableId | resourceLocator | | ✓ | operation=insert | Modes: list, id (expression also accepted) |

### Query (executeQuery only)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sqlQuery | string | | | operation=executeQuery | The SQL query text. Only shown when `useLegacySql` is false (explicitly or by default). |

### Data mode (insert only)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| dataMode | string | `autoMap` | | operation=insert | `autoMap` (infer from input item keys) or `define` (explicit field mapping) |

### Fields (insert + define mode only)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| fieldsUi.values | array | | | dataMode=define, operation=insert | Array of `{ fieldId, fieldValue }` pairs |

### Options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| options.defaultDataset | string | | | (always) | Override the default dataset for query execution |
| options.dryRun | boolean | false | | (always) | If true, the query is validated without running |
| options.includeSchema | boolean | false | | (always) | Include column schema in executeQuery output |
| options.location | string | | | (always) | Geographic location of the dataset (e.g. `US`, `EU`) |
| options.maximumBytesBilled | string | | | (always) | Billable byte cap for query |
| options.maxResults | number | | | operation=executeQuery | Max rows returned per page |
| options.timeoutMs | number | | | (always) | Query timeout in milliseconds |
| options.rawOutput | boolean | false | | (always) | Return raw API response instead of parsed rows |
| options.useLegacySql | boolean | false | | (always) | Enable legacy SQL dialect |
| options.returnAsNumbers | boolean | false | | operation=executeQuery | Return numeric values as JS numbers (not strings) |
| options.queryParameters | (unknown) | | | (always) | Named or positional query parameters |
| options.batchSize | number | | | operation=insert | Rows per batch insert request |
| options.ignoreUnknownValues | boolean | false | | operation=insert | Ignore unknown fields in insert rows |
| options.skipInvalidRows | boolean | false | | operation=insert | Skip invalid rows instead of failing |
| options.templateSuffix | string | | | operation=insert | Suffix for template table insertion |
| options.traceId | string | | | (always) | Trace ID for request logging |

### V1-only parameters (resource=record)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | `create` | ✓ | resource=record | `create` or `getAll` |
| projectId | string | | ✓ | (always) | Plain string (not resourceLocator) in V1 |
| datasetId | string | | ✓ | (always) | |
| tableId | string | | ✓ | (always) | |
| columns | string | | | operation=create | Comma-separated column names |
| returnAll | boolean | false | | operation=getAll | Return all matching rows |
| limit | number | | | operation=getAll, returnAll=false | Max rows to return |
| simple | boolean | false | | operation=getAll | Return simplified output |
| options.selectedFields | string | | | operation=getAll | Comma-separated field names to return |

## Runtime behavior

### Authentication

The node supports two authentication methods: OAuth2 (via `googleBigQueryOAuth2Api`) and service account (via `googleApi`). OAuth2 requires the BigQuery, Cloud Platform, and Drive scopes. Service account authentication uses a private key and service account email, with an optional impersonated user.

### Input

Each input item is processed independently. For `executeQuery`, the SQL can reference input item values via expressions. For `insert`, each input item becomes a row (or a set of rows under `autoMap` mode).

### Query execution (executeQuery)

The node sends a BigQuery Jobs API `jobs.insert` request with a `query` job configuration. The SQL query text is submitted as the `query` field in the job config. Options like `defaultDataset`, `useLegacySql`, `dryRun`, `maxResults`, `timeoutMs`, `maximumBytesBilled`, and `location` are mapped to the job configuration.

When `rawOutput` is false (default), the response rows are parsed into clean JSON objects. When `rawOutput` is true, the full API response is returned. When `includeSchema` is true, the schema definition is included alongside the row data.

The `queryParameters` option supports both named and positional parameters. Each parameter includes `name` (for named), `parameterType` (type string), and `parameterValue` (value).

The `returnAsNumbers` option controls whether numeric values are returned as JavaScript numbers (true) or strings (false). BigQuery returns all numerics as strings by default to avoid precision loss.

### Insert

The node sends a BigQuery Jobs API `jobs.insert` request with a `load` or `query` job configuration. Under `autoMap` mode, column names are inferred from the item keys of the first input item. Under `define` mode, the user explicitly maps `fieldId` → `fieldValue` in the `fieldsUi.values` array.

Each input item produces one row in the insert payload. The `batchSize` option controls how many rows are sent per API call. The `ignoreUnknownValues` and `skipInvalidRows` options control error handling for mismatched schema.

The `templateSuffix` option enables template table insertion, where the actual destination table name is `tableId + templateSuffix`.

### Output

For `executeQuery`, each output item contains the query result rows. The row data is an array of JSON objects under the `rows` key. If `includeSchema` is true, the schema is included under `schema`. If `rawOutput` is true, the full response object is returned.

For `insert`, each output item is a pass-through of the input item with additional metadata about the insert operation (job reference, row count).

### Errors

- BigQuery API errors (invalid query, permission denied, quota exceeded) are thrown as node errors.
- When `dryRun` is true, the query is validated only; no data is returned. A dry-run error means the query is invalid.
- For inserts, `skipInvalidRows` and `ignoreUnknownValues` control whether partial failures are silently handled.
- Standard `continueOnFail` behavior applies: on error, the node outputs `[{ json: { error: message } }]` on the main output.

### Expressions

The following parameters accept expression strings:
- `projectId`, `datasetId`, `tableId` (via resourceLocator value)
- `sqlQuery`
- All option values except `queryParameters`
- `columns`, `returnAll`, `limit`, `simple` (V1)

### AI tool usage

This node can be used as an AI tool for AI Agent nodes. When used as a tool, many parameters can be set automatically by the AI based on the agent's reasoning.

## Acceptance tests

### Test: executeQuery basic

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "database",
  "operation": "executeQuery",
  "projectId": { "__rl": true, "mode": "id", "value": "my-project" },
  "sqlQuery": "SELECT name, age FROM `my-project.my_dataset.users` LIMIT 10",
  "options": {
    "useLegacySql": false,
    "maxResults": 10
  }
}
```

**Expect** output[0] to contain `rows` as an array of JSON objects with `name` and `age` fields.

### Test: insert autoMap

**Given** input items:

```json
[
  { "json": { "name": "Alice", "age": 30 } },
  { "json": { "name": "Bob", "age": 25 } }
]
```

**Parameters:**

```json
{
  "resource": "database",
  "operation": "insert",
  "projectId": { "__rl": true, "mode": "id", "value": "my-project" },
  "datasetId": { "__rl": true, "mode": "id", "value": "my_dataset" },
  "tableId": { "__rl": true, "mode": "id", "value": "users" },
  "dataMode": "autoMap"
}
```

**Expect** the insert request body contains `rows` with two entries, each having `json` fields `name` and `age`. Each output item is a pass-through of the input with pairedItem index.

### Test: insert define mode

**Given** input items:

```json
[{ "json": { "fullName": "Charlie", "years": 35 } }]
```

**Parameters:**

```json
{
  "resource": "database",
  "operation": "insert",
  "projectId": { "__rl": true, "mode": "id", "value": "my-project" },
  "datasetId": { "__rl": true, "mode": "id", "value": "my_dataset" },
  "tableId": { "__rl": true, "mode": "id", "value": "users" },
  "dataMode": "define",
  "fieldsUi": {
    "values": [
      { "fieldId": "name", "fieldValue": "={{ $json.fullName }}" },
      { "fieldId": "age", "fieldValue": "={{ $json.years }}" }
    ]
  }
}
```

**Expect** the insert request body contains `rows[0].json` with `{ "name": "Charlie", "age": 35 }` (after expression evaluation). Each output item is a pass-through with pairedItem.

### Test: executeQuery with dryRun

**Parameters:**

```json
{
  "resource": "database",
  "operation": "executeQuery",
  "projectId": { "__rl": true, "mode": "id", "value": "my-project" },
  "sqlQuery": "SELECT 1",
  "options": {
    "dryRun": true
  }
}
```

**Expect** no rows returned; the output confirms the query is valid (no error thrown).

### Test: V1 create operation

**Parameters:**

```json
{
  "resource": "record",
  "operation": "create",
  "projectId": "my-project",
  "datasetId": "my_dataset",
  "tableId": "users",
  "columns": "name,age",
  "options": {
    "skipInvalidRows": true
  }
}
```

**Expect** a BigQuery load job is created for the table. Output items are pass-through of input.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| executeQuery behavior | documented | Public docs confirm operation exists; descriptor confirms full parameter set |
| insert behavior | documented | Public docs + descriptor confirm autoMap/define modes |
| V1 version model | inferred | Descriptor schema shows V1 uses `resource=record` with `create`/`getAll` operations |
| V2 vs V2.1 differences | inferred | Schemas are identical; version bump likely internal or minor behavioral |
| Options parameter details | inferred | All 16 option fields extracted from descriptor schema |
| OAuth2 scopes | documented | Public credential docs + credential JS file confirm scopes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/google-bigquery.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
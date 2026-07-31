---
type: n8n-nodes-base.supabase
displayName: Supabase
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Supabase

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/supabase/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/common-issues.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.supabase`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `supabaseApi` (Host URL + Service Role Key)

## External API / service contract

This node interacts with the Supabase Data API, a PostgREST-based HTTP API at `https://<project>.supabase.co/rest/v1/`. Authenticated requests use the service role key (or anon key) via the `apikey` header.

- **Create:** `POST /rest/v1/<table>` with JSON body of column-value pairs; `Prefer: return=representation` returns the created row.
- **Get (single):** `GET /rest/v1/<table>?<column>=eq.<value>&select=*` — returns a single-row array.
- **Get All:** `GET /rest/v1/<table>?select=*` with optional query-string PostgREST filters, `limit`, and `order`.
- **Update:** `PATCH /rest/v1/<table>` with query-string filters and JSON body of changed columns.
- **Delete:** `DELETE /rest/v1/<table>` with query-string filters.

Schema selection uses the `Accept-Profile` header (or `schema` query parameter) for custom PostgREST schemas.

## Parameters

### Top-level

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| useCustomSchema | boolean | false | no | always | Toggle to select a non-`public` schema |
| schema | string | public | no | show: useCustomSchema = true | Schema name; evaluated once for first input item |
| resource | options | row | yes | always | Only value: `row` |
| operation | options | create | yes | show: resource = row | One of: create, delete, get, getAll, update |
| tableId | string | (empty) | yes | show: resource = row (all ops) | Table name; populated dynamically via loadOptionsMethod |

### Per-operation parameters

#### Create

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| dataToSend | options | defineBelow | yes | operation = create | `autoMapInputData` or `defineBelow` |
| inputsToIgnore | string | (empty) | no | show: dataToSend = autoMapInputData | Comma-separated keys to skip during auto-map |
| fieldsUi | fixedCollection | — | no | show: dataToSend = defineBelow | Collection of `fieldValues`: `fieldId` + `fieldValue` key-value pairs |

#### Get (single row)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| filters | fixedCollection | — | no | operation = get | Simple conditions: `keyName` (field), `keyValue`; always uses `eq` operator |

#### Get All

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| returnAll | boolean | false | no | operation = getAll | When false, `limit` applies |
| limit | number | 50 | no | show: returnAll = false | Max results (min 1) |
| filterType | options | manual | yes | operation = getAll | `none`, `manual` (build conditions), or `string` (raw PostgREST filter) |
| matchType | options | anyFilter | no | show: filterType = manual | `anyFilter` (OR) or `allFilters` (AND) |
| filters | fixedCollection | — | no | show: filterType = manual | Conditions with `keyName`, `condition` (operator), `keyValue` |
| filterString | string | (empty) | no | show: filterType = string | Raw PostgREST filter e.g. `name=eq.john` |

#### Update

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| dataToSend | options | defineBelow | yes | operation = update | `autoMapInputData` or `defineBelow` |
| inputsToIgnore | string | (empty) | no | show: dataToSend = autoMapInputData | Comma-separated keys to skip |
| fieldsUi | fixedCollection | — | no | show: dataToSend = defineBelow | Key-value pairs for column values to update |
| filterType | options | manual | yes | operation = update | `manual` or `string` |
| matchType | options | anyFilter | no | show: filterType = manual | `anyFilter` or `allFilters` |
| filters | fixedCollection | — | no | show: filterType = manual | Filter conditions (same as Get All) |
| filterString | string | (empty) | no | show: filterType = string | Raw PostgREST filter string |

#### Delete

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| filterType | options | manual | yes | operation = delete | `manual` or `string` |
| matchType | options | anyFilter | no | show: filterType = manual | `anyFilter` or `allFilters` |
| filters | fixedCollection | — | no | show: filterType = manual | Filter conditions |
| filterString | string | (empty) | no | show: filterType = string | Raw PostgREST filter string |

### Filter condition operators (manual filterType)

| operator | value | description |
|----------|-------|-------------|
| Equals | eq | Exact match |
| Not Equals | neq | Not equal |
| Greater Than | gt | > |
| Greater Than or Equal | gte | >= |
| Less Than | lt | < |
| Less Than or Equal | lte | <= |
| LIKE (use `*` for `%`) | like | SQL LIKE wildcard match |
| ILIKE (case-insensitive) | ilike | Case-insensitive LIKE |
| Is | is | Exact equality for null, true, false, unknown |
| Full-Text | fullText | Postgres full-text search |

### Full-text search functions (when condition = fullText)

| name | value | PostgREST function |
|------|-------|--------------------|
| to_tsquery | fts | Standard full-text search |
| plainto_tsquery | plfts | Parsed query input |
| phraseto_tsquery | phfts | Phrase matching |
| websearch_tsquery | wfts | Web-style search syntax |

## Runtime behavior

### Input

The node accepts one `main` input. Each input item triggers a separate API call for create/get/delete operations. For getAll, a single API call fetches results that are split into one output item per returned row.

### Output

- **Create:** Returns the created row object (via `Prefer: return=representation`). Emits `{ data: {} }` if the API returns an empty array.
- **Get:** Returns the matched row as a single item, or `{ data: null }` if no row matched.
- **Get All:** Returns one output item per matched row. If `returnAll` is false, `limit` caps the result set. No results produces zero output items.
- **Update:** Returns the updated row object per input item. Emits `{ data: null }` if no rows matched the filter.
- **Delete:** Returns `{ success: true }` per input item.

Binary data is not handled. All output uses the shape `{ json: <response_data> }`.

### Expression evaluation

- `schema`, `tableId`, `filterString`, field values, and condition values accept expression strings.
- `useCustomSchema`, `returnAll`, and option-type fields are `noDataExpression: true` (static values only).

### Errors

- Non-2xx API responses throw with the HTTP status code and message.
- With `continueOnFail: true`, the error is emitted as `{ json: { error: <message> } }` on the main output.
- Schema resolution errors (table not found, column not found) throw immediately.
- Row-level security (RLS) policy restrictions cause empty query results without throwing. This is a documented common issue: RLS blocks all access until explicit policies are created.

### AI tool usage

This node can be exposed as a tool for AI agents. In tool mode, parameters may be populated dynamically by the AI model rather than from workflow expression evaluation.

## Acceptance tests

### Test: create a row with auto-mapped data

**Given** input items:
```json
[{ "json": { "name": "Alice", "email": "alice@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "row",
  "operation": "create",
  "tableId": "users",
  "dataToSend": "autoMapInputData",
  "inputsToIgnore": ""
}
```

**Expect** a single HTTP POST to `/rest/v1/users` with body `{"name":"Alice","email":"alice@example.com"}` and `Prefer: return=representation`. Output[0] contains the created row.

### Test: get all rows with manual filters

**Parameters:**
```json
{
  "resource": "row",
  "operation": "getAll",
  "tableId": "users",
  "returnAll": true,
  "filterType": "manual",
  "matchType": "allFilters",
  "filters": {
    "conditions": [
      { "keyName": "age", "condition": "gte", "keyValue": "18" },
      { "keyName": "status", "condition": "eq", "keyValue": "active" }
    ]
  }
}
```

**Expect** HTTP GET to `/rest/v1/users?age=gte.18&status=eq.active&select=*`. Output[0] contains one item per matching row.

### Test: update rows with raw filter string

**Parameters:**
```json
{
  "resource": "row",
  "operation": "update",
  "tableId": "users",
  "dataToSend": "defineBelow",
  "fieldsUi": {
    "fieldValues": [{ "fieldId": "role", "fieldValue": "admin" }]
  },
  "filterType": "string",
  "filterString": "email=eq.alice@example.com"
}
```

**Expect** HTTP PATCH to `/rest/v1/users?email=eq.alice%40example.com` with body `{"role":"admin"}` and `Prefer: return=representation`. Output[0] contains the updated row.

### Test: delete with manual filter

**Parameters:**
```json
{
  "resource": "row",
  "operation": "delete",
  "tableId": "users",
  "filterType": "manual",
  "matchType": "anyFilter",
  "filters": {
    "conditions": [{ "keyName": "id", "condition": "eq", "keyValue": "42" }]
  }
}
```

**Expect** HTTP DELETE to `/rest/v1/users?id=eq.42`. Output[0] contains `{ "success": true }`.

### Test: custom schema with getAll

**Parameters:**
```json
{
  "useCustomSchema": true,
  "schema": "custom_schema",
  "resource": "row",
  "operation": "getAll",
  "tableId": "my_table",
  "filterType": "none"
}
```

**Expect** HTTP GET to `/rest/v1/my_table?select=*` with `Accept-Profile: custom_schema` header (or `?schema=custom_schema` query param). Output[0] contains all rows from the custom schema.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource list | Public docs + descriptor | Single resource: Row |
| Operation list | Public docs + descriptor | 5 operations: create, delete, get, getAll, update |
| Filter condition operators | Descriptor metadata | 10 operators + 4 full-text search functions |
| Data-to-send modes | Descriptor metadata | autoMapInputData / defineBelow |
| Schema selection | Public docs + descriptor | useCustomSchema toggle + schema string field |
| Table/column dynamic loading | Descriptor metadata | loadOptionsMethod for getTables / getTableColumns |
| PostgREST filter syntax | Public docs (common issues) | Raw string filter format documented |
| API response shapes | Inferred from PostgREST convention | `Prefer: return=representation` for create/update |
| Delete return shape | Inferred from REST conventions | `{ success: true }` |
| RLS behavior | Public docs (common issues) | RLS causes empty results, not errors |
| AI tool capability | Public docs | Node can be used as AI agent tool |
| Custom schema transport | Inferred from PostgREST protocol | `Accept-Profile` header or `schema` query param |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/supabase.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
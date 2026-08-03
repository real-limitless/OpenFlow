---
type: n8n-nodes-base.supabaseTool
displayName: Supabase Tool
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Supabase Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/supabase/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://supabase.com/docs/guides/api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.supabaseTool`
- **Aliases:** `n8n-nodes-base.supabase` (base node)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `supabaseApi` (required) — Host (Project URL) + Secret Key

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | row | yes | — | Single resource: `row` |
| operation | options | create | yes | — | One of: `create`, `get`, `getAll`, `update`, `delete` |
| tableId | resourceLocator (list/ID) | — | yes | all operations | Loaded dynamically from Supabase project; depends on custom schema setting |
| useCustomSchema | boolean | false | no | — | When enabled, sends `Content-Profile` / `Accept-Profile` headers for non-public schemas |
| schema | string | public | when useCustomSchema=true | show when useCustomSchema=true | Schema name to target instead of `public` |
| dataToSend | options | defineBelow | on create/update | show when operation=create or update | `defineBelow` (manual column mapping) or `autoMapInputData` (match input properties to column names) |
| inputsToIgnore | string | — | on create/update & autoMapInputData | show when operation=create/update & dataToSend=autoMapInputData | Comma-separated input properties to exclude from auto-mapping |
| fieldsUi | fixedCollection | — | on create/update & defineBelow | show when operation=create/update & dataToSend=defineBelow | Column-value pairs: each entry has `fieldId` (column name from dynamic load) and `fieldValue` (expression) |
| filterType | options | manual | on create/update/delete/getAll | show for those operations | `none`, `manual` (build conditions), or `string` (raw PostgREST filter string) |
| matchType | options | anyFilter | on create/update/delete/getAll & filterType=manual | show when filterType=manual | `anyFilter` (OR) or `allFilters` (AND) for combining conditions |
| filters | fixedCollection | — | on create/update/delete/getAll & filterType=manual | show when filterType=manual | Conditions with `keyName` (column), `condition` (operator), `keyValue` (value); for fullText, also `searchFunction` (fts/plfts/phfts/wfts) |
| filterString | string | — | on create/update/delete/getAll & filterType=string | show when filterType=string | Raw PostgREST filter syntax, e.g. `name=eq.jhon` |
| Select Conditions | fixedCollection | — | on get | show when operation=get | Conditions for GET (single row lookup): each entry has `keyName` (column) and `keyValue` (value); uses `eq` operator |
| returnAll | boolean | false | on getAll | show when operation=getAll | Return all matching rows or limit |
| limit | number | 50 | on getAll & returnAll=false | show when operation=getAll & returnAll=false | Max rows to return |

### Condition operators

When `filterType=manual`, each condition uses one of these operators:

| Operator | PostgREST mapping | Description |
|----------|-------------------|-------------|
| `eq` | `.eq.` | Equals |
| `neq` | `.neq.` | Not equals |
| `gt` | `.gt.` | Greater than |
| `gte` | `.gte.` | Greater than or equal |
| `lt` | `.lt.` | Less than |
| `lte` | `.lte.` | Less than or equal |
| `like` | `.like.` | SQL LIKE (use `*` instead of `%`) |
| `ilike` | `.ilike.` | Case-insensitive LIKE (use `*` instead of `%`) |
| `is` | `.is.` | IS comparison for null/true/false/unknown |
| `fullText` | `.fts.` / `.plfts.` / `.phfts.` / `.wfts.` | Full-text search with configurable search function |

## Runtime behavior

### Input

Consumes items on `main` input. Each item provides data for the operation:
- For `create`/`update`: column values come from `fieldsUi` entries (manual) or auto-mapped from item JSON properties. The node sends `Prefer: return=representation` header to receive the created/updated row back.
- For `get`: `Select Conditions` key-value pairs identify the target row; only exact-match (`eq`) filtering is used.
- For `getAll`/`delete`/`update`: `filters` (manual or string) build PostgREST query parameters for row selection. `matchType` controls AND vs OR across conditions.

### Output

Produces items on `main` output:
- **create**: One item per input item with the created row (all columns returned per PostgREST representation). Contains at minimum the row data.
- **get**: One item with the matched row, or empty if not found.
- **getAll**: One item per returned row, with row fields as JSON properties.
- **update**: One item per input item with the updated row (all columns returned).
- **delete**: One item per input item with the deleted row data (returned before deletion due to `Prefer: return=representation`).

For create/update/delete, the Supabase PostgREST response includes all columns of the affected row, not a reduced subset. The executor must not impose an output column filter.

### Errors

- Auth failures (invalid Host/Secret Key) throw
- Missing table errors throw
- Constraint violations (unique, foreign key) throw
- `continueOnFail`: When enabled, failed items emit error output on the second output branch instead of stopping execution
- PostgREST returns HTTP 2xx with a body; non-2xx responses throw `NodeApiError`

### Expressions

All string parameters accept n8n expressions (`{{ $json.field }}`, `{{ $('node').item.json.field }}`). `fieldValue` entries in `fieldsUi` and `keyValue` entries in conditions accept expressions.

## Acceptance tests

### Test: create row (manual column mapping)

**Given** input items:
```json
[{ "json": { "title": "Hello", "content": "World" } }]
```

**Parameters:**
```json
{
  "operation": "create",
  "resource": "row",
  "tableId": "posts",
  "dataToSend": "defineBelow",
  "fieldsUi": {
    "fieldValues": [
      { "fieldId": "title", "fieldValue": "={{ $json.title }}" },
      { "fieldId": "content", "fieldValue": "={{ $json.content }}" }
    ]
  }
}
```

**Expect** output[0]: one item with the created row including all columns (id, title, content, created_at)

### Test: getAll rows with manual filters

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "getAll",
  "resource": "row",
  "tableId": "posts",
  "returnAll": false,
  "limit": 10,
  "filterType": "manual",
  "matchType": "allFilters",
  "filters": {
    "conditions": [
      { "keyName": "status", "condition": "eq", "keyValue": "published" },
      { "keyName": "created_at", "condition": "gte", "keyValue": "2024-01-01" }
    ]
  }
}
```

**Expect** output[0]: up to 10 items, each having the row fields as JSON properties, filtered by `status=eq.published` and `created_at=gte.2024-01-01`

### Test: get single row

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "get",
  "resource": "row",
  "tableId": "posts",
  "filters": {
    "conditions": [
      { "keyName": "id", "keyValue": "42" }
    ]
  }
}
```

**Expect** output[0]: one item with the row where `id=42`, or empty output if no match

### Test: update row with auto-map

**Given** input items:
```json
[{ "json": { "id": 1, "title": "Updated Title", "content": "Updated Content" } }]
```

**Parameters:**
```json
{
  "operation": "update",
  "resource": "row",
  "tableId": "posts",
  "dataToSend": "autoMapInputData",
  "inputsToIgnore": "id",
  "filterType": "manual",
  "matchType": "allFilters",
  "filters": {
    "conditions": [
      { "keyName": "id", "condition": "eq", "keyValue": "={{ $json.id }}" }
    ]
  }
}
```

**Expect** output[0]: one item with the updated row (title and content changed)

### Test: delete row

**Given** input items:
```json
[{ "json": { "id": 1 } }]
```

**Parameters:**
```json
{
  "operation": "delete",
  "resource": "row",
  "tableId": "posts",
  "filterType": "manual",
  "matchType": "allFilters",
  "filters": {
    "conditions": [
      { "keyName": "id", "condition": "eq", "keyValue": "={{ $json.id }}" }
    ]
  }
}
```

**Expect** output[0]: one item with the deleted row data (returned before deletion)

### Test: getAll with raw filter string

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "operation": "getAll",
  "resource": "row",
  "tableId": "posts",
  "returnAll": false,
  "limit": 5,
  "filterType": "string",
  "filterString": "category=eq.tech&status=eq.published"
}
```

**Expect** output[0]: up to 5 items matching the raw PostgREST filter string `category=eq.tech&status=eq.published`

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Row resource + 5 operations | documented | Confirmed in public docs: create, get, getAll, update, delete |
| Credentials (Host + Secret Key) | documented | Confirmed in credential docs; connects to PostgREST Data API |
| AI tool mode ($fromAI) | documented | Node marked `usableAsTool: true`; parameters support `$fromAI()` |
| Table ID dynamic loading | inferred | Table list loaded from Supabase project via REST; UI uses resourceLocator |
| Data mapping (autoMapInputData / defineBelow) | inferred | Standard pattern across n8n database tool nodes |
| Filter conditions with operators | inferred | PostgREST filter operators match documented PostgREST API (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, fullText variants) |
| Custom schema support | inferred | Uses Content-Profile / Accept-Profile PostgREST headers as documented by Supabase |
| Prefer: return=representation | inferred | Standard PostgREST header for returning affected rows |
| Full-text search functions | inferred | fts (to_tsquery), plfts (plainto_tsquery), phfts (phraseto_tsquery), wfts (websearch_to_tsquery) — documented PostgREST functions |
| Limit/returnAll on getAll | documented | Standard pagination documented in public docs |
| No trigger support | documented | Tool is an action node, not a trigger |

## OpenFlow mapping

- **Definition group:** `transform` (Data & Storage category)
- **Executor file:** `src/lib/engine/executors/SupabaseTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

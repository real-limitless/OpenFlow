---
type: n8n-nodes-base.airtable
displayName: Airtable
category: Data & Storage
versions: [2, 2.1, 2.2]
priority: medium
status: specced
---

# Airtable

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtable.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/airtable.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.airtabletrigger.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.airtable`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `airtableTokenApi` (Personal Access Token) or `airtableOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `airtableTokenApi` | yes | always | `airtableTokenApi` (Access Token), `airtableOAuth2Api` (OAuth2) |
| resource | options | `record` | yes | always | `record` (default), `base` |
| operation | options | `get` (record) / `getMany` (base) | yes | by resource | record: create/upsert/deleteRecord/get/search/update; base: getMany/getSchema |
| base | resourceLocator | `{ mode: 'list', value: '' }` | yes | record \| base.getSchema | list/url/id modes; not shown for base.getMany |
| table | resourceLocator | `{ mode: 'list', value: '' }` | yes | record | list/url/id modes; depends on base.value |
| view | resourceLocator | `{ mode: 'list', value: '' }` | no | search.options | list/url/id modes; depends on base.value + table.value |
| columns | resourceMapper | `{ mappingMode: 'defineBelow', value: null }` | yes | create/update/upsert | resourceMapperMethod: getColumns or getColumnsWithRecordId; mode: add (create) or update (update/upsert) |
| id | string | `''` | yes | get/deleteRecord | record ID |
| filterByFormula | string | `''` | no | search | Airtable formula; empty = all records |
| returnAll | boolean | `true` | no | search, base.getMany | paginate all results |
| limit | number | `100` | no | search (!returnAll), base.getMany (!returnAll) | max 100 |
| sort | fixedCollection | `{}` | no | search | property[].field (dynamic from getColumns) + property[].direction (asc/desc) |
| options (search) | collection | `{}` | no | search | downloadFields (multiOptions, dynamic), fields (multiOptions, dynamic), view (resourceLocator) |
| options (get) | collection | `{}` | no | get | downloadFields (multiOptions, dynamic) |
| options (create/update/upsert) | collection | `{}` | no | create/update/upsert | typecast (boolean, default false), ignoreFields (string, autoMapInputData only), updateAllMatches (boolean, update/upsert only) |
| options (getMany) | collection | `{}` | no | base.getMany | permissionLevel (multiOptions: comment/create/edit/none/read) |

### v1 (legacy, version 1)

v1 uses a flat operation list (no resource): Append/Delete/List/Read/Update. Auth defaults to deprecated `airtableApi` (API Key). Parameters include application (base), table, fields (comma-separated), id, returnAll, limit, downloadAttachments, downloadFieldNames, additionalOptions collection (fields, filterByFormula, sort, typecast).

## Runtime behavior

### Resource: Record

**Create** — POSTs fields to `/{base}/{table}` with optional typecast. Uses resourceMapper in `add` mode (no record id expected). Returns the created record object from Airtable API.

**Create or Update (upsert)** — PATCHes records to `/{base}/{table}` with `performUpsert.fieldsToMergeOn`. If columns include `id`, existing records with that id are updated; if 422, falls back to POST to create. Without `id`, matches on columnsToMatchOn fields; if multiple matches found, updates first or all (updateAllMatches). Returns array of `{ records: [...] }`.

**Delete** — DELETEs `/{base}/{table}/{id}`. Returns the deleted record from Airtable API.

**Get** — GETs `/{base}/{table}/{id}`. Optional `downloadFields` to fetch attachment binaries. Returns flattened record object with `id` + `fields.*`.

**Search** — GETs `/{base}/{table}` with optional `filterByFormula`, `fields`, `sort`, `view`, `maxRecords` (if not returnAll). If returnAll, paginates via offset. Optional `downloadFields` on all returned records. Before v2.1, query runs once for all input items (pairedItem fallback); from v2.1, runs per-item.

**Update** — PATCHes `/{base}/{table}` with record id and fields. If `id` column included in match columns, uses that directly. If not, fetches all records from table, matches via `findMatches` helper, then updates matched records. Returns `{ records: [...] }`.

### Resource: Base

**Get Many** — GETs `meta/bases` with optional pagination. Filters by `permissionLevel` if specified. Returns base objects.

**Get Schema** — GETs `meta/bases/{base}/tables`. Returns table array with id, name, and fields (id, name, type).

### Errors

- Airtable API errors are processed through `processAirtableError` which normalizes error messages and includes record id context.
- `continueOnFail` returns error items as `{ json: { message, error } }` or `{ json: { error: message } }` (delete/get).
- Common issues: 403 Forbidden (insufficient scopes), 429 rate limit (5 req/s per base, 30s cooldown).

### Expressions

All string/number/boolean parameters accept expressions. resourceMapper columns.value, filterByFormula, id, and option sub-fields support expressions.

## Acceptance tests

### Test: base.getMany — list all bases

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "base",
  "operation": "getMany",
  "returnAll": true,
  "options": {}
}
```

**Expect** output[0]:

```json
[
  {
    "json": {
      "id": "appXXXXXXXXXXXXXX",
      "name": "My Base",
      "permissionLevel": "read"
    }
  }
]
```

### Test: record.create — create record with columns

**Given** input items:

```json
[{ "json": { "Name": "Alice", "Email": "alice@example.com" } }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "record",
  "operation": "create",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" },
  "table": { "mode": "id", "value": "tblYYYYYYYYYYYYYY" },
  "columns": {
    "mappingMode": "autoMapInputData",
    "value": null
  },
  "options": {
    "typecast": false
  }
}
```

**Expect** output[0]:

```json
[
  {
    "json": {
      "id": "recZZZZZZZZZZZZZZ",
      "createdTime": "2024-01-15T12:00:00.000Z",
      "fields": {
        "Name": "Alice",
        "Email": "alice@example.com"
      }
    }
  }
]
```

### Test: record.search — filter by formula with limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "record",
  "operation": "search",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" },
  "table": { "mode": "id", "value": "tblYYYYYYYYYYYYYY" },
  "filterByFormula": "{Status} = 'Active'",
  "returnAll": false,
  "limit": 10,
  "sort": {
    "property": [{ "field": "Name", "direction": "asc" }]
  }
}
```

**Expect** output[0]:

```json
[
  {
    "json": {
      "id": "recZZZZZZZZZZZZZZ",
      "fields": {
        "Name": "Alice",
        "Status": "Active"
      }
    }
  }
]
```

### Test: record.upsert — create or update by match column

**Given** input items:

```json
[{ "json": { "id": "recZZZZZZZZZZZZZZ", "Email": "newalice@example.com" } }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "record",
  "operation": "upsert",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" },
  "table": { "mode": "id", "value": "tblYYYYYYYYYYYYYY" },
  "columns": {
    "mappingMode": "autoMapInputData",
    "matchingColumns": ["id"]
  },
  "options": {
    "typecast": false
  }
}
```

**Expect** output[0]:

```json
[
  {
    "json": {
      "records": [{ "id": "recZZZZZZZZZZZZZZ", "fields": { "Email": "newalice@example.com" } }]
    }
  }
]
```

### Test: record.get — get single record

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "airtableTokenApi",
  "resource": "record",
  "operation": "get",
  "base": { "mode": "id", "value": "appXXXXXXXXXXXXXX" },
  "table": { "mode": "id", "value": "tblYYYYYYYYYYYYYY" },
  "id": "recZZZZZZZZZZZZZZ"
}
```

**Expect** output[0]:

```json
[
  {
    "json": {
      "id": "recZZZZZZZZZZZZZZ",
      "fields": {
        "Name": "Alice",
        "Email": "alice@example.com"
      },
      "createdTime": "2024-01-15T12:00:00.000Z"
    }
  }
]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list and parameters | Documented (public docs + descriptor) | Doc lists 5 operations (append/list/read/update/delete); descriptor reveals v2 resource model (record/base) with 8 operations including upsert, search, getSchema, getMany |
| Version diffs (v1 vs v2) | Descriptor metadata | v1 is legacy flat operation model; v2 is resource-based with resourceMapper; v2 supports versions 2/2.1/2.2 |
| ResourceMapper column loading | Descriptor (loadOptionsMethod) | Dynamic from getColumns/getColumnsWithRecordId methods |
| Airtable API response shapes | Public docs + descriptor | Wraps Airtable REST API; responses include `records[]`, `id`, `fields`, `createdTime` |
| Error handling / rate limits | Public docs (common issues) | 429 rate limiting: 5 req/s per base, 30s cooldown |
| Trigger node (airtableTrigger) | Public docs only | Polling-based trigger; not covered by this spec (separate node type) |

## OpenFlow mapping

- **Definition group:** `data` (app/integration)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.airtable.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

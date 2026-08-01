---
type: n8n-nodes-base.webflow
displayName: Webflow
category: Marketing
versions: [2]
priority: medium
status: specced
---

# Webflow

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.webflow.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/webflow.md | Public docs only |
| https://developers.webflow.com/data/reference/rest-introduction | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.webflow`
- **Aliases:** `delete` -> `deleteItem`
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `webflowOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: ["item"] | "item" | Y | — | Only one resource |
| operation | options | "get" | Y | resource=item | One of: create, deleteItem, get, getAll, update |
| siteId | options (loaded) | "" | Y | resource=item | Dynamically populated from Webflow account |
| collectionId | options (loaded) | "" | Y | resource=item | Depends on siteId; dynamically populated |
| itemId | string | "" | Y | operation in [get,deleteItem,update] | CMS item identifier |
| live | boolean | false | N | operation in [create,update] | Publish to live site immediately |
| returnAll | boolean | false | N | operation=getAll | Return all items vs paginated |
| limit | number | 100 | N | operation=getAll AND returnAll=false | Max items (1-100) |
| fieldsUi | fixedCollection | {} | N | operation in [create,update] | Key-value pairs: fieldId + fieldValue |

The `fieldsUi` fixedCollection contains a single option group named `fieldValues`. Each entry pairs a `fieldId` (string, the collection field key) with a `fieldValue` (string, the value to set). The fieldId options are dynamically loaded based on the selected collectionId.

## Runtime behavior

### Input

Each input item is processed independently. For `create` and `update`, the `fieldsUi.fieldValues` collection is flattened into the `fieldData` object sent to the Webflow API.

### Output

| Operation | Output shape |
|-----------|-------------|
| create | Single item object from POST response body: `{ id, fieldData, createdOn, lastUpdated, isArchived, isDraft }` |
| deleteItem | `{ success: true }` on 204; `{ success: false }` on any other status code |
| get | Single item object from GET response body |
| getAll | Array of item objects; paginated or full collection |
| update | Single item object from PATCH response body |

The `deleteItem` operation accepts the wire value `deleteItem`. It also supports the alias `delete` for convenience, which maps to the same behavior.

### Errors

On API failure (non-2xx status, network error, malformed request), the node throws unless `continueOnFail` is enabled, in which case an error item `{ json: { message, error } }` is emitted for that input index. The `deleteItem` operation does not throw on non-204 statuses; it returns `{ success: false }` instead.

### Expressions

All parameters that accept string or options values support n8n expression syntax. The `fieldValue` parameter within `fieldsUi.fieldValues` accepts expressions.

## Acceptance tests

### Test: create item

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "create",
  "siteId": "site_abc",
  "collectionId": "col_xyz",
  "live": false,
  "fieldsUi": {
    "fieldValues": [
      { "fieldId": "name", "fieldValue": "Test Item" }
    ]
  }
}
```

**Expect** the executor sends `POST /collections/col_xyz/items` with body `{ "fieldData": { "name": "Test Item" } }` and returns the response body as output items.

### Test: delete item (deleteItem operation)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "deleteItem",
  "siteId": "site_abc",
  "collectionId": "col_xyz",
  "itemId": "item_123"
}
```

**Expect** the executor sends `DELETE /collections/col_xyz/items/item_123`. If the API returns 204, output is `{ success: true }`. If any other status, output is `{ success: false }`. Never throws on non-2xx.

### Test: delete item via alias (delete operation)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "delete",
  "siteId": "site_abc",
  "collectionId": "col_xyz",
  "itemId": "item_123"
}
```

**Expect** the executor treats `delete` as equivalent to `deleteItem` and sends `DELETE /collections/col_xyz/items/item_123`.

### Test: get all items with limit

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "getAll",
  "siteId": "site_abc",
  "collectionId": "col_xyz",
  "returnAll": false,
  "limit": 10
}
```

**Expect** the executor sends `GET /collections/col_xyz/items?limit=10` and returns the items array from the response body.

### Test: continue on fail

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "get",
  "siteId": "site_abc",
  "collectionId": "col_xyz",
  "itemId": "nonexistent"
}
```

With `continueOnFail: true`, when the API returns an error, the executor emits `{ json: { message: "...", error: ... } }` without throwing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation enum values | Confirmed via corpus | Wire value is `deleteItem`; `delete` is an alias |
| Site/collection/field dynamic loading | Inferred from implementation | Loaded via credential-scoped API calls |
| Exact response field set | Inferred from schema desciptors | Webflow API may return additional fields per collection schema |
| Webflow API base URL | Inferred | Standard `https://api.webflow.com` |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/webflow.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
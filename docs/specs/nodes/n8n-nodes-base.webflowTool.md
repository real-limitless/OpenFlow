# n8n-nodes-base.webflowTool

AI agent tool variant of the Webflow app node. Wraps the Webflow CMS Data API v2 Item resource CRUD operations so an AI agent can create, read, update, delete, and list items within a Webflow site collection. Parameters can be set dynamically by the AI model through `$fromAI()`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.webflow.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/webflow.md | Public docs only |
| https://developers.webflow.com/data/reference/rest-introduction | External service docs |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.webflowTool`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `webflowOAuth2Api` (OAuth2) or `webflowApi` (API access token) — same credential types as the base Webflow node

## Parameters

### Resource & operation

| Parameter | type | default | required | notes |
|-----------|------|---------|----------|-------|
| resource | fixed | `"item"` | yes | Single resource; always Item |
| operation | enum | — | yes | `"create"`, `"delete"`, `"get"`, `"getAll"`, `"update"` |

The `delete` operation is an alias for the underlying `deleteItem` operation, matching the same behavior as the base Webflow node.

### Target selection

The node must identify the target site, collection, and optionally a specific item:

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| siteId | dynamic options | yes | Loaded from the authenticated Webflow account |
| collectionId | dynamic options | yes | Scoped to the selected site; loaded from Webflow API |
| itemId | string | conditional | Required for get, delete, update operations |

### Data input (create, update)

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| live | boolean | false | Publish changes to the live site immediately |
| fieldsUi | fixedCollection | `{}` | Key-value pairs mapping collection field IDs to values |

The `fieldsUi` fixedCollection contains an option group (e.g. `fieldValues`). Each entry pairs a `fieldId` (string, the collection field key) with a `fieldValue` (string, the value to set). Field ID options are dynamically loaded based on the selected `collectionId`.

### Pagination (getAll)

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| returnAll | boolean | false | Return all items vs paginated |
| limit | number | 100 | Max items (1–100); hidden when returnAll is true |

All operation-specific parameters accept `$fromAI()` expressions and can be populated dynamically by the AI model.

## Runtime behavior

### Input

Each incoming item represents one discrete Webflow CMS item operation. The node reads `operation`, `siteId`, `collectionId`, and any operation-specific parameters from configuration (or from AI-populated expressions) and constructs the corresponding Webflow Data API v2 call.

### Output

| Operation | Output shape |
|-----------|-------------|
| create | Single item object from POST response: `{ id, fieldData, createdOn, lastUpdated, isArchived, isDraft }` |
| delete | `{ "success": true }` on 204; `{ "success": false }` on other status |
| get | Single item object from GET response |
| getAll | Array of item objects from GET collection response; paginated or full collection |
| update | Single item object from PATCH response |

The output shape mirrors the Webflow CMS Data API v2 response for each operation.

### Errors

- Missing or invalid credentials -> descriptive error.
- API error (non-2xx, network failure, malformed request) -> error thrown.
- `continueOnFail` -> emits an error item `{ json: { message, error } }` without throwing.
- The `delete` operation does not throw on non-204 statuses; it returns `{ "success": false }`.

### Expressions

All operation-specific parameters support n8n expression syntax and `$fromAI()` dynamic population. Resource and operation selectors may also be dynamic.

## Acceptance tests

### Test: create item with field data

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

**Expect** the executor sends `POST /collections/col_xyz/items` with body `{ "fieldData": { "name": "Test Item" } }` and returns the created item object from the API response as output[0].

### Test: get single item

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
  "itemId": "item_123"
}
```

**Expect** the executor sends `GET /collections/col_xyz/items/item_123` and returns the item object as output[0].

### Test: delete item

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

**Expect** the executor sends `DELETE /collections/col_xyz/items/item_123`. On 204, output is `{ "success": true }`. On other statuses, output is `{ "success": false }`. Never throws on non-2xx.

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

**Expect** the executor sends `GET /collections/col_xyz/items?limit=10` and returns the items array from the response as output[0].

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
| Operations | documented | Same 5 Item operations as base Webflow node: create, delete, get, getAll, update |
| Credentials | documented | Uses same credential types (OAuth2 + API access token) as base node |
| `$fromAI()` support | documented | Public docs confirm base node can be used as AI tool with dynamic param population |
| No dedicated tool docs page | documented | The tool variant has no separate n8n docs page; behavior is inferred from base node |
| Parameter shapes | inferred from base node | Tool variant inherits same parameter structure as base Webflow node |
| Site/collection/field dynamic loading | inferred from base node | Dynamic options loading follows same pattern as base Webflow node |
| Response shapes | inferred | Follows Webflow CMS Data API v2 conventions |

## OpenFlow mapping

- **Definition group:** `Webflow`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.webflowTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

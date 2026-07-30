---
type: n8n-nodes-base.webflow
displayName: Webflow
category: Transform
versions: [1, 2]
defaultVersion: 2
priority: medium
status: specced
---

# Webflow

Consume the Webflow API to create, read, update, and delete Collection items.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.webflow/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/webflow/ | Public docs only (credentials) |
| https://developers.webflow.com/ | Third-party service API docs (Webflow API reference, paraphrased) |

## Wire format

- **Type string:** `n8n-nodes-base.webflow`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `webflowApi` — access token (`accessToken`) — used when `authentication = accessToken`
  - `webflowOAuth2Api` — OAuth2 — used when `authentication = oAuth2`
- **Categories:** Marketing, Transform — group `transform` (**descriptor**)

### Resources and operations (documented)

| Resource | Operation | Webflow API endpoint | Documented |
|----------|-----------|----------------------|------------|
| Item | Create | `POST /collections/{collectionId}/items` | yes |
| Item | Delete | `DELETE /collections/{collectionId}/items/{itemId}` | yes |
| Item | Get | `GET /collections/{collectionId}/items/{itemId}` | yes |
| Item | Get Many | `GET /collections/{collectionId}/items` | yes |
| Item | Update | `PATCH /collections/{collectionId}/items/{itemId}` | yes |

## Parameters

### Common (all operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `accessToken` | yes | — | `accessToken` \| `oAuth2` (**documented**) |
| resource | options | `item` | yes | — | Only `item` available (**documented**) |
| operation | options | `get` | yes | resource=item | `create` \| `delete` \| `get` \| `getAll` \| `update` (**documented**) |

### Item — Create parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| siteId | options | | yes | resource=item, operation=create | Site containing the collection. Load options via `getSites` (**documented** + **inferred** loadOptionsMethod) |
| collectionId | options | | yes | resource=item, operation=create | Collection to add item to. Load options via `getCollections` (depends on `siteId`) (**documented** + **inferred** loadOptionsMethod) |
| live | boolean | `false` | yes | resource=item, operation=create | Publish item to live site (**documented**) |
| fieldsUi.fieldValues[].fieldId | options | | yes* | resource=item, operation=create | Field to set. Load options via `getFields` (depends on `collectionId`) (**documented** + **inferred** loadOptionsMethod) |
| fieldsUi.fieldValues[].fieldValue | string | `''` | no | resource=item, operation=create | Value for the field (**documented**) |

* `fieldsUi.fieldValues` is a fixedCollection with `multipleValues: true`; at least one entry is required to create an item with fields.

### Item — Get parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| siteId | options | | yes | resource=item, operation=get | Site containing the collection. Load options via `getSites` (**documented** + **inferred**) |
| collectionId | options | | yes | resource=item, operation=get | Collection to get item from. Load options via `getCollections` (depends on `siteId`) (**documented** + **inferred**) |
| itemId | string | | yes | resource=item, operation=get | ID of the item to retrieve (**documented**) |

### Item — Delete parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| siteId | options | | yes | resource=item, operation=delete | Site containing the collection. Load options via `getSites` (**documented** + **inferred**) |
| collectionId | options | | yes | resource=item, operation=delete | Collection to delete item from. Load options via `getCollections` (depends on `siteId`) (**documented** + **inferred**) |
| itemId | string | | yes | resource=item, operation=delete | ID of the item to delete (**documented**) |

### Item — Update parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| siteId | options | | yes | resource=item, operation=update | Site containing the collection. Load options via `getSites` (**documented** + **inferred**) |
| collectionId | options | | yes | resource=item, operation=update | Collection to update item in. Load options via `getCollections` (depends on `siteId`) (**documented** + **inferred**) |
| itemId | string | | yes | resource=item, operation=update | ID of the item to update (**documented**) |
| live | boolean | `false` | yes | resource=item, operation=update | Publish updated item to live site (**documented**) |
| fieldsUi.fieldValues[].fieldId | options | | yes* | resource=item, operation=update | Field to update. Load options via `getFields` (depends on `collectionId`) (**documented** + **inferred**) |
| fieldsUi.fieldValues[].fieldValue | string | `''` | no | resource=item, operation=update | New value for the field (**documented**) |

* `fieldsUi.fieldValues` is a fixedCollection with `multipleValues: true`; at least one entry is required to update an item with fields.

### Item — Get Many parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| siteId | options | | yes | resource=item, operation=getAll | Site containing the collection. Load options via `getSites` (**documented** + **inferred**) |
| collectionId | options | | yes | resource=item, operation=getAll | Collection to get items from. Load options via `getCollections` (depends on `siteId`) (**documented** + **inferred**) |
| returnAll | boolean | `false` | no | resource=item, operation=getAll | Return all items (paginates internally) (**documented**) |
| limit | number | `100` | no* | resource=item, operation=getAll, returnAll=false | Max items to return (1–100) (**documented**) |

* Required when `returnAll = false`.

### Load options methods (inferred from descriptor)

| method | dependsOn | returns |
|--------|-----------|---------|
| getSites | — | Array of `{ name: string, value: string }` — site names and IDs |
| getCollections | siteId | Array of `{ name: string, value: string }` — collection names and IDs for the site |
| getFields | collectionId | Array of `{ name: string, value: string }` — field names and IDs for the collection |

## Runtime behavior

### Input

- Consumes `main` input items (one API call per item).
- All string parameters accept n8n expression strings (`{{ … }}`) for per-item templating (**inferred** / standard n8n behaviour).
- The `fieldsUi.fieldValues` fixedCollection is transformed into a flat `fieldData` object (`fieldId` → `fieldValue`) for the API request body.

### Output

| Operation | Output item shape | Documented / inferred |
|-----------|-------------------|------------------------|
| Create | `json` = created item object (includes `id`, `fieldData`, `createdOn`, `updatedOn`, …) | documented / Webflow API |
| Delete | `json` = `{ success: true }` on HTTP 204, `{ success: false }` otherwise | inferred from V1/V2 code |
| Get | `json` = item object | documented / Webflow API |
| Get Many | `json` = array of item objects (when `returnAll=true` or up to `limit`) | documented / Webflow API |
| Update | `json` = updated item object | documented / Webflow API |

### Errors

- Missing required credential (`webflowApi` or `webflowOAuth2Api`) throws (**inferred**).
- Invalid/expired access token → HTTP 401 from Webflow, surfaced as node error (**inferred** / standard HTTP behaviour).
- Missing required parameters (`siteId`, `collectionId`, `itemId`, etc.) throws (**inferred**).
- Webflow API rate limits (HTTP 429) surface as node errors (**inferred** / standard HTTP behaviour).
- `continueOnFail` respected: on error, outputs `{ json: { error: string, message: string } }` per item instead of throwing (**inferred** from V1/V2 execute code).

### Expressions

All string parameters (`siteId`, `collectionId`, `itemId`, `fieldValue`, etc.) accept n8n expression strings (`{{ … }}`) for per-item templating (**inferred** / standard n8n behaviour).

### Live publishing

- `live = true` on Create/Update appends `/live` to the API endpoint path, publishing the item immediately (**inferred** from V1/V2 code).
- `live = false` creates/updates the item in draft/staging only (**inferred**).

## Acceptance tests

### Test: create item

**Given** one input item `{}`

**Parameters:**

```json
{
  "authentication": "accessToken",
  "resource": "item",
  "operation": "create",
  "siteId": "site_123",
  "collectionId": "coll_456",
  "live": false,
  "fieldsUi": {
    "fieldValues": [
      { "fieldId": "name", "fieldValue": "Test Item" },
      { "fieldId": "slug", "fieldValue": "test-item" }
    ]
  }
}
```

**Expect** one outgoing `POST https://api.webflow.com/v2/collections/coll_456/items` with JSON body `{ "fieldData": { "name": "Test Item", "slug": "test-item" } }` and output[0][0].json = created item object (contains `id`, `fieldData`, etc.).

### Test: get item

**Given** one input item `{}`

**Parameters:**

```json
{
  "authentication": "accessToken",
  "resource": "item",
  "operation": "get",
  "siteId": "site_123",
  "collectionId": "coll_456",
  "itemId": "item_789"
}
```

**Expect** one outgoing `GET https://api.webflow.com/v2/collections/coll_456/items/item_789`; output[0][0].json = item object.

### Test: get many items (limited)

**Given** one input item `{}`

**Parameters:**

```json
{
  "authentication": "accessToken",
  "resource": "item",
  "operation": "getAll",
  "siteId": "site_123",
  "collectionId": "coll_456",
  "returnAll": false,
  "limit": 50
}
```

**Expect** one outgoing `GET https://api.webflow.com/v2/collections/coll_456/items?limit=50`; output[0][0].json = array of up to 50 item objects.

### Test: update item

**Given** one input item `{}`

**Parameters:**

```json
{
  "authentication": "accessToken",
  "resource": "item",
  "operation": "update",
  "siteId": "site_123",
  "collectionId": "coll_456",
  "itemId": "item_789",
  "live": true,
  "fieldsUi": {
    "fieldValues": [
      { "fieldId": "name", "fieldValue": "Updated Name" }
    ]
  }
}
```

**Expect** one outgoing `PATCH https://api.webflow.com/v2/collections/coll_456/items/item_789/live` with JSON body `{ "fieldData": { "name": "Updated Name" } }`; output[0][0].json = updated item object.

### Test: delete item

**Given** one input item `{}`

**Parameters:**

```json
{
  "authentication": "accessToken",
  "resource": "item",
  "operation": "delete",
  "siteId": "site_123",
  "collectionId": "coll_456",
  "itemId": "item_789"
}
```

**Expect** one outgoing `DELETE https://api.webflow.com/v2/collections/coll_456/items/item_789`; output[0][0].json = `{ success: true }` (on HTTP 204).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact wire field names for `fieldData` object | documented | Webflow API uses `fieldData` as the wrapper; confirmed by V1/V2 code |
| Output shape for `getAll` when `returnAll=true` | inferred | V2 uses `webflowApiRequestAllItems` which returns flat array; V1 returns `responseData.items` |
| Delete success response shape | inferred | V1/V2 code maps HTTP 204 → `{ success: true }`, else `{ success: false }` |
| OAuth2 credential flow details | documented (credentials doc) | `webflowOAuth2Api` uses standard OAuth2; spec does not model auth flow |
| V1 vs V2 API version differences | partially documented | V2 uses `/v2/` endpoints; V1 used `/v1/` (now deprecated in n8n) — spec targets current V2 behaviour |
| Load options method signatures | inferred from descriptor | `getSites`, `getCollections`, `getFields` names and `dependsOn` from V2 code |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/webflow.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Two credential types (`webflowApi` for access token, `webflowOAuth2Api` for OAuth2) selected via `authentication` parameter. Versioned node (v1, v2) with v2 as default.
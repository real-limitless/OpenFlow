---
type: n8n-nodes-base.microsoftSharePoint
displayName: Microsoft SharePoint
category: ECM
versions: [1]
priority: medium
status: specced
---

# Microsoft SharePoint

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftsharepoint.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only |
| https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/get-to-know-the-sharepoint-rest-service | Third-party API docs |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftSharePoint`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftSharePointOAuth2Api` (Microsoft OAuth2 with SharePoint-specific subdomain)

## Parameters

The node uses a resource + operation structure. The user selects a resource (File, Item, or List) and an operation within that resource.

### Common parameters (all operations)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | - | yes | `file`, `item`, or `list` |
| operation | fixed | - | yes | depends on resource |

### File resource

| operation | parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Download | site | resourceLocator | yes | Site identifier (list or by-ID mode) |
| Download | folder | resourceLocator | yes | Parent folder; defaults to library root |
| Download | file | resourceLocator | yes | File identifier or path |
| Download | dataPropertyName | string | no | Output binary property name (default `data`) |
| Upload | site | resourceLocator | yes | Site identifier |
| Upload | folder | resourceLocator | yes | Target folder; defaults to library root |
| Upload | fileName | string | yes | Name for the uploaded file |
| Upload | fileContents | string | yes | Name of the input binary field containing the file data |
| Update | site | resourceLocator | yes | Site identifier |
| Update | folder | resourceLocator | yes | Folder containing the file |
| Update | file | resourceLocator | yes | File identifier to update |
| Update | fileName | string | no | New file name; if omitted the original name is kept |
| Update | changeFileContent | boolean | yes | Whether to replace the file binary content |
| Update | fileContents | string | no | Input binary field name (required when changeFileContent is true) |

### Item resource

| operation | parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Create | site | resourceLocator | yes | Site identifier |
| Create | list | resourceLocator | yes | List identifier |
| Create | columns | resourceMapper | yes | Field values to set on the new item; mapped mode (add) |
| upsert | site | resourceLocator | yes | Site identifier |
| upsert | list | resourceLocator | yes | List identifier |
| upsert | columns | resourceMapper | yes | Field values; mapped mode (upsert) |
| Delete | site | resourceLocator | yes | Site identifier |
| Delete | list | resourceLocator | yes | List identifier |
| Delete | item | resourceLocator | yes | Item identifier |
| Get | site | resourceLocator | yes | Site identifier |
| Get | list | resourceLocator | yes | List identifier |
| Get | item | resourceLocator | yes | Item identifier |
| Get | simplify | boolean | no | Whether to select only common fields via `$select` (default `true`) |
| GetAll | site | resourceLocator | yes | Site identifier |
| GetAll | list | resourceLocator | yes | List identifier |
| GetAll | returnAll | boolean | no | Return all results or up to a limit (default `false`) |
| GetAll | limit | number | no | Max items when returnAll is false (default `50`) |
| GetAll | filter | string | no | OData `$filter` formula, e.g. `fields/Title eq 'item1'` |
| GetAll | simplify | boolean | no | Whether to select only common fields via `$select` (default `true`) |
| GetAll | options.fields | multiOptions | no | Specific fields to include in output (e.g. contentType, createdDateTime, createdBy, fields, id, lastModifiedDateTime, lastModifiedBy, parentReference, webUrl) |
| Update | site | resourceLocator | yes | Site identifier |
| Update | list | resourceLocator | yes | List identifier |
| Update | item | resourceLocator | yes | Item identifier |
| Update | columns | resourceMapper | yes | Field values to update; mapped mode (update) |

All item create/update/upsert operations show a notice: "Due to API restrictions, the following column types cannot be updated: Hyperlink, Location, Metadata".

### List resource

| operation | parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| Get | site | resourceLocator | yes | Site identifier |
| Get | list | resourceLocator | yes | List identifier |
| Get | simplify | boolean | no | Select only common fields via `$select` (default `true`) |
| GetAll | site | resourceLocator | yes | Site identifier |
| GetAll | returnAll | boolean | no | Return all results or up to a limit (default `false`) |
| GetAll | limit | number | no | Max items when returnAll is false (default `50`) |
| GetAll | simplify | boolean | no | Select only common fields (default `true`) |

### Credential parameters (Microsoft OAuth2 — SharePoint)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| subdomain | string | - | yes | SharePoint tenant subdomain (e.g. `tenant123` from `https://tenant123.sharepoint.com`) |
| scope | string | (constructed) | yes | Hidden field; constructed as `openid offline_access https://{subdomain}.sharepoint.com/.default` |
| graphApiBaseUrl | string | `https://graph.microsoft.com` | yes | Hidden field; Microsoft Graph API base URL |

### Node-level request options

| name | type | default | notes |
|------|------|---------|-------|
| requestOptions.batching.batchSize | number | 50 | Items per batch; -1 disables batching, 0 treated as 1 |
| requestOptions.batching.batchInterval | number | 1000 | Milliseconds between batches |
| requestOptions.allowUnauthorizedCerts | boolean | false | Ignore SSL certificate validation |
| requestOptions.proxy | string | - | HTTP proxy URL |
| requestOptions.timeout | number | 10000 | Request timeout in milliseconds |

## Runtime behavior

### Input

Each input item is processed independently. The node verifies that the SharePoint OAuth2 credential is present. For operations that consume binary data (file upload/update), the specified `fileContents` field name is read from the input item's binary data.

### Output

**File/Download:** Produces an output item with the original JSON fields plus binary data attached under the `dataPropertyName` key (default `data`).

**File/Upload, File/Update:** Passes through the input item unchanged on success. The SharePoint drive item metadata is returned by the API.

**Item/Create, Item/upsert, Item/Update:** Returns the created or updated item object from the SharePoint REST API, containing fields like `id`, `createdBy`, `createdDateTime`, `lastModifiedBy`, `lastModifiedDateTime`, `eTag`, `webUrl`, and the item's `fields` object with list-specific field values (e.g., `Title`, `ID`, `ContentType`, `Created`, `Modified`).

**Item/Get:** When `simplify` is true, returns the item filtered to common fields. Otherwise returns the full item object including metadata and `fields`.

**Item/GetAll:** When `simplify` is true, each item is filtered to common fields. The raw API response wraps items in a `value` array; the node unwraps this array so that each output item is one list item. Each item includes `id`, `contentType`, `createdBy`, `createdDateTime`, `eTag`, `fields`, `lastModifiedBy`, `lastModifiedDateTime`, `parentReference`, and `webUrl`.

**Item/Delete:** The SharePoint REST API returns 204 No Content. The input item is passed through unchanged.

**List/Get:** Returns the list metadata object with `id`, `displayName`, `description`, `name`, `createdDateTime`, `lastModifiedDateTime`, `webUrl`.

**List/GetAll:** Unwraps the `value` array from the API response, returning one output item per list.

### Errors

- Missing or invalid credentials: throw `NodeOperationError`.
- SharePoint API errors (HTTP 4xx/5xx): propagate as `NodeOperationError` with the API error message.
- Resource not found (404): throw `NodeOperationError`.
- When `continueOnFail` is enabled, the node emits the error as a `{ json: { error: { message, ... } } }` output item on output index 0 and continues execution.

### Expressions

Parameters that accept strings support `{{ }}` expression syntax. Resource identifiers (site, list, file, item IDs) are expression-compatible.

### External API (SharePoint REST / Microsoft Graph)

The node communicates with the SharePoint REST API at `https://{subdomain}.sharepoint.com/_api/v2.0/`:
- GET `/sites/{site-id}/lists` — list lists
- GET `/sites/{site-id}/lists/{list-id}` — get list
- GET `/sites/{site-id}/lists/{list-id}/items` — get items
- GET `/sites/{site-id}/lists/{list-id}/items/{item-id}` — get item
- POST `/sites/{site-id}/lists/{list-id}/items` — create item
- PATCH `/sites/{site-id}/lists/{list-id}/items/{item-id}` — update item (note: endpoint requires item ID in URL for PATCH, not the collection URL)
- DELETE `/sites/{site-id}/lists/{list-id}/items/{item-id}` — delete item
- GET `/sites/{site-id}/drive/items/{file-id}/content` — download file
- PUT `/sites/{site-id}/drive/items/{folder-id}:/{filename}:/content` — upload file
- PATCH `/sites/{site-id}/drive/items/{file-id}` — update file metadata

Pagination uses `@odata.nextLink` from the response body for continuation.

## Acceptance tests

### Test: list all lists

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "list",
  "operation": "getAll",
  "site": "my-site-id",
  "returnAll": true
}
```

**Expect** output[0] to contain unwrapped list objects:
```json
[{
  "json": {
    "id": "b0d2e8f0-1234-5678-9abc-def012345678",
    "displayName": "My List",
    "description": "",
    "name": "MyList",
    "createdDateTime": "2024-01-01T00:00:00Z",
    "lastModifiedDateTime": "2024-06-01T00:00:00Z",
    "webUrl": "https://tenant123.sharepoint.com/sites/my-site/Lists/MyList"
  }
}]
```

### Test: create a list item

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "create",
  "site": "my-site-id",
  "list": "my-list-id",
  "columns": {
    "mappingMode": "defineBelow",
    "value": {
      "Title": "New Task",
      "Status": "Not Started"
    }
  }
}
```

**Expect** output[0] to include:
```json
{
  "json": {
    "id": "5",
    "fields": {
      "Title": "New Task",
      "ID": 5,
      "ContentType": "Item"
    },
    "webUrl": "https://tenant123.sharepoint.com/sites/my-site/Lists/MyList/5_.000"
  }
}
```

### Test: download a file

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "download",
  "site": "my-site-id",
  "folder": "root",
  "file": "my-file-id",
  "dataPropertyName": "downloadedFile"
}
```

**Expect** output[0] to contain the original JSON plus binary data under `binary.downloadedFile`.

### Test: delete a list item

**Given** input items:
```json
[{ "json": { "itemId": "5" } }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "delete",
  "site": "{{ $json.siteId }}",
  "list": "my-list-id",
  "item": "{{ $json.itemId }}"
}
```

**Expect** output[0] to pass through the input item unchanged:
```json
[{ "json": { "itemId": "5" } }]
```

### Test: get all items with OData filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "getAll",
  "site": "my-site-id",
  "list": "my-list-id",
  "returnAll": true,
  "filter": "fields/Title eq 'item1'"
}
```

**Expect** output items to be unwrapped list items each containing `id`, `fields`, and metadata. Only items matching the filter are returned.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire type & version | documented | Confirmed via corpus descriptor (`nodeVersion: "1.0"`) |
| Resource & operation list | documented | Public docs enumerate File (3 ops), Item (6 ops), List (2 ops) |
| Parameter names & types | inferred from descriptor | `resourceMapper` type for columns, `resourceLocator` for site/list/file/folder/item, `simplify` boolean, OData `filter` string |
| File upload binary input | inferred from descriptor | `fileContents` string parameter names the input binary field |
| File update contract | inferred from descriptor | `changeFileContent` toggle + optional `fileName` rename |
| Credential shape | documented | `microsoftSharePointOAuth2Api` — extends `microsoftOAuth2Api`, `subdomain` + constructed `scope` |
| API base URL | inferred from descriptor | `https://{subdomain}.sharepoint.com/_api/v2.0/` |
| Pagination | inferred | Standard `@odata.nextLink` continuation via SharePoint REST API |
| Error handling | inferred | Standard n8n pattern: API errors propagate as NodeOperationError |
| Item Delete output shape | inferred from descriptor | Post-receive set operation `{ deleted: true }` on the output |

## OpenFlow mapping

- **Definition group:** `ecm`
- **Executor file:** `src/lib/engine/executors/microsoft-sharepoint.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
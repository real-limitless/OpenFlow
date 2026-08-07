---
type: n8n-nodes-base.microsoftSharePointTool
displayName: Microsoft SharePoint Tool
category: ECM
versions: [1]
priority: medium
status: specced
---

# Microsoft SharePoint Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftsharepoint/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |
| https://learn.microsoft.com/en-us/sharepoint/dev/apis/sharepoint-rest-graph | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftSharePointTool`
- **Aliases:** (none — base node type `n8n-nodes-base.microsoftSharePoint` is unified with `usableAsTool: true`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftSharePointOAuth2Api` (extends `microsoftOAuth2Api`; requires a SharePoint **Subdomain** — e.g. `tenant123` from `https://tenant123.sharepoint.com`)

## Parameters

Parameters are organized by resource and operation. The **Resource** selector determines which set of operations is available. Common across all branches is a `requestOptions` collection that allows customizing the HTTP request (batching, timeout, proxy, allowUnauthorizedCerts).

### Resource: File

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options: `file` | `file` | yes | Selects the File resource group |
| operation | options: `download`, `update`, `upload` | `download` | yes | File action to perform |
| site | resourceLocator (list, id) | — | yes | Target SharePoint site |
| folder | resourceLocator (list, id) | — | conditional | Parent folder; required for download/upload |
| file | resourceLocator (list, id) | — | conditional | File to download; required for download |
| fileName | string | — | conditional | New or destination file name (update, upload) |
| changeFileContent | boolean | false | no | Whether to replace file content on update |
| fileContents | string | — | conditional | New file content (when changeFileContent is true, or for upload) |

### Resource: Item

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options: `item` | `file` | yes | Selects the Item resource group |
| operation | options: `create`, `upsert`, `delete`, `get`, `getAll`, `update` | `getAll` | yes | List item action |
| site | resourceLocator (list, id) | — | yes | Target SharePoint site |
| list | resourceLocator (list, id) | — | yes | Target list within the site |
| item | resourceLocator (list, id) | — | conditional | Target item ID (get, delete, update, upsert) |
| columns | resourceMapper | `{mappingMode: 'defineBelow'}` | conditional | Column values for create, upsert, update |
| filter | string | — | no | OData filter formula for getAll |
| returnAll | boolean | false | no | Return all matching items vs. paginated |
| limit | number | 50 | no | Max items per page when returnAll is false |
| simplify | boolean | true | no | Flatten nested API response fields |
| options.fields | string | — | no | Comma-separated list of fields to return (getAll) |

### Resource: List

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options: `list` | `file` | yes | Selects the List resource group |
| operation | options: `get`, `getAll` | `getAll` | yes | List action |
| site | resourceLocator (list, id) | — | yes | Target SharePoint site |
| list | resourceLocator (list, id) | — | conditional | Single list ID (get) |
| returnAll | boolean | false | no | Return all lists vs. paginated |
| limit | number | 50 | no | Max lists per page when returnAll is false |
| simplify | boolean | true | no | Flatten nested API response fields |

### Common options

| name | type | default | notes |
|------|------|---------|-------|
| requestOptions.batching | — | — | Enable request batching |
| requestOptions.allowUnauthorizedCerts | boolean | — | Skip TLS verification |
| requestOptions.proxy | string | — | HTTP proxy URL |
| requestOptions.timeout | number | — | Request timeout in ms |

## Runtime behavior

### Input processing

Each input item is processed independently. The node resolves all parameter values (including expressions like `$json.*` and `$fromAI()`) per item, constructs a SharePoint REST API v2.0 request, and emits one output item per result.

### Output shape

**File — Download:** Outputs binary data with the file contents. The `json` portion contains metadata from the SharePoint drive item response shaped according to the `simplify` flag.

**File — Update/Upload:** Outputs the SharePoint drive item JSON response for the updated/uploaded file.

**Item — Create/Upsert/Update:** Outputs the created or modified list item as a JSON object. When `simplify` is true, nested `fields` are flattened to the top level.

**Item — Get:** Outputs the single list item JSON.

**Item — Get All:** Outputs an array of list item JSON objects (simplified or raw per the `simplify` parameter).

**Item — Delete:** Outputs the deleted item response (typically minimal success acknowledgement).

**List — Get:** Outputs the single list metadata JSON.

**List — Get All:** Outputs an array of list metadata JSON objects.

### Error handling

- On HTTP 4xx/5xx from the SharePoint API, the node throws an error unless `continueOnFail` is enabled on the node, in which case an empty output is produced for that item.
- Invalid `site`, `list`, `folder`, or `file` references (resource not found) result in a 404 error.
- Read-only or restricted column types (Hyperlink, Location, Metadata) cannot be written and will generate API errors.

### Expressions

All parameters accept expression strings, including those with `noDataExpression: true` (resource, operation selectors). The `$fromAI()` function is available for AI-agent tool usage, allowing the AI to dynamically populate site, list, file, folder, and column parameters.

## Acceptance tests

### Test: File download

**Given** input items:
```json
[{ "json": { "siteId": "mysite", "fileId": "file123" } }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "download",
  "site": { "mode": "id", "value": "={{ $json.siteId }}" },
  "folder": { "mode": "id", "value": "root" },
  "file": { "mode": "id", "value": "={{ $json.fileId }}" }
}
```

**Expect** output[0] contains:
- Binary data accessible via the node's binary output
- Metadata in the `json` property (e.g. `name`, `size`, `lastModifiedDateTime`)

### Test: Item create with columns

**Given** input items:
```json
[{ "json": { "Title": "Test Item", "Status": "Active" } }]
```

**Parameters:**
```json
{
  "resource": "item",
  "operation": "create",
  "site": { "mode": "id", "value": "mysite" },
  "list": { "mode": "id", "value": "mylist-id" },
  "columns": { "mappingMode": "defineBelow", "value": { "Title": "={{ $json.Title }}", "Status": "={{ $json.Status }}" } }
}
```

**Expect** output[0].json contains the created list item with `id`, `fields.Title`, `fields.Status`, and standard SharePoint metadata.

### Test: Item get many with filter

**Parameters:**
```json
{
  "resource": "item",
  "operation": "getAll",
  "site": { "mode": "id", "value": "mysite" },
  "list": { "mode": "id", "value": "mylist-id" },
  "filter": "Status eq 'Active'",
  "returnAll": false,
  "limit": 10,
  "simplify": true
}
```

**Expect** output[0].json is an array of up to 10 flattened item objects where `Status` equals `'Active'`.

### Test: List get all

**Parameters:**
```json
{
  "resource": "list",
  "operation": "getAll",
  "site": { "mode": "id", "value": "mysite" },
  "returnAll": true,
  "simplify": true
}
```

**Expect** output[0].json is an array of all list objects, each containing at minimum `id`, `displayName`, and `webUrl`.

### Test: File upload

**Given** input items with binary data:
```json
[{ "json": {}, "binary": { "file": { "data": "BASE64_ENCODED_CONTENT", "mimeType": "text/plain", "fileName": "newfile.txt" } } }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "upload",
  "site": { "mode": "id", "value": "mysite" },
  "folder": { "mode": "id", "value": "root" },
  "fileName": "newfile.txt",
  "fileContents": "={{ $binary.file.data }}"
}
```

**Expect** output[0].json contains the drive item for the uploaded file with `name` equal to `"newfile.txt"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation set | Documented | Public docs enumerate File/Item/List operations |
| Parameter names and types | Inferred from corpus | Behaviorally verified against public doc descriptions; exact parameter nesting abstracted |
| Credential shape | Documented | Public credentials page documents subdomain + OAuth2 scope construction |
| API base URL | Inferred from corpus | `https://{subdomain}.sharepoint.com/_api/v2.0/` — consistent with public Microsoft docs |
| OData filter syntax | Inferred | Standard SharePoint REST API OData filter; exact passthrough |
| `$fromAI()` support | Inferred | Common pattern across all `*Tool` variants in the SDK |
| `resourceMapper` `columns` | Inferred from corpus | Behavioral — maps input fields to SharePoint list column values |
| Simplify flattening details | Inferred | Outcome-level: nested `fields` are promoted to top-level |
| Exact response fields | Inferred | Contractual: shape mirrors SharePoint REST API v2.0 response; exact field set depends on list schema |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/microsoftSharePointTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** The base node type `n8n-nodes-base.microsoftSharePoint` shares the same parameters and operations. The `*Tool` variant is the same node with `usableAsTool: true` and `$fromAI()` support enabled. Credential is `microsoftSharePointOAuth2Api` which extends `microsoftOAuth2Api` and requires a SharePoint Subdomain.

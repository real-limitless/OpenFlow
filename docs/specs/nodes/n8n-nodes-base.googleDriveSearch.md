---
type: n8n-nodes-base.googleDriveSearch
displayName: Google Drive Search
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Google Drive Search

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/file-folder-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |
| https://developers.google.com/drive/api/guides/search-files | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleDriveSearch`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Google Drive OAuth2 (`googleDriveOAuth2Api`) or service account (`googleApi`). The Drive API must be enabled in the associated Google Cloud project.

## Parameters

This is a single-operation node exposed as a standalone type. It wraps only the **File/Folder → Search** operation from the full Google Drive node.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| searchMode | enum: `name`, `advanced` | `name` | yes | Simple name-based search vs raw Google Drive query string syntax |
| query | string | — | yes | In name mode: name fragment to match (partial match). In advanced mode: full [Google Drive `q` query](https://developers.google.com/drive/api/guides/search-files) string |
| returnAll | boolean | false | no | When true, paginate through all matches. When false, obey `limit` |
| limit | number | 50 | no | Maximum results to return when `returnAll` is false |
| driveId | string (resource-locator) | — | no | Scope search to a specific shared drive. Accepts URL, ID, or list selection. Defaults to "My Drive" when omitted |
| folderId | string (resource-locator) | — | no | Scope search to a specific folder. Accepts URL, ID, or list selection |
| whatToSearch | enum: `filesFolders`, `files`, `folders` | `filesFolders` | no | Restrict results by item kind |
| includeTrashed | boolean | false | no | Include items in the Drive trash in results |

### Options

| name | type | default | notes |
|------|------|---------|-------|
| fields | multi-select | `[All]` | Returned metadata fields: `explicitlyTrashed`, `exportLinks`, `hasThumbnail`, `iconLink`, `id`, `kind`, `mimeType`, `name`, `permissions`, `shared`, `spaces`, `starred`, `thumbnailLink`, `trashed`, `version`, `webViewLink`. When `[All]` is selected, all fields are returned |

## Runtime behavior

### Input

Each incoming item is processed independently. Parameters may reference item data through expressions.

### Output

One output item is produced per input item. The `json` payload contains the search results array keyed under a results wrapper alongside the total result count and pagination metadata (page token when more results exist):

```
{
  "kind": "drive#fileList",
  "incompleteSearch": false,
  "files": [
    { "id": "...", "name": "...", "mimeType": "...", ... }
  ]
}
```

When configured fields limit the response, each file entry contains only the selected metadata fields. The minimal guarantee per entry is `id`, `name`, and `mimeType`.

### Errors

- Authentication, authorization, quota, and 4xx/5xx API errors surface as thrown errors and respect `continueOnFail`.
- Invalid query syntax in advanced mode returns a Drive API error.
- Missing credentials or disabled Drive API throw before making any API call.

### Expressions

All string, number, boolean, and enum parameters accept n8n expression strings.

## Acceptance tests

### Test: search by name fragment

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "searchMode": "name",
  "query": "report",
  "returnAll": false,
  "limit": 10,
  "whatToSearch": "files"
}
```

**Expect** output[0].json to contain a `files` array with at most 10 entries, each entry having `id`, `name`, and `mimeType`, and each `name` containing the fragment `"report"`.

### Test: search with return all

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "searchMode": "name",
  "query": "photo",
  "returnAll": true,
  "whatToSearch": "filesFolders",
  "includeTrashed": false
}
```

**Expect** output[0].json to contain a `files` array containing all matching files and folders whose name matches `"photo"`, with no hard limit. Pagination is transparent.

### Test: advanced query

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "searchMode": "advanced",
  "query": "mimeType='application/vnd.google-apps.folder' and trashed=false",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0].json to contain a `files` array with at most 5 entries, each entry having `mimeType` equal to `"application/vnd.google-apps.folder"` and `trashed` false.

### Test: scope to a specific folder

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "searchMode": "name",
  "query": "notes",
  "folderId": "1abcFolderId",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0].json to contain a `files` array where every entry is located under folder `"1abcFolderId"` or its subfolders, and each `name` contains the fragment `"notes"`.

### Test: include trashed items

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "searchMode": "name",
  "query": "old",
  "includeTrashed": true,
  "returnAll": false,
  "limit": 50
}
```

**Expect** output[0].json to contain a `files` array potentially including entries where `trashed` is `true`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Single-operation design | inferred | No dedicated n8n documentation page exists for this type string. It wraps the File/Folder → Search operation from the Google Drive node as a standalone node |
| Search parameters | documented | Public docs for Google Drive file-folder operations describe all search parameters in detail |
| Drive search API semantics | documented | Google Drive `files.list` + `q` parameter (public API docs) |
| Exact output shape | inferred | Output follows the Google Drive `files.list` response shape; OpenFlow guarantees the `files` array with `id`/`name`/`mimeType` per entry |
| Credential type | documented | Standard Google OAuth2 or service account; Drive API scope required |
| Pagination for returnAll | inferred | Standard Drive API page token pagination; `returnAll` pages transparently until no `nextPageToken` |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleDriveSearch.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

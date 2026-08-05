# Box

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.box.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/box.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.boxtrigger.md | Public docs only |
| https://developer.box.com/reference/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.box`
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `boxOAuth2Api` (OAuth2, required)

## Parameters

The node exposes two resources (`File`, `Folder`) each with its own set of operations.

### File resource

| Operation | Required params | Optional / notable params | Description |
|-----------|----------------|--------------------------|-------------|
| Copy | `fileId` | `parentId`, `name`, `version`, `fields` | Copies a file to another folder, optionally renamed |
| Delete | `fileId` | none | Removes a file |
| Download | `fileId`, `binaryPropertyName` (default `data`) | none | Downloads file content into a binary output field |
| Get | `fileId` | `fields` | Retrieves file metadata |
| Search | `query` | `returnAll`, `limit`, content types, date ranges, direction, extensions, folder IDs, scope, size range, sort, trash content, user IDs | Searches files by query string with optional filters |
| Share | `fileId`, `accessibleBy` (user/group), `role` | `useEmail`/`email` vs `userId`, `groupId`, `can_view_path`, `expires_at`, `notify`, `fields` | Shares a file with a user or group at a given access role |
| Upload | `fileName`, `binaryData` (bool) | If `binaryData=true`: `binaryPropertyName` (default `data`); if `binaryData=false`: `fileContent` (text); always: `parentId` | Uploads a file from text content or a binary field |

### Folder resource

| Operation | Required params | Optional / notable params | Description |
|-----------|----------------|--------------------------|-------------|
| Create | `name` | `parentId`, `access` (open/collaborators), `fields` | Creates a new folder, optionally under a parent |
| Delete | `folderId` | `recursive` (bool) | Deletes a folder, optionally recursively |
| Get | `folderId` | none | Retrieves folder metadata |
| Search | `query` | `returnAll`, `limit`, same filter set as File Search | Searches folders |
| Share | `folderId`, `accessibleBy`, `role` | Same options as File Share | Shares a folder with a user or group |
| Update | `folderId` | `name`, `description`, `parentId`, `can_non_owners_invite`, `can_non_owners_view_collaborators`, `is_collaboration_restricted_to_enterprise`, `shared_link` (access/password/permissions/tags) | Updates folder properties including shared link config |

## Runtime behavior

### Input

Processes each incoming item individually. For upload operations with `binaryData=true`, the binary content is read from `item.binary[binaryPropertyName]` (default key `data`). For upload without binary data, the text content is taken from `fileContent`.

### Output

Each operation returns the Box API response as `json` output. Notable specifics:
- **Download:** Returns `{ json: fileMetadata, binary: { [binaryPropertyName]: { data: Buffer, mimeType: string, fileName: string } } }`. The downloaded file content is placed into the binary output.
- **Upload:** Returns the uploaded file metadata (id, name, type) from the Box API response.
- **Search:** Returns an array of matching items. Supports `returnAll` / `limit` for pagination.
- **Share:** Returns the collaboration object.
- All other operations return the standard Box API resource representation.

### Errors

API errors (auth failure, not found, rate limiting) propagate as item-level errors. The `continueOnFail` flag controls whether errors halt the execution or allow the next items to proceed. No retry logic is built into the node.

### Expressions

All string-typed parameters accept n8n expressions (e.g., `{{ $json.fileId }}`).

## Acceptance tests

### Test: Upload file from text

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "upload",
  "fileName": "hello.txt",
  "binaryData": false,
  "fileContent": "Hello, Box!",
  "parentId": "0"
}
```

**Expect** output[0] to contain a `json` object with `id` (string), `name` ("hello.txt"), `type` ("file").

### Test: Upload file from binary

**Given** input items with binary data:
```json
[{
  "json": {},
  "binary": {
    "data": {
      "data": "dGVzdCBjb250ZW50",
      "mimeType": "text/plain",
      "fileName": "test.txt"
    }
  }
}]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "upload",
  "fileName": "test.txt",
  "binaryData": true,
  "binaryPropertyName": "data",
  "parentId": "0"
}
```

**Expect** output[0] `json` contains `id`, `name`, `type`.

### Test: Download file

**Given** input items:

```json
[{ "json": { "fileId": "12345" } }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "download",
  "fileId": "={{ $json.fileId }}",
  "binaryPropertyName": "data"
}
```

**Expect** output[0] `json` contains file metadata and `binary.data` contains `data` (Buffer), `mimeType`, `fileName`.

### Test: Create folder

**Parameters:**
```json
{
  "resource": "folder",
  "operation": "create",
  "name": "New Folder",
  "parentId": "0"
}
```

**Expect** output[0] `json` contains `id`, `name` ("New Folder"), `type` ("folder").

### Test: Search files

**Parameters:**
```json
{
  "resource": "file",
  "operation": "search",
  "query": "report",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] `json` contains an `entries` array with up to 10 matching items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API endpoints | Documented | Box API docs specify endpoints at `api.box.com/2.0`; upload uses `upload.box.com/api/2.0` |
| Parameters | Documented | All parameter names and types sourced from public n8n docs and confirmed via corpus |
| Binary behavior | Documented | Download/output binary patterns are standard for n8n file nodes + prior cycle hints |
| Auth | Documented | OAuth2 only (boxOAuth2Api) |
| Response shapes | Inferred | Standard Box API `{ type, id, name, ... }` shapes; tests use abstract contract checks |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/box.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.microsoftOneDrive
displayName: Microsoft OneDrive
category: Data & Storage
versions: [1]
priority: low
status: specced
---

# Microsoft OneDrive

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftonedrive/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftOneDrive`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftOneDriveOAuth2Api` (node-specific), `microsoftOAuth2Api` (generic Graph), `microsoftEntraServicePrincipal` (app-only)

## Parameters

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `file` | yes | `file` \| `folder` |

### File operations

| operation name | display | required params | optional params | notes |
|----------------|---------|----------------|----------------|-------|
| `copy` | Copy a file | file or file ID | destination folder, new name, conflictBehavior, childrenOnly | Async operation (HTTP 202). Implementer either follows the Location monitor URL to completion, or documents that the copied item is returned asynchronously. |
| `delete` | Delete a file | file or file ID | — | Moves to recycle bin; passes input item through unchanged |
| `download` | Download a file | file or file ID | — | Returns binary data |
| `get` | Get a file | file or file ID | — | Returns file metadata |
| `rename` | Rename a file | file or file ID, new name | — | Updates the file name |
| `search` | Search a file | query | — | Searches by file name or content |
| `share` | Share a file | file or file ID | recipient email, permissions, message, requireSignIn, sendEmail | Creates a sharing link or sends invitation |
| `upload` | Upload a file | parent folder, file name, binary data | — | Limited to 4MB per upload |

### Folder operations

| operation name | display | required params | optional params | notes |
|----------------|---------|----------------|----------------|-------|
| `create` | Create a folder | folder name, parent folder | — | Creates an empty folder |
| `delete` | Delete a folder | folder or folder ID | — | Moves to recycle bin; passes input item through unchanged |
| `getAll` | Get Children | folder or folder ID | — | Lists items (files + sub-folders) inside a folder |
| `rename` | Rename a folder | folder or folder ID, new name | — | Updates folder name |
| `search` | Search a folder | query | — | Searches folders by name |
| `share` | Share a folder | folder or folder ID | recipient email, permissions, message, requireSignIn, sendEmail | Creates a sharing link or sends invitation |

### File / folder reference

Most operations accept either a file/folder ID directly or a URL pointing to the resource. The node resolves it via the Microsoft Graph API.

### Credential authentication

The node's Authentication dropdown offers three credential types:
- **OneDrive OAuth2** — node-specific credential (default)
- **Microsoft OAuth2 (Graph)** — generic Microsoft Graph credential, reusable across Microsoft nodes (requires `Files.ReadWrite.All` or similar scope)
- **Microsoft Entra Service Principal (App-Only)** — app-only access with no signed-in user

For government cloud tenants (US Government, US Government DOD, China), the credential's **Microsoft Graph API Base URL** must be set accordingly.

## Runtime behavior

### Input

Each input item may carry:
- A `json` payload referencing the file/folder to act on (via expression)
- For `upload`, the binary data must be present in the item's `binary` property

### Output

- **File operations:**
  - `copy`: Graph returns `202 Accepted` with a `Location` header pointing to an async monitor URL (the copy itself is queued, not synchronous). If the response body already carries `driveItem` fields, pass them through. Otherwise the executor MUST follow the `Location` monitor URL (poll until `status: completed`/`failed`) and return the resulting item metadata (`id`, `name`, `size`, `parentReference`, `webUrl`), or document the async contract explicitly. Never emit a bare `{success: true}` when a richer response is available.
  - `get`, `rename`, `search`: output items contain file metadata objects (id, name, size, createdDateTime, lastModifiedDateTime, webUrl, parentReference, etc.)
  - `download`: output items contain file metadata on `json` and binary data on `binary`
  - `delete`: passes the input item through unchanged (returns the original `item.json`, not `{success:true}`)
  - `share`: outputs the sharing link or invitation response object
  - `upload`: outputs the uploaded file metadata object

- **Folder operations:**
  - `create`, `rename`, `search`, `share`: analogous output shapes
  - `getAll` (Get Children): outputs one item per child (file or folder), each with standard item metadata
  - `delete`: passes the input item through unchanged (returns the original `item.json`)

All responses reflect the Microsoft Graph API response shape for the respective endpoint.

### Errors

- Missing or invalid file/folder reference throws a `NodeOperationError` with a descriptive message
- Authentication failures propagate from the credential layer
- Uploads exceeding 4MB throw a size-limit error (4MiB = `4 * 1024 * 1024` bytes)
- Async copy monitoring that ends in `failed` throws with the operation error (e.g. `nameAlreadyExists`)
- `continueOnFail`: when enabled, the node outputs `[{ json: { error: message } }]` on the primary output instead of throwing

### Expressions

All string and reference parameters accept n8n expression syntax (`{{ }}`). Binary data for upload is selected via a data property name expression.

## Acceptance tests

### Test: upload a file

**Given** input items:

```json
[{
  "json": { "folderName": "/Documents" },
  "binary": {
    "file": {
      "mimeType": "text/plain",
      "data": "aGVsbG8gd29ybGQ="
    }
  }
}]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "upload",
  "parentFolder": "{{ $json.folderName }}",
  "binaryPropertyName": "file",
  "fileName": "hello.txt"
}
```

**Expect** output[0] — each item contains file metadata with `name`, `id`, `size`, `parentReference`, and `webUrl`. Size matches the uploaded content.

### Test: list folder children

**Given** input items:

```json
[{ "json": { "folderId": "ABC123" } }]
```

**Parameters:**

```json
{
  "resource": "folder",
  "operation": "getAll",
  "folderId": "{{ $json.folderId }}"
}
```

**Expect** output[0] — one item per child; each item has `json` fields including `name`, `id`, `size`, `folder` (for sub-folders), `file` (for files), and `lastModifiedDateTime`.

### Test: download a file

**Given** input items:

```json
[{ "json": { "fileId": "FILE456" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "download",
  "fileId": "{{ $json.fileId }}"
}
```

**Expect** output[0] — items carry file metadata on `json` and the file contents on `binary`.

### Test: share a folder

**Given** input items:

```json
[{ "json": { "folderId": "FOLDER789" } }]
```

**Parameters:**

```json
{
  "resource": "folder",
  "operation": "share",
  "folderId": "{{ $json.folderId }}",
  "permissions": "read",
  "requireSignIn": true
}
```

**Expect** output[0] — items contain a sharing link object with `link` and `webUrl` fields.

### Test: delete a file (continueOnFail)

**Given** input items:

```json
[{ "json": { "fileId": "NONEXISTENT" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "delete",
  "fileId": "{{ $json.fileId }}",
  "continueOnFail": true
}
```

**Expect** output[0] — `[{ "json": { "error": "…" } }]` rather than a thrown error.

### Test: copy a file (async 202)

**Given** input items:

```json
[{ "json": { "fileId": "FILE456", "destFolderId": "FOLDER789" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "copy",
  "fileId": "{{ $json.fileId }}",
  "destinationFolder": "{{ $json.destFolderId }}"
}
```

**Expect** output[0] — items contain file metadata with `id`, `name`, `size`, `parentReference`, and `webUrl`. The executor must handle the async 202 response by either polling the `Location` monitor URL to completion or returning the `driveItem` from the response body if present. Never emit a bare `{ success: true }`.

### Test: upload oversized file (error)

**Given** input items with a binary payload whose decoded byte length exceeds 4MiB (i.e. `Buffer.from(bin.data, 'base64').length > 4 * 1024 * 1024`):

```json
[{
  "json": { "folderName": "/Documents" },
  "binary": {
    "file": {
      "mimeType": "application/octet-stream",
      "data": "<base64 encoding of a payload strictly larger than 4 MiB>"
    }
  }
}]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "upload",
  "parentFolder": "{{ $json.folderName }}",
  "binaryPropertyName": "file",
  "fileName": "large.bin"
}
```

**Expect** the executor throws a clear size-limit error before any Graph API call. No silent truncation or partial upload is allowed.

### Test: delete passthrough

**Given** input items:

```json
[{ "json": { "fileId": "FILE456", "originalField": "preserved" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "delete",
  "fileId": "{{ $json.fileId }}"
}
```

**Expect** output[0] — the original item is passed through with all original fields intact, not replaced with `{success: true}`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources + operations | documented | Public docs list file (8 ops) and folder (6 ops) |
| Credential types | documented | Three auth options with documented scopes |
| Upload size limit | documented | 4MB limit stated in public docs |
| Parameter names and exact option enums | inferred from descriptor | Nested structures (share permissions, etc.) abstracted at the outcome level |
| Copy async 202 contract | documented | Microsoft Graph API returns `202 Accepted` with `Location` monitor URL; implementer must follow the URL or pass through `driveItem` body |
| Delete passthrough behavior | inferred | Implementer must return original `item.json`, not `{success:true}` |
| Microsoft Graph API response shapes | inferred from Graph API docs | Standard `driveItem` resource shape; implementer should refer to Microsoft Graph API docs |
| Get Children pagination | inferred | Standard Graph API pagination via `@odata.nextLink`; not documented on node page |
| Trigger variant exists | documented | `n8n-nodes-base.microsoftOneDriveTrigger` — separate spec needed |

## OpenFlow mapping

- **Definition group:** `core` (Data & Storage)
- **Executor file:** `src/lib/engine/executors/microsoft-one-drive.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
---
type: n8n-nodes-base.nextCloud
displayName: Nextcloud
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Nextcloud

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nextcloud.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/nextcloud.md | Public docs only |
| https://nextcloud-server.netlify.app/ (Nextcloud API reference) | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.nextCloud`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `nextCloudApi` (Basic auth: WebDAV URL + username + password/app-password) or `nextCloudOAuth2Api` (OAuth2)

## Parameters

The node selects a **Resource** (File / Folder / User) and an **Operation** within that resource. Parameters common to many operations include file or folder paths, which are expressed as server-relative paths under the WebDAV mount point.

### File operations

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| Resource | string | yes | Always `file` |
| Operation | string | yes | One of: `copy`, `delete`, `download`, `move`, `share`, `upload` |
| Source path / file path | string | yes | Server-side path of the source file (e.g. `/Documents/report.pdf`) |
| Destination path | string | For copy/move | Target path when copying or moving |
| Binary data / file content | binary / string | For upload | Incoming binary data for file creation |
| Share type | integer | For share | OCS share type (e.g. 0 = user, 3 = public link, etc.) |
| Share recipient | string | For share (user/group) | Recipient ID or public share label |

### Folder operations

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| Resource | string | yes | Always `folder` |
| Operation | string | yes | One of: `copy`, `create`, `delete`, `list`, `move`, `share` |
| Folder path | string | yes | Server-side path of the folder (e.g. `/Documents`) |
| Destination path | string | For copy/move | Target path when copying or moving |

### User operations

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| Resource | string | yes | Always `user` |
| Operation | string | yes | One of: `invite`, `delete`, `get`, `getAll`, `edit` |
| User ID | string | For get/delete/edit | The Nextcloud user identifier |
| User data | object | For create/edit | Attributes such as display name, email, groups, quota, language |

## Runtime behavior

### Input

Each input item is processed independently unless the operation is configured to merge or batch. For file upload, the node expects a binary property on the input item.

### Output

- **File download:** Returns the file data as a binary property on the output item(s), plus metadata fields (contentLength, contentType, eTag, lastModified, path, type).
- **File list / Folder list:** Returns an array of items (one per entry), each containing metadata fields (path, contentLength, contentType, eTag, lastModified, type).
- **Create / Copy / Move / Delete / Share:** Returns a confirmation object or the metadata of the affected resource. For share operations, returns share details (token, url, etc.).
- **User operations:** Returns the user record(s) or a success indicator.

### Errors

- If the remote resource does not exist (404), the node returns an error unless `continueOnFail` is set, in which case it produces an empty output item for that input.
- Authentication failures and insufficient permissions propagate as errors.
- Network errors (timeout, DNS) propagate as errors.

### Expressions

All path, user ID, and data parameter values accept expression strings.

## Acceptance tests

### Test: upload a file then download it

**Given** input item with binary data:

```json
[{
  "json": { "fileName": "hello.txt" },
  "binary": {
    "data": {
      "mimeType": "text/plain",
      "data": "SGVsbG8gV29ybGQ="
    }
  }
}]
```

**Parameters:** `{ "resource": "file", "operation": "upload", "filePath": "/test/hello.txt", "binaryPropertyName": "data" }`

**Expect** output[0] contains a success indicator with no error property.

### Test: list folder contents

**Given** input item:

```json
[{ "json": {} }]
```

**Parameters:** `{ "resource": "folder", "operation": "list", "folderPath": "/Documents" }`

**Expect** output[0] to be an array of items, each with `path`, `contentType`, `contentLength`, and `type` fields. At minimum, one item should have `type: "directory"` or `type: "file"`.

### Test: copy a file

**Given** input item:

```json
[{ "json": {} }]
```

**Parameters:** `{ "resource": "file", "operation": "copy", "sourcePath": "/source/file.txt", "destinationPath": "/dest/file.txt" }`

**Expect** output[0] to contain the copy result with no error.

### Test: invite a user

**Given** input item:

```json
[{ "json": { "userId": "newuser", "email": "newuser@example.com" } }]
```

**Parameters:** `{ "resource": "user", "operation": "invite", "userId": "newuser", "data": { "email": "newuser@example.com" } }`

**Expect** output[0] to contain the created user record including the userId and email fields.

### Test: delete a file with continueOnFail

**Given** input item:

```json
[{ "json": { "path": "/nonexistent/file.txt" } }]
```

**Parameters:** `{ "resource": "file", "operation": "delete", "filePath": "/nonexistent/file.txt", "continueOnFail": true }`

**Expect** output[0] to be an empty item with no thrown error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Documented | Public n8n docs enumerate all File, Folder, and User operations |
| Credential shapes | Documented | Public n8n docs detail Basic auth and OAuth2 fields |
| WebDAV API contract | Public Nextcloud docs | The underlying protocol is standard WebDAV with Nextcloud OCS extensions for sharing and user management |
| Exact parameter names and defaults | Inferred from schema descriptors | Some parameter names (e.g. `binaryPropertyName`, `shareType`) are typical n8n conventions not fully documented on the page |
| Response shape details | Partially documented | The response fields shown in acceptance tests come from the corpus schema descriptors, not public docs; actual API may return additional fields |

## OpenFlow mapping

- **Definition group:** `data`
- **Executor file:** `src/lib/engine/executors/nextCloud.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
---
type: n8n-nodes-base.googleDrive
displayName: Google Drive
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Google Drive

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/file-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/file-folder-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/folder-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/shared-drive-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleDrive`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Google Drive API via OAuth2 (preferred) or a Google service account. The credential is the shared Google auth credential used across Google nodes; the Drive API must be enabled in the associated Google Cloud project.

## Parameters

The node uses a **resource → operation** discriminator pattern, backed by the Google Drive v2/v3 REST API.

**Cross-cutting conventions:**

- **Parent destination:** any operation that places an item inside a folder or shared drive takes a single `parentId` parameter holding the target folder or drive id. For workflow compatibility, `folderId` and `driveId` are accepted as aliases of `parentId` (when more than one is provided, `parentId` wins). Omitting it places the item in the user's "My Drive" root.
- **Shared drive name:** drive create/update use `name` as the canonical field; `driveName` is accepted as an alias.
- **Permissions:** share operations accept an array of permission entries shaped `{ role, type, email? | domain? }` (for example `{ role: "reader", type: "user", email: "a@example.com" }` or `{ role: "writer", type: "domain", domain: "example.com" }`). The same list is also accepted wrapped as `{ permissionValues: [...] }`.

### File resource

| operation | parameter | type | notes |
|-----------|-----------|------|-------|
| `copy` | `fileId` (via list / URL / ID picker) | string | Source file; id can be derived from a shareable file URL |
| `copy` | `newName` | string | Name for the copy |
| `copy` | `copyInSameFolder` | boolean | When false, require target drive/folder |
| `copy` | `parentId` | string | Target parent (only when not copying in the same folder); `folderId`/`driveId` aliases accepted |
| `create` | `content` | string | Text body used to create the file |
| `create` | `fileName` | string | Name of the new file |
| `create` | `parentId` | string | Parent destination; `folderId`/`driveId` aliases accepted |
| `create` | `convertToGoogleDocument` | boolean | Produce a Google Doc (requires Docs API) vs default `.txt` |
| `delete` | `fileId` | string | File to delete |
| `delete` | `deletePermanently` | boolean | Bypass trash and delete now |
| `download` | `fileId` | string | File to download |
| `download` | `convertTo` (per type) | enum | Export format for native Google files (Docs → PDF/DOCX/etc., Sheets → XLSX/CSV/etc., Slides → PPTX, Drawings → PNG/SVG/PDF/JPEG) |
| `download` | `outputField` | string | Name of the binary-data field to attach to output |
| `move` | `fileId` | string | File to move |
| `move` | `parentId` | string | New parent destination; `folderId`/`driveId` aliases accepted |
| `share` | `fileId` | string | File to share |
| `share` | `permissions` | array | Array of `{ role, type, email? | domain? }` entries (or `{ permissionValues: [...] }`); role is `reader`/`writer`/`commenter`/owner-level, type is `user`/`group`/`domain`/`anyone` |
| `share` | `transferOwnership`, `sendNotificationEmail`, `emailMessage` | mixed | Ownership-transfer and notification options |
| `update` | `fileId` | string | File to update |
| `update` | `changeFileContent` | boolean | Replace body with binary data from an input field |
| `update` | `newFileName` | string | New display name |
| `update` | `moveToTrash` | boolean | Trash the file instead of changing metadata |
| `upload` | `binaryField` | string | Name of the input field holding the binary file data |
| `upload` | `fileName` | string | Name of the uploaded file |
| `upload` | `parentId` | string | Parent destination; `folderId`/`driveId` aliases accepted |

### File/Folder resource

| operation | parameter | type | notes |
|-----------|-----------|------|-------|
| `search` | `searchMode` | enum: `name`, `advanced` | Name-based simple search vs raw Google query string |
| `search` | `query` | string | Name fragment (simple mode) or Google `q` query syntax (advanced) |
| `search` | `returnAll` | boolean | When true, page through all matches |
| `search` | `limit` | number | Cap when `returnAll` = false |
| `search` | `parentId` | string | Optional scope to constrain the search; `folderId`/`driveId` aliases accepted |
| `search` | `whatToSearch` | enum: `filesFolders`, `files`, `folders` | Kind of items to match |
| `search` | `includeTrashed` | boolean | Include items in trash |

### Folder resource

| operation | parameter | type | notes |
|-----------|-----------|------|-------|
| `create` | `folderName` | string | Name of the new folder |
| `create` | `parentId` | string | Parent destination; `folderId`/`driveId` aliases accepted |
| `delete` | `folderId` | string | Folder to delete |
| `delete` | `deletePermanently` | boolean | Bypass trash |
| `share` | `folderId` | string | Folder to share |
| `share` | `permissions` | array | Same permission model as file share |

### Shared Drive resource

| operation | parameter | type | notes |
|-----------|-----------|------|-------|
| `create` | `name` | string | Display name of the shared drive (`driveName` alias accepted) |
| `create` | `restrictions`, `capabilities`, `color`, `hidden` | mixed | Drive-level restrictions/display options |
| `delete` | `driveId` | string | Shared drive to delete |
| `get` | `driveId` | string | Shared drive to fetch |
| `getAll` | `returnAll` | boolean | When true, page through all shared drives |
| `getAll` | `limit` | number | Cap when `returnAll` = false |
| `getAll` | `query` | string | Drive search query string |
| `update` | `driveId` | string | Shared drive to update |
| `update` | `name`, `color`, `restrictions` | mixed | Updated drive attributes (`name` canonical; `driveName` alias accepted) |

Many read-style operations accept an optional **fields / simplify** option that limits returned metadata to the set the user requests (for example file `id`, `name`, `mimeType`, `webViewLink`, `trashed`, `version`) or collapses verbose responses to the essential fields.

## Runtime behavior

### Input

The node processes each input item independently. Parameters may reference item data through expressions. For upload/update operations that replace content, a named field on the input item must carry binary data.

### Output

One output item is produced per input item. The `json` payload is the Google Drive API response for the performed action, normalized to a stable shape at the outcome level:

- **Reads (get/getMany/search):** the matching resource(s), paginated when requested; single items keep the metadata object, multi-item results are arrays or paginated list bodies.
- **Writes (create/copy/update/upload):** the affected resource's metadata (at minimum `id`, `name`, `mimeType`, `parents`, `webViewLink`).
- **Downloads:** the file bytes are attached to the output item's binary data under the configured field name; metadata accompanies it.
- **Deletes / moves:** a confirmation-style result carrying the outcome and (for delete) whether it was permanent or trashed.

### Operation semantics

- **Upload / create / copy:** the file bytes or text body plus the resolved parent id are sent to Drive; the returned metadata object is emitted.
- **Delete:** the item is moved to trash by default (recoverable). Only when `deletePermanently` is true is the item permanently removed via a hard delete. The output records which behavior occurred.
- **Move:** the file is relocated to the target parent by replacing its current parent set with the destination — the executor must not assume the source parent is `root`; it should read the file's current parents and replace that set with the target.
- **Share:** each permission entry is applied (created) against the target file/folder; ownership transfer and notification options are honored when supplied.

### Errors

- Authentication, authorization, not-found, quota, and 4xx/5xx API errors surface as thrown errors and are governed by the workflow's `continueOnFail` setting.
- Missing required identifiers (file/folder/drive id, binary field) are validated before any HTTP call and throw without contacting the API.
- Failed share/permission changes throw; the operation does not partially succeed silently.

### Expressions

All string, number, boolean, and enum parameters accept n8n expression strings; resource/operation selectors are typically static.

## Acceptance tests

### Test: create a text file

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "create",
  "fileName": "notes.txt",
  "content": "hello",
  "folderId": "root"
}
```

**Expect** output[0].json to contain `name` equal to `"notes.txt"` and a non-empty `id`, `mimeType` of `text/plain` (or `application/vnd.google-apps.document` when `convertToGoogleDocument` is true), and `parents` including `"root"`.

### Test: search files by name

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "fileFolder",
  "operation": "search",
  "searchMode": "name",
  "query": "notes",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0].json to contain a list of at most 5 items, each with an `id`, `name`, and `mimeType` field, and each `name` matching the `notes` fragment.

### Test: download a file

**Given** input items:

```json
[{ "json": { "fileId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "download",
  "fileId": "= {{ $json.fileId }}",
  "outputField": "data"
}
```

**Expect** output[0].json to contain the file metadata including `id` equal to `"abc123"`, and output[0].binary to contain a `data` entry whose `mimeType` matches the file's type.

### Test: share a file with a user

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "share",
  "fileId": "abc123",
  "permissions": [{ "role": "reader", "type": "user", "email": "alice@example.com" }]
}
```

**Expect** output[0].json to include a permission record for `alice@example.com` with role `reader`; a subsequent get on the file reports that permission.

### Test: share a file with the wrapped permissions shape

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "share",
  "fileId": "abc123",
  "permissions": { "permissionValues": [{ "role": "writer", "type": "domain", "domain": "example.com" }] }
}
```

**Expect** output[0].json to include a permission record for `example.com` with role `writer`; the wrapped `permissionValues` shape is equivalent to the bare-array form.

### Test: upload a file into a folder

**Given** input items:

```json
[{ "json": {}, "binary": { "file": { "fileName": "report.pdf", "mimeType": "application/pdf" } } }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "upload",
  "binaryField": "file",
  "fileName": "report.pdf",
  "folderId": "1abcFolder"
}
```

**Expect** output[0].json to contain `name` equal to `"report.pdf"`, a non-empty `id`, `mimeType` equal to `"application/pdf"`, and `parents` including `"1abcFolder"`; the `folderId` alias resolves to the same `parentId`.

### Test: delete into trash vs permanently

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "delete",
  "fileId": "abc123",
  "deletePermanently": false
}
```

**Expect** output[0].json to report the delete outcome as trashed (not permanently removed); a subsequent metadata read on the file still returns it with `trashed` true. When the same fixture runs with `deletePermanently` = true, the file is permanently removed and a subsequent read returns not-found.

### Test: move a file between folders

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "file",
  "operation": "move",
  "fileId": "abc123",
  "parentId": "2targetFolder"
}
```

**Expect** output[0].json to contain `id` equal to `"abc123"` and `parents` equal to `["2targetFolder"]`; the file's previous parent no longer appears in its `parents` set.

### Test: create a shared drive and list it

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "drive",
  "operation": "create",
  "name": "Team Space"
}
```

**Expect** output[0].json to contain `name` equal to `"Team Space"` and a non-empty `id`; then with `getAll`/`returnAll` = true the created drive appears in the resulting list.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource / operation catalog | documented | Public docs list File, File/Folder, Folder, and Shared Drive resources and their operations verbatim |
| Parameter purposes | documented | Public docs describe each parameter's purpose; names here are abstracted |
| Exact parameter nesting / option enums | inferred | Original UI nesting is out of scope per clean-room abstraction; OpenFlow should expose a flat, outcome-oriented schema |
| API response shape | inferred | Spec defines stable outcome-level fields (id, name, mimeType, parents, webViewLink) that are the documented intersection of Drive v2/v3 responses |
| Parent id naming (`parentId` + `folderId`/`driveId` aliases) | inferred | Public docs use Parent Drive/Parent Folder (driveId/folderId); OpenFlow exposes a single canonical parent param with aliases for compatibility |
| Share permission entry shape | documented | Public docs enumerate Role (reader/writer/commenter/owner levels) and Type (user/group/domain/anyone) with recipient email or domain |
| Delete semantics (trash vs permanent) | documented | Public docs: "Delete Permanently" chooses to delete now instead of moving to trash |
| Move semantics (replace parent set) | inferred | Drive v2 parents API adds a parent; OpenFlow contract replaces the parent set with the target |
| Credential type | documented | OAuth2 recommended; service account also supported |
| Binary output for downloads | inferred | Docs confirm binary output placement; field name and shape are an OpenFlow decision |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleDrive.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Scope note:** Upload/download rely on the engine's binary-data plumbing; the executor should not reimplement multipart handling beyond what the SDK provides.

---
type: n8n-nodes-base.googleDriveTool
displayName: Google Drive
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Drive (AI Tool)

A tool variant of the Google Drive node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports File (copy/create/delete/download/move/share/update/upload), File/Folder (search), Folder (create/delete/share), and Shared Drive (create/delete/get/getAll/update) operations against the Google Drive API v2/v3.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/file-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/file-folder-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/folder-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/shared-drive-operations/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://developers.google.com/drive/api | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleDriveTool`
- **Aliases:** `Drive`, `GDrive`, `GD`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleDriveOAuth2Api` (OAuth2) or `googleApi` (service account). The Drive API must be enabled in the associated Google Cloud project.

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | `oAuth2` or `serviceAccount` |

### Resource selection

The user selects one of four resources (File, File/Folder, Folder, Shared Drive) which determines available operations. Parameter shapes mirror the full Google Drive node (see `n8n-nodes-base.googleDrive`), with additional AI-support metadata.

### File resource

| Operation | Key parameters |
|-----------|----------------|
| Copy | File ID (list/URL/ID picker), New name, Copy in same folder, Parent destination (when not same folder); parent accepts `parentId`/`folderId`/`driveId` |
| Create | File name, Content (text body), Parent destination; optional: Convert to Google Doc |
| Delete | File ID; optional: Delete permanently (bypass trash) |
| Download | File ID, Convert to (export format: PDF/DOCX/XLSX/CSV/PPTX/PNG/SVG/JPEG for native Google files), Output field name for binary data |
| Move | File ID, Parent destination |
| Share | File ID, Permissions (array of `{ role, type, email? \| domain? }` entries); optional: Transfer ownership, Send notification email, Email message |
| Update | File ID; optional: New file name, Change file content (binary), Move to trash |
| Upload | Binary field (input), File name, Parent destination |

### File/Folder resource

| Operation | Key parameters |
|-----------|----------------|
| Search | Search mode (name / advanced), Query string, Return all, Limit, Parent scope, What to search (files/folders/filesAndFolders), Include trashed |

### Folder resource

| Operation | Key parameters |
|-----------|----------------|
| Create | Folder name, Parent destination |
| Delete | Folder ID; optional: Delete permanently |
| Share | Folder ID, Permissions (same schema as file share) |

### Shared Drive resource

| Operation | Key parameters |
|-----------|----------------|
| Create | Name; optional: Restrictions, Capabilities, Color, Hidden |
| Delete | Drive ID |
| Get | Drive ID |
| GetAll | Return all, Limit, Query |
| Update | Drive ID; optional: Name, Color, Restrictions |

### File/Folder identification

Files and folders support multiple identification modes:
- **From list**: Dropdown selection of available resources
- **By URL**: Full shareable URL (e.g. `https://drive.google.com/file/d/<FILE_ID>/view`)
- **By ID**: The `fileId` or `folderId` from the URL

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "let model fill" toggle is available on appropriate parameter fields
- Tool name and description metadata are configurable in the AI Agent node
- Operations with binary data (download, upload, update with file content) depend on the runtime's binary-data plumbing and may be constrained in agent contexts

## Runtime behavior

### Input

Consumes items from `main` input. Parameters may reference item data through expressions. For upload/update operations that replace content, a named field on the input item must carry binary data.

### Output

**Output[0]** — operation result, one item per input item:

- **Reads (get/getAll/search):** the matching resource(s), paginated when requested
- **Writes (create/copy/update/upload):** the affected resource's metadata (`id`, `name`, `mimeType`, `parents`, `webViewLink`)
- **Downloads:** file bytes attached to the output item's binary data under the configured field name, with metadata alongside
- **Deletes/moves:** confirmation result carrying the outcome
- **Share:** the applied permission record(s)

### Errors

- API errors (auth, permissions, not-found, quota, rate limits) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Missing required identifiers (file/folder/drive ID, binary field) throw before API calls
- Delete-to-trash vs permanent delete: default is trash (recoverable); only when `deletePermanently` = true is the item permanently removed

### Expressions

All string/number/boolean/enum parameters accept n8n expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions. Resource/operation selectors are typically static.

## Acceptance tests

### Test: Create a text file

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

**Expect** output[0].json to contain `name` equal to `"notes.txt"` and a non-empty `id`, `mimeType` of `text/plain`, and `parents` including `"root"`.

### Test: Search for files by name

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

**Expect** output[0].json to contain a list of at most 5 items, each with an `id`, `name`, and `mimeType`, each `name` matching the `notes` fragment.

### Test: Share a file with a user

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

**Expect** output[0].json to include a permission record for `alice@example.com` with role `reader`.

### Test: Upload a file into a folder

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

**Expect** output[0].json to contain `name` equal to `"report.pdf"`, a non-empty `id`, `mimeType` equal to `"application/pdf"`, and `parents` including `"1abcFolder"`.

### Test: Move a file between folders

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

**Expect** output[0].json to contain `id` equal to `"abc123"` and `parents` equal to `["2targetFolder"]`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Google Drive operations and parameters | documented | Public docs comprehensively describe all Drive operations and parameters |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |
| Tool-specific parameter layout | inferred | The tool variant wraps the standard Google Drive operations identically to the base node in agent context |
| Alias list | confirmed from corpus | "Drive", "GDrive", "GD" |
| Credential type names | inferred | `googleDriveOAuth2Api` (OAuth2) and `googleApi` (service account) follow the Google credential conventions |
| Version count | inferred | Single version; base Google Drive node also has one version |
| Exact output shape for each operation | documented | Outcome-level results documented; exact JSON shape varies by Drive API v2/v3 version |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleDriveTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

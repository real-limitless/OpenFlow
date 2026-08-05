---
type: n8n-nodes-base.dropboxTool
displayName: Dropbox (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Dropbox (AI Tool)

A tool variant of the Dropbox node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function. Supports File (copy/delete/download/move/upload), Folder (copy/create/delete/list/move), and Search (query) operations against the Dropbox API v2.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dropbox/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/dropbox/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://www.dropbox.com/developers/documentation/http/overview | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.dropboxTool`
- **Aliases:** `Dropbox`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `dropboxApi` (access token) or `dropboxOAuth2Api` (OAuth2)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `accessToken` | no | `accessToken` or `oAuth2` |

### Resource selection

The user selects one of three resources (File, Folder, Search) which determines available operations. Parameter shapes mirror the full Dropbox node, with additional AI-support metadata via `$fromAI()`.

### File resource

| Operation | Key parameters |
|-----------|----------------|
| Copy | Source path, Destination path |
| Delete | File path |
| Download | File path, Output binary property name |
| Move | Source path, Destination path |
| Upload | Full path (including filename), Binary data toggle; when binary=true: binary property name; when binary=false: file content as text |

### Folder resource

| Operation | Key parameters |
|-----------|----------------|
| Copy | Source path, Destination path |
| Create | Folder path |
| Delete | Folder path |
| List | Folder path, Return all, Limit; filter options: include deleted, include shared members, include mounted folders, include non-downloadable files, recursive |
| Move | Source path, Destination path |

### Search resource

| Operation | Key parameters |
|-----------|----------------|
| Query | Search query text, File status (active/deleted), Return all, Limit, Simplify results; filter options: file categories (audio/document/paper/folder/image/other/pdf/presentation/spreadsheet/video), file extensions, path scope |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name and description metadata are configurable in the AI Agent node
- Operations with binary data (download, upload) depend on the runtime's binary-data plumbing

## Runtime behavior

### Input

Consumes items from `main` input. Parameters may reference item data through expressions. For upload operations, a binary field on the input item carries file content when `binaryData` is enabled.

### Output

**Output[0]** — operation result, one item per input item:

- **Upload/Download:** file metadata (name, path, size, modified timestamp) alongside binary data for downloads
- **Copy/Move:** result metadata including source and destination paths
- **Delete:** confirmation response
- **Create (folder):** folder metadata (path, name, id)
- **List:** array of file and folder metadata entries for the given folder path
- **Search:** array of matching entries with file/folder metadata, limited/paginated as configured

### Errors

- Dropbox API errors (auth, permissions, not-found, quota, rate limits) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Missing required parameters (path, destination path) throw before API calls
- The Dropbox API returns structured errors (e.g. path/not_found) that should be surfaced

### Expressions

All string/number/boolean/enum parameters accept n8n expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions. Resource/operation selectors are typically static.

## Acceptance tests

### Test: Upload a file

**Given** input items:
```json
[{ "json": {}, "binary": { "file": { "fileName": "test.txt", "mimeType": "text/plain" } } }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "upload",
  "path": "/test.txt",
  "binaryData": true,
  "binaryPropertyName": "file"
}
```

**Expect** output[0].json to contain `path_display` ending with `/test.txt` and a non-empty `id`.

### Test: List folder contents

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "folder",
  "operation": "list",
  "path": "",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0].json to contain an array of up to 10 entries, each with `name`, `path_display`, and `type` (file or folder).

### Test: Search for files

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "search",
  "operation": "query",
  "query": "test",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0].json to contain matching results, each with a `metadata` containing `name` and `path_display`.

### Test: Create and delete a folder

**Given** input items:
```json
[{ "json": {} }, { "json": {} }]
```

**Parameters** (item 0):
```json
{
  "resource": "folder",
  "operation": "create",
  "path": "/test-folder"
}
```

**Expect** output[0].json to contain `path_display` equal to `/test-folder`.

**Parameters** (item 1):
```json
{
  "resource": "folder",
  "operation": "delete",
  "path": "/test-folder"
}
```

**Expect** output[1].json to indicate a successful deletion.

### Test: Copy a file

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "file",
  "operation": "copy",
  "path": "/source.txt",
  "toPath": "/dest.txt"
}
```

**Expect** output[0].json to contain `path_display` equal to `/dest.txt` and metadata indicating a copy occurred.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Dropbox operations and parameters | documented | Public docs list all operations for File/Folder/Search resources |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |
| Authentication parameter | confirmed from corpus | `authentication` accepts `accessToken` or `oAuth2` |
| Credential type names | confirmed from corpus | `dropboxApi` (Access Token), `dropboxOAuth2Api` (OAuth2) |
| Exact filter option fields | inferred | Filter parameters like `include_deleted`, `recursive`, `file_categories` are inferred from schema |
| Exact output shape | inferred | Dropbox API responses vary; only functional outcomes are spec'd |
| Tool-specific parameter layout | inferred | The tool variant wraps the standard Dropbox operations identically in agent context |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.dropboxTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

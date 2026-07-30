---
type: n8n-nodes-base.readWriteFile
displayName: Read/Write Files from Disk
category: Files
versions: [1, 1.1]
priority: medium
status: specced
---

# Read/Write Files from Disk

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile.md | Public docs only |
| https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/security.md | Public docs only (N8N_RESTRICT_FILE_ACCESS_TO) |
| https://docs.n8n.io/changelog/v20-breaking-changes.md | Public docs only (2.0 default restrict) |
| https://github.com/micromatch/picomatch#basic-globbing | Public third-party docs (glob pattern syntax only) |
| Public node descriptor metadata (parameter names, defaults, enums, aliases, versions) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.readWriteFile`
- **Aliases:** UI search labels `Binary`, `File`, `Text`, `Open`, `Import`, `Save`, `Export`, `Disk`, `Transfer` (**inferred** from public descriptor metadata; not alternate runtime type ids)
- **Display name:** `Read/Write Files from Disk`
- **Group / category:** `input` · Core Nodes · Files (**inferred** group tag from public descriptor; category from public docs)
- **Versions:** `1`, `1.1` (both supported; `typeVersion` selects)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Hosting:** Available on Cloud (restricted to `/home/node/`) and self-hosted (**documented**)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `read` | yes | — | `noDataExpression: true`. `read` = "Read File(s) From Disk"; `write` = "Write File to Disk" (**documented** UI; wire enums from descriptor) |
| fileSelector | string | `""` | yes | `operation: ["read"]` | "File(s) Selector" — file path or glob pattern. Always use forward slashes, even on Windows (**documented**) |
| fileName | string | `""` | yes | `operation: ["write"]` | "File Path and Name" — destination path, name, and extension (**documented**) |
| dataPropertyName | string | `data` | yes | `operation: ["write"]` | "Input Binary Field" — name of the input binary field containing the file to write (**documented**) |
| options | collection | `{}` | no | `operation: ["read"]` | Read operation options (see nested) (**documented**) |
| options | collection | `{}` | no | `operation: ["write"]` | Write operation options (see nested) (**documented**) |

### `operation` enum

| Wire value | UI label | Description |
|------------|----------|-------------|
| `read` | Read File(s) From Disk | Retrieve one or more files from the computer that runs n8n |
| `write` | Write File to Disk | Create a binary file on the computer that runs n8n |

### Read options (`options.*` — `operation: ["read"]`)

| name | type | default | notes |
|------|------|---------|-------|
| options.fileExtension | string | `""` | "File Extension" — override extension in the output binary metadata. Placeholder `e.g. zip` (**documented** + descriptor) |
| options.fileName | string | `""` | "File Name" — override name in the output binary metadata. Placeholder `e.g. data.zip` (**documented** + descriptor) |
| options.mimeType | string | `""` | "MIME Type" — override MIME type in the output binary metadata. Placeholder `e.g. application/zip` (**documented** + descriptor) |
| options.dataPropertyName | string | `data` | "Put Output File in Field" — name of the output binary field that receives the file (**documented** + descriptor) |

### Write options (`options.*` — `operation: ["write"]`)

| name | type | default | notes |
|------|------|---------|-------|
| options.append | boolean | `false` | "Append" — append to an existing file instead of creating a new one. Commonly used with text files; not limited to them, but not applicable to structured binary formats (**documented** + descriptor) |

### Version differences (v1 → v1.1)

| Topic | v1 | v1.1 | Source |
|-------|----|------|--------|
| `options` collection visibility | Read options shown only for `operation: ["read"]`; write `options` (append) shown for `operation: ["write"]` | Read/write `options` visibility unified — options collection available for both operations | **Inferred** from public node-definition descriptor metadata |

The public docs page reflects current (v1.1) behavior: read has its own options (fileExtension, fileName, mimeType, dataPropertyName) and write has its own options (append) (**documented**).

## Runtime behavior

### Role

Reads one or more files from — or writes binary file data to — the filesystem of the machine running the engine. Not for transferring files between different computers (use FTP, HTTP Request, AWS S3, etc. for that) (**documented**).

### File access restrictions (documented)

| Deployment | Allowed paths | Notes |
|------------|---------------|-------|
| n8n Cloud | `/home/node/` only | Paths outside (e.g. `/tmp/`, `/data/`) fail with an access error. `/home/node/.n8n/` is reserved for internal state. Filesystem is ephemeral — written files are not guaranteed to persist across executions, restarts, or redeploys. |
| Self-hosted (n8n 2.0+) | `~/.n8n-files` by default | Configurable via `N8N_RESTRICT_FILE_ACCESS_TO` env var (semicolon-separated list of allowed directories). Set explicitly to allow file operations elsewhere. |
| Self-hosted (pre-2.0) | Any path the n8n process can reach | No default restriction unless `N8N_RESTRICT_FILE_ACCESS_TO` is set. |
| Docker | Container filesystem | Paths refer to the n8n container's filesystem, not the Docker host. Mount host directories as volumes to make them available. |

Absolute file paths are recommended to prevent errors (**documented**).

### Read operation

1. Resolve `fileSelector` as a glob pattern using picomatch syntax (**documented**):
   - `*` — matches any character zero or more times, excluding path separators
   - `**` — matches any character zero or more times, including path separators
   - `?` — matches any character except path separators exactly once
   - `[]` — matches any one character inside the brackets (e.g. `[abc]` matches `a`, `b`, or `c`)
2. Always use forward slashes `/` as path separator, even on Windows (**documented**).
3. For each matching file, emit one output item whose binary field (named by `options.dataPropertyName`, default `data`) contains the file content as `IBinaryData` (base64-encoded `data`, `mimeType`, `fileName`, `fileExtension`, `fileSize`).
4. If `options.fileName`, `options.fileExtension`, or `options.mimeType` are set, they override the corresponding metadata fields in the output binary; otherwise values are inferred from the file path (**documented** + **inferred** fallback).
5. The item `json` is passed through from the input item (**inferred** platform convention — one output item per matched file, per input item).

### Write operation

1. For each input item, read binary data from the field named by `dataPropertyName` (default `data`).
2. Write the binary content to the file path specified by `fileName` (File Path and Name), including the extension.
3. If `options.append` is `true`, append the bytes to an existing file instead of creating/overwriting a new one (**documented**). Append is commonly used with text files; not applicable to structured binary formats.
4. One file is written per input item (**inferred** — each input item's binary field is written to the same `fileName` path; with multiple items, later writes overwrite earlier ones unless `append` is set).
5. Output items pass through the input items unchanged (**inferred** platform convention).

### Output

- **Read:** one item per matched file, on `main[0]`. Each item carries the file content in the named binary field. The `json` payload is passed through from the corresponding input item (**inferred**).
- **Write:** one item per input item, on `main[0]`, passed through unchanged (**inferred**).

### Errors

- **Read — no files match selector:** throws an error (message references the selector that matched nothing) (**inferred** from descriptor error metadata).
- **Read/Write — path outside allowed directories:** fails with an access error (**documented** for Cloud; **inferred** for self-hosted with `N8N_RESTRICT_FILE_ACCESS_TO`).
- **Write — input item missing the named binary field:** throws an error (**inferred** platform convention).
- **Write — directory in path does not exist or is unwritable:** surfaces the host filesystem error (**inferred** host FS behavior).
- `continueOnFail`: when enabled, a failed item produces an error item on `main[0]` (with `json.error` / error metadata) instead of stopping the whole execution; other items continue (**inferred** platform convention).

### Expressions

`fileSelector`, `fileName`, `dataPropertyName`, and all `options.*` string fields accept expression strings where the platform evaluates node parameters (**inferred** from descriptor type annotations allowing `Expression<string>`; platform-wide behavior). The `operation` field is `noDataExpression: true` — it does not accept expressions (**documented** in descriptor).

## Acceptance tests

### Test: read a single file

**Given** the file `/data/example.txt` exists on the engine host with content `hello world`  
**And** parameters:

```json
{
  "operation": "read",
  "fileSelector": "/data/example.txt",
  "options": {}
}
```

**Expect** output[0]:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "aGVsbG8gd29ybGQ=",
        "mimeType": "text/plain",
        "fileName": "example.txt",
        "fileExtension": "txt",
        "fileSize": 11
      }
    }
  }
]
```

(`aGVsbG8gd29ybGQ=` is base64 for `hello world`)

### Test: read multiple files via glob

**Given** files `/data/a.txt` and `/data/b.txt` exist  
**And** parameters:

```json
{
  "operation": "read",
  "fileSelector": "/data/*.txt",
  "options": {}
}
```

**Expect** output[0] has 2 items, each with `binary.data` holding the respective file content. Item order follows the glob match order.

### Test: read with custom output field and metadata overrides

**Given** the file `/data/report.pdf` exists  
**And** parameters:

```json
{
  "operation": "read",
  "fileSelector": "/data/report.pdf",
  "options": {
    "dataPropertyName": "attachment",
    "fileName": "invoice.pdf",
    "mimeType": "application/pdf"
  }
}
```

**Expect** output[0][0] has `binary.attachment` (not `binary.data`) with `fileName` = `invoice.pdf` and `mimeType` = `application/pdf`.

### Test: write a file

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "aGVsbG8gd29ybGQ=",
        "mimeType": "text/plain",
        "fileName": "example.txt"
      }
    }
  }
]
```

**Parameters:**

```json
{
  "operation": "write",
  "fileName": "/data/out.txt",
  "dataPropertyName": "data",
  "options": {}
}
```

**Expect** the file `/data/out.txt` is created on the engine host with content `hello world` (decoded from the input binary). Output items pass through the input unchanged.

### Test: write with append

**Given** the file `/data/log.txt` already contains `line1\n`  
**And** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "bGluZTI=",
        "mimeType": "text/plain"
      }
    }
  }
]
```

**Parameters:**

```json
{
  "operation": "write",
  "fileName": "/data/log.txt",
  "dataPropertyName": "data",
  "options": { "append": true }
}
```

**Expect** `/data/log.txt` now contains `line1\nline2` (appended, not overwritten).

### Test: read — no files match selector throws

**Given** no files match the pattern  
**And** parameters:

```json
{
  "operation": "read",
  "fileSelector": "/data/nonexistent.*",
  "options": {}
}
```

**Expect** the node throws an error referencing the selector that matched nothing. With `continueOnFail: true`, the error is surfaced as an error item on `main[0]` instead.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| operation read/write enums + defaults | documented | Public docs + descriptor |
| fileSelector glob syntax (*, **, ?, []) | documented | Docs link to picomatch |
| Read options (fileExtension, fileName, mimeType, dataPropertyName) | documented | Docs + descriptor defaults/placeholders |
| Write options (append) | documented | Docs + descriptor |
| dataPropertyName default `data` (read + write) | documented | Docs + descriptor |
| Versions 1 and 1.1 both supported | inferred | From public descriptor `version: [1, 1.1]` |
| v1 → v1.1 options visibility change | inferred | From public node-definition descriptor metadata; docs reflect v1.1 |
| Forward slashes required on Windows | documented | Docs + descriptor description |
| Cloud restricted to /home/node/ | documented | Docs file-locations section |
| Self-hosted default ~/.n8n-files (2.0+) | documented | Docs + 2.0 breaking changes |
| N8N_RESTRICT_FILE_ACCESS_TO env var | documented | Docs security env vars |
| Read: one output item per matched file | inferred | Docs say "retrieve one or more files"; item-per-file is the conventional shape |
| Read: json passed through from input | inferred | Not explicitly documented |
| Read: metadata fallback from file path when options empty | inferred | Docs say options "override"; fallback inferred |
| Write: one file per input item, pass-through output | inferred | Not explicitly documented |
| Write: missing binary field throws | inferred | Platform convention |
| Read: no match throws error | inferred | From descriptor error metadata |
| continueOnFail error item shape | inferred | Platform convention |
| IBinaryData fields (data, mimeType, fileName, fileExtension, fileSize) | inferred | Standard item binary shape; consistent with sibling file nodes |
| Exact glob library / read backend | not specified | Implement with any correct glob + fs library; do not copy third-party engine source |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/readWriteFile.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Host note:** Requires a filesystem-capable runtime. Gate behind the same `N8N_RESTRICT_FILE_ACCESS_TO`-equivalent allowlist used for other local FS nodes. On serverless/ephemeral runtimes, warn that written files are not guaranteed to persist.
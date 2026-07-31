---
type: n8n-nodes-base.readBinaryFiles
displayName: Read Binary Files
category: Files
versions: [1]
priority: low
status: specced
---

# Read Binary Files

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile.md | Public docs only (successor node) |
| https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/security.md | Public docs only (N8N_RESTRICT_FILE_ACCESS_TO) |
| Public node descriptor metadata (parameter names, defaults, enums, aliases, versions) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.readBinaryFiles`
- **Aliases:** `Text`, `Open`, `Import` (UI search labels only; not alternate runtime type ids)
- **Display name:** `Read Binary Files`
- **Group / category:** `core` · Core Nodes · Files
- **Versions:** `1` (single version)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Status:** Hidden/legacy node. Predecessor of `n8n-nodes-base.readWriteFile` (Read/Write Files from Disk). Retained for backward compatibility with workflows created before the successor replaced it. No write operation.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| fileSelector | string | `""` | yes | — | "File(s) Selector" — file path or glob pattern. Always use forward slashes. |
| options | collection | `{}` | no | — | Read options (see nested). |

### Options (`options.*`)

| name | type | default | notes |
|------|------|---------|-------|
| options.dataPropertyName | string | `data` | "Put Output File in Field" — name of the output binary field that receives the file content |
| options.fileExtension | string | `""` | "File Extension" — override extension in output binary metadata |
| options.fileName | string | `""` | "File Name" — override name in output binary metadata |
| options.mimeType | string | `""` | "MIME Type" — override MIME type in output binary metadata |

No `operation` parameter (read-only). No `append` option (no write capability).

## Runtime behavior

### Role

Reads one or more files from the filesystem of the machine running the engine using a glob pattern. This node only reads — it has no write operation. It is functionally equivalent to the read operation of `n8n-nodes-base.readWriteFile`, minus the `operation` parameter.

### File access restrictions

Identical to the Read/Write Files from Disk node:

| Deployment | Allowed paths | Notes |
|------------|---------------|-------|
| n8n Cloud | `/home/node/` only | Paths outside fail with access error. Filesystem is ephemeral. |
| Self-hosted (n8n 2.0+) | `~/.n8n-files` by default | Configurable via `N8N_RESTRICT_FILE_ACCESS_TO` env var. |
| Self-hosted (pre-2.0) | Any path the process can reach | No default restriction. |
| Docker | Container filesystem | Mount host directories as volumes to make them available. |

### Input

Accepts any number of input items on `main[0]`.

### Output

1. Resolve `fileSelector` as a glob pattern (picomatch syntax: `*`, `**`, `?`, `[]`).
2. For each matching file, emit one output item whose binary property (named by `options.dataPropertyName`, default `data`) contains the file content as binary data (base64-encoded data, mimeType, fileName, fileExtension, fileSize).
3. If `options.fileName`, `options.fileExtension`, or `options.mimeType` are set, they override the corresponding metadata fields; otherwise values are inferred from the file path.
4. The item `json` is passed through from the input item (when multiple input items exist, the glob is evaluated once and the matched files are emitted for each input item).

### Errors

- **No files match selector:** throws an error referencing the selector.
- **Path outside allowed directories:** fails with access error.
- `continueOnFail`: when enabled, a failed item produces an error item on `main[0]` (with `json.error` containing the error message) instead of stopping execution; other items continue.

### Expressions

`fileSelector` and all `options.*` string fields accept expression strings.

## Acceptance tests

### Test: read a single file

**Given** the file `/data/example.txt` exists on the engine host with content `hello world`
**And** input items:

```json
[{ "json": { "id": 1 } }]
```

**Parameters:**

```json
{
  "fileSelector": "/data/example.txt",
  "options": {}
}
```

**Expect** output[0]:

```json
[
  {
    "json": { "id": 1 },
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
  "fileSelector": "/data/*.txt",
  "options": {}
}
```

**Expect** output[0] has 2 items, each with `binary.data` holding the respective file content. Item order follows glob match order.

### Test: read with custom output binary field name

**Given** the file `/data/report.pdf` exists
**And** parameters:

```json
{
  "fileSelector": "/data/report.pdf",
  "options": {
    "dataPropertyName": "attachment",
    "fileName": "invoice.pdf",
    "mimeType": "application/pdf"
  }
}
```

**Expect** output[0][0] has `binary.attachment` (not `binary.data`) with `fileName = "invoice.pdf"` and `mimeType = "application/pdf"`.

### Test: continueOnFail — no files match

**Given** no files match the pattern
**And** `continueOnFail: true`
**And** parameters:

```json
{
  "fileSelector": "/data/nonexistent.*",
  "options": {}
}
```

**Expect** output[0] is a single error item with `json.error` containing the error message referencing the selector.

### Test: glob with path recursion

**Given** files `/data/sub/a.txt` and `/data/sub/deep/b.txt` exist
**And** parameters:

```json
{
  "fileSelector": "/data/**/*.txt",
  "options": {}
}
```

**Expect** output[0] has 2 items, one for each file discovered recursively.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, aliases | documented | Public descriptor metadata |
| Hidden/legacy status | inferred | Public docs 404; descriptor shows no primary doc page |
| Predecessor of readWriteFile | inferred | Descriptor primaryDocumentation points to readWriteFile docs |
| fileSelector required, default "" | inferred | From public descriptor |
| Options (dataPropertyName default "data", fileExtension, fileName, mimeType) | inferred | Matches readWriteFile read options; from public descriptor |
| No operation parameter (read-only) | inferred | Descriptor has no operation field |
| Glob syntax (*, **, ?, []) | documented | readWriteFile public docs; same backend |
| Per-item processing and output shape | inferred | Same as readWriteFile read operation |
| JSON pass-through from input item | inferred | Platform convention |
| File access restrictions | documented | Same as readWriteFile; public docs |
| Error handling + continueOnFail | inferred | Platform convention |
| Single version only | inferred | Node version is 1.0 with no version range |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/readBinaryFiles.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Host note:** Hidden/legacy node for import compatibility. Prefer the `readWriteFile` executor for new workflows. The read operation of `readWriteFile` covers the same behavior and is the canonical replacement. Requires a filesystem-capable runtime. Gate behind the same `N8N_RESTRICT_FILE_ACCESS_TO`-equivalent allowlist used for other local FS nodes.
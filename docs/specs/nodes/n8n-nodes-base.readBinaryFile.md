---
type: n8n-nodes-base.readBinaryFile
displayName: Read Binary File
category: Files
versions: [1]
priority: medium
status: specced
---

# Read Binary File

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile.md | Public docs only |
| https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/security.md | Public docs only (N8N_RESTRICT_FILE_ACCESS_TO) |
| Public node descriptor metadata (parameter names, defaults, enums, aliases, versions) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.readBinaryFile`
- **Aliases:** `Text`, `Open`, `Import` (UI search labels only; not alternate runtime type ids)
- **Display name:** `Read Binary File`
- **Group / category:** `core` · Core Nodes · Files
- **Versions:** `1` (single version)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| filePath | string | `""` | yes | — | "File Path" — path of the file to read. Placeholder: `/data/example.jpg`. Always use forward slashes, even on Windows. |
| dataPropertyName | string | `data` | yes | — | "Property Name" — name of the binary property to which to write the data of the read file |

No options collection or additional parameters. The node has a single version with no parameter-level displayOptions.

## Runtime behavior

### Input

Accepts any number of input items on `main[0]`. Each input item is processed independently. The `json` payload of each input item is passed through to the corresponding output item.

### Output

For each input item, the node reads the file at `filePath` (resolved relative to the engine's filesystem), converts it to binary data, and writes it into the output item's binary field named by `dataPropertyName` (default `data`). The output item's `json` is a shallow copy of the input item's `json`.

The file path is resolved via `helpers.resolvePath()` and read via `helpers.createReadStream()`. Binary metadata (mimeType, fileName, fileExtension, fileSize) is inferred from the file by `helpers.prepareBinaryData()`.

### File access restrictions

Same restrictions as the Read/Write Files from Disk node:
- **n8n Cloud:** restricted to `/home/node/` only
- **Self-hosted (n8n 2.0+):** defaults to `~/.n8n-files`; configurable via `N8N_RESTRICT_FILE_ACCESS_TO`
- **Self-hosted (pre-2.0):** any path the process can reach
- **Docker:** paths refer to the container filesystem, not the host

### Errors

- **File not found or unreadable:** throws an error with the host filesystem error message.
- **Path outside allowed directories:** fails with an access error.
- `continueOnFail`: when enabled, a failed item produces an error item on `main[0]` (with `json.error` containing the error message) instead of stopping execution; other items continue.

### Expressions

Both `filePath` and `dataPropertyName` accept expression strings.

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
  "filePath": "/data/example.txt",
  "dataPropertyName": "data"
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

### Test: custom binary property name

**Given** the file `/data/report.pdf` exists
**And** parameters:

```json
{
  "filePath": "/data/report.pdf",
  "dataPropertyName": "attachment"
}
```

**Expect** output[0][0] has `binary.attachment` (not `binary.data`) with the file content.

### Test: per-item processing with JSON pass-through

**Given** the file `/data/input.csv` exists
**And** input items:

```json
[
  { "json": { "index": 1 } },
  { "json": { "index": 2 } }
]
```

**Parameters:**

```json
{
  "filePath": "/data/input.csv",
  "dataPropertyName": "data"
}
```

**Expect** output[0] has 2 items. Each item has `json` matching the corresponding input item's `json` (e.g., `{ "index": 1 }` and `{ "index": 2 }`), and both carry the same file content in `binary.data`.

### Test: continueOnFail — file not found

**Given** the file `/data/nonexistent.txt` does not exist
**And** parameters:

```json
{
  "filePath": "/data/nonexistent.txt",
  "dataPropertyName": "data"
}
```

**And** `continueOnFail: true`

**Expect** output[0]:

```json
[
  {
    "json": { "error": "ENOENT: no such file or directory, open '/data/nonexistent.txt'" }
  }
]
```

### Test: continueOnFail — mixed success and failure across items

**Given** input items:
```json
[{ "json": {} }, { "json": {} }]
```

**And** `continueOnFail: true`
**And** `filePath` is an expression that resolves to a valid path for the first item and an invalid path for the second.

**Expect** output[0] has 2 items: the first item is a success with the file content in `binary.data` and `json: {}`, the second is an error item with `json.error` containing the failure message.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, aliases | documented | Public descriptor metadata |
| filePath required, default "" | inferred | From public descriptor |
| dataPropertyName required, default "data" | inferred | From public descriptor |
| Per-item processing (one input item → one output item) | inferred | From JS execution pattern |
| JSON pass-through from input item | inferred | Implementation behavior: shallow copy of `item.json` |
| Binary metadata inferred from file (mimeType, fileName, etc.) | inferred | Via `helpers.prepareBinaryData` |
| File access restrictions (Cloud, self-hosted, Docker) | documented | Same as readWriteFile node; public docs |
| Error handling + continueOnFail | inferred | Platform convention observed in implementation |
| No options / additional parameters | inferred | Public descriptor shows no options collection |
| Single version (no version diffs) | inferred | Node version is 1.0 with no version range |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/readBinaryFile.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Host note:** Requires a filesystem-capable runtime. Gate behind the same `N8N_RESTRICT_FILE_ACCESS_TO`-equivalent allowlist used for other local FS nodes.
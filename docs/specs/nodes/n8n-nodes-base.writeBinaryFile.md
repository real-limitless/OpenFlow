---
type: n8n-nodes-base.writeBinaryFile
displayName: Write Binary File
category: Files
versions: [1]
priority: medium
status: specced
---

# Write Binary File

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile.md | Public docs only (Write File to Disk section) |
| Public node descriptor metadata (parameter names, defaults, enums, aliases, versions) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.writeBinaryFile`
- **Aliases:** `Text`, `Save`, `Export` (UI search labels; not alternate runtime type ids)
- **Display name:** `Write Binary File`
- **Group / category:** `output` · Core Nodes · Files (inferred from descriptor)
- **Versions:** `1` (single version)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Hidden node:** `true` — this node is not shown in the regular node panel; it is a single-purpose simplified version of the "Write File to Disk" operation from `n8n-nodes-base.readWriteFile`
- **Hosting:** Same file-access restrictions as Read/Write Files from Disk: Cloud restricted to `/home/node/`; self-hosted respects `N8N_RESTRICT_FILE_ACCESS_TO`

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fileName | string | `""` | yes | "File Path and Name" — destination path including filename and extension. Use absolute paths with forward slashes |
| dataPropertyName | string | `"data"` | yes | "Input Binary Field" — name of the binary property on the input item that contains the data to write |
| options.append | boolean | `false` | no | Whether to append data to an existing file instead of creating a new one |

All parameters accept expression strings (`{{ ... }}`).

## Runtime behavior

### Input

Consumes one or more items from `main` input. Each item must have a binary property with the name specified in `dataPropertyName`. The binary data is written to the file system at the path given by `fileName`.

### Output

Passes each input item through unchanged as output items. The node does not add or remove any properties — it is a side-effect-only node.

### Errors

- **Missing binary property:** If the input item does not contain a binary property matching `dataPropertyName`, the node throws an error for that item.
- **File access denied:** If the resolved path falls outside the allowed directory (Cloud: `/home/node/`; self-hosted: `N8N_RESTRICT_FILE_ACCESS_TO`), the node throws an access error.
- **Parent directory does not exist:** throws an error.
- **Append to non-existent file:** If `options.append` is true but the file does not exist, behavior should be equivalent to creating a new file (no error).
- **`continueOnFail`:** When enabled, failed items produce an error output item `{ json: { error: string } }` on output[0] instead of halting execution.

### Expressions

All parameters accept expression strings.

## Acceptance tests

### Test: write binary file to disk

**Given** input items:

```json
[{
  "json": { "id": 1 },
  "binary": {
    "myFile": {
      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "mimeType": "image/png",
      "fileName": "input.png"
    }
  }
}]
```

**Parameters:**

```json
{
  "fileName": "/tmp/test-output.png",
  "dataPropertyName": "myFile"
}
```

**Expect** output[0] passes through the same item unchanged. The file `/tmp/test-output.png` exists on disk with the decoded binary content matching the `myFile` binary data.

### Test: write with default property name

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "data": {
      "data": "SGVsbG8gV29ybGQ=",
      "mimeType": "text/plain"
    }
  }
}]
```

**Parameters:**

```json
{
  "fileName": "/tmp/hello.txt",
  "dataPropertyName": "data"
}
```

**Expect** output[0] passes through. File `/tmp/hello.txt` contains the decoded text "Hello World".

### Test: append to existing file

**Given** input items (first execution creates file, second execution appends):

```json
[{
  "json": {},
  "binary": {
    "data": {
      "data": "BBBTdHJpbmc=",
      "mimeType": "text/plain"
    }
  }
}]
```

**Parameters:**

```json
{
  "fileName": "/tmp/append-test.txt",
  "dataPropertyName": "data",
  "options": {
    "append": true
  }
}
```

**Expect** If the file exists, content is appended (not overwritten). If the file does not exist, it is created. Output[0] passes through unchanged.

### Test: missing binary property raises error

**Given** input items:

```json
[{
  "json": { "text": "hello" }
}]
```

**Parameters:**

```json
{
  "fileName": "/tmp/out.txt",
  "dataPropertyName": "data"
}
```

**Expect** The node throws an error because the input item has no binary property named `data`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Write-specific behavior | Documented | Covered by the public "Write File to Disk" section of the Read/Write Files from Disk docs |
| Parameter names and defaults | documented | `fileName`, `dataPropertyName`, `options.append` from public descriptor metadata |
| Hidden node status | inferred | Node is `hidden: true` in descriptor — a simplified single-purpose variant of the combined readWriteFile node |
| File-access restrictions | documented | Cloud `/home/node/` restriction, self-hosted `N8N_RESTRICT_FILE_ACCESS_TO`, n8n 2.0 default `~/.n8n-files` |
| Expressions support | inferred | All string/boolean parameters likely accept expressions following the standard pattern |
| Hosting environment defaults | documented | Cloud ephemeral filesystem warning, Docker volume mount requirement |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/write-binary-file.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
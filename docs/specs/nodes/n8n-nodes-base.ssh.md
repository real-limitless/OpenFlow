---
type: n8n-nodes-base.ssh
displayName: SSH
category: Development
versions: [1]
priority: medium
status: specced
---

# SSH

Execute shell commands and transfer files to a remote host over the Secure
Shell Protocol. Three operations are supported: **execute command**, **download
file**, and **upload file**.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ssh.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/ssh.md | Public docs only (credentials) |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `Ssh.node.json` + `Ssh.node.schema.js`) | Public descriptor metadata — wire parameter names, enums, defaults, credential field names only |

## Wire format

- **Type string:** `n8n-nodes-base.ssh`
- **Aliases:** `remote` (palette / codex search; **descriptor**)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** required — selected by the `authentication` parameter:
  - `sshPassword` when `authentication = "password"`
  - `sshPrivateKey` when `authentication = "privateKey"`
  (**documented** + **descriptor**)

### Credential fields

**SSH Password (`sshPassword`)** — host, port (default **22**), username, password (**documented** / **descriptor**).

**SSH Private Key (`sshPrivateKey`)** — host, port (default **22**), username, privateKey (PEM / OpenSSH), passphrase (optional if key unencrypted) (**documented** / **descriptor**).

## Parameters

`resource` selects the family (`command` | `file`) and `operation` selects the
specific action. Visibility of every other parameter is gated by
`displayOptions` on `resource` + `operation`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `password` | yes | — | `password` \| `privateKey` — selects credential type (**descriptor**; required for credential test gating) |
| resource | options | `command` | yes | — | `command` \| `file` (**documented** + **descriptor**) |
| operation | options | `execute` (command) / `upload` (file) | yes | resource=command → `execute`; resource=file → `download` \| `upload` (**documented**; default **descriptor**) |
| command | string \| expression | `""` | yes* | resource=command, operation=execute | Command to execute on the remote device (**documented**; wire name **descriptor**) |
| cwd | string \| expression | `/` | yes | resource=command, operation=execute | Working directory on the remote device. `~/...` is expanded via the SSH session's `$HOME`; `~` (no slash) is an error (**documented** label "Working Directory"; wire name `cwd` **descriptor**; `~` semantics **descriptor**) |
| path | string \| expression | `""` | yes* | resource=file, operation=download | Full remote path **including the file name** to download. The downloaded binary will use this file name unless `options.fileName` overrides it (**documented**) |
| path | string \| expression | `""` | yes* | resource=file, operation=upload | Remote **directory** to upload into. The final file name comes from `binaryData.fileName` unless `options.fileName` overrides it (**documented** "Target Directory"; wire name `path` **descriptor**) |
| binaryPropertyName | string \| expression | `data` | yes* | resource=file | Download: name of the object property that will hold the binary bytes on the output item. Upload: name of the input binary property that contains the file to upload (**documented** labels; wire name **descriptor**) |
| options | collection | `{}` | no | resource=file, operation ∈ upload, download | See options below (**documented**; wire name **descriptor**) |
| options.fileName | string \| expression | `""` | no | resource=file, operation ∈ upload, download | Override the binary file name. Download: overrides the name taken from the source path. Upload: overrides `binaryData.fileName`; the value is `sanitizeFilename`-d before being concatenated to the target directory (**documented**; sanitization **descriptor**) |

\*Required when the operation’s `displayOptions` show the field.

### Version differences

- **v1** (current, `nodeVersion: 1.0`): single resource/operation split
  (`command` / `file` × `execute` / `download` / `upload`); `cwd` default `/`;
  no streaming output (**descriptor**).

## Runtime behavior

### Input

- One SSH action per input item, executed sequentially per item in a single
  SSH session that is opened once for the whole run and disposed at the end
  (**descriptor**).
- `cwd` and `path` that start with `~/` are expanded against the SSH session’s
  resolved `$HOME`; a bare `~` (no slash) throws `NodeOperationError` with the
  message *"Invalid path. Replace "~" with home directory or "~/"*"
  (**descriptor**).
- **Upload** reads bytes from `item.binary[binaryPropertyName]`. If that
  property carries an `id` (engine-binary), the stream is fetched via
  `getBinaryStream`; otherwise the base64 `data` field is decoded as `binary`
  (**descriptor**).
- **Download** ignores input binary on the matching item; it preserves any
  other binary properties by shallow copy and writes the downloaded bytes to
  `binary[binaryPropertyName]`. The remote file is written to a temporary
  local file (`tmp-promise`, `n8n-ssh-` prefix) and then handed to the engine
  via `nodeHelpers.copyBinaryFile` (**descriptor**).

### Output

| operation | Output shape |
|-----------|----------------|
| **execute** | One new item per input item. `json` is the SSH `execCommand` result object: `{ code: number, signal: null \| string, stderr: string, stdout: string }`. `pairedItem = { item: <inputIndex> }` (**descriptor**; matches `__schema__/v1.0.0/command/execute.json`) |
| **download** | Same item count as input (the input items are **mutated in place** to carry the new binary). Each output item has `json` copied from the input and `binary[binaryPropertyName]` set to the downloaded file. The destination file name on the binary is `options.fileName` when set, else the basename of the remote `path`. `pairedItem = { item: <inputIndex> }` (**descriptor**) |
| **upload** | One new item per input item. `json = { success: true }`. `pairedItem = { item: <inputIndex> }` (**descriptor**; matches `__schema__/v1.0.0/file/upload.json`) |

Notes:

- The return value of `execute` is `[returnItems]` for `command/execute` and
  for `file/upload`, but `[items]` for `file/download` (the input list, with
  binaries attached) (**descriptor**).
- Download reuses the input `json` shape verbatim and shallow-copies any
  pre-existing binary properties so that the *incoming* item’s binary map is
  not mutated (**descriptor**).

### Errors

- Missing / unresolvable credential, SSH handshake failure, auth failure,
  connection refused, or any `node-ssh` error → throws unless
  `continueOnFail` (**descriptor**).
- `path` that is the bare string `~` (without `/`) throws `NodeOperationError`
  with a "Invalid path. Replace..." message (**descriptor**).
- **Upload** with a missing input binary property: `assertBinaryData` throws
  unless `continueOnFail` (**descriptor**).
- **Download** with a remote path the SSH session cannot stat: thrown
  unless `continueOnFail` (**descriptor**).
- `continueOnFail`:
  - `command/execute` and `file/upload` → push `{ json: { error: <message> }, pairedItem: { item: i } }` and continue (**descriptor**).
  - `file/download` → replace `items[i]` with `{ json: { error: <message> } }` and continue (no `pairedItem`; no binary attached) (**descriptor**).

### Expressions

`command`, `cwd`, `path`, `binaryPropertyName`, and `options.fileName` accept
expression strings where the UI allows expressions (**documented** labels +
**descriptor**).

## Acceptance tests

### Test: execute command success

**Given** input items:

```json
[{ "json": { "host": "example" } }]
```

**Parameters:**

```json
{
  "authentication": "password",
  "resource": "command",
  "operation": "execute",
  "command": "echo hello",
  "cwd": "/"
}
```

**Credentials:** valid `sshPassword` for a host that accepts `echo hello`.

**Expect** output[0] has one item:

```json
[{ "json": { "code": 0, "signal": null, "stderr": "", "stdout": "hello\n" }, "pairedItem": { "item": 0 } }]
```

Non-zero `code` or non-empty `stderr` is allowed; the shape stays the same
(**documented** exec shape).

### Test: execute with `~` throws

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "password",
  "resource": "command",
  "operation": "execute",
  "command": "ls",
  "cwd": "~"
}
```

**Expect** the node throws `NodeOperationError` with a message starting with
*"Invalid path. Replace \"~\" with home directory or \"~/\""* (**descriptor**).

### Test: download writes binary property

**Given** input items:

```json
[{ "json": { "label": "report" } }]
```

**Parameters:**

```json
{
  "authentication": "privateKey",
  "resource": "file",
  "operation": "download",
  "path": "/data/report.csv",
  "binaryPropertyName": "data"
}
```

**Credentials:** valid `sshPrivateKey` for a host that has `/data/report.csv`.

**Expect** output[0] has one item with `json` mirroring the input and
`binary.data` populated with the file bytes; binary file name is `report.csv`
(basename of `path`) when `options.fileName` is empty (**documented** + **descriptor**).

### Test: download with `options.fileName` overrides name

**Parameters:**

```json
{
  "authentication": "password",
  "resource": "file",
  "operation": "download",
  "path": "/data/report.csv",
  "binaryPropertyName": "data",
  "options": { "fileName": "Q3-report.csv" }
}
```

**Expect** the binary `data.fileName` is `Q3-report.csv` (**documented**).

### Test: upload from input binary

**Given** input items:

```json
[{
  "json": { "id": 1 },
  "binary": {
    "data": {
      "data": "aGVsbG8=",
      "mimeType": "text/plain",
      "fileName": "hello.txt"
    }
  }
}]
```

**Parameters:**

```json
{
  "authentication": "password",
  "resource": "file",
  "operation": "upload",
  "path": "/uploads",
  "binaryPropertyName": "data"
}
```

**Expect** output[0] has one item:

```json
[{ "json": { "success": true }, "pairedItem": { "item": 0 } }]
```

The remote file is `/uploads/hello.txt` (target dir + sanitized
`binaryData.fileName`) (**documented** + **descriptor**).

### Test: continueOnFail on download replaces the input item with an error

**Given** input items:

```json
[{ "json": { "label": "x" } }]
```

**With** `continueOnFail = true` and parameters that would fail download (e.g.
non-existent remote path):

```json
{
  "authentication": "password",
  "resource": "file",
  "operation": "download",
  "path": "/does/not/exist.bin",
  "binaryPropertyName": "data"
}
```

**Expect** output[0] is one item:

```json
[{ "json": { "error": "..." }, "pairedItem": { "item": 0 } }]
```

No `binary.data` is attached; the input item’s binary map is dropped
(**descriptor**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations (execute / download / upload) | documented | Per end-user docs |
| Parameter labels and shapes (Credential, Command, Working Directory, Path, File Property, Input Binary Field, Target Directory, File Name) | documented | Per end-user docs |
| Wire names for non-label fields: `authentication`, `resource`, `operation`, `cwd`, `binaryPropertyName`, `options.fileName` | descriptor | From package node-definition schema under CORPUS_DIR only — not execute source |
| Defaults: `authentication=password`, `resource=command`, `operation=execute`, `operation=upload` (file), `cwd=/`, `binaryPropertyName=data`, `options.fileName=""` | descriptor | Aligns with common UI defaults |
| Two credentials (`sshPassword` / `sshPrivateKey`) selected by `authentication` | documented + descriptor | End-user docs describe password vs private key; wire gating per descriptor |
| Credential field names (host, port, username, password / privateKey, passphrase) | documented | End-user credential page |
| `~/...` expansion and bare-`~` error message | descriptor | Not documented in end-user docs |
| Exec result shape `{ code, signal, stderr, stdout }` | documented + descriptor schema | Matches `__schema__/v1.0.0/command/execute.json` and `__schema__/v1.0.0/file/download.json` (identical shape) |
| Upload result shape `{ success: true }` | descriptor | Matches `__schema__/v1.0.0/file/upload.json` |
| Download reuses input item (mutates in place; shallow-copies other binary props) | descriptor | |
| Filename sanitization on upload via `sanitizeFilename` | descriptor | |
| Connection pooling / persistent session across runs | gap | Not documented; spec assumes per-run session, closed in `finally` |
| Streaming `stdout` / large command output buffering | gap | Not documented; executor loads the full `execCommand` result into `json` |
| Stdin / interactive shell | gap | Not documented for this node |
| Specific error message strings beyond the `~` message | inferred | |
| Connection-timeout options, retry, host-key verification options | gap | Not exposed in the public node UI |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/ssh.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** The SSH client must be a pure SSH library (e.g. `ssh2` /
  `node-ssh` replacement) — never load the third-party node package. Map
  `authentication` → credential type (`sshPassword` / `sshPrivateKey`).
  Implement per-item exec/upload; for `download`, mutate the input items list
  to attach `binary[binaryPropertyName]` so the engine returns one item per
  input. Apply `sanitizeFilename` to the resolved upload file name and
  expand `~/...` against the SSH session’s `$HOME` for both `cwd` and
  `path`.

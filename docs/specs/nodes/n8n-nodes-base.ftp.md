---
type: n8n-nodes-base.ftp
displayName: FTP
category: Files
versions: [1]
priority: high
status: specced
---

# FTP

Access and transfer files on an FTP or SFTP server (delete, download, list, rename/move, upload).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ftp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/ftp.md | Public docs only (credentials) |

## Wire format

- **Type string:** `n8n-nodes-base.ftp`
- **Aliases:** `SFTP`, `FTP`, `Binary`, `File`, `Transfer` (codex / palette search; **descriptor**)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** required by protocol — type `ftp` when `protocol=ftp`, type `sftp` when `protocol=sftp` (**documented** + credential property names from public credential docs / descriptor)

### Credential fields

**FTP (`ftp`)** — host, port (default **21**), username, password (**documented** / **descriptor**).

**SFTP (`sftp`)** — host, port (default **22**), username, password, privateKey (OpenSSH format), passphrase (optional if key unencrypted) (**documented** / **descriptor**).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| protocol | options | `ftp` | yes | — | `ftp` \| `sftp` — selects credential type (**documented** behavior; wire enum **descriptor**) |
| operation | options | `download` | yes | — | `delete` \| `download` \| `list` \| `rename` \| `upload` (**documented**; default **descriptor**) |
| path | string | | yes* | operation ∈ delete, download, list, upload | Remote path (full path for delete) (**documented**) |
| oldPath | string | | yes* | operation = rename | Existing remote path (**documented**) |
| newPath | string | | yes* | operation = rename | Destination remote path (**documented**) |
| binaryPropertyName | string | `data` | yes* | download; or upload when binaryData=true | Download: output binary field name (“Put Output File in Field”). Upload: input binary field name (**documented** labels; wire name **descriptor**) |
| binaryData | boolean | `true` | no | operation = upload | true = upload from item binary; false = upload text `fileContent` (**documented**) |
| fileContent | string | | yes* | operation = upload, binaryData = false | Text body of file to upload (**documented**) |
| recursive | boolean | `false` | no | operation = list | Recursively list under path (**documented**) |
| options | collection | `{}` | no | all operations | Nested options below (**documented** subset + **descriptor** keys) |
| options.folder | boolean | `false` | no | operation = delete | Allow deleting folders as well as files (**documented**) |
| options.recursive | boolean | `false` | no | operation = delete, folder = true | When deleting a directory, remove contents recursively (**documented**) |
| options.createDirectories | boolean | `false` | no | operation = rename | Recursively create destination parent dirs (**documented**) |
| options.timeout | number | `10000` | no | — | Connection timeout ms (**descriptor**; not in end-user ops doc) |
| options.enableConcurrentReads | boolean | `false` | no | download + SFTP | Concurrent reads for faster download; not all SFTP servers support (**documented**) |
| options.maxConcurrentReads | number | `5` | no | enableConcurrentReads = true | (**descriptor**) |
| options.chunkSize | number | `64` | no | enableConcurrentReads = true | Chunk size in KB (**descriptor**; docs note not all servers support) |

\*Required when the operation’s displayOptions show the field.

## Runtime behavior

### Input

- One remote action per input item (standard item loop) (**inferred**).
- **Upload** with `binaryData=true`: binary payload comes from a prior node (e.g. Read/Write Files from Disk, HTTP Request) on the named binary property (**documented**).
- **Upload** with `binaryData=false`: UTF-8 (or plain) text from `fileContent` becomes the remote file body (**documented**).
- Credentials supply host/port/user auth; SFTP may use password and/or private key + passphrase (**documented**).

### Output

| operation | Output shape |
|-----------|----------------|
| **list** | One item per remote entry under `path` (non-recursive: immediate children; recursive: tree walk). JSON fields typically include name/path/type/size/modify time (**inferred** listing metadata; exact keys **inferred**). |
| **download** | Same item count as input; binary file bytes placed on `item.binary[binaryPropertyName]`; JSON may retain path/filename metadata (**documented** binary field; metadata **inferred**). |
| **upload** | Success item(s) confirming write to `path` (**inferred** success payload). |
| **delete** | Success confirmation for deleted path; with `options.folder` + `options.recursive`, directory trees are removed (**documented**). |
| **rename** | Moves/renames `oldPath` → `newPath`; with `options.createDirectories`, missing destination parents are created (**documented**). |

Protocol:

- `protocol=ftp` uses plain FTP credential and FTP client semantics (**documented**).
- `protocol=sftp` uses SFTP credential and SSH file-transfer semantics; concurrent-read options apply only here (**documented**).

### Errors

- Missing/invalid credentials, connection refused, auth failure, timeout → fail item/node (**inferred** standard).
- Path not found, permission denied, delete file-as-folder without `options.folder`, non-empty folder delete without recursive → fail (**inferred** from option semantics).
- Upload missing binary property or empty required path fields → fail (**inferred**).
- SFTP concurrent reads unsupported by server → may fail when enabled (**documented** caveat).
- `continueOnFail`: failed item yields error on item / empty branch per engine policy (**inferred**).

### Expressions

`path`, `oldPath`, `newPath`, `binaryPropertyName`, `fileContent`, and boolean/number option fields accept expression strings where the UI allows expressions (**inferred** / standard).

## Acceptance tests

### Test: list non-recursive

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "protocol": "ftp",
  "operation": "list",
  "path": "/incoming",
  "recursive": false
}
```

**Credentials:** valid `ftp` (host/port/user/password).

**Expect** output[0]: one item per direct child of `/incoming`; no throw on success. Recursive=false must not include nested-only paths as if flattened without parent context (**documented** recursive flag).

### Test: download to binary field

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "protocol": "sftp",
  "operation": "download",
  "path": "/data/report.csv",
  "binaryPropertyName": "data"
}
```

**Credentials:** valid `sftp`.

**Expect** output[0][0].binary.data present (file bytes); field name matches `binaryPropertyName` (**documented**).

### Test: upload text content

**Given** input items:

```json
[{ "json": { "body": "hello" } }]
```

**Parameters:**

```json
{
  "protocol": "ftp",
  "operation": "upload",
  "path": "/outgoing/hello.txt",
  "binaryData": false,
  "fileContent": "hello"
}
```

**Expect** remote file created/overwritten at path with content `hello`; success item on output[0] (**documented** text upload mode).

### Test: upload binary from prior item

**Given** input items:

```json
[{
  "json": { "fileName": "photo.png" },
  "binary": {
    "data": {
      "data": "<base64-or-engine-binary>",
      "mimeType": "image/png",
      "fileName": "photo.png"
    }
  }
}]
```

**Parameters:**

```json
{
  "protocol": "sftp",
  "operation": "upload",
  "path": "/uploads/photo.png",
  "binaryData": true,
  "binaryPropertyName": "data"
}
```

**Expect** remote file written from binary property `data` (**documented**).

### Test: delete folder recursive

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "protocol": "ftp",
  "operation": "delete",
  "path": "/tmp/job-42",
  "options": {
    "folder": true,
    "recursive": true
  }
}
```

**Expect** directory and contents removed when they exist; without `folder`, deleting a directory must fail (**documented**).

### Test: rename with createDirectories

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "protocol": "sftp",
  "operation": "rename",
  "oldPath": "/a/file.txt",
  "newPath": "/b/nested/file.txt",
  "options": {
    "createDirectories": true
  }
}
```

**Expect** `/b/nested` created as needed and file moved to `newPath` (**documented**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations + primary params | documented | delete/download/list/rename/upload |
| Credential FTP vs SFTP fields | documented | host/port/user/password; SFTP key+passphrase |
| Wire param names (`binaryPropertyName`, `binaryData`, `oldPath`, …) | descriptor | From package node-definition schema under CORPUS_DIR only — not execute source |
| Default operation `download`, protocol `ftp`, binary field `data` | descriptor | Aligns with common UI defaults |
| `options.timeout`, concurrent-read numbers | descriptor | Docs mention concurrent reads; numeric defaults from descriptor |
| List/download/upload success JSON keys | inferred | Docs describe behavior, not exact item JSON schema |
| Overwrite policy on upload/rename collision | inferred | Assume server/client default overwrite or replace |
| Passive/active FTP mode, TLS/FTPS | gap | Not in public node doc |
| Exact error message strings | inferred | |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/ftp.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Prefer pure protocol clients (FTP/SFTP) behind the executor; never load third-party workflow node packages. Credential resolution by `protocol` → `ftp` / `sftp`.

---
type: n8n-nodes-base.compression
displayName: Compression
category: Transform
versions: [1, 1.1]
priority: medium
status: specced
---

# Compression

Compress and decompress files. The node reads binary file(s) from each input
item, packs or unpacks them, and writes the result back to a binary property.
Supports **Zip** and **Gzip** formats (descriptor); the public docs also list
**Tar** and **Tar (Gzip)** — see Gaps.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.compression.md | Public docs only |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `dist/types/nodes.json` → `compression`) | Public descriptor metadata — parameter names, enums, defaults only |

## Wire format

- **Type string:** `n8n-nodes-base.compression`
- **Aliases:** `Zip`, `Gzip`, `uncompress`, `compress`, `decompress`, `archive`, `unarchive`, `Binary`, `Files`, `File` (**descriptor** `codex.alias`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Node versions:** `1`, `1.1` (**descriptor**); `1.1` is current
- **Group / category:** `transform` / Core Nodes → Files, Data Transformation (**descriptor**)
- **Subtitle expression:** `={{$parameter["operation"]}}` (**descriptor**)
- **Default node color:** `#408000` (**descriptor**)
- **Icon:** `fa:file-archive`, `green` (**descriptor**)
- **Usable as AI tool:** `true` (**descriptor** `usableAsTool`)

## Parameters

`operation` selects the direction. All other parameters are conditionally shown
via `displayOptions` on `operation` (and `outputFormat`, `@version`). Several
parameters are declared twice (once per version or per output format) with the
same wire name; the active one is selected by `displayOptions`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `decompress` | yes | — | `compress` (Compress file(s)) \| `decompress` (Decompress file(s)); `noDataExpression: true` (**documented** labels; wire enum + default **descriptor**) |
| binaryPropertyName | string | `data` | yes | operation ∈ compress | Comma-separated list of binary fields to compress (**documented**; wire name + default **descriptor**) |
| binaryPropertyName | string | `data` | yes | operation ∈ decompress | Comma-separated list of binary fields to decompress (**documented**; wire name + default **descriptor**) |
| outputFormat | options | `""` | no | operation ∈ compress, @version = 1 | `gzip` \| `zip`; empty default forces a choice in v1 (**descriptor**) |
| outputFormat | options | `zip` | no | operation ∈ compress, @version ≠ 1 | `gzip` \| `zip` (**descriptor**; docs also list `tar` / `tar.gz` — see Gaps) |
| fileName | string | `""` | yes | operation ∈ compress, outputFormat = zip | Output file name, e.g. `data.zip` (**documented**; wire name + default **descriptor**) |
| binaryPropertyOutput | string | `data` | no | operation ∈ compress, outputFormat = zip | Output binary field name (**documented**; wire name + default **descriptor**) |
| fileName | string | `""` | no | operation ∈ compress, outputFormat = gzip, @version ≠ 1 | Output file name, e.g. `data.txt` (**descriptor**; not required in v1.1 gzip) |
| binaryPropertyOutput | string | `data` | no | operation ∈ compress, outputFormat = gzip, @version ≠ 1 | Output binary field name (**descriptor**) |
| outputPrefix | string | `data` | yes | operation ∈ compress, outputFormat = gzip, @version = 1 | Prefix to add to the gzip file (v1 legacy) (**descriptor**) |
| outputPrefix | string | `file_` | yes | operation ∈ decompress | Prefix + incrementing index names each extracted file (**documented**; wire name + default **descriptor**) |

> The docs describe **Operation**, **Input Binary Field(s)**, **Output Format**,
> **File Name**, **Put Output File in Field** (compress) and **Output Prefix**
> (decompress). The wire names `operation`, `binaryPropertyName`,
> `outputFormat`, `fileName`, `binaryPropertyOutput`, `outputPrefix` come from
> the **descriptor**. The v1 gzip `outputPrefix` parameter is **descriptor-only**
> (not described in the current docs, which document v1.1).

## Runtime behavior

### Input

- One compress/decompress pass per input item (standard item loop) (**inferred**).
- Binary file(s) are read from `item.binary[field]` for each field name in the
  comma-separated `binaryPropertyName` (default `data`) (**documented** +
  **descriptor**).
- **Zero input items → zero output items** (empty `main` output array). The node
  must short-circuit before reading binary data and must **not** throw
  (**inferred** standard n8n transform pattern).
- The node does not read from `item.json`; it operates on `item.binary` only
  (**inferred**).

### Output — Compress

- Item count is preserved: each input item produces one output item carrying the
  compressed archive (**inferred**).
- **Zip** (`outputFormat = zip`): all input binary files for the item are
  combined into a single zip archive. The archive is written to
  `item.binary[binaryPropertyOutput]` (default `data`) with `fileName` set from
  `fileName` (e.g. `data.zip`) and `mimeType` `application/zip` (**documented**
  field names; archive assembly + mime **inferred**).
- **Gzip** (`outputFormat = gzip`, v1.1): a gzip stream is written to
  `item.binary[binaryPropertyOutput]` (default `data`) with `fileName` from
  `fileName` (e.g. `data.txt`) and `mimeType` `application/gzip` (**descriptor**
  field names; mime **inferred**). Gzip is a single-stream format; with more than
  one input binary field the behavior is **inferred** (see Gaps).
- **Gzip** (`outputFormat = gzip`, v1 legacy): the output uses `outputPrefix`
  (default `data`) instead of `fileName`/`binaryPropertyOutput` (**descriptor**;
  exact v1 output key semantics **inferred**).
- All existing `item.json` fields and unrelated binary fields are retained
  (**inferred**).

### Output — Decompress

- The archive format is detected from the **file extension** of the input binary
  file's `fileName`. Supported extensions (**documented**):
  - `.zip`
  - `.gz` and `.gzip`
  - `.tar`
  - `.tar.gz` and `.tgz`
- A `.tar.gz` / `.tgz` archive is extracted in a **single step** — the gzip
  layer is not decompressed separately (**documented**).
- Each extracted file is named with `outputPrefix` (default `file_`) followed by
  an incrementing index: `file_0`, `file_1`, … (**documented**).
- The extracted files are emitted as binary properties on the output item(s)
  keyed `{outputPrefix}{index}` (e.g. `file_0`), each carrying one extracted
  file with its archive-internal name as `fileName` (**inferred** — the docs name
  only the prefix+index convention; whether all files land on one item or one
  item per file is **inferred**, see Gaps).
- All existing `item.json` fields are retained (**inferred**).

### Errors

- **Unsupported extension on decompress → throw** (do not silently produce empty
  output). Supported extensions are `zip`, `gz`, `gzip`, `tar`, `tar.gz`, `tgz`
  (**documented**).
- Missing or empty binary field at `binaryPropertyName` → fail (**inferred**).
- Corrupt or truncated archive → fail (**inferred**).
- Missing required `fileName` for `outputFormat = zip` → fail (**inferred**
  standard required-field validation).
- `continueOnFail`: a failed item yields an error on the item / empty output per
  engine policy (**inferred**).

### Expressions

- `operation` is declared `noDataExpression: true` — it **cannot** be an
  expression (**descriptor**).
- The remaining string parameters (`binaryPropertyName`, `fileName`,
  `binaryPropertyOutput`, `outputPrefix`) are plain `string` types in the
  descriptor; n8n string fields generally accept expressions (`{{ … }}`) in the
  UI, so they are expected to accept expressions, but this is **inferred** (not
  declared).

## Acceptance tests

Binary entries use the n8n shape `{ fileName, data (base64), mimeType }`.
`hello` base64 = `aGVsbG8=`. Deterministic gzip (mtime 0) of `hello` base64 =
`H4sIAAAAAAAC/8tIzcnJBwCGphA2BQAAAA==`.

### Test: Compress to gzip (v1.1)

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": { "fileName": "data.txt", "data": "aGVsbG8=", "mimeType": "text/plain" }
    }
  }
]
```

**Parameters:**

```json
{
  "operation": "compress",
  "binaryPropertyName": "data",
  "outputFormat": "gzip",
  "fileName": "data.txt",
  "binaryPropertyOutput": "data"
}
```

**Expect** output[0]:

```json
[
  {
    "json": {},
    "binary": {
      "data": { "fileName": "data.txt", "data": "<gzip stream of 'hello'>", "mimeType": "application/gzip" }
    }
  }
]
```

Assert structurally: `output[0].binary.data.fileName === "data.txt"`,
`mimeType === "application/gzip"`, and base64-decoding `data` then gunzipping
yields `hello`. Exact gzip bytes are not asserted (stream headers are
implementation-dependent).

### Test: Compress to zip (v1.1)

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": { "fileName": "data", "data": "aGVsbG8=", "mimeType": "application/octet-stream" }
    }
  }
]
```

**Parameters:**

```json
{
  "operation": "compress",
  "binaryPropertyName": "data",
  "outputFormat": "zip",
  "fileName": "data.zip",
  "binaryPropertyOutput": "data"
}
```

**Expect** output[0]:

```json
[
  {
    "json": {},
    "binary": {
      "data": { "fileName": "data.zip", "data": "<zip archive>", "mimeType": "application/zip" }
    }
  }
]
```

Assert structurally: `output[0].binary.data.fileName === "data.zip"`,
`mimeType === "application/zip"`, and the zip archive contains an entry whose
content is `hello`. Exact zip bytes are not asserted (timestamps/deflate are
implementation-dependent).

### Test: Compress multiple fields to zip (multi-field binaryPropertyName)

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": { "fileName": "a.txt", "data": "aGVsbG8=", "mimeType": "text/plain" },
      "data2": { "fileName": "b.txt", "data": "d29ybGQ=", "mimeType": "text/plain" }
    }
  }
]
```

**Parameters:**

```json
{
  "operation": "compress",
  "binaryPropertyName": "data,data2",
  "outputFormat": "zip",
  "fileName": "bundle.zip",
  "binaryPropertyOutput": "data"
}
```

**Expect** output[0]:

```json
[
  {
    "json": {},
    "binary": {
      "data": { "fileName": "bundle.zip", "data": "<zip archive>", "mimeType": "application/zip" }
    }
  }
]
```

Assert structurally: `output[0].binary.data.fileName === "bundle.zip"`,
`mimeType === "application/zip"`, and the zip archive contains two entries
whose contents are `hello` and `world` respectively. The comma-separated
`binaryPropertyName` reads both `data` and `data2` fields and combines them
into one archive (**documented** — "use a comma-separated list").

### Test: Decompress a gzip archive

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": { "fileName": "data.gz", "data": "H4sIAAAAAAAC/8tIzcnJBwCGphA2BQAAAA==", "mimeType": "application/gzip" }
    }
  }
]
```

**Parameters:**

```json
{
  "operation": "decompress",
  "binaryPropertyName": "data",
  "outputPrefix": "file_"
}
```

**Expect** output[0] (one-item interpretation):

```json
[
  {
    "json": {},
    "binary": {
      "file_0": { "fileName": "data", "data": "aGVsbG8=", "mimeType": "text/plain" }
    }
  }
]
```

Assert: a binary property keyed `file_0` exists whose decoded content is
`hello`. (Whether multiple extracted files land on one item as `file_0`,
`file_1`, … or as one item per file is **inferred** — see Gaps.)

### Test: Decompress unsupported extension throws

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": { "fileName": "data.rar", "data": "AAAA", "mimeType": "application/x-rar" }
    }
  }
]
```

**Parameters:**

```json
{
  "operation": "decompress",
  "binaryPropertyName": "data",
  "outputPrefix": "file_"
}
```

**Expect:** the node **throws** an error. It must not silently produce empty
output.

### Test: Empty input produces empty output

**Given** input items:

```json
[]
```

**Parameters:**

```json
{
  "operation": "compress",
  "binaryPropertyName": "data",
  "outputFormat": "zip",
  "fileName": "data.zip",
  "binaryPropertyOutput": "data"
}
```

**Expect** output[0]:

```json
[]
```

The node must not throw or read `binaryPropertyName` when there are zero input
items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| `operation` enum + default `decompress` | descriptor | Docs list both operations but not a default |
| Wire names `binaryPropertyName`/`outputFormat`/`fileName`/`binaryPropertyOutput`/`outputPrefix` | descriptor | Docs use display labels only |
| `outputFormat` enum = `{zip, gzip}` | descriptor | Docs list Zip, Gzip, **Tar, Tar (Gzip)** — Tar/Tar.gz are **not** in the v2.15.1 descriptor `outputFormat` options. Treat zip/gzip as the compress wire contract; Tar/Tar.gz support is a docs/descriptor discrepancy (likely newer docs or docs-only) |
| Decompress supported extensions `.zip`/`.gz`/`.gzip`/`.tar`/`.tar.gz`/`.tgz` | documented | Descriptor option descriptions mention only "zip or gzip"; docs are authoritative for decompress detection |
| `.tar.gz`/`.tgz` single-step extraction | documented | |
| v1 vs v1.1 parameter split (gzip `outputPrefix` vs `fileName`/`binaryPropertyOutput`) | descriptor | Docs document v1.1 only; v1 gzip `outputPrefix` is descriptor-only |
| `outputFormat` v1 default `""` vs v1.1 default `zip` | descriptor | |
| Per-item loop / item-count preservation on compress | inferred | Standard n8n transform pattern |
| Empty input → empty output (no throw) | inferred | Standard n8n transform pattern; `ensureItems` preserves empty input |
| Zip combines multiple input binary fields into one archive | inferred | Docs say "compress more than one file"; archive assembly inferred |
| Gzip with multiple input binary fields | inferred (low confidence) | Gzip is single-stream; multi-file behavior undefined by docs — implementer should verify |
| Decompress output item count (one item w/ `file_0`,`file_1`,… vs one item per file) | inferred | Docs name only the prefix+index convention; **key implementer uncertainty** — verify against a real instance |
| Decompress output binary key = `{outputPrefix}{index}` | inferred | "prefix, followed by an incrementing index, to name each extracted file" |
| Output mime types (`application/zip`, `application/gzip`) | inferred | Not in docs or descriptor |
| v1 gzip output key semantics via `outputPrefix` | inferred | Descriptor-only parameter; exact v1 behavior not documented |
| Unsupported extension → throw (not empty output) | documented | |
| Expression acceptance on string params | inferred | Descriptor declares plain `string`; `operation` is `noDataExpression: true` |
| Error message strings | inferred | |
| Underlying archive libraries | inferred | Not named in docs; OpenFlow may use any zip/gzip/tar library honoring the same contract |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/compression.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Use zip/gzip/tar libraries honoring the format contract behind the
  executor; never load the `n8n-nodes-base` package. Read binary file(s) from
  `item.binary[field]` for each field in the comma-separated `binaryPropertyName`;
  write compressed output to `item.binary[binaryPropertyOutput]` (zip / v1.1
  gzip) or `item.binary[outputPrefix]` (v1 gzip). For decompress, detect format
  from the input `fileName` extension, extract, and emit extracted files keyed
  `{outputPrefix}{index}`. Preserve all `item.json` fields and unrelated binary
  fields. No credentials required. `operation` is not an expression.
  **Critical implementer contract:** (1) Unsupported extension on decompress
  **must throw** — never silently emit empty output. (2) Empty input (zero
  items) returns empty output — do not throw or read `binaryPropertyName`.
  (3) `.tar.gz`/`.tgz` must extract in a single step. (4) Decompress output
  item-count (one item with `file_0`,`file_1`,… vs one item per file) is the top
  uncertainty — verify against a real instance before finalizing.
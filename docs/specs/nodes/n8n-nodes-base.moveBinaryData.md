---
type: n8n-nodes-base.moveBinaryData
displayName: Move Binary Data
category: Transform
versions: [1, 1.1]
priority: P2
status: specced
---

# Move Binary Data

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile/ | Public docs only (related "Move Base64 String to File" operation) |
| npm package descriptor (MoveBinaryData.node.json) | Public descriptor only |

## Wire format

- **Type string:** `n8n-nodes-base.moveBinaryData`
- **Aliases:** `Move Binary Data`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Hidden:** true (internal node, not shown in add-node panel)

## Parameters

### Mode selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `mode` | options | `binaryToJson` | yes | `binaryToJson` — Binary → JSON; `jsonToBinary` — JSON → Binary |

### Binary-to-JSON parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `setAllData` | boolean | `true` | no | mode: binaryToJson | Replace all JSON data with decoded binary; else write to single key |
| `sourceKey` | string | `data` | yes | mode: binaryToJson | Binary key to read from (dot-notation supported) |
| `destinationKey` | string | `data` | yes | mode: binaryToJson, setAllData: false | JSON key to write to (dot-notation) |

### JSON-to-Binary parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `convertAllData` | boolean | `true` | no | mode: jsonToBinary | Convert all JSON data to binary; else only one key |
| `sourceKey` | string | `data` | yes | mode: jsonToBinary, convertAllData: false | JSON key to read from (dot-notation) |
| `destinationKey` | string | `data` | yes | mode: jsonToBinary | Binary key to write to (dot-notation) |

### Options (collection, shared)

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| `encoding` | options | `utf8` | mode: any | Character encoding for decode/encode (iconv-lite supported encodings) |
| `keepSource` | boolean | `false` | mode: any | Preserve the source key; by default it is deleted |
| `stripBOM` | boolean | `true` | mode: binaryToJson, BOM-aware encoding | Strip BOM on decode |
| `addBOM` | boolean | `false` | mode: jsonToBinary, BOM-aware encoding | Add BOM on encode |
| `jsonParse` | boolean | `false` | mode: binaryToJson, setAllData: false | JSON.parse the decoded value |
| `keepAsBase64` | boolean | `false` | mode: binaryToJson, setAllData: false | Keep binary data as base64 string instead of decoding |
| `dataIsBase64` | boolean | `false` | mode: jsonToBinary, convertAllData: false | Input is already base64; skip stringify |
| `useRawData` | boolean | `false` | mode: jsonToBinary | Use raw data without JSON.stringify |
| `fileName` | string | `""` | mode: jsonToBinary | File name to set on output binary data |
| `mimeType` | string | `application/json` | mode: jsonToBinary | MIME type for output binary data |

## Runtime behavior

### Input

Accepts zero or more items with `json` and optionally `binary` properties.

### Output

One output item per input item that has the required source data. Items without the required source key are silently dropped (not included in output).

### Binary-to-JSON mode

- Reads the binary value from the source key, decodes it using the selected encoding, and writes the result into the item's `json` property.
- When `setAllData` is true: the entire `json` is replaced with the decoded/parsed value.
- When `setAllData` is false: `json` is deep-copied from the input, and the decoded value is written to the destination key. If `jsonParse` is true, the decoded string is JSON-parsed to an object.
- If `keepAsBase64` is true, the binary data is kept as a base64 string instead of being decoded.
- Source binary key is removed from output unless `keepSource` is true.

### JSON-to-Binary mode

- Reads the JSON value from the source key (or the entire `json` if `convertAllData` is true), encodes it using the selected encoding, and writes the result as binary data into the destination binary key.
- When `convertAllData` is true: the entire `json` value is stringified and encoded.
- When `convertAllData` is false: only the named source key is stringified and encoded.
- If `dataIsBase64` is true, the input is treated as a pre-encoded base64 string.
- If `useRawData` is true and the value is not an object, it is not stringified.
- Source JSON key is removed from output unless `keepSource` is true.
- When `convertAllData` is true and `keepSource` is false, `json` is set to an empty object.

### Version differences

| Version | Change |
|---------|--------|
| 1.0 | JSON-to-Binary: always sets `mimeType` to `application/json` if not provided |
| 1.1 | JSON-to-Binary: if no `fileName` is set and no file extension is derived, defaults to `file` as the filename |

### Errors

- Throws if `mode` is not recognized.
- Items with missing source data are silently skipped (no error thrown).
- `continueOnFail`: when true, individual item errors are caught and the item is passed through with an `error` field on `json`.

### Expressions

All parameter values may contain expressions.

## Acceptance tests

### Test: Binary-to-JSON (setAllData)

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "data": { "data": "eyJrZXkiOiAidmFsdWUifQ==", "mimeType": "application/json" }
  }
}]
```

**Parameters:**

```json
{ "mode": "binaryToJson", "sourceKey": "data", "setAllData": true }
```

**Expect** output[0] has 1 item with `json` equal to `{"key": "value"}` and no binary data (source key removed).

### Test: Binary-to-JSON (single key, keepSource)

**Given** input items:

```json
[{
  "json": { "existing": true },
  "binary": {
    "data": { "data": "aGVsbG8=", "mimeType": "text/plain" }
  }
}]
```

**Parameters:**

```json
{ "mode": "binaryToJson", "sourceKey": "data", "setAllData": false, "destinationKey": "message", "options": { "keepSource": true } }
```

**Expect** output[0] has 1 item with `json.existing` = `true`, `json.message` = `"hello"`, and `binary.data` preserved.

### Test: JSON-to-Binary (convertAllData, with fileName)

**Given** input items:

```json
[{ "json": { "name": "Alice", "age": 30 } }]
```

**Parameters:**

```json
{ "mode": "jsonToBinary", "destinationKey": "data", "convertAllData": true, "options": { "fileName": "alice.json", "mimeType": "application/json" } }
```

**Expect** output[0] has 1 item with `json` = `{}` (empty, source removed), `binary.data` containing base64-encoded `{"name":"Alice","age":30}`, `binary.data.fileName` = `"alice.json"`, `binary.data.mimeType` = `"application/json"`.

### Test: JSON-to-Binary (single key, keepSource)

**Given** input items:

```json
[{ "json": { "name": "Alice", "payload": "SGVsbG8=" } }]
```

**Parameters:**

```json
{ "mode": "jsonToBinary", "sourceKey": "payload", "destinationKey": "file", "convertAllData": false, "options": { "keepSource": true, "dataIsBase64": true } }
```

**Expect** output[0] has 1 item with `json.name` = `"Alice"`, `json.payload` = `"SGVsbG8="`, `binary.file` containing decoded base64 `"Hello"`.

### Test: Binary-to-JSON (base64 keepAsBase64)

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "data": { "data": "aGVsbG8=", "mimeType": "text/plain" }
  }
}]
```

**Parameters:**

```json
{ "mode": "binaryToJson", "sourceKey": "data", "setAllData": false, "destinationKey": "out", "options": { "keepAsBase64": true } }
```

**Expect** output[0].json.out = `"aGVsbG8="` (base64 string kept as-is).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Encoding options list | inferred from corpus | Uses iconv-lite; all supported encodings are available |
| BOM-aware encodings list | inferred from corpus | Dynamically determined from iconv-lite |
| Version 1.1 fileName default | inferred from corpus | Fallback to `file` when no fileName and no file extension derived |
| Hidden node status | confirmed from descriptor | `hidden: true` — not shown in add-node panel |
| Public docs page | 404 | No dedicated public docs page for this node type; primary doc URL points to Convert to File page |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/move-binary-data.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
---
type: n8n-nodes-base.convertToFile
displayName: Convert to File
category: Transform
versions: [1, 1.1]
priority: P1
status: specced
---

# Convert to File

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile/ | Public docs only |
| npm package descriptor (types/nodes.json) | Public descriptor only |

## Wire format

- **Type string:** `n8n-nodes-base.convertToFile`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `csv` | yes | — | One of: `csv`, `html`, `iCal`, `toJson`, `ods`, `rtf`, `toText`, `xls`, `xlsx`, `toBinary` |
| `binaryPropertyName` | string | `data` | yes | — | Name of the output binary field that receives the generated file |
| `options.fileName` | string | `""` | no | — | Output file name (without extension) |
| `options.headerRow` | boolean | `true` | no | operation: csv, html, rtf, ods, xls, xlsx | Whether to include a header row |
| `options.delimiter` | string | `,` | no | operation: csv | CSV column delimiter |
| `options.includeEmptyCells` | boolean | `false` | no | operation: csv, html, rtf, ods, xls, xlsx | Include empty cells as empty strings |
| `options.rawData` | boolean | `false` | no | operation: xlsx | Write raw data without type coercion |
| `options.fieldName` | string | `data` | no | operation: toText, toBinary | Input field containing the text/base64 value |
| `options.mimeType` | string | `""` | no | operation: toBinary | Override MIME type for decoded binary |
| `options.fileExtension` | string | `""` | no | operation: toBinary | Override file extension for decoded binary |
| `options.eventTitle` | string | `""` | no | operation: iCal | Field name or literal for event title |
| `options.eventDescription` | string | `""` | no | operation: iCal | Field name or literal for event description |
| `options.eventLocation` | string | `""` | no | operation: iCal | Field name or literal for event location |
| `options.eventStart` | string | `""` | no | operation: iCal | Field name or literal for event start date |
| `options.eventEnd` | string | `""` | no | operation: iCal | Field name or literal for event end date |
| `options.multipleFiles` | boolean | `false` | no | operation: toJson | When true, produce one JSON file per item; otherwise a single file with all items |

## Runtime behavior

### Input

Accepts zero or more items. Each item's `json` object provides the data to convert.

### Output

Produces one item per input item (for `iCal`, `toJson` with `multipleFiles`, `toText`, `toBinary`) or a single item (for `csv`, `html`, `rtf`, `ods`, `xls`, `xlsx`, `toJson` without `multipleFiles`).

Each output item carries:
- `json`: the original input item's json (preserved)
- `binary`: a record keyed by `binaryPropertyName` containing the generated file as `IBinaryData` with base64-encoded `data`, `mimeType`, `fileName`, `fileExtension`, and `fileSize`.

### Per-operation details

| operation | value | behavior | output items |
|-----------|-------|----------|-------------|
| Convert to CSV | `csv` | All items → single CSV string. Header row from union of keys (first item's keys). Values comma-separated, quoted if needed. | 1 |
| Convert to HTML | `html` | All items → single HTML `<table>`. Header row from first item's keys. | 1 |
| Convert to ICS | `iCal` | Each item → one ICS (iCalendar) event file. | N (one per input) |
| Convert to JSON | `toJson` | All items → single JSON array file, or one file per item when `multipleFiles` is true. | 1 or N |
| Convert to ODS | `ods` | All items → ODS spreadsheet. **Partial** — requires spreadsheet library. | 1 |
| Convert to RTF | `rtf` | All items → RTF table. | 1 |
| Convert to Text File | `toText` | Each item's named field value → text file. | N |
| Convert to XLS | `xls` | All items → XLS spreadsheet. **Partial** — requires spreadsheet library. | 1 |
| Convert to XLSX | `xlsx` | All items → XLSX spreadsheet. **Partial** — requires spreadsheet library. | 1 |
| Move Base64 String to File | `toBinary` | Each item's named field (base64 string) → decoded binary file. | N |

### Errors

- Throws if `binaryPropertyName` is empty.
- Throws if `operation` is not recognized.
- For `toText`: throws if the named field is missing on an item.
- For `toBinary`: throws if the named field is missing or not a valid base64 string.
- `continueOnFail`: when true, errors on individual items are caught and the item is passed through with an `error` field on `json`.

### Expressions

All parameter values may contain expressions (resolved by the engine before the executor runs).

## Acceptance tests

### Test: CSV — basic

**Given** input items:

```json
[
  { "json": { "name": "Alice", "age": 30 } },
  { "json": { "name": "Bob", "age": 25 } }
]
```

**Parameters:**

```json
{ "operation": "csv", "binaryPropertyName": "data" }
```

**Expect** output[0] has 1 item with `binary.data` containing base64 of:

```
name,age
Alice,30
Bob,25
```

### Test: JSON — single file

**Given** input items:

```json
[
  { "json": { "id": 1 } },
  { "json": { "id": 2 } }
]
```

**Parameters:**

```json
{ "operation": "toJson", "binaryPropertyName": "data" }
```

**Expect** output[0] has 1 item with `binary.data` containing base64 of `[{"id":1},{"id":2}]`.

### Test: Text — per-item

**Given** input items:

```json
[
  { "json": { "message": "hello" } },
  { "json": { "message": "world" } }
]
```

**Parameters:**

```json
{ "operation": "toText", "binaryPropertyName": "data", "options": { "fieldName": "message" } }
```

**Expect** output[0] has 2 items, each with `binary.data` containing base64 of the respective message.

### Test: toBinary — base64 decode

**Given** input items:

```json
[{ "json": { "raw": "aGVsbG8=" } }]
```

**Parameters:**

```json
{ "operation": "toBinary", "binaryPropertyName": "data", "options": { "fieldName": "raw", "fileExtension": "txt", "mimeType": "text/plain" } }
```

**Expect** output[0][0].binary.data decodes to `hello`, with `mimeType` `text/plain` and `fileExtension` `txt`.

### Test: HTML — table

**Given** input items:

```json
[{ "json": { "a": 1, "b": 2 } }]
```

**Parameters:**

```json
{ "operation": "html", "binaryPropertyName": "data" }
```

**Expect** output[0] has 1 item with `binary.data` containing base64 of an HTML string containing `<table>`, `<th>a</th>`, `<th>b</th>`, `<td>1</td>`, `<td>2</td>`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| ODS/XLS/XLSX generation | inferred | Requires spreadsheet library (exceljs or similar). Marked partial/TODO. |
| ICS event field mapping | inferred | Field names for event properties inferred from descriptor option names. |
| RTF table format | inferred | Simple RTF table generation; may not match all RTF readers. |
| CSV quoting rules | inferred | Standard RFC 4180 quoting (double quotes for values containing commas, quotes, or newlines). |
| `multipleFiles` for toJson | inferred | Not in truncated descriptor; inferred from operation description "single or multiple JSON files". |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/convert-to-file.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
---
type: n8n-nodes-base.extractFromFile
displayName: Extract from File
category: Transform
versions: [1]
priority: P1
status: specced
---

# Extract from File

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.extractfromfile/ | Public docs only |
| npm package descriptor (types/nodes.json) | Public descriptor only |

## Wire format

- **Type string:** `n8n-nodes-base.extractFromFile`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `csv` | yes | — | One of: `csv`, `html`, `iCal`, `toJson`, `ods`, `rtf`, `toText`, `xls`, `xlsx` |
| `binaryPropertyName` | string | `data` | yes | — | Name of the input binary field that holds the file to extract from |
| `options.headerRow` | boolean | `true` | no | operation: csv, html, rtf, ods, xls, xlsx | Whether the file contains a header row |
| `options.delimiter` | string | `,` | no | operation: csv | CSV column delimiter |
| `options.fieldName` | string | `data` | no | operation: toText | Output field name that receives the text content |

## Runtime behavior

### Input

Accepts one or more items. Each item must carry binary data in the field named by `binaryPropertyName`. The binary `data` field is base64-encoded text content.

### Output

Produces one or more items whose `json` contains the extracted data. The binary data is not carried forward unless the operation is `toText` (which preserves the original item json and adds the text as a field).

### Per-operation details

| operation | value | behavior | output items |
|-----------|-------|----------|-------------|
| CSV to JSON | `csv` | Parse CSV text. If `headerRow` is true, first row becomes keys; otherwise keys are `column_0`, `column_1`, … | N (one per data row) |
| HTML to JSON | `html` | Parse `<table>` rows. If `headerRow` is true, first `<tr>` cells become keys; otherwise `column_N`. | N (one per row) |
| ICS to JSON | `iCal` | Parse VEVENT blocks. Each event becomes one item with fields: `title` (SUMMARY), `description` (DESCRIPTION), `location` (LOCATION), `start` (DTSTART), `end` (DTEND), `uid` (UID). | N (one per event) |
| JSON to JSON | `toJson` | Parse JSON file. If the content is an array, each element becomes one item. If it is a single object, one item is produced. | 1 or N |
| ODS to JSON | `ods` | Parse ODS spreadsheet. **Partial** — requires spreadsheet library. | N |
| RTF to JSON | `rtf` | Parse RTF table rows. **Partial** — basic text extraction only. | N |
| Text File to JSON | `toText` | Decode binary to text and place it in the field named by `options.fieldName`. Preserves the original item json. | 1 (per input item) |
| XLS to JSON | `xls` | Parse XLS spreadsheet. **Partial** — requires spreadsheet library. | N |
| XLSX to JSON | `xlsx` | Parse XLSX spreadsheet. **Partial** — requires spreadsheet library. | N |

### Errors

- Throws if `binaryPropertyName` is empty.
- Throws if the named binary field is missing on an input item.
- Throws if `operation` is not recognized.
- For `toJson`: throws if the file content is not valid JSON.
- `continueOnFail`: when true, errors on individual items are caught and the item is passed through with an `error` field on `json`.

### Expressions

All parameter values may contain expressions (resolved by the engine before the executor runs).

## Acceptance tests

### Test: CSV — basic with header

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "bmFtZSxhZ2UKQWxpY2UsMzAKQm9iLDI1Cg==",
        "mimeType": "text/csv",
        "fileName": "data.csv",
        "fileExtension": "csv"
      }
    }
  }
]
```

(base64 of `name,age\nAlice,30\nBob,25\n`)

**Parameters:**

```json
{ "operation": "csv", "binaryPropertyName": "data" }
```

**Expect** output[0] has 2 items:

```json
[
  { "json": { "name": "Alice", "age": "30" } },
  { "json": { "name": "Bob", "age": "25" } }
]
```

### Test: JSON — array

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "W3siaWQiOjF9LHsiaWQiOjJ9XQ==",
        "mimeType": "application/json"
      }
    }
  }
]
```

(base64 of `[{"id":1},{"id":2}]`)

**Parameters:**

```json
{ "operation": "toJson", "binaryPropertyName": "data" }
```

**Expect** output[0] has 2 items: `[{ "json": { "id": 1 } }, { "json": { "id": 2 } }]`.

### Test: Text — per-item

**Given** input items:

```json
[
  {
    "json": { "id": 1 },
    "binary": {
      "data": {
        "data": "aGVsbG8=",
        "mimeType": "text/plain"
      }
    }
  }
]
```

(base64 of `hello`)

**Parameters:**

```json
{ "operation": "toText", "binaryPropertyName": "data", "options": { "fieldName": "content" } }
```

**Expect** output[0][0].json is `{ "id": 1, "content": "hello" }`.

### Test: ICS — events

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "QkVHSU46VkNBTEVOREFSDQpWRVJTSU9OOjIuMA0KQkVHSU46VkVWRU5UDQpVSUQ6MSU0MGV4YW1wbGUNClNVTU1BUlk6VGVzdCBFdmVudA0KRFRTVEFSVDoyMDI2MDEwMVQwOTAwMDBaDQpERVRFTkQ6MjAyNjAxMDFUMTAwMDAwWQ0KRU5EOlZFVkVOVA0KRU5EOlZDQUxFTkRBUg==",
        "mimeType": "text/calendar"
      }
    }
  }
]
```

(base64 of an ICS calendar with one VEVENT)

**Parameters:**

```json
{ "operation": "iCal", "binaryPropertyName": "data" }
```

**Expect** output[0] has 1 item with `json.title` = `Test Event`.

### Test: HTML — table

**Given** input items:

```json
[
  {
    "json": {},
    "binary": {
      "data": {
        "data": "PHRhYmxlPjx0cj48dGg+YTwvdGg+PHRoPmI8L3RoPjwvdHI+PHRyPjx0ZD4xPC90ZD48dGQ+MjwvdGQ+PC90cj48L3RhYmxlPg==",
        "mimeType": "text/html"
      }
    }
  }
]
```

(base64 of `<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>`)

**Parameters:**

```json
{ "operation": "html", "binaryPropertyName": "data" }
```

**Expect** output[0] has 1 item: `{ "json": { "a": "1", "b": "2" } }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| ODS/XLS/XLSX parsing | inferred | Requires spreadsheet library (exceljs or similar). Marked partial/TODO. |
| RTF table parsing | inferred | Basic text extraction only; may not handle all RTF constructs. |
| ICS field mapping | inferred | Field names for output items inferred from ICS property names. |
| CSV quoting rules | inferred | Standard RFC 4180 quoting (double quotes for values containing commas, quotes, or newlines). |
| HTML table parsing | inferred | Simple regex-based extraction of `<tr>` and `<td>`/`<th>` cells. |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/extract-from-file.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
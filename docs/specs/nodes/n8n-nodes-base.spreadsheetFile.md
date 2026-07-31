---
type: n8n-nodes-base.spreadsheetFile
displayName: Spreadsheet File
category: Data & Storage
versions: [1, 2]
priority: medium
status: specced
---

# Spreadsheet File

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.extractfromfile.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.spreadsheetFile`
- **Aliases:** `_Excel`, `Excel`, `CSV`, `Sheet`, `Spreadsheet`, `xls`, `xlsx`, `ods`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Hidden:** true (internal node; not exposed in the node panel picker, but functional when imported via workflow JSON)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | fromFile | yes | — | `fromFile` (Read From File) or `toFile` (Write to File) |
| binaryPropertyName | string | data | yes | operation = fromFile | Name of the input binary field containing the file data |
| binaryPropertyName | string | data | yes | operation = toFile | Name of the output binary field to receive the file |
| fileFormat | options | autodetect (fromFile), xls (toFile) | yes | — | File format: autodetect, csv, html, ods, rtf, xls, xlsx (fromFile); csv, html, ods, rtf, xls, xlsx (toFile) |
| options | collection | {} | no | — | See option collections below |

### From-file options (operation = fromFile)

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| delimiter | string | , | fileFormat = csv | Field delimiter character |
| encoding | options | utf-8 | fileFormat = csv | Character encoding: ascii, latin1, ucs-2, ucs2, utf-8, utf16le, utf8 |
| enableBOM | boolean | false | fileFormat = csv | Exclude byte-order-mark from CSV input |
| relaxQuotes | boolean | false | fileFormat = csv | Treat unclosed quotes as literal content instead of throwing |
| headerRow | boolean | true | — | First row contains column names |
| includeEmptyCells | boolean | false | — | Emit empty-string entries for empty cells |
| maxRowCount | number | -1 | fileFormat = csv | Stop after N rows (-1 = all) |
| range | string | "" | — | Read range: numeric = starting row, A1-style string = named range |
| rawData | boolean | false | — | Return unparsed raw data instead of structured rows |
| readAsString | boolean | false | — | Read all values as strings to preserve special characters |
| sheetName | string | Sheet | — | Sheet to read from (first sheet if unset) |
| fromLine | number | 0 | fileFormat = csv | First line index to start reading from |
| skipRecordsWithErrors | fixedCollection | { enabled: true, maxSkippedRecords: -1 } | fileFormat = csv | Skip malformed records; `enabled` boolean + `maxSkippedRecords` cap (-1 = unlimited) |

### To-file options (operation = toFile)

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| compression | boolean | false | fileFormat = xlsx, ods | Apply ZIP compression |
| fileName | string | "" | — | Output filename override; defaults to `spreadsheet.<fileFormat>` |
| headerRow | boolean | true | — | Emit header row with column names |
| sheetName | string | Sheet | fileFormat = ods, xls, xlsx | Sheet name in the spreadsheet |

## Runtime behavior

### Input

Each input item is processed independently. The node operates on binary data attached to each item.

**Read from file (`fromFile`):** The node reads binary data from the field named by `binaryPropertyName` on each input item. It parses that binary data according to the selected `fileFormat` option. CSV-specific options (delimiter, encoding, BOM handling, quote relaxation, row limits, error skipping) apply only when `fileFormat = csv`. Options common across formats (headerRow, includeEmptyCells, range, rawData, readAsString, sheetName) apply as described.

**Write to file (`toFile`):** The node serializes the JSON data of each input item into the selected spreadsheet format. All input items are aggregated into rows of a single sheet. The output binary is placed into the field named by `binaryPropertyName` on the output item. The `headerRow` option controls whether the first emitted row contains the JSON key names.

### Output

**Read from file (`fromFile`, non-raw mode):** Each input item produces one or more output items, one per row parsed from the binary data. When `headerRow = true`, row values are keyed by the column names from the first row. When `headerRow = false`, row values are keyed by numeric indices (0, 1, 2, ...). When `rawData = true`, a single output item is produced per input item containing the unparsed data structure.

**Write to file (`toFile`):** One output item per input item, with binary data set in the field named by `binaryPropertyName`. The original JSON data from the input item is preserved alongside the binary field.

### Errors

- Unparseable file data should throw an error. `continueOnFail` returns the input item with `error` property set.
- CSV parsing errors with `skipRecordsWithErrors.enabled = true` skip the offending record instead of throwing, up to `maxSkippedRecords`. If the cap is exceeded, throw.
- Unsupported file formats should throw.

### Expressions

All parameter values accept expressions (`{{ }}`). The `operation`, `fileFormat`, and `binaryPropertyName` parameters are `noDataExpression = true` (does not evaluate per-item expressions).

## Acceptance tests

### Test: read CSV with header row

**Given** an input item with binary data containing:

```
name,age
Alice,30
Bob,25
```

**Parameters:**
```json
{ "operation": "fromFile", "fileFormat": "csv", "binaryPropertyName": "data", "options": { "headerRow": true } }
```

**Expect** output[0]:
```json
[
  { "json": { "name": "Alice", "age": "30" } },
  { "json": { "name": "Bob", "age": "25" } }
]
```

### Test: read CSV without header row

**Given** CSV data: `Alice,30\nBob,25`

**Parameters:**
```json
{ "operation": "fromFile", "fileFormat": "csv", "binaryPropertyName": "data", "options": { "headerRow": false } }
```

**Expect** output items with numeric keys:
```json
[
  { "json": { "0": "Alice", "1": "30" } },
  { "json": { "0": "Bob", "1": "25" } }
]
```

### Test: write JSON to CSV

**Given** input items:
```json
[
  { "json": { "name": "Alice", "age": 30 } },
  { "json": { "name": "Bob", "age": 25 } }
]
```

**Parameters:**
```json
{ "operation": "toFile", "fileFormat": "csv", "binaryPropertyName": "data", "options": { "headerRow": true } }
```

**Expect** one output item with binary field `data` containing CSV content:
```
name,age
Alice,30
Bob,25
```

### Test: read XLSX with sheet name

**Given** an input item with binary data containing an XLSX workbook with a sheet named "Data" containing `col\nval1\nval2`.

**Parameters:**
```json
{ "operation": "fromFile", "fileFormat": "xlsx", "binaryPropertyName": "data", "options": { "sheetName": "Data", "headerRow": true } }
```

**Expect** output items with key `col` and values `val1`, `val2`.

### Test: skip records with CSV errors

**Given** CSV data: `a,b\n1,2\n3,broken\n4,5`

**Parameters:**
```json
{ "operation": "fromFile", "fileFormat": "csv", "binaryPropertyName": "data", "options": { "skipRecordsWithErrors": { "value": { "enabled": true, "maxSkippedRecords": 10 } } } }
```

**Expect** two output items (the malformed row `3,broken` is skipped):
```json
[
  { "json": { "a": "1", "b": "2" } },
  { "json": { "a": "4", "b": "5" } }
]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Autodetect file format | inferred from descriptor | The `fromFile` operation has an `autodetect` option; the detection algorithm (magic bytes vs extension) is not publicly documented |
| V1 vs V2 differences | documented from descriptor | V1 lacks `autodetect` fileFormat option for fromFile; V2 adds it. V1 lacks `rawData`, `readAsString`, `fromLine`, `skipRecordsWithErrors` fromFile options |
| XLS/XLSX library choice | inferred | The spec should not prescribe an implementation library |
| HTML/RTF reading | inferred from descriptor | Support is declared but the resulting output shape is not described in public docs |
| `rawData` output shape | inferred | The exact structure returned when rawData=true is not publicly documented |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/spreadsheet-file.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
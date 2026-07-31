---
type: n8n-nodes-base.microsoftExcel
displayName: Microsoft Excel (OneDrive)
category: Data & Storage
versions: [1, 2]
priority: medium
status: specced
---

# Microsoft Excel (OneDrive)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftexcel/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/resources/excel | Third-party API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftExcel`
- **Aliases:** `_Excel`, `Excel`, `Sheet`, `CSV`, `Spreadsheet`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftExcelOAuth2Api` (default), `microsoftOAuth2Api`, `microsoftEntraOAuth2Api`
  - Authentication dropdown lets the user pick between Excel-specific OAuth2, generic Microsoft Graph OAuth2 (reusable across Microsoft nodes), or Entra Service Principal (app-only, v2+)
  - Government cloud tenants can set a custom Graph API base URL via the credential

## Parameters

### Resource selector

A top-level `resource` parameter selects the entity type:

- `table` — work with structured Excel tables
- `workbook` — manage workbooks
- `worksheet` — manage and manipulate worksheet data

### Version 1 resources and operations

**table:**
- `append` — append rows to the end of an existing table
- `getColumns` — list column names in a table
- `getRows` — retrieve all rows from a table
- `lookup` — find a row by matching a column value

**workbook:**
- `addWorksheet` — create a new worksheet in the workbook
- `getAll` — list accessible workbooks

**worksheet:**
- `getAll` — list worksheets in a workbook
- `readRows` / get content — retrieve cell content from a worksheet

### Version 2 additions (v2 retains all v1 operations)

**table (v2 adds):**
- `addTable` — create a structured table from a range
- `convertToRange` — convert a table back to a plain range
- `deleteTable` — remove a table

**workbook (v2 adds):**
- `deleteWorkbook` — delete a workbook

**worksheet (v2 adds):**
- `append` — write rows to a worksheet without a table
- `clear` — clear cell values or formats in a range
- `deleteWorksheet` — delete a worksheet
- `update` — modify specific cells by row index or key column
- `upsert` — update matching rows or insert new ones based on a key column

### Common resource locator parameters

When a workbook, worksheet, or table must be selected, the node presents a resource locator control that dynamically lists candidates via the Microsoft Graph API:

- Workbook — searched via `GET /me/drive/root/search(q='{filter}')` or `GET /me/drive/root/children`
- Worksheet — listed via `GET /drive/items/{workbookId}/workbook/worksheets`
- Table — listed via `GET /drive/items/{workbookId}/workbook/worksheets/{worksheetId}/tables`

### Data source and column parameters

Operations that read or write cell data accept:

- **Data mapping** — incoming item fields mapped to column positions (for append/update/upsert)
- **Column to match on** — for lookup/update/upsert operations, the column to use as the key
- **Value to match / column value** — for lookup operations, the value to find
- **Raw data output** — a boolean option; when enabled the node returns the raw Graph API response under `raw` key instead of parsed rows
- **Range** — for worksheet readRows/clear operations, an optional A1-style range string (e.g. `A1:C10`). When omitted, the used range is inferred from the worksheet.

### Options

Optional settings common across operations include:

- **Data start row** — the first row containing data (for worksheets without tables, rows above this are treated as headers)
- **Key column** — for upsert/update, identifies which column holds the lookup value
- **Column mapping strategy** — how incoming item fields map to worksheet columns (by position, by header name, or auto-detect)

## Runtime behavior

### Input processing

Each input item produces one API call or is batched into a single call depending on the operation:
- **Append** — all items are batched and appended as a single set of rows
- **Lookup/Update/Upsert** — each item is processed individually; the column match is evaluated against the current sheet data
- **Read/GetAll** — a single API call returns data, which is split into output items (one per row)

### Output shape

**Read-style operations** (getRows, readRows, lookup, getAll):
Each output item contains a `json` object with column names as keys and cell values as values. If `rawDataOutput` is enabled, the item also contains a `raw` property with the full Graph API response.

**Write-style operations** (append, update, upsert, addWorksheet, addTable):
Output items mirror the input items, enriched with any metadata returned from the API (e.g. the range that was written to).

**Delete/clear operations** (deleteTable, deleteWorksheet, clear, deleteWorkbook):
Input items pass through unchanged on success.

### Errors

- **Resource not found** — if the workbook, worksheet, or table no longer exists (deleted, renamed), the node throws a descriptive error
- **Column mismatch** — if a column name referenced in the data mapping or lookup does not exist in the worksheet, the node throws
- **Credential errors** — expired tokens, insufficient permissions (`Files.ReadWrite` or `Files.ReadWrite.All` missing), or government cloud misconfiguration produce auth errors
- **`continueOnFail`** — when enabled, errored items produce a `{ json: { error: string } }` output on the main branch instead of halting

### Expressions

All parameter values (workbook/worksheet/table identifiers, column names, cell values, range strings) accept n8n expression syntax.

## Acceptance tests

### Test: table append rows

**Given** input items:
```json
[{ "json": { "Name": "Alice", "Age": 30 } }, { "json": { "Name": "Bob", "Age": 25 } }]
```

**Parameters:**
```json
{ "resource": "table", "operation": "append", "workbook": "{{ $params.workbookId }}", "worksheet": "{{ $params.sheetName }}", "table": "{{ $params.tableName }}" }
```

**Expect** output[0] to contain the same items with a `range` property added indicating where data was written. The API call should `POST` the array of arrays `[["Alice",30],["Bob",25]]` to the table rows endpoint.

### Test: worksheet lookup by column

**Given** input items:
```json
[{ "json": { "email": "alice@example.com" } }]
```

**Parameters:**
```json
{ "resource": "worksheet", "operation": "upsert", "workbook": "{{ $params.workbookId }}", "worksheet": "{{ $params.sheetName }}", "columnToMatchOn": "Email", "value": "{{ $json.email }}" }
```

**Expect** the node to read the worksheet, find the row where the Email column equals `alice@example.com`, update it with any additional mapped fields, and output the updated row. If no match exists, insert a new row.

### Test: workbook get all

**Parameters:**
```json
{ "resource": "workbook", "operation": "getAll" }
```

**Expect** output[0] to contain one item per workbook. Each item has `json` keys like `id`, `name`, `webUrl`, `createdDateTime`, `lastModifiedDateTime` as returned by the Microsoft Graph drive items API.

### Test: worksheet read rows (v2)

**Parameters:**
```json
{ "resource": "worksheet", "operation": "readRows", "workbook": "{{ $params.workbookId }}", "worksheet": "{{ $params.sheetName }}", "rawDataOutput": false }
```

**Expect** output[0] to contain one item per row in the worksheet, with column headers as keys.

### Test: table add and delete (v2 lifecycle)

**Parameters:**
```json
{ "resource": "table", "operation": "addTable", "workbook": "{{ $params.workbookId }}", "worksheet": "{{ $params.sheetName }}", "range": "A1:C10", "hasHeaders": true }
```

**Expect** output[0] to contain a single item identifying the newly created table (id, name, address).

Follow with `deleteTable` on the same table id — expect pass-through of input items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | Public docs list the core operations; corpus v2 descriptor confirms the full list plus v2 additions (e.g. addTable, deleteTable, deleteWorkbook, upsert) |
| Credential types | documented | Public docs document three auth options; corpus confirms credential names |
| Parameter details (column mapping, range, rawDataOutput, key column) | inferred | Behavior follows common patterns in other n8n app nodes (Google Sheets, etc.); exact option names and defaults from descriptor |
| V1 vs V2 operation split | inferred from descriptor | V1 has 3 resources with 8 total operations; V2 adds 7 more (addTable, convertToRange, deleteTable, deleteWorkbook, clear, deleteWorksheet, update, upsert). Public docs do not enumerate the version split. |
| Graph API endpoint patterns | documented | Public Microsoft Graph Excel API docs confirm the REST resources |
| Output shapes | inferred | Row-based output matches standard n8n pattern; exact response enrichment from descriptor |

## OpenFlow mapping

- **Definition group:** `data`
- **Executor file:** `src/lib/engine/executors/microsoft-excel.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
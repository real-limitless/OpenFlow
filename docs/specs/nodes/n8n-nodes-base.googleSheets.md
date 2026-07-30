---
type: n8n-nodes-base.googleSheets
displayName: Google Sheets
category: Data & Storage
versions: [1, 2, 3, 4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7]
priority: medium
status: specced
---

# Google Sheets

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/document-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/sheet-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/service-account.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleSheets`
- **Aliases:** `CSV`, `Sheet`, `Spreadsheet`, `GS`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `googleSheetsOAuth2Api` (OAuth2 — recommended) — scopes: `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive.metadata`
  - `googleApi` (Service Account) — region-selectable
- **Usable as tool:** true

## Parameters

### Common (all operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `authentication` | options | `oAuth2` | no | — | `serviceAccount` \| `oAuth2` |
| `resource` | options | `sheet` | yes | — | `spreadsheet` \| `sheet` |

---

### Resource: `spreadsheet` (Document)

#### Operation: `create` — Create a spreadsheet

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `create` | yes | `resource:spreadsheet` | — |
| `title` | string | `""` | yes | `resource:spreadsheet, operation:create` | Spreadsheet title |
| `sheetsUi` | fixedCollection | `{}` | no | `resource:spreadsheet, operation:create` | Array of sheets to create; each has `title` (string) and `hidden` (boolean, default false) |
| `options.locale` | string | `""` | no | `resource:spreadsheet, operation:create` | Locale formats: `en` (639-1), `fil` (639-2), `en_US` (language_country) |
| `options.autoRecalc` | options | `""` | no | `resource:spreadsheet, operation:create` | Recalculation interval: `ON_CHANGE`, `MINUTE`, `HOUR` |

**Output:** Single item with created spreadsheet metadata (spreadsheetId, URL, sheets array).

---

#### Operation: `deleteSpreadsheet` — Delete a spreadsheet

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `deleteSpreadsheet` | yes | `resource:spreadsheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:spreadsheet, operation:deleteSpreadsheet` | Modes: `list` (searchable), `url` (extracts ID), `id` (raw ID) |

**Output:** Single item with `{ success: true }` on success.

---

### Resource: `sheet` (Sheet Within Document)

#### Operation: `append` — Append Row

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `append` | yes | `resource:sheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:sheet` | Modes: `list`, `url`, `id` |
| `sheetName` | resourceLocator | — | yes | `resource:sheet, operation:append` | Modes: `list`, `url` (extracts gid), `id` (sheetId), `name` |
| `dataMode` | options | `defineBelow` | no | `resource:sheet, operation:append, @version:3` | `autoMapInputData` \| `defineBelow` \| `nothing` — v3 only |
| `fieldsUi` | fixedCollection | `{}` | no | `resource:sheet, operation:append, dataMode:defineBelow, @version:3` | Manual column mapping (v3) — each item: `fieldId` (column name/ID), `fieldValue` (string) |
| `columns` | resourceMapper | `defineBelow` | yes | `resource:sheet, operation:append, @version>=4` | Column mapper (v4+) — modes: `defineBelow`, `autoMapInputData` |
| `options.cellFormat` | options | `USER_ENTERED` | no | `resource:sheet, operation:append` | `USER_ENTERED` (Google formats) \| `RAW` (n8n formats) |
| `options.locationDefine.values.headerRow` | number | `1` | no | `resource:sheet, operation:append` | Header row index (1-based) |
| `options.handlingExtraData` | options | `insertInNewColumn` | no | `resource:sheet, operation:append` | For auto-map: `insertInNewColumn` \| `ignoreIt` \| `error` |
| `options.useAppend` | boolean | `false` | no | `resource:sheet, operation:append` | Use Sheets API `append` endpoint (more efficient, requires uniform sheet) |

**Input:** Items with data to append (one item = one row).
**Output:** Single item with appended row data (row number of cells, row number, updated range).

---

#### Operation: `appendOrUpdate` — Append or Update Row (upsert)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `appendOrUpdate` | yes | `resource:sheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:sheet` | Modes: `list`, `url`, `id` |
| `sheetName` | resourceLocator | — | yes | `resource:sheet, operation:appendOrUpdate` | Modes: `list`, `url`, `id`, `name` |
| `columns` | resourceMapper | `defineBelow` | yes | `resource:sheet, operation:appendOrUpdate, @version 4.0–4.6` | Column mapper — mode: `upsert` |
| `options.cellFormat` | options | `USER_ENTERED` | no | `resource:sheet, operation:appendOrUpdate` | `USER_ENTERED` \| `RAW` |
| `options.locationDefine.values.headerRow` | number | `1` | no | `resource:sheet, operation:appendOrUpdate` | Header row index (1-based) |
| `options.locationDefine.values.firstDataRow` | number | `2` | no | `resource:sheet, operation:appendOrUpdate` | First data row index (1-based) |
| `options.handlingExtraData` | options | `insertInNewColumn` | no | `resource:sheet, operation:appendOrUpdate` | `insertInNewColumn` \| `ignoreIt` \| `error` |
| `options.useAppend` | boolean | `false` | no | `resource:sheet, operation:appendOrUpdate` | Use append endpoint |

**Input:** Items to upsert (matched by key column(s)).
**Output:** Items with updated/appended row data ( row number, updated range).

---

#### Operation: `clear` — Clear a sheet

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `clear` | yes | `resource:sheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:sheet` | Modes: `list`, `url`, `id` |
| `sheetName` | resourceLocator | — | yes | `resource:sheet, operation:clear` | Modes: `list`, `url`, `id`, `name` |
| `clear` | options | `wholeSheet` | yes | `resource:sheet, operation:clear` | `wholeSheet` \| `specificRows` \| `specificColumns` \| `specificRange` |
| `keepFirstRow` | boolean | `false` | no | `resource:sheet, operation:clear, clear:wholeSheet` | Preserve header row when clearing whole sheet |
| `startIndex` | number | `1` | no | `resource:sheet, operation:clear, clear:specificRows` | Start row (1-based) |
| `rowsToDelete` | number | `1` | no | `resource:sheet, operation:clear, clear:specificRows` | Number of rows to clear |
| `startIndex` | string | `A` | no | `resource:sheet, operation:clear, clear:specificColumns` | Start column letter |
| `columnsToDelete` | number | `1` | no | `resource:sheet, operation:clear, clear:specificColumns` | Number of columns to clear |
| `range` | string | `A:F` | yes | `resource:sheet, operation:clear, clear:specificRange` | A1 notation (e.g. `A:F` or `Sheet1!A1:C10`) |

**Output:** Single item with `{ success: true, clearedRange: string }`.

---

#### Operation: `create` — Create a new sheet

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `create` | yes | `resource:sheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:sheet, operation:create` | Modes: `list`, `url`, `id` |
| `title` | string | `n8n-sheet` | yes | `resource:sheet, operation:create` | New sheet title |
| `options.hidden` | boolean | `false` | no | `resource:sheet, operation:create` | Hidden in UI |
| `options.rightToLeft` | boolean | `false` | no | `resource:sheet, operation:create` | RTL sheet |
| `options.sheetId` | number | `0` | no | `resource:sheet, operation:create` | Explicit sheetId (non-negative, immutable) |
| `options.index` | number | `0` | no | `resource:sheet, operation:create` | Insert index (0 = first) |
| `options.tabColor` | color | `#0aa55c` | no | `resource:sheet, operation:create` | Tab color hex |

**Output:** Single item with created sheet metadata (sheetId, title, index, gridProperties).

---

#### Operation: `remove` — Delete a sheet

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `remove` | yes | `resource:sheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:sheet` | Modes: `list`, `url`, `id` |
| `sheetName` | resourceLocator | — | yes | `resource:sheet, operation:remove` | Modes: `list`, `url`, `id`, `name` |

**Output:** Single item with `{ success: true }`.

---

#### Operation: `delete` — Delete Rows or Columns

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `delete` | yes | `resource:sheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:sheet` | Modes: `list`, `url`, `id` |
| `sheetName` | resourceLocator | — | yes | `resource:sheet, operation:delete` | Modes: `list`, `url`, `id`, `name` |
| `toDelete` | options | `rows` | yes | `resource:sheet, operation:delete` | `rows` \| `columns` |
| `startIndex` | number | `2` | no | `resource:sheet, operation:delete, toDelete:rows` | Start row (1-based, first data row = 2) |
| `numberToDelete` | number | `1` | no | `resource:sheet, operation:delete, toDelete:rows` | Row count |
| `startIndex` | string | `A` | no | `resource:sheet, operation:delete, toDelete:columns` | Start column letter |
| `numberToDelete` | number | `1` | no | `resource:sheet, operation:delete, toDelete:columns` | Column count |

**Output:** Single item with `{ success: true, deletedRange: string }`.

---

#### Operation: `read` — Get Row(s)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `read` | yes | `resource:sheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:sheet` | Modes: `list`, `url`, `id` |
| `sheetName` | resourceLocator | — | yes | `resource:sheet, operation:read` | Modes: `list`, `url`, `id`, `name` |
| `filtersUI` | fixedCollection | `{}` | no | `resource:sheet, operation:read` | Filters: each has `lookupColumn` (column name/ID), `lookupValue` (string) |
| `combineFilters` | options | `AND` (≥4.3) / `OR` (<4.3) | no | `resource:sheet, operation:read` | `AND` \| `OR` — how to combine multiple filters |
| `options.dataLocationOnSheet.values.rangeDefinition` | options | `detectAutomatically` | no | `resource:sheet, operation:read` | `detectAutomatically` \| `specifyRange` \| `specifyRangeA1` |
| `options.dataLocationOnSheet.values.readRowsUntil` | options | `lastRowInSheet` | no | `rangeDefinition:detectAutomatically` | `firstEmptyRow` \| `lastRowInSheet` |
| `options.dataLocationOnSheet.values.headerRow` | number | `1` | no | `rangeDefinition:specifyRange` | Header row index (1-based relative to range) |
| `options.dataLocationOnSheet.values.firstDataRow` | number | `2` | no | `rangeDefinition:specifyRange` | First data row index (1-based relative to range) |
| `options.dataLocationOnSheet.values.range` | string | `""` | no | `rangeDefinition:specifyRangeA1` | A1 notation (e.g. `C4:E7`, `MySheet!A:Z`) |
| `options.outputFormatting.values.general` | options | `UNFORMATTED_VALUE` | no | `resource:sheet, operation:read` | `UNFORMATTED_VALUE` (numbers) \| `FORMATTED_VALUE` (display strings) \| `FORMULA` (raw formulas) |
| `options.outputFormatting.values.date` | options | `FORMATTED_STRING` | no | `resource:sheet, operation:read` | `FORMATTED_STRING` (locale) \| `SERIAL_NUMBER` (days since 1899-12-30) |
| `options.whenFilterHasMultipleMatches` | options | `first` | no | `resource:sheet, operation:read` | `first` \| `all` — return first match or all matches |

**Input:** None (read-only).
**Output:** Array of items — each item is a row object with column names as keys. First row (header) is not returned by default; use `dataLocationOnSheet` to include it.

---

#### Operation: `update` — Update Row

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `update` | yes | `resource:sheet` | — |
| `documentId` | resourceLocator | — | yes | `resource:sheet` | Modes: `list`, `url`, `id` |
| `sheetName` | resourceLocator | — | yes | `resource:sheet, operation:update` | Modes: `list`, `url`, `id`, `name` |
| `dataMode` | options | `defineBelow` | no | `resource:sheet, operation:update, @version:3` | `autoMapInputData` \| `defineBelow` \| `nothing` — v3 only |
| `fieldsUi` | fixedCollection | `{}` | no | `resource:sheet, operation:update, dataMode:defineBelow, @version:3` | Manual column mapping (v3) — each: `fieldId`, `fieldValue` |
| `columns` | resourceMapper | `defineBelow` | yes | `resource:sheet, operation:update, @version>=4` | Column mapper (v4+) |
| `options.cellFormat` | options | `USER_ENTERED` | no | `resource:sheet, operation:update` | `USER_ENTERED` \| `RAW` |
| `options.locationDefine.values.headerRow` | number | `1` | no | `resource:sheet, operation:update` | Header row index (1-based) |
| `options.locationDefine.values.firstDataRow` | number | `2` | no | `resource:sheet, operation:update` | First data row index (1-based) |

**Input:** Items with data to update (one item = one row update, matched by key column(s)).
**Output:** Items with updated row data (row number, updated range).

---

## Runtime behavior

### Input

- **All operations** consume items from the `main` input channel (one item per row to write/update/upsert).
- **Read (`read`)** consumes no input items; it pulls from the sheet and emits output items.
- **Delete spreadsheet / Delete sheet / Clear / Delete rows/columns** consume no input items; they execute once per node execution.

### Output

- **Create spreadsheet:** Emits one item with `spreadsheetId`, `spreadsheetUrl`, `sheets[]`.
- **Delete spreadsheet:** Emits one item `{ success: true }`.
- **Append row:** Emits one item per input item with `row`, `updatedRange`, `updatedRows`.
- **Append or Update Row:** Emits one item per input item with `row`, `updatedRange`, `updatedRows`, `operation` (`appended` or `updated`).
- **Clear:** Emits one item `{ success: true, clearedRange }`.
- **Create sheet:** Emits one item with `sheetId`, `title`, `index`, `gridProperties`.
- **Delete sheet:** Emits one item `{ success: true }`.
- **Delete rows/columns:** Emits one item `{ success: true, deletedRange }`.
- **Get rows:** Emits N items (one per row), each item's `json` contains column-name-keyed values.
- **Update row:** Emits one item per input item with `row`, `updatedRange`, `updatedRows`.

### Errors

- Authentication failures (invalid/expired credentials) → throw.
- Spreadsheet/sheet not found → throw.
- Invalid range / A1 notation → throw.
- API rate limits (429) → throw (retry handled by n8n core).
- `continueOnFail`: supported per n8n core — on failure, emits `[{ json: { error: <message> } }]` on the failed branch.

### Expressions

All string/number parameters accept expressions (`{{ $json.field }}`, `{{ $parameter.name }}`, etc.). Resource locator modes `url` and `id` support extraction via regex from expressions.

### Version differences

| Version range | Notable changes |
|---------------|-----------------|
| 1–2 | Legacy auth order (Service Account default v1, OAuth2 default v2); `resource: spreadsheet`/`sheet`; basic operations only. |
| 3 | Introduced `dataMode` (`autoMapInputData`, `defineBelow`, `nothing`) and `fieldsUi` for append/update. |
| 4.0–4.6 | Replaced `fieldsUi` with `columns` resourceMapper; added `appendOrUpdate` with `upsert` mode; `combineFilters` default changed from `OR` to `AND` at 4.3. |
| 4.7 (current) | Current default; refined resourceMapper options; improved hints & UI. |

---

## Acceptance tests

### Test: Create spreadsheet

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "spreadsheet",
  "operation": "create",
  "title": "Test Sheet",
  "sheetsUi": { "sheetValues": [{ "title": "Sheet1" }, { "title": "Sheet2", "hidden": true }] },
  "options": { "locale": "en_US", "autoRecalc": "ON_CHANGE" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "spreadsheetId": "{{$string}}",
    "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/{{$string}}/edit",
    "sheets": [
      { "properties": { "sheetId": 0, "title": "Sheet1", "index": 0, "gridProperties": { "rowCount": 1000, "columnCount": 26 } } },
      { "properties": { "sheetId": 1, "title": "Sheet2", "index": 1, "hidden": true, "gridProperties": { "rowCount": 1000, "columnCount": 26 } } }
    ]
  }
}]
```

---

### Test: Append row (v4+)

**Given** input items:
```json
[{ "json": { "Name": "Alice", "Age": 30, "Email": "alice@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "append",
  "documentId": { "mode": "id", "value": "test-spreadsheet-id" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "columns": { "mappingMode": "defineBelow", "value": [{ "fieldId": "Name", "fieldValue": "={{$json.Name}}" }, { "fieldId": "Age", "fieldValue": "={{$json.Age}}" }, { "fieldId": "Email", "fieldValue": "={{$json.Email}}" }] },
  "options": { "cellFormat": "USER_ENTERED", "locationDefine": { "values": { "headerRow": 1 } } }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "row": 2,
    "updatedRange": "Sheet1!A2:C2",
    "updatedRows": 1
  }
}]
```

---

### Test: Append or Update Row (upsert)

**Given** input items:
```json
[{ "json": { "ID": "123", "Name": "Bob", "Status": "Active" } }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "appendOrUpdate",
  "documentId": { "mode": "id", "value": "test-spreadsheet-id" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "columns": { "mappingMode": "defineBelow", "value": [{ "fieldId": "ID", "fieldValue": "={{$json.ID}}" }, { "fieldId": "Name", "fieldValue": "={{$json.Name}}" }, { "fieldId": "Status", "fieldValue": "={{$json.Status}}" }] },
  "options": { "cellFormat": "USER_ENTERED", "locationDefine": { "values": { "headerRow": 1, "firstDataRow": 2 } }, "useAppend": false }
}
```

**Expect** output[0] (when ID "123" exists in column A):
```json
[{
  "json": {
    "row": 5,
    "updatedRange": "Sheet1!A5:C5",
    "updatedRows": 1,
    "operation": "updated"
  }
}]
```

**Expect** output[0] (when ID "123" does not exist):
```json
[{
  "json": {
    "row": 10,
    "updatedRange": "Sheet1!A10:C10",
    "updatedRows": 1,
    "operation": "appended"
  }
}]
```

---

### Test: Get rows with filters

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "read",
  "documentId": { "mode": "id", "value": "test-spreadsheet-id" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "filtersUI": { "values": [{ "lookupColumn": "Status", "lookupValue": "Active" }] },
  "combineFilters": "AND",
  "options": {
    "dataLocationOnSheet": { "values": { "rangeDefinition": "detectAutomatically", "readRowsUntil": "lastRowInSheet" } },
    "outputFormatting": { "values": { "general": "UNFORMATTED_VALUE", "date": "FORMATTED_STRING" } },
    "whenFilterHasMultipleMatches": "all"
  }
}
```

**Expect** output[0]:
```json
[
  { "json": { "ID": "123", "Name": "Alice", "Status": "Active", "Email": "alice@example.com" } },
  { "json": { "ID": "456", "Name": "Bob", "Status": "Active", "Email": "bob@example.com" } }
]
```

---

### Test: Clear whole sheet (keep header)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "clear",
  "documentId": { "mode": "id", "value": "test-spreadsheet-id" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "clear": "wholeSheet",
  "keepFirstRow": true
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true, "clearedRange": "Sheet1!A2:Z1000" } }]
```

---

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| All operations, parameters, enums, defaults | documented | From n8n docs + extracted node descriptor |
| Credential scopes & types | documented | OAuth2 (3 scopes) + Service Account (region) |
| Output item shapes | inferred | Based on Google Sheets API responses described in docs; exact field names may vary |
| `continueOnFail` error shape | inferred | Standard n8n core behavior |
| Exact `updatedRange` format for append vs appendOrUpdate | inferred | Docs show examples but not exhaustive |
| Version-specific parameter availability (v1–v4.7) | partially documented | Descriptor shows displayOptions by version; some gaps |
| Resource mapper internals (`getMappingColumns`, `getSheetHeaderRowAndSkipEmpty`) | not documented | Internal loadOptions methods — behavior inferred from docs |

---

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleSheets.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `googleSheetsOAuth2Api`, `googleApi` (implement as OpenFlow credential adapters)
- **Node type string:** `n8n-nodes-base.googleSheets`
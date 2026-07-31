---
type: n8n-nodes-base.googleSheets
displayName: Google Sheets
category: Data & Storage
versions: [3, 4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7]
priority: high
status: implemented
---

# Google Sheets

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/document-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/sheet-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/service-account.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.googleSheets`
- **Aliases:** `CSV`, `Sheet`, `Spreadsheet`, `GS`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleApi` (Service Account) | `googleSheetsOAuth2Api` (OAuth2)

## Parameters

### Authentication

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `oAuth2` | yes | — | Options: `serviceAccount`, `oAuth2` |

### Resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `sheet` | yes | — | Options: `spreadsheet`, `sheet` |

### Resource: Spreadsheet

#### Operation: Create

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | `resource=spreadsheet` | Only `create` |
| title | string | `''` | yes | `resource=spreadsheet, operation=create` | Spreadsheet title |
| sheetsUi | fixedCollection | `{}` | no | `resource=spreadsheet, operation=create` | Array of sheets with `title`, `hidden` |
| options.locale | string | `''` | no | `resource=spreadsheet, operation=create` | Locale: `en`, `fil`, `en_US` |
| options.autoRecalc | options | `''` | no | `resource=spreadsheet, operation=create` | Options: `ON_CHANGE`, `MINUTE`, `HOUR` |

#### Operation: Delete

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `deleteSpreadsheet` | yes | `resource=spreadsheet` | Only `deleteSpreadsheet` |
| documentId | resourceLocator | `{ mode: 'list', value: '' }` | yes | `resource=spreadsheet, operation=deleteSpreadsheet` | Spreadsheet ID/URL |

### Resource: Sheet Within Document

#### Common parameters (all sheet operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| documentId | resourceLocator | `{ mode: 'list', value: '' }` | yes | `resource=sheet` | Spreadsheet ID/URL |
| sheetName | resourceLocator | `{ mode: 'list', value: '' }` | yes | `resource=sheet, operation=append|appendOrUpdate|clear|delete|read|remove|update` | Sheet name/ID/URL |

#### Operation: Read

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `read` | yes | `resource=sheet` | Read rows |
| combineFilters | options | `AND` | no | `operation=read` | How to combine filters: `AND`, `OR` |
| filtersUI | fixedCollection | `{}` | no | `operation=read` | Column/value filters |
| options | collection | `{}` | no | `operation=read` | Read options |
| options.dataLocationOnSheet | fixedCollection | `{ values: { rangeDefinition: 'detectAutomatically' } }` | no | `operation=read` | Range detection: `detectAutomatically`, `specifyRangeA1`, `specifyRange` |
| options.outputFormatting | fixedCollection | `{ values: { general: 'UNFORMATTED_VALUE', date: 'FORMATTED_STRING' } }` | no | `operation=read` | General: `UNFORMATTED_VALUE`, `FORMATTED_VALUE`, `FORMULA`; Date: `FORMATTED_STRING`, `SERIAL_NUMBER` |
| options.returnFirstMatch | boolean | `false` | no | `operation=read, @version>=4.5` | Return first matching row only |
| options.returnAllMatches | options | `returnFirstMatch` | no | `operation=read, @version<4.5` | Options: `returnFirstMatch`, `returnAllMatches` |

#### Operation: Append

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `append` | yes | `resource=sheet` | Append row |
| columns | resourceMapper | `{ mappingMode: 'defineBelow', value: null }` | yes | `operation=append, @version>=4` | Column mapping (autoMapInputData / defineBelow) |
| dataMode | options | `defineBelow` | yes | `operation=append, @version=3` | `autoMapInputData`, `defineBelow`, `nothing` |
| fieldsUi | fixedCollection | `{}` | no | `operation=append, dataMode=defineBelow, @version=3` | Manual field mapping |
| options | collection | `{}` | no | `operation=append` | Append options |
| options.cellFormat | options | `USER_ENTERED` | no | `operation=append` | `USER_ENTERED`, `RAW` |
| options.locationDefine | fixedCollection | `{}` | no | `operation=append` | Header row, first data row |
| options.handlingExtraData | options | `insertInNewColumn` | no | `operation=append, dataMode=autoMapInputData` | `insertInNewColumn`, `ignoreIt`, `error` |
| options.useAppend | boolean | `false` | no | `operation=append` | Use append API (minimize calls) |

#### Operation: Append or Update (Upsert)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `appendOrUpdate` | yes | `resource=sheet` | Upsert row |
| columns | resourceMapper | `{ mappingMode: 'defineBelow', value: null }` | yes | `operation=appendOrUpdate, @version>=4` | Column mapping with matching columns |
| dataMode | options | `defineBelow` | yes | `operation=appendOrUpdate, @version=3` | `autoMapInputData`, `defineBelow`, `nothing` |
| columnToMatchOn | options | `''` | yes | `operation=appendOrUpdate, @version=3` | Column to match on |
| valueToMatchOn | string | `''` | yes | `operation=appendOrUpdate, dataMode=defineBelow, @version=3` | Value to match |
| fieldsUi | fixedCollection | `{}` | no | `operation=appendOrUpdate, dataMode=defineBelow, @version=3` | Manual field mapping |
| options | collection | `{}` | no | `operation=appendOrUpdate` | Upsert options |
| options.cellFormat | options | `USER_ENTERED` | no | `operation=appendOrUpdate` | `USER_ENTERED`, `RAW` |
| options.locationDefine | fixedCollection | `{}` | no | `operation=appendOrUpdate` | Header row, first data row |
| options.handlingExtraData | options | `insertInNewColumn` | no | `operation=appendOrUpdate, dataMode=autoMapInputData` | `insertInNewColumn`, `ignoreIt`, `error` |
| options.useAppend | boolean | `false` | no | `operation=appendOrUpdate` | Use append API for new rows |

#### Operation: Update

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `update` | yes | `resource=sheet` | Update existing row |
| columns | resourceMapper | `{ mappingMode: 'defineBelow', value: null }` | yes | `operation=update, @version>=4` | Column mapping with matching columns |
| dataMode | options | `defineBelow` | yes | `operation=update, @version=3` | `autoMapInputData`, `defineBelow`, `nothing` |
| columnToMatchOn | options | `''` | yes | `operation=update, @version=3` | Column to match on |
| valueToMatchOn | string | `''` | yes | `operation=update, dataMode=defineBelow, @version=3` | Value to match |
| fieldsUi | fixedCollection | `{}` | no | `operation=update, dataMode=defineBelow, @version=3` | Manual field mapping |
| options | collection | `{}` | no | `operation=update` | Update options |
| options.cellFormat | options | `USER_ENTERED` | no | `operation=update` | `USER_ENTERED`, `RAW` |
| options.locationDefine | fixedCollection | `{}` | no | `operation=update` | Header row, first data row |
| options.handlingExtraData | options | `insertInNewColumn` | no | `operation=update, dataMode=autoMapInputData` | `insertInNewColumn`, `ignoreIt`, `error` |

#### Operation: Clear

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `clear` | yes | `resource=sheet` | Clear data |
| clear | options | `wholeSheet` | yes | `operation=clear` | `wholeSheet`, `specificRows`, `specificColumns`, `specificRange` |
| keepFirstRow | boolean | `false` | no | `operation=clear, clear=wholeSheet` | Keep header row |
| startIndex | number | `1` | yes* | `operation=clear, clear=specificRows` | 1-based first row to clear |
| rowsToDelete | number | `1` | yes* | `operation=clear, clear=specificRows` | Row count |
| startIndex | string | `A` | yes* | `operation=clear, clear=specificColumns` | Column letter start |
| columnsToDelete | number | `1` | yes* | `operation=clear, clear=specificColumns` | Column count |
| range | string | `A:F` | yes* | `operation=clear, clear=specificRange` | A1 notation range |

#### Operation: Create (Sheet)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | `resource=sheet` | Create sheet |
| title | string | `n8n-sheet` | yes | `operation=create` | Sheet title |
| options | collection | `{}` | no | `operation=create` | Sheet options |
| options.hidden | boolean | `false` | no | `operation=create` | Hidden in UI |
| options.rightToLeft | boolean | `false` | no | `operation=create` | RTL layout |
| options.sheetId | number | `0` | no | `operation=create` | Explicit sheet ID |
| options.index | number | `0` | no | `operation=create` | Sheet index |
| options.tabColor | color | `0aa55c` | no | `operation=create` | Tab color hex |

#### Operation: Delete (Rows/Columns)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `delete` | yes | `resource=sheet` | Delete rows/columns |
| toDelete | options | `rows` | yes | `operation=delete` | `rows` or `columns` |
| startIndex | number | `2` | yes* | `operation=delete, toDelete=rows` | 1-based row start (first data row is 2) |
| numberToDelete | number | `1` | yes* | `operation=delete, toDelete=rows` | Row count |
| startIndex | string | `A` | yes* | `operation=delete, toDelete=columns` | Column letter start |
| numberToDelete | number | `1` | yes* | `operation=delete, toDelete=columns` | Column count |

#### Operation: Remove (Entire Sheet)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `remove` | yes | `resource=sheet` | Delete entire sheet |
| id | string | `''` | yes | `operation=remove` | Sheet ID to delete |

### Credentials

- **googleApi** (Service Account) — requires Google Cloud service account with Sheets API + Drive API enabled
- **googleSheetsOAuth2Api** (OAuth2) — OAuth2 with scopes `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive`

## Runtime behavior

### Input

- **Main input:** Array of items, each with `json` payload.
- For write operations (`append`, `update`, `appendOrUpdate`, `create` sheet), each input item provides row data.
- For `read`, input items can provide filter values via expressions.
- Document and Sheet parameter values that use expressions are evaluated once against the first input item.

### Output

- **Main output:** Array of items per input item.
- **Read:** Returns rows as items with `json` containing column-keyed objects. The first row of the sheet is treated as a heading row and excluded from output unless explicit range is set.
- **Append/Update/Upsert:** Returns updated/appended row data (e.g., `updatedRange`, `updatedRows`, `updatedColumns`, `updatedCells`).
- **Create (spreadsheet):** Returns created resource metadata (`spreadsheetId`, `spreadsheetUrl`, `sheets`).
- **Create (sheet):** Returns created sheet metadata (`sheetId`, `title`, `index`).
- **Clear/Delete/Remove:** Returns success status or passes through input items.
- **Errors:** Throws on API errors unless `continueOnFail=true`.

### Errors

- Throws on API errors (auth, not found, quota, invalid range) unless `continueOnFail=true`.
- Read with no matches: throws unless `options.continue=true` (V1) or returns empty array (V2).
- Read with filter returning multiple matches: returns first unless `options.returnAllMatches=returnAllMatches` or `options.returnFirstMatch=false` (V2).
- Append/Update/AppendOrUpdate with `handlingExtraData=error`: throws on fields that don't match columns.

### Expressions

All string/number parameters support n8n expressions (`{{ $json.field }}`). Notable expression-enabled fields: `documentId`, `sheetName`, `title`, `lookupValue`, `range`, `options.*`. Expressions for `documentId` and `sheetName` are evaluated once for all items.

## Acceptance tests

### Test: Spreadsheet Create

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "spreadsheet",
  "operation": "create",
  "title": "Test Sheet {{ $now.format('YYYY-MM-DD') }}",
  "sheetsUi": { "sheetValues": [{ "title": "Sheet1" }] },
  "options": { "locale": "en_US", "autoRecalc": "ON_CHANGE" }
}
```

**Expect** output[0]:
```json
[{ "json": { "spreadsheetId": "string", "spreadsheetUrl": "string", "sheets": [{ "properties": { "sheetId": "number", "title": "Sheet1" } }] } }]
```

---

### Test: Sheet Read (basic)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "read",
  "documentId": { "mode": "id", "value": "1ABC123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "options": { "dataLocationOnSheet": { "values": { "rangeDefinition": "detectAutomatically" } }, "outputFormatting": { "values": { "general": "UNFORMATTED_VALUE", "date": "FORMATTED_STRING" } } }
}
```

**Expect** output[0]:
```json
[{ "json": { "colA": "val1", "colB": "val2", "colC": 123, "colD": "text" } }]
```

---

### Test: Sheet Append (Auto-Map)

**Given** input items:
```json
[{ "json": { "name": "Alice", "email": "alice@example.com", "age": 30 } }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "append",
  "documentId": { "mode": "id", "value": "1ABC123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "columns": { "mappingMode": "autoMapInputData" },
  "options": { "cellFormat": "USER_ENTERED" }
}
```

**Expect** output[0]:
```json
[{ "json": { "updatedRange": "Sheet1!A2:C2", "updatedRows": 1, "updatedColumns": 3, "updatedCells": 3 } }]
```

---

### Test: Sheet Update (Key Match)

**Given** input items:
```json
[{ "json": { "id": "row-1", "name": "Alice Updated", "email": "alice@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "update",
  "documentId": { "mode": "id", "value": "1ABC123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "columns": { "mappingMode": "defineBelow", "value": [ { "matchingColumns": ["id"] } ] },
  "options": { "cellFormat": "USER_ENTERED", "locationDefine": { "values": { "headerRow": 1, "firstDataRow": 2 } } }
}
```

**Expect** output[0]:
```json
[{ "json": { "updatedRange": "Sheet1!A2:C2", "updatedRows": 1, "updatedColumns": 3, "updatedCells": 3 } }]
```

---

### Test: Sheet Append or Update (Upsert)

**Given** input items:
```json
[{ "json": { "id": "row-2", "name": "Bob", "email": "bob@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "appendOrUpdate",
  "documentId": { "mode": "id", "value": "1ABC123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "columns": { "mappingMode": "defineBelow", "value": [ { "matchingColumns": ["id"] } ] },
  "options": { "cellFormat": "USER_ENTERED", "locationDefine": { "values": { "headerRow": 1, "firstDataRow": 2 } } }
}
```

**Expect** output[0]:
```json
[{ "json": { "updatedRange": "Sheet1!A3:C3", "updatedRows": 1, "updatedColumns": 3, "updatedCells": 3 } }]
```

---

### Test: Sheet Read (Filtered)

**Given** input items:
```json
[{ "json": { "searchEmail": "alice@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "read",
  "documentId": { "mode": "id", "value": "1ABC123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "filtersUI": { "values": [{ "lookupColumn": "email", "lookupValue": "={{ $json.searchEmail }}" }] },
  "combineFilters": "AND",
  "options": { "returnFirstMatch": true, "outputFormatting": { "values": { "general": "UNFORMATTED_VALUE" } } }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "row-1", "name": "Alice", "email": "alice@example.com" } }]
```

---

### Test: Sheet Clear (Whole Sheet, Keep Header)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "clear",
  "documentId": { "mode": "id", "value": "1ABC123" },
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

### Test: Sheet Create (New Sheet)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "create",
  "documentId": { "mode": "id", "value": "1ABC123" },
  "title": "NewSheet",
  "options": { "hidden": false, "index": 1, "tabColor": "0aa55c" }
}
```

**Expect** output[0]:
```json
[{ "json": { "sheetId": "number", "title": "NewSheet", "index": 1 } }]
```

---

### Test: Sheet Delete Rows

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "delete",
  "documentId": { "mode": "id", "value": "1ABC123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "toDelete": "rows",
  "startIndex": 5,
  "numberToDelete": 2
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true, "deletedRows": 2, "startRow": 5 } }]
```

---

### Test: Sheet Remove (Entire Sheet)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "remove",
  "documentId": { "mode": "id", "value": "1ABC123" },
  "id": "0"
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true, "deletedSheetId": "0" } }]
```

---

### Test: Spreadsheet Delete

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "spreadsheet",
  "operation": "deleteSpreadsheet",
  "documentId": { "mode": "id", "value": "1ABC123" }
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential types & scopes | documented | Public docs + credential JSON |
| Resource/operation enum values | documented | Matches public docs operations |
| Parameter names & defaults | inferred from package JSON (v2.15.1) | Mapped from camelCase node params; v3 vs v4+ differences noted |
| `loadOptionsMethod: 'getSheets'` / `spreadSheetsSearch` | inferred | Dynamic sheet/spreadsheet list via API |
| `delete` vs `remove` semantics | documented | `delete` = rows/cols; `remove` = entire sheet |
| Clear param name `clear` vs V1 `range` only | inferred from descriptor | V2 introduces structured clear type selector |
| OAuth2 scopes | documented | Sheets + Drive scopes required |
| Version-dependent parameter shapes | inferred from package | `dataMode`/`columns` mappingMode, `columnToMatchOn`/`columns.matchingColumns` differ by version |
| Read output shape | inferred | Column keys come from header row; exact output shape depends on sheet data |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleSheets.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

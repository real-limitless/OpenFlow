---
type: n8n-nodes-base.googleSheetsTool
displayName: Google Sheets
category: AI Tool
versions: [1, 2, 3, 4, 4.2]
priority: high
status: specced
---

# Google Sheets (AI Tool)

A tool variant of the Google Sheets node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Document and Sheet Within Document resources against the Google Sheets API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/sheet-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/document-operations.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only |
| https://developers.google.com/sheets/api | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleSheetsTool`
- **Aliases:** `CSV`, `Sheet`, `Spreadsheet`, `GS`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleSheetsOAuth2Api` (OAuth2) or `googleApi` (service account)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | `oAuth2` or `serviceAccount` |

### Resource selection

The user selects a resource (Document or Sheet Within Document) which determines available operations.

### Document operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Title, Sheets (titles array), optional: Locale, Recalculation Interval (On Change / Minute / Hour) |
| Delete | Document (by list / URL / ID) |

### Sheet Within Document operations

| Operation | Key parameters |
|-----------|----------------|
| Append or Update Row | Document (by list/URL/ID), Sheet (by list/URL/ID/Name), Mapping Column Mode (Manually / Automatically / Nothing), optional: Cell Format, Data Location on Sheet, Handling Extra Fields, Use Append |
| Append Row | Document, Sheet, Mapping Column Mode, optional: Cell Format, Data Location on Sheet, Handling Extra Fields, Use Append |
| Clear | Document, Sheet, Clear scope (Whole Sheet / Specific Rows / Specific Columns / Specific Range), optional: Keep First Row |
| Create (new sheet) | Document, Title, optional: Hidden, Right To Left, Sheet ID, Sheet Index, Tab Color |
| Delete (sheet) | Document, Sheet |
| Delete Rows or Columns | Document, Sheet, Start Row Number or Start Column, Number of Rows or Columns to Delete |
| Get Row(s) | Document, Sheet, optional: Filters (Column, Value), Data Location on Sheet, Output Formatting (unformatted/formatted/formulas), Date Formatting, When Filter Has Multiple Matches (Return All Matches) |
| Update Row | Document, Sheet, Mapping Column Mode, optional: Cell Format, Data Location on Sheet |

### Document identification modes

Both Document and Sheet parameters support multiple identification modes:
- **From list**: Dropdown selection of available resources
- **By URL**: Full URL of the spreadsheet/sheet
- **By ID**: The `spreadsheetId` or `sheetId` from the URL
- **By Name** (sheet only): The sheet tab title

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "Automatically" mapping column mode allows the AI agent to infer column mappings from input data
- Tool name and description metadata are configurable in the AI Agent node

## Runtime behavior

### Input

Consumes items from `main` input. For row operations with manual or automatic column mapping, input item fields are used as the row data values.

### Output

**Output[0]** — operation result:
- **Get Row(s)**: Returns rows as an array of JSON objects with column-name keys, plus `row_number`. The first row is treated as a header row and excluded from results by default.
- **Create (Document)**: Returns the created spreadsheet metadata including `spreadsheetId`, `spreadsheetUrl`, and sheet properties.
- **Create (Sheet)**: Returns the updated spreadsheet properties.
- **Append/Update Row**: Returns the updated range metadata (spreadsheet ID, updated range, updated rows/columns/cells).
- **Clear / Delete**: Returns the API response confirming the operation.
- **Delete Rows or Columns**: Returns the API response confirming the update.
- **Delete (Document)**: Returns an empty success response.

### Errors

- API errors (auth failures, rate limits, invalid document/sheet IDs, permission errors) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Deleting a spreadsheet or sheet is permanent and irreversible
- Invalid mapping column references throw configuration errors before API calls

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. All string fields accept standard n8n expressions.

## Acceptance tests

### Test: Get all rows from a sheet

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "getAll",
  "documentId": { "mode": "url", "value": "https://docs.google.com/spreadsheets/d/abc123/edit" },
  "sheetName": { "mode": "name", "value": "Sheet1" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "Name": "Alice",
    "Email": "alice@example.com",
    "row_number": 2
  }
}]
```

### Test: Append a new row

**Given** input items:
```json
[{ "json": { "name": "Bob", "email": "bob@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "append",
  "documentId": { "mode": "id", "value": "abc123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "columnMapping": { "mode": "auto" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "spreadsheetId": "abc123",
    "updatedRange": "Sheet1!A4:B4",
    "updatedRows": 1,
    "updatedCells": 2
  }
}]
```

### Test: Create a new spreadsheet

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "document",
  "operation": "create",
  "title": "My New Sheet",
  "sheets": [{ "title": "Data" }]
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "spreadsheetId": "<new-id>",
    "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/<new-id>/edit",
    "sheets": [{ "sheetId": 0, "title": "Data" }]
  }
}]
```

### Test: Get rows with a column filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "getAll",
  "documentId": { "mode": "id", "value": "abc123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "filters": { "column": "Email", "value": "alice@example.com" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "Name": "Alice",
    "Email": "alice@example.com",
    "row_number": 2
  }
}]
```

### Test: Update an existing row

**Given** input items:
```json
[{ "json": { "rowNumber": 2, "Name": "Alice Smith" } }]
```

**Parameters:**
```json
{
  "resource": "sheet",
  "operation": "update",
  "documentId": { "mode": "id", "value": "abc123" },
  "sheetName": { "mode": "name", "value": "Sheet1" },
  "columnMapping": { "mode": "manual", "values": [{ "column": "Name", "value": "={{ $json.Name }}" }] }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "spreadsheetId": "abc123",
    "updatedRange": "Sheet1!B2:B2",
    "updatedRows": 1,
    "updatedCells": 1
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Google Sheets operations and parameters | documented | Public docs comprehensively describe all operations and parameters |
| Exact output shape for each operation | documented | Public docs describe outcome-level results; exact JSON shape varies by Google Sheets API version |
| $fromAI() dynamic parameter support | documented | Public docs confirm support via the AI tool hint on both operation pages |
| Tool-specific parameter layout (name, description in AI Agent) | inferred | As with gmailTool, the tool node exposes operations identically to the base node when used in agent context |
| Version differences (v1-v4.2) | inferred from corpus | Multiple typeVersions exist; v4.2 is current with all sheet and document operations |
| Alias list | confirmed from corpus | "CSV", "Sheet", "Spreadsheet", "GS" |
| Credential type string | inferred | Uses `googleSheetsOAuth2Api` and `googleApi` credential types consistent with other Google tool nodes |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleSheetsTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
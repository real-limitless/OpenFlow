---
type: n8n-nodes-base.microsoftExcelTool
displayName: Microsoft Excel
category: AI Tool
versions: [2]
priority: medium
status: specced
---

# Microsoft Excel (AI Tool)

A tool variant of the Microsoft Excel (OneDrive) node for use as an AI agent tool. When connected to an AI Agent, the agent model dynamically populates parameters via `$fromAI()` expressions or the "let model fill" toggle. Wraps the Microsoft Graph Excel REST API across 3 resources (Table, Workbook, Worksheet) with the same operations as the non-tool node.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftexcel/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoftentraserviceprincipal.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://learn.microsoft.com/en-us/graph/api/resources/excel | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftExcelTool`
- **Aliases:** (none; base node aliases: `_Excel`, `Excel`, `Sheet`, `CSV`, `Spreadsheet`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials** (via Authentication dropdown):
  - `microsoftExcelOAuth2Api` — Excel-specific OAuth2 (default)
  - `microsoftOAuth2Api` — generic Microsoft Graph OAuth2, reusable across Microsoft nodes; requires `Files.ReadWrite` or `Files.ReadWrite.All` scope
  - `microsoftEntraServicePrincipalApi` — app-only (no signed-in user); requires Mailbox parameter
  - Government cloud tenants set a custom Graph API base URL via the credential

## Parameters

All resources and operations match the full `microsoftExcel` node. See the canonical spec at `docs/specs/nodes/n8n-nodes-base.microsoftExcel.md` for the complete parameter table. Key parameter families:

- **Resource selector:** `resource` ∈ { `table`, `workbook`, `worksheet` }
- **Table operations:** `append` (add rows), `getColumns`, `getRows`, `lookup` (find row by column value), `addTable`, `convertToRange`, `deleteTable` (v2)
- **Workbook operations:** `addWorksheet`, `getAll`, `deleteWorkbook` (v2)
- **Worksheet operations:** `getAll`, `readRows` / get content, `append` (write rows without table), `clear`, `deleteWorksheet`, `update`, `upsert` (v2)
- **Entity reference:** Workbook, worksheet, and table IDs are resolved via Microsoft Graph resource locators
- **Data mapping:** Column names and values mapped from incoming item fields
- **AI tool-specific:** All parameters accept `$fromAI()` expressions for dynamic population by the agent model

## Runtime behavior

### External API

Same Microsoft Graph Excel REST API contracts as the full Excel node:
- `GET /me/drive/items/{id}/workbook/worksheets` — list worksheets
- `GET /me/drive/items/{id}/workbook/worksheets/{id}/tables` — list tables
- `POST /me/drive/items/{id}/workbook/worksheets/{id}/tables/{id}/rows/add` — append table rows
- `GET /me/drive/items/{id}/workbook/worksheets/{id}/tables/{id}/rows` — get table rows
- `GET /me/drive/items/{id}/workbook/worksheets/{id}/range` — get worksheet cell content
- `GET /me/drive/root/children` — list workbooks
- `POST /me/drive/items/{id}/workbook/worksheets/add` — add worksheet
- `PATCH /me/drive/items/{id}/workbook/worksheets/{id}/range` — update cells

### Input

Consumes items from `main` input. Workbook/worksheet/table identifiers, column names, cell values, and ranges may reference item data. For append operations, multiple input items are batched into a single API call.

### Output

- **Read-style (getRows, readRows, lookup, getAll):** one output item per row, with column names as JSON keys. If `rawDataOutput` is enabled, the raw Graph response is included under a `raw` key.
- **Write-style (append, update, upsert, addWorksheet, addTable):** input items pass through, enriched with any API response metadata (e.g., the written range).
- **Delete/clear (deleteTable, deleteWorksheet, clear, deleteWorkbook):** input items pass through unchanged on success.

### Errors

API errors (4xx/5xx, auth failures, resource-not-found) propagate as node errors. `continueOnFail` emits an error item instead of throwing.

### Expressions

Parameters tagged as AI-populatable accept `$fromAI()`. All string fields accept standard n8n `{{ }}` expressions.

## Acceptance tests

### Test: Append rows to table via AI tool

**Given** input items:
```json
[{ "json": { "Name": "Alice", "Age": 30 } }, { "json": { "Name": "Bob", "Age": 25 } }]
```

**Parameters:**
```json
{
  "resource": "table",
  "operation": "append",
  "workbook": "= $fromAI('workbook')",
  "worksheet": "= $fromAI('worksheet')",
  "table": "= $fromAI('table')"
}
```

**Expect** output[0] to contain the same items with a `range` property added. The API call should `POST` `[["Alice",30],["Bob",25]]` as rows. The executor must not throw when `$fromAI()` is present; resolution is handled by the AI agent framework.

### Test: Lookup row by column value

**Given** input items:
```json
[{ "json": { "email": "alice@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "table",
  "operation": "lookup",
  "workbook": "{{ $params.workbookId }}",
  "worksheet": "{{ $params.sheetName }}",
  "table": "{{ $params.tableName }}",
  "columnToMatchOn": "Email",
  "value": "{{ $json.email }}"
}
```

**Expect** output[0] — the matching row with column-name keys and the Email value equal to `alice@example.com`.

### Test: List all workbooks

**Parameters:**
```json
{
  "resource": "workbook",
  "operation": "getAll"
}
```

**Expect** output[0] to contain one item per workbook with `json` keys like `id`, `name`, `webUrl` as returned by the Graph drive items API.

### Test: Read worksheet content

**Parameters:**
```json
{
  "resource": "worksheet",
  "operation": "readRows",
  "workbook": "= $fromAI('workbookId')",
  "worksheet": "= $fromAI('sheetName')",
  "rawDataOutput": false
}
```

**Expect** output[0] to contain one item per row, with column headers as JSON keys. No raw Graph response included.

### Test: Add and delete worksheet (v2 lifecycle)

**Parameters:**
```json
{ "resource": "worksheet", "operation": "deleteWorksheet", "workbook": "{{ $params.workbookId }}", "worksheet": "{{ $params.sheetName }}" }
```

**Expect** output[0] — the input item passes through unchanged on successful deletion (`204 No Content`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource + operation list | documented | Same 3 resources / operations as the full Excel node (8 in v1, 15 in v2) |
| Credential choices | documented | Three credential modes per public docs |
| Tool-mode parameter population | documented | `$fromAI()` support documented in public n8n AI docs |
| Exact `$fromAI()` parameter coverage per operation | inferred | Public docs describe the feature generally; not enumerated per field |
| Output shapes | inferred | Same outcomes as canonical Excel spec — row-based read, pass-through write/delete |
| Microsoft Graph Excel endpoint patterns | documented | Public Microsoft Graph Excel REST API docs confirm endpoints |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.microsoftExcelTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `microsoftExcelOAuth2Api`, `microsoftOAuth2Api`, `microsoftEntraServicePrincipalApi`
- **Canonical reference:** `docs/specs/nodes/n8n-nodes-base.microsoftExcel.md`

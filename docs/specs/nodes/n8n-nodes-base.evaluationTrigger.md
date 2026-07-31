---
type: n8n-nodes-base.evaluationTrigger
displayName: Evaluation Trigger
category: Trigger
versions: [1]
priority: medium
status: specced
---

# Evaluation Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.evaluationtrigger.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/understand-why-to-test.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/run-quick-evaluations.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/use-metrics-to-measure-quality.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/test-and-improve-ai-workflows/fix-common-issues.md | Public docs only |
| n8n-nodes-base npm package descriptor (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.evaluationTrigger`
- **Aliases:** `Test`, `Metrics`, `Evals`, `Set Output`, `Set Metrics`
- **Inputs:** `main` × 0 (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `googleSheetsOAuth2Api` (required when source is `googleSheets`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `source` | `'dataTable' \| 'googleSheets'` | `'dataTable'` | yes | — | Where to read the test dataset |
| `authentication` | `'serviceAccount' \| 'oAuth2'` | `'oAuth2'` | no | hide when `source: dataTable` | Google Sheets auth method |
| `documentId` | resourceLocator (list/url/id) | `{mode:"list",value:""}` | no | hide when `source: dataTable` | Google Sheets spreadsheet |
| `sheetName` | resourceLocator (list/url/id) | `{mode:"list",value:""}` | no | hide when `source: dataTable` | Google Sheets sheet |
| `dataTableId` | resourceLocator (list/id) | `{mode:"list",value:""}` | no | show when `source: dataTable` | Data table reference |
| `limitRows` | boolean | `false` | no | — | Whether to cap the number of rows processed |
| `maxRows` | number | `10` | no | show when `limitRows: true` | Maximum rows to process |
| `filtersUI` | array of `{lookupColumn, lookupValue}` | — | no | hide when `source: dataTable` | Google Sheets column-value filters |
| `filterRows` | boolean | `false` | no | show when `source: dataTable` | Whether to filter data table rows |
| `matchType` | `'anyCondition' \| 'allConditions'` | `'anyCondition'` | no | show when `filterRows: true` | How to combine filter conditions |
| `filters` | array of `{keyName, condition, keyValue}` | — | no | show when `filterRows: true` | Data table filter conditions |

## Runtime behavior

### Activation

The node is a trigger that activates when the "Evaluate all" button is clicked (or via the Evaluations tab "Run Test" button). It does not activate on normal "Execute Workflow" — manual execution outputs a single row based on current parameters.

### Input processing

The node reads from the configured source (data table or Google Sheets) and emits each qualifying row as a separate output item. Each item contains the row's columns as JSON key-value pairs. Filtering and row limits are applied before emission.

### Output

Output `main[0]`: one item per dataset row. Each item carries the column names as keys and cell values as values, plus metadata:

- `json`: the row data keyed by column name
- `binary`: (none)
- `pairedItem`: references the source row index

### Errors

- If the source is misconfigured (missing credential, invalid document, missing sheet), the node throws an error.
- If no rows match the filter, the node produces zero output items.
- `continueOnFail` is supported but not commonly used for trigger nodes.

### Evaluation lifecycle

The trigger is part of a three-node evaluation pattern:

1. Evaluation Trigger (this node) — reads dataset rows
2. AI workflow under test — processes each row
3. Evaluation node (set outputs / set metrics) — writes results back

The workflow engine runs the entire subgraph once per row, sequentially or with configurable concurrency.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: single row from data table

**Given** a data table with one row `{"input": "Hello", "expected": "Hi"}`.

**Parameters:**
```json
{
  "source": "dataTable",
  "dataTableId": { "mode": "id", "value": "dt-1" },
  "limitRows": false
}
```

**Expect** output[0] to contain one item:
```json
[{
  "json": { "input": "Hello", "expected": "Hi" },
  "pairedItem": { "item": 0 }
}]
```

### Test: Google Sheets with row limit

**Given** a Google Sheet with 50 rows.

**Parameters:**
```json
{
  "source": "googleSheets",
  "authentication": "oAuth2",
  "documentId": { "mode": "url", "value": "https://docs.google.com/spreadsheets/d/abc123" },
  "sheetName": { "mode": "list", "value": "Sheet1" },
  "limitRows": true,
  "maxRows": 5
}
```

**Expect** exactly 5 items in output[0].

### Test: data table with filter

**Given** a data table with rows where `status` = `active` and `status` = `inactive`.

**Parameters:**
```json
{
  "source": "dataTable",
  "dataTableId": { "mode": "id", "value": "dt-1" },
  "filterRows": true,
  "matchType": "allConditions",
  "filters": {
    "conditions": [
      { "keyName": "status", "condition": "eq", "keyValue": "active" }
    ]
  }
}
```

**Expect** only rows where `status` equals `active`.

### Test: zero rows from filter

**Given** a data table with no rows matching the filter condition.

**Parameters:**
```json
{
  "source": "dataTable",
  "dataTableId": { "mode": "id", "value": "dt-1" },
  "filterRows": true,
  "filters": {
    "conditions": [
      { "keyName": "nonexistent", "condition": "eq", "keyValue": "value" }
    ]
  }
}
```

**Expect** output[0] to be an empty array `[]`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Source parameter names and defaults | documented | Public docs + descriptor metadata confirm exact names |
| Condition operators for data table filters | inferred | Public docs describe column/value filtering; full operator list from descriptor |
| Output item shape | inferred | Standard trigger output pattern; no explicit docs for row-as-item contract |
| Evaluation lifecycle and concurrency | documented | Public docs describe sequential/parallel execution and limits |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/evaluation-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
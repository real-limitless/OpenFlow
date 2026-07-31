---
type: n8n-nodes-base.evaluation
displayName: Evaluation
category: Utility
versions: [1]
priority: medium
status: specced
---

# Evaluation

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.evaluation/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.evaluationtrigger.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.evaluation`
- **Aliases:** `Test`, `Metrics`, `Evals`, `Set Output`, `Set Metrics`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 (one output for Set Outputs and Set Metrics; two named outputs for Check If Evaluating: evaluated / not evaluating)
- **Credentials:** None directly; Set Outputs operation can consume a Google Sheets credential for writing to a spreadsheet

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixedCollection |  | yes | always | One of: `setOutputs`, `setMetrics`, `checkIfEvaluating` |
| source | string | `dataTable` | only when operation=setOutputs | operation=setOutputs | `dataTable` or `googleSheets` |
| dataTable | string |  | only when source=dataTable | operation=setOutputs ∧ source=dataTable | Data table name or ID |
| outputs.values | collection |  | only when operation=setOutputs | operation=setOutputs | Array of `{ name, value }` pairs written as columns |
| credential | credential |  | only when source=googleSheets | operation=setOutputs ∧ source=googleSheets | Google Sheets OAuth2 credential |
| documentId | resourceLocator |  | only when source=googleSheets | operation=setOutputs ∧ source=googleSheets | Google Spreadsheet ID (list/URL/ID modes) |
| sheetId | resourceLocator |  | only when source=googleSheets | operation=setOutputs ∧ source=googleSheets | Sheet within spreadsheet (list/URL/ID/name modes) |
| metrics.values | collection |  | only when operation=setMetrics | operation=setMetrics | Array of `{ name, value }` pairs; value must be numeric |

## Runtime behavior

### Input

Each input item is processed independently. The operation determines what happens.

### Output

- **Set Outputs:** Passes each input item through unchanged, writing the defined `outputs` values to the configured data table or Google Sheet as a side effect. Output items mirror the input shape.
- **Set Metrics:** Passes each input item through unchanged, recording the defined `metrics` values to the n8n Evaluations tab as a side effect. Output items mirror the input shape.
- **Check If Evaluating:** Does not modify input items. Produces items on the **evaluated** output index (0) if the current execution is part of an evaluation run, or on the **not evaluating** output index (1) otherwise. This is a pure branching operation with no side effects.

### Errors

- If a Set Outputs operation fails to write (invalid credential, missing sheet, write conflict), the node throws. `continueOnFail` behavior is standard: on failure the item is replaced with `{ json: { error } }` on a single output.
- Set Metrics with a non-numeric value should throw.
- Check If Evaluating never throws from its own logic.

### Expressions

All string/value parameters accept expressions. The `value` fields within `outputs.values` and `metrics.values` are expression-enabled.

## Acceptance tests

### Test: checkIfEvaluating — evaluating path

**Given** input items:

```json
[{ "json": { "testData": "abc" } }]
```

**Parameters:**

```json
{ "operation": "checkIfEvaluating" }
```

**Runtime context:** execution is flagged as an evaluation run.

**Expect** output[0]:

```json
[{ "json": { "testData": "abc" } }]
```

**Expect** output[1] is empty.

### Test: checkIfEvaluating — not evaluating path

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "operation": "checkIfEvaluating" }
```

**Runtime context:** execution is NOT flagged as an evaluation run.

**Expect** output[0] is empty.

**Expect** output[1]:

```json
[{ "json": {} }]
```

### Test: setMetrics pass-through

**Given** input items:

```json
[{ "json": { "id": 1, "response": "hello" } }]
```

**Parameters:**

```json
{
  "operation": "setMetrics",
  "metrics": {
    "values": [
      { "name": "accuracy", "value": 0.95 }
    ]
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "id": 1, "response": "hello" } }]
```

The metric `accuracy` with value `0.95` must be recorded in the execution's evaluation metrics store.

### Test: setOutputs writes to data table

**Given** input items:

```json
[{ "json": { "input": "test", "score": 85 } }]
```

**Parameters:**

```json
{
  "operation": "setOutputs",
  "source": "dataTable",
  "dataTable": "my-eval-table",
  "outputs": {
    "values": [
      { "name": "Score", "value": "={{ $json.score }}" }
    ]
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "input": "test", "score": 85 } }]
```

The row `{ Score: 85 }` must be appended to the data table named `my-eval-table`.

### Test: setOutputs uses Google Sheets

**Parameters:**

```json
{
  "operation": "setOutputs",
  "source": "googleSheets",
  "documentId": { "__rl": true, "mode": "id", "value": "abc123" },
  "sheetId": { "__rl": true, "mode": "name", "value": "Sheet1" },
  "outputs": {
    "values": [
      { "name": "Result", "value": "passed" }
    ]
  }
}
```

**Expect** that the node resolves the Google Sheets credential, locates document `abc123` / sheet `Sheet1`, and appends a row with column `Result` = `passed`. Output items pass through unchanged.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | documented | Public docs list exactly 3 operations |
| Set Outputs parameters | documented | Source, dataTable, outputs, Google Sheets sub-params all documented |
| Set Metrics parameters | documented | Name + numeric value documented |
| Check If Evaluating branching | documented | Two output branches for evaluated / not evaluating |
| Data table backend | inferred | Public docs mention "data table" but do not describe the storage API; implementation dependent |
| Evaluation context flag | inferred | The runtime must provide a mechanism to flag an execution as an evaluation; Check If Evaluating reads this flag |
| Set Metrics storage | inferred | Metrics must be persisted per-execution and surfaced in an Evaluations tab; exact API is implementation-defined |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/evaluation.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
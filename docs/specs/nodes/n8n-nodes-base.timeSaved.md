---
type: n8n-nodes-base.timeSaved
displayName: Track Time Saved
category: Core Nodes
versions: [1]
priority: low
status: specced
---

# Track Time Saved

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.savedTime/ | Public docs (page 404 -- inferred from node metadata) |

No public documentation page exists for this node. The specification is reconstructed from the node's published JSON descriptor (type string, parameter names, option values, defaults). No implementation source was read.

## Wire format

- **Type string:** `n8n-nodes-base.timeSaved`
- **Aliases:** `time`, `track`, `saved`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

This is a **local utility node** with no external API calls. Its effect is purely computational: it records a "minutes saved" value per execution and aggregates it across all Time Saved nodes in the workflow. Input items are passed through unchanged.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | string (enum) | `once` | yes | none | `once` = count minutes saved once for all input items; `perItem` = multiply minutes saved by the number of input items |
| minutesSaved | number | 0 | yes | none | Integer >= 0; the number of minutes saved by this workflow execution |

## Runtime behavior

### Input

Any number of items on `main[0]`. All items pass through to output unchanged.

### Output

Same items as input, passed through on `main[0]`. The minutes-saved contribution is **not** embedded in output item JSON. Instead it is recorded on the workflow execution metadata as a side-effect. Multiple Time Saved nodes in the same workflow have their values summed together in the execution summary.

### Calculation mode

- **Once For All Items** (`once`): the `minutesSaved` value is added to the workflow total exactly once, regardless of how many input items arrive.
- **Per Item** (`perItem`): the `minutesSaved` value is multiplied by the number of input items (`input.length × minutesSaved`) and that product is added to the workflow total.

### Errors

- Negative `minutesSaved` values are rejected by the parameter constraint (min 0).
- If `minutesSaved` is 0, the node still executes silently and contributes nothing to the total.
- Standard `continueOnFail` behavior applies.

### Expressions

`minutesSaved` does not support expression strings (`noDataExpression: true`). `mode` similarly does not support expressions.

## Acceptance tests

### Test: basic once-mode

**Given** input items:

```json
[{ "json": { "id": 1 } }, { "json": { "id": 2 } }]
```

**Parameters:**

```json
{ "mode": "once", "minutesSaved": 10 }
```

**Expect** output[0] passes through all 2 input items unchanged. Workflow execution summary records 10 minutes saved.

### Test: per-item mode

**Given** input items:

```json
[{ "json": {} }, { "json": {} }, { "json": {} }]
```

**Parameters:**

```json
{ "mode": "perItem", "minutesSaved": 5 }
```

**Expect** output[0] passes through all 3 items unchanged. Workflow execution summary records 15 minutes saved (3 × 5).

### Test: zero minutes

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "mode": "once", "minutesSaved": 0 }
```

**Expect** output[0] passes through the item unchanged. No time is recorded (contribution 0).

### Test: no input items

**Given** empty input:

```json
[]
```

**Parameters:**

```json
{ "mode": "perItem", "minutesSaved": 10 }
```

**Expect** output[0] is empty. Workflow execution summary records 0 minutes saved (0 × 10).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Public documentation | documented (404) | The URL in the node metadata returns 404. No public docs page exists. |
| Parameter structure | inferred | Reconstructed from published JSON descriptor. High confidence. |
| Execution metadata aggregation | inferred | The hint text "Multiple Saved Time nodes in the same workflow will have their values summed together" confirms aggregation. Exact output location in the execution UI is undocumented. |
| Expression support | inferred | `noDataExpression: true` on both parameters means they accept only literal values. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.timeSaved.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

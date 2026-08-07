---
type: n8n-nodes-base.quickChartTool
displayName: QuickChart
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# QuickChart (AI Tool)

An AI agent tool variant of the QuickChart node. When connected to an AI Agent in the Tools panel, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Shares the same parameters, credentials, and runtime behavior as the base QuickChart node (`n8n-nodes-base.quickChart`).

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickchart.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://quickchart.io/documentation/ | External API docs |
| https://quickchart.io/documentation/usage/parameters/ | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.quickChartTool`
- **Aliases:** (inherits the base node aliases from `n8n-nodes-base.quickChart`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `quickChartApi` (optional API key for higher rate limits)

## Parameters

This tool node shares the same parameter schema as the base `n8n-nodes-base.quickChart` node. All parameters support `$fromAI()` expressions.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| chartType | options: `bar`, `doughnut`, `line`, `pie`, `polarArea` | `bar` | yes | Chart type to render |
| labelsMode | options: `manually`, `array` | `manually` | yes | How to provide X-axis / segment labels |
| labelsUi | fixedCollection of strings | `{}` | (yes when manual) | Individual labels; shown when labelsMode=manually |
| labelsArray | string | — | (yes when array) | JSON array of labels; shown when labelsMode=array |
| data | json (string) | — | yes | Chart.js dataset data array |
| output | string | `data` | yes | Binary output field name for the rendered chart |
| chartOptions | collection | `{}` | no | Optional rendering: backgroundColor, devicePixelRatio (1-2), format (png/pdf/svg/webp), height, width, horizontal (bar/polarArea only), Chart.js version |
| datasetOptions | collection | `{}` | no | Optional dataset-level styling: backgroundColor, borderColor, fill, label, pointStyle |

## Runtime behavior

All behavior is identical to the base `n8n-nodes-base.quickChart` node. See [that spec](n8n-nodes-base.quickChart.md) for full details.

Key points:

- Each input item is processed independently
- The node builds a Chart.js config object from `chartType`, `labelsMode`/labels, `data`, `chartOptions`, and `datasetOptions`, then calls the QuickChart API at `https://quickchart.io/chart`
- Output is one item per input with the original JSON preserved plus a binary attachment under the field name specified by `output` (default `data`)
- Binary MIME type matches the chosen `format`: `image/png`, `image/webp`, `image/svg+xml`, or `application/pdf`
- `fileName` follows the pattern `chart.{ext}`
- The QuickChart API parameters used are: `c` (Chart.js config), `width`, `height`, `bkg` (backgroundColor), `devicePixelRatio`, `format`, and `v` (Chart.js version)
- When used as an AI tool, the agent model can populate any parameter via `$fromAI()`. Parameters without explicit user values are inferred by the LLM from the agent's instructions and conversation context

### Error handling

- HTTP errors from QuickChart produce a `NodeApiError`
- With `continueOnFail`, the original item is returned with an `error` property instead
- Invalid JSON in `data` or `labelsArray` produces a parameter validation error

## Acceptance tests

### Test: basic bar chart via AI tool

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "chartType": "bar",
  "labelsMode": "manually",
  "labelsUi": { "labelsValues": [{ "label": "A" }, { "label": "B" }, { "label": "C" }] },
  "data": "[10, 25, 15]",
  "output": "chartImage"
}
```

**Expect** output[0]:
- Original JSON preserved
- Binary attachment under `chartImage`
- `mimeType` is `image/png`

### Test: tool node with $fromAI() dynamic parameters

**Given** input item:
```json
[{ "json": { "dataPoints": [5, 10, 7], "labels": ["X", "Y", "Z"] } }]
```

**Parameters:**
```json
{
  "chartType": "={{ $fromAI('line') }}",
  "data": "={{ $fromAI($json.dataPoints) }}",
  "labelsArray": "={{ $fromAI($json.labels) }}",
  "chartOptions": {
    "width": 800,
    "height": 400
  }
}
```

**Expect** output[0]:
- Binary attachment under default `data` field
- Chart dimensions are 800×400

### Test: continue on fail with invalid data

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "chartType": "pie",
  "data": "NOT_JSON",
  "output": "data"
}
```

**With** `continueOnFail: true`

**Expect** output[0]:
- Original JSON preserved
- Has an `error` property
- No binary attachment

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter schema | Documented (n8n docs + type descriptor) | Identical to base QuickChart node |
| $fromAI() support | Documented (n8n docs) | Standard for all Tool variant nodes |
| datasetOptions collection | Inferred from type descriptor | Additional dataset-level styling not in original spec; confirmed in corpus type file |
| Chart types | Documented (n8n docs) | 5 types: bar, doughnut, line, pie, polarArea |
| Credentials | Documented (n8n docs) | quickChartApi — optional API key |
| Binary output field | Inferred from descriptor | Default `data`, configurable |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/quickChart.ts` (shared with base QuickChart node)
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Tool registration:** The executor should register the node with both the base type string (`n8n-nodes-base.quickChart`) and the tool type string (`n8n-nodes-base.quickChartTool`) as aliases, delegating to the same implementation

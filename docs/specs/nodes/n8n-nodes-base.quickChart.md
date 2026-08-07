---
type: n8n-nodes-base.quickChart
displayName: QuickChart
category: Marketing
versions: [1]
priority: medium
status: specced
alias: [image, graph, report, chart, diagram, data, visualize]
usableAsTool: true
---

# QuickChart

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickchart.md | Public docs only |
| https://quickchart.io/documentation/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.quickChart`
- **Aliases:** `image`, `graph`, `report`, `chart`, `diagram`, `data`, `visualize`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `quickChartApi` (optional API key for higher rate limits)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| chartType | options: `bar`, `doughnut`, `line`, `pie`, `polarArea` | `bar` | yes | The chart type to render |
| labelsMode | options: `manually`, `array` | `manually` | yes | How to supply X-axis / segment labels |
| labelsUi | fixedCollection of strings | `{}` | (yes when manual) | Per-item labels; shown when labelsMode=manually |
| labelsArray | string | — | (yes when array) | JSON array of labels e.g. `["Berlin","Paris"]`; shown when labelsMode=array |
| data | json (string) | — | yes | Chart.js dataset data array e.g. `[60,10,12,20]` |
| output | string | `data` | yes | Binary output field name for the rendered chart image |
| chartOptions | collection | `{}` | no | Optional rendering tweaks: backgroundColor (color), devicePixelRatio (1-2), format (png/pdf/svg/webp), height, width, horizontal (bar/polarArea only), Chart.js version |

## Runtime behavior

### Input

Each input item is processed independently. The node expects the `data` parameter at minimum — a JSON array of numeric values for the dataset.

Labels (X-axis categories or segment names) are optional but recommended for meaningful charts. They may be supplied manually as a fixed collection of strings or as a JSON array expression.

All parameter values may use n8n expressions.

### Output

For each input item, the node produces one output item with:
- All original input JSON fields preserved
- A binary attachment under the field name specified in the `output` parameter (default `data`)
- The binary attachment is the chart image rendered by QuickChart in the chosen format (PNG by default)
- The binary attachment's `mimeType` matches the format: `image/png`, `image/webp`, `image/svg+xml`, or `application/pdf`
- `fileName` follows the pattern `chart.{ext}`

The node calls QuickChart's public API at `https://quickchart.io/chart` with parameters `c` (Chart.js config string built from chartType + labels + data + chartOptions), `width`, `height`, `bkg` (backgroundColor), `devicePixelRatio`, `format`, and `v` (Chart.js version). The response binary is attached to the output item.

### Errors

- If the QuickChart API returns an HTTP error, the node throws a `NodeApiError` with the response status and body
- If `continueOnFail` is enabled, the node returns the original input item with an `error` property instead of throwing
- Invalid JSON in `data` or `labelsArray` parameters produces a parameter validation error

### Expressions

All parameters accept n8n expressions. The `labelsUi` fixed collection items and `chartOptions` collection values support dynamic values.

## Acceptance tests

### Test: bar chart with manual labels

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "chartType": "bar",
  "labelsMode": "manually",
  "labelsUi": { "labelsValues": [{ "label": "Q1" }, { "label": "Q2" }, { "label": "Q3" }] },
  "data": "[10, 25, 15]",
  "output": "chartImage"
}
```

**Expect** output[0]:
- JSON fields identical to input
- Binary attachment exists under `chartImage`
- `mimeType` is `image/png`
- `fileName` matches `chart.png`

### Test: line chart with array labels

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "chartType": "line",
  "labelsMode": "array",
  "labelsArray": "[\"Jan\", \"Feb\", \"Mar\"]",
  "data": "[5, 10, 7]",
  "output": "data"
}
```

**Expect** output[0]:
- Binary attachment under `data` field
- `mimeType` is `image/png`

### Test: pie chart with SVG format and background color

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "chartType": "pie",
  "labelsMode": "manually",
  "labelsUi": { "labelsValues": [{ "label": "A" }, { "label": "B" }] },
  "data": "[60, 40]",
  "output": "chartImage",
  "chartOptions": {
    "format": "svg",
    "backgroundColor": "#ffffff",
    "width": 800,
    "height": 400
  }
}
```

**Expect** output[0]:
- Binary attachment `mimeType` is `image/svg+xml`
- `fileName` matches `chart.svg`

### Test: polar area chart with horizontal orientation

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "chartType": "polarArea",
  "labelsMode": "manually",
  "labelsUi": { "labelsValues": [{ "label": "X" }, { "label": "Y" }, { "label": "Z" }] },
  "data": "[30, 50, 20]",
  "output": "data",
  "chartOptions": {
    "horizontal": true
  }
}
```

**Expect** output[0]:
- Binary attachment exists under `data`
- Chart is rendered as a horizontal polar area

### Test: continue on fail — invalid data

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "chartType": "bar",
  "data": "NOT_VALID_JSON",
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
| Chart types | Documented (n8n docs) | 5 types: bar, doughnut, line, pie, polarArea |
| API parameters | Documented (QuickChart API docs) | GET /chart endpoint with c, width, height, devicePixelRatio, bkg, format, v |
| Credentials | Documented (n8n docs) | quickChartApi — optional API key; without it, public endpoint used |
| Labels input structure | Inferred from descriptor | Two modes: manual fixedCollection or string JSON array |
| Binary output field | Inferred from descriptor | Configurable field name, default `data` |
| horizontal option displayOptions | Inferred from descriptor | Shown only for bar / polarArea chart types |
| Chart.js version parameter | Inferred from QuickChart API docs | `v` param with default `2` (v2), `4` for Chart.js v4 |
| exact rate-limit behavior | Inferred | Public endpoint has unspecified rate limits; API key raises them |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/quickChart.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

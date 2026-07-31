---
type: n8n-nodes-base.quickChart
displayName: QuickChart
category: Marketing
versions: [1]
priority: medium
status: specced
---

# QuickChart

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickchart.md | Public docs only |
| https://quickchart.io/documentation/ | Third-party service API docs |
| https://quickchart.io/documentation/usage/parameters/ | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.quickChart`
- **Aliases:** `image`, `graph`, `report`, `chart`, `diagram`, `data`, `visualize`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `quickChartApi` (optional — API key for higher rate limits; QuickChart public API works without auth for basic usage)

## Parameters

The node builds a Chart.js configuration and sends it to the QuickChart API (`https://quickchart.io/chart`), which returns a rendered chart image.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| chartType | fixedOptions | `bar` | ✓ | always | Bar, Doughnut, Line, Pie, Polar |
| chart | string | — | ✓ | always | Chart.js configuration object (JSON). The user provides the full Chart.js config; the node may inject `type` based on `chartType` if omitted. |
| width | number | `500` | ✗ | always | Image width in pixels |
| height | number | `300` | ✗ | always | Image height in pixels |
| devicePixelRatio | number | `2` | ✗ | always | Pixel ratio (`1` = standard, `2` = retina) |
| backgroundColor | string | `transparent` | ✗ | always | Canvas background (CSS color: rgb, hex, hsl, or color name) |
| version | string | `2.9.4` | ✗ | always | Chart.js version (`2`, `3`, `4`, or semver string) |
| format | fixedOptions | `png` | ✗ | always | Output format: `png`, `webp`, `jpg`, `svg`, `pdf` |
| encoding | fixedOptions | `url` | ✗ | always | Chart parameter encoding: `url` or `base64` |

### Additional options (collection)

| name | type | default | notes |
|------|------|---------|-------|
| host | string | `https://quickchart.io` | Self-hosted QuickChart instance base URL |

## Runtime behavior

### Input

Each input item is processed independently. The node expects a chart configuration string (JSON) in the `chart` parameter, which may reference fields from the input item via expressions.

### Output

For each input item, the node produces one output item containing:

```json
{
  "json": {
    "data": "<binary data buffer containing the chart image>"
  },
  "binary": {
    "data": {
      "mimeType": "<image/png or matching format>",
      "fileName": "chart.png"
    }
  }
}
```

The returned chart image is attached to the item as binary data. The `data` field in `json` holds a base64-encoded data URI of the image. The exact output contract:
- `binary.data` — the raw image bytes with the correct `mimeType` for the chosen `format`
- `json.data` — base64 data-URI string of the same image

### Errors

- If the QuickChart API returns a non-2xx response, the node throws (or emits an error item on the error output if `continueOnFail` is enabled).
- If the `chart` parameter is empty or not valid JSON, the node throws.
- If the API request times out or the self-hosted URL is unreachable, the node throws.

### Expressions

The `chart` parameter accepts expression strings to build the Chart.js config dynamically from input item data. `width`, `height`, `devicePixelRatio`, `backgroundColor`, `version`, `format`, and `host` also accept expressions.

## Acceptance tests

### Test: basic bar chart

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "chartType": "bar",
  "chart": "{\"data\":{\"labels\":[\"Q1\",\"Q2\",\"Q3\",\"Q4\"],\"datasets\":[{\"label\":\"Sales\",\"data\":[100,150,80,200]}]}}",
  "width": 500,
  "height": 300,
  "format": "png"
}
```

**Expect** output[0]:
- `binary.data` exists with `mimeType` `image/png`
- `json.data` is a non-empty string starting with `data:image/png;base64,`

### Test: dynamic chart from input data

**Given** input items:

```json
[{ "json": { "label": "Users", "values": [120, 60, 50, 180, 120], "labels": [2012, 2013, 2014, 2015, 2016] } }]
```

**Parameters:**

```json
{
  "chartType": "line",
  "chart": "={\"data\":{\"labels\":{{JSON.stringify($json.labels)}},\"datasets\":[{\"label\":$json.label,\"data\":{{JSON.stringify($json.values)}}}]}}",
  "width": 800,
  "height": 400,
  "format": "png"
}
```

**Expect** output[0]:
- `binary.data` exists with `mimeType` `image/png`

### Test: custom Chart.js version and SVG output

**Given** input items:

```json
[{ "json": { "myData": [30, 50, 20] } }]
```

**Parameters:**

```json
{
  "chartType": "pie",
  "chart": "={\"data\":{\"labels\":[\"A\",\"B\",\"C\"],\"datasets\":[{\"data\":{{JSON.stringify($json.myData)}}}]},\"options\":{\"plugins\":{\"legend\":{\"display\":true}}}}",
  "version": "4",
  "format": "svg",
  "backgroundColor": "white"
}
```

**Expect** output[0]:
- `binary.data` exists with `mimeType` `image/svg+xml`

### Test: polar chart with explicit devicePixelRatio

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "chartType": "polar",
  "chart": "{\"data\":{\"datasets\":[{\"data\":[11,16,7,3,14]}],\"labels\":[\"Red\",\"Green\",\"Yellow\",\"Grey\",\"Blue\"]}}",
  "devicePixelRatio": 1,
  "width": 400,
  "height": 400,
  "format": "png"
}
```

**Expect** output[0]:
- `binary.data` exists with `mimeType` `image/png`
- Image dimensions are exactly 400×400 (not 800×800, confirming `devicePixelRatio` = 1)

### Test: doughnut chart with self-hosted host URL (option)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "chartType": "doughnut",
  "chart": "{\"data\":{\"datasets\":[{\"data\":[10,20,30]}],\"labels\":[\"Red\",\"Blue\",\"Yellow\"]}}",
  "format": "png",
  "options": {
    "host": "https://selfhosted.quickchart.example.com"
  }
}
```

**Expect** output[0]:
- The node sends the request to `https://selfhosted.quickchart.example.com/chart` instead of `https://quickchart.io/chart`

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Chart type options | Public docs | Bar, Doughnut, Line, Pie, Polar confirmed in n8n docs |
| API parameters (width, height, format, etc.) | QuickChart API docs | Mapped from QuickChart's public API docs; node exposes these as node parameters |
| Credential schema | Not publicly documented | `quickChartApi` credential is referenced in node metadata but the credential docs page returns 404; likely an API key |
| Binary output shape | Inferred | n8n image-generating nodes consistently return image data in `binary.data` with base64 data-URI in `json.data` |
| Self-hosted host option | Inferred | Common pattern across n8n API nodes that support self-hosted instances |

## OpenFlow mapping

- **Definition group:** `marketing`
- **Executor file:** `src/lib/engine/executors/quick-chart.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
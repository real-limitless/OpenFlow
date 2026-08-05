---
type: n8n-nodes-base.googlePageSpeedInsights
displayName: Google PageSpeed Insights
category: Core
versions: [1]
priority: medium
status: specced
---

# Google PageSpeed Insights

## Sources

| URL | Source class |
|-----|----------------|
| https://developers.google.com/speed/docs/insights/v5/get-started | Public docs only |
| https://developers.google.com/speed/docs/insights/rest/v5/pagespeedapi/runpagespeed | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googlePageSpeedInsights`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleApi` (API key)

The node authenticates via a Google API key credential (`googleApi`). The API key is sent as the `key` query parameter on every request to `GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed`.

## Parameters

The node has a single resource (Report) with a single operation (Get). It wraps the PageSpeed Insights API v5 `runPagespeed` endpoint.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| url | string | — | yes | The URL to fetch and analyze |
| strategy | enum | `DESKTOP` | no | Analysis strategy: `DESKTOP` or `MOBILE` |
| categories | multi-select enum | `[PERFORMANCE]` | no | Lighthouse categories to run: `PERFORMANCE`, `ACCESSIBILITY`, `BEST_PRACTICES`, `SEO` — if none set, only Performance is run |
| locale | string | — | no | Locale used to localize formatted results (e.g. `en-US`, `ja`) |

The node passes user-supplied parameters to the API as query parameters (`url`, `strategy`, `category` repeated per category, `locale`, `key`).

## Runtime behavior

### Input

The node does not consume or transform input items from previous nodes. It executes once per input item, producing one output item per execution. If no input items are provided when running in execute-once mode, it executes against the parameters as configured.

### Output

For each input item, the node produces a single output item containing the full API response JSON, including:

- `captchaResult` — captcha verification result string
- `id` — canonicalized final URL of the analyzed page
- `loadingExperience` — real-user CrUX metrics with percentiles, distributions, and overall category (FAST/AVERAGE/SLOW)
- `originLoadingExperience` — aggregated CrUX metrics for the full origin
- `lighthouseResult` — full Lighthouse audit result including:
  - `lighthouseVersion` / `fetchTime` / `userAgent`
  - `configSettings` — emulated form factor, locale, categories run
  - `categories` — performance/accessibility/seo/best-practices scores (0–1)
  - `audits` — map of individual audit results with scores, display values, and details
  - `categoryGroups` — group labels for audit categorization
- `analysisUTCTimestamp` — UTC timestamp string
- `version` — PageSpeed API version (`major` / `minor`)

The full response object is placed under `json` in the output item. No binary data is produced.

### Errors

- HTTP 403 / 429 from the API (quota exceeded, invalid key) should surface as a thrown error.
- If `lighthouseResult.runtimeError` is present in the response, the node may surface it as a warning or attach it to the output.
- `continueOnFail` behavior follows the standard pattern: when enabled, the node passes the item to the error output instead of throwing.

### Expressions

All parameter values accept expression strings. The `url` parameter is virtually always set via expression.

## Acceptance tests

### Test: basic desktop performance report

**Given** an empty input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "url": "https://web.dev/",
  "strategy": "DESKTOP",
  "categories": ["PERFORMANCE"]
}
```

**Expect** output[0]:

- `json.id` equals `"https://web.dev/"`
- `json.lighthouseResult` is a non-null object
- `json.lighthouseResult.categories.performance.score` is a number between 0 and 1
- `json.lighthouseResult.configSettings.formFactor` equals `"desktop"`
- `json.loadingExperience` is present (or null — depends on CrUX data availability)

### Test: mobile with multiple categories

**Given** an empty input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "url": "https://example.com/",
  "strategy": "MOBILE",
  "categories": ["PERFORMANCE", "ACCESSIBILITY", "SEO"]
}
```

**Expect** output[0]:

- `json.id` is set
- `json.lighthouseResult.categories` contains keys `performance`, `accessibility`, `seo`
- `json.lighthouseResult.categories.performance.score` is a number
- `json.lighthouseResult.configSettings.formFactor` equals `"mobile"`

### Test: API error on invalid URL

**Given** an empty input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "url": "not-a-valid-url"
}
```

**Expect:** Node throws an error describing the invalid URL or API response.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API contract | Fully documented | Google's public API reference for `runPagespeed` is comprehensive |
| n8n node UI/schema | Inferred from API + Google credentials pattern | The n8n public docs page 404s and the node is absent from the current known nodes list — the node was likely removed between n8n 0.x and 1.x |
| Exact parameter nesting (ui representation) | Inferred | Node likely exposed URL + strategy as top-level fields and categories/locale as additional options; abstraction here is appropriate |
| Credential type | Inferred from other Google API nodes | `googleApi` (API key) is the standard credential for non-OAuth Google API nodes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googlePageSpeedInsights.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

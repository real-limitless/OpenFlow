---
type: n8n-nodes-base.googlePerspective
displayName: Google Perspective
category: Analytics
versions: [1]
priority: medium
status: specced
---

# Google Perspective

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleperspective/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |
| https://developers.perspectiveapi.com/s/about-the-api-attributes-and-languages | Public docs (referenced but JS-heavy portal) |

## Wire format

- **Type string:** `n8n-nodes-base.googlePerspective`
- **Aliases:** `["Moderation"]`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googlePerspectiveOAuth2Api` (extends Google OAuth2 single-service credential)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | `analyzeComment` | yes | — | Single operation; this is the only value |
| text | string | — | yes | operation = analyzeComment | The comment text to analyze |
| requestedAttributesValues[].attributeName | string enum | `flirtation` | no | operation = analyzeComment | One of: `toxicity`, `severe_toxicity`, `identity_attack`, `insult`, `profanity`, `threat`, `sexually_explicit`, `flirtation` |
| requestedAttributesValues[].scoreThreshold | number | 0 | no | operation = analyzeComment | Minimum score (0.0–1.0) to return results; 0 returns all |
| options.languages | string[] | — | no | operation = analyzeComment | Language codes for the text. Auto-detected if omitted. Dynamic options loaded from Perspective API. String via expression also accepted. |

## Runtime behavior

### Input

The node processes each input item independently. The `text` parameter is drawn from the item (expression) or set statically.

### Output

Each input item produces one output item with the original `json` payload enriched with a `perspective` root key containing the full API response body from `comments.analyze`. The response includes per-attribute score summaries (`summaryScore.value`, `spanScores` array for attribute spans).

If the API returns an error (e.g. invalid text, quota exceeded) the node throws, unless `continueOnFail` is enabled, in which case the error detail is placed into the item's `error` property and the item is passed through.

### Errors

- 4xx/5xx HTTP errors from the Perspective API are surfaced directly.
- Empty or non-text input may produce API-level errors (e.g. `INVALID_ARGUMENT`).
- `continueOnFail` results in output items with an `error` property rather than halting execution.

### Expressions

All parameter values accept n8n expression strings.

## Acceptance tests

### Test: basic toxicity check

**Given** input items:
```json
[{ "json": { "comment": "You are an idiot" } }]
```

**Parameters:**
```json
{
  "operation": "analyzeComment",
  "text": "={{ $json.comment }}",
  "requestedAttributesValues": [
    { "attributeName": "toxicity", "scoreThreshold": 0 }
  ]
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "comment": "You are an idiot",
    "perspective": {
      "attributeScores": {
        "TOXICITY": {
          "summaryScore": { "value": 0.87, "type": "PROBABILITY" }
        }
      },
      "languages": ["en"]
    }
  }
}]
```

### Test: multiple attributes with threshold

**Given** input items:
```json
[{ "json": { "text": "Shut up!" } }]
```

**Parameters:**
```json
{
  "operation": "analyzeComment",
  "text": "={{ $json.text }}",
  "requestedAttributesValues": [
    { "attributeName": "toxicity", "scoreThreshold": 0.5 },
    { "attributeName": "insult", "scoreThreshold": 0.5 },
    { "attributeName": "profanity", "scoreThreshold": 0.5 }
  ],
  "options": { "languages": ["en"] }
}
```

**Expect** output[0] to include `json.perspective.attributeScores` with keys `TOXICITY`, `INSULT`, `PROFANITY`, each containing a `summaryScore.value` between 0 and 1.

### Test: continue on API error

**Given** input items:
```json
[{ "json": { "comment": "" } }]
```

**Parameters:**
```json
{
  "operation": "analyzeComment",
  "text": "",
  "options": { "continueOnFail": true }
}
```

**Expect** output[0] to contain `json.error` with a descriptive message and no `json.perspective` key.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact API endpoint path | Inferred | Uses `commentanalyzer.googleapis.com/v1alpha2/comments:analyze` based on public Perspective API docs |
| Full response shape | Inferred | Returns `attributeScores` map with per-attribute `summaryScore` and optional `spanScores` |
| Dynamic language loading | Documented | `getLanguages` method in the node loads options from the API |
| Attribute name list | Corpus-confirmed | Enumerated from the node definition schema; matches the Perspective API attribute reference |
| Score threshold semantics | Documented | Acts as a filter — only attributes exceeding the threshold appear; 0 = return all |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googlePerspective.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.googlePerspective
displayName: Google Perspective
category: Analytics
versions: [1]
priority: medium
status: specced
alias: [Moderation]
---

# Google Perspective

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleperspective/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://developers.perspectiveapi.com/s/about-the-api-attributes-and-languages | Public docs only |
| https://developers.perspectiveapi.com/s/docs-get-started | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googlePerspective`
- **Aliases:** `Moderation`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googlePerspectiveOAuth2Api`

Uses the Google OAuth2 single-service credential type (OAuth 2.0 with Client ID + Client Secret). The Google Perspective API must be enabled in the Google Cloud project and API access must be requested from the Perspective API team.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | fixed | `analyzeComment` | Y | — | Single operation; no other operations exist |
| text | string/expression | — | Y | operation: analyzeComment | The comment text to analyze for toxicity/attributes |
| requestedAttributesUi.requestedAttributesValues | array | [] | N | operation: analyzeComment | List of attributes to score against the text |
| requestedAttributesValues[].attributeName | string/expression | flirtation | N | — | Toxicity attribute: flirtation, identity_attack, insult, profanity, severe_toxicity, sexually_explicit, threat, or toxicity |
| requestedAttributesValues[].scoreThreshold | number/expression | 0 | N | — | Return only scores above this threshold (0-1). At 0, all scores returned |
| options.languages | string/expression | — | N | operation: analyzeComment | Comma-separated language codes (e.g. "en", "es"). Auto-detected if omitted |

## Runtime behavior

### Input

The node accepts one or more items via `main` input. The `text` parameter is evaluated per-item (expressions resolve against each item's JSON data). The `requestedAttributesUi` and `options` collections are also evaluated per-item.

### Output

For each input item, the node calls the Google Perspective API `comments:analyze` endpoint (`POST https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze`). The response contains a `attributeScores` map keyed by requested attribute name, with span scores and summary scores.

The output item carries:
- All original input item data (JSON is merged/extended).
- A `attributeScores` object mapping each requested attribute to its `spanScores` and `summaryScore` objects (each with `value` and `scoreType`).

If no attributes are explicitly requested, the node defaults to analyzing a reasonable subset (at least `toxicity`).

### Errors

- API errors (authentication, quota, invalid text) produce an error item on the same output, or throw depending on `continueOnFail`.
- If the Perspective API returns an error response, the node should throw unless `continueOnFail` is enabled, in which case the error info is added to the output item.
- Empty or whitespace-only text should be handled gracefully (throw with descriptive message).

### Expressions

All parameter values support expression strings (`=...` syntax) for dynamic resolution at runtime: `text`, `attributeName`, `scoreThreshold`, `languages`.

## Acceptance tests

### Test: analyze a single toxic comment

**Given** input items:
```json
[{ "json": { "comment": "You are an idiot" } }]
```

**Parameters:**
```json
{
  "operation": "analyzeComment",
  "text": "={{ $json.comment }}",
  "requestedAttributesUi": {
    "requestedAttributesValues": [
      { "attributeName": "toxicity", "scoreThreshold": 0 }
    ]
  }
}
```

**Expect** output[0] contains:
- A `attributeScores` object with a `toxicity` key
- `toxicity.summaryScore.value` is a number between 0 and 1 (non-zero for toxic text)

### Test: analyze with all attributes

**Given** input items:
```json
[{ "json": { "comment": "I really enjoyed this article" } }]
```

**Parameters:**
```json
{
  "operation": "analyzeComment",
  "text": "={{ $json.comment }}",
  "requestedAttributesUi": {
    "requestedAttributesValues": [
      { "attributeName": "toxicity" },
      { "attributeName": "insult" },
      { "attributeName": "profanity" },
      { "attributeName": "threat" }
    ]
  }
}
```

**Expect** output[0] contains:
- All four attribute keys under `attributeScores`
- Each `summaryScore.value` is a number between 0 and 1

### Test: expression-based attribute selection

**Given** input items:
```json
[{ "json": { "attr": "toxicity" } }]
```

**Parameters:**
```json
{
  "operation": "analyzeComment",
  "text": "Bad comment",
  "requestedAttributesUi": {
    "requestedAttributesValues": [
      { "attributeName": "={{ $json.attr }}" }
    ]
  }
}
```

**Expect** output[0]:
- `attributeScores.toxicity` exists with a numeric `summaryScore.value`

### Test: empty text error handling

**Given** input items:
```json
[{ "json": { "comment": "" } }]
```

**Parameters:**
```json
{ "operation": "analyzeComment", "text": "" }
```

**Expect:** Node throws an error or emits an error output item indicating invalid input text.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Single operation (analyzeComment) | Public docs + node descriptor | Confirmed from both sources |
| Attribute names and scoreThreshold | Corpus descriptor (parameter schema) | 8 standard Perspective API attributes; documented externally |
| Output shape (attributeScores with spanScores + summaryScore) | Inferred from Perspective API spec | Standard Perspective API response shape |
| Default attributes when none requested | Inferred | Behavior undocumented — assume defaults to `toxicity` or all |
| Languages option | Corpus descriptor | Free-form string; API auto-detects if absent |
| Credential type | Corpus descriptor | `googlePerspectiveOAuth2Api` — Google OAuth2 single service |
| Alias "Moderation" | Node JSON co de x | Confirmed |

## OpenFlow mapping

- **Definition group:** `Analytics`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googlePerspective.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

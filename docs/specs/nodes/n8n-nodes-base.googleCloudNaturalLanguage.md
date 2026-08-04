---
type: n8n-nodes-base.googleCloudNaturalLanguage
displayName: Google Cloud Natural Language
category: Analytics
versions: [1]
priority: medium
status: specced
---

# Google Cloud Natural Language

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudnaturallanguage/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/ | Public docs only |
| https://cloud.google.com/natural-language/docs/analyzing-sentiment | Google Cloud public docs |
| https://cloud.google.com/natural-language/docs/reference/rest/v2/documents/analyzeSentiment | Google Cloud public docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleCloudNaturalLanguage`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleCloudNaturalLanguageOAuth2Api` (OAuth2 only — service account not supported)

## Parameters

The node exposes a single resource/operation pair:

**Resource:** `Document`
**Operation:** `Analyze Sentiment`

| parameter | type | required | notes |
|-----------|------|----------|-------|
| `documentType` | `string` | yes | The source of the document text: `content` (inline text) or `gcsContentUri` (Cloud Storage URI) |
| `textContent` | `string` | conditional | Inline document text (used when `documentType` = `content`); supports expressions |
| `gcsUri` | `string` | conditional | Cloud Storage URI like `gs://bucket/object` (used when `documentType` = `gcsContentUri`); supports expressions |
| `inputLanguage` | `string` | no | Optional BCP-47 language code (e.g. `en`, `es`, `fr`). When omitted the API auto-detects language |
| `encodingType` | `string` | no | Character encoding for token offsets: `UTF8` (default), `UTF16`, `UTF32`, or `NONE`. Controls `beginOffset` in sentence output. Default: `UTF8` |

### Expression support

All string parameters accept n8n expressions.

## Runtime behavior

### Input

Each input item is processed independently. The node constructs a Google Cloud Natural Language `documents:analyzeSentiment` request per item using the configured parameters.

### Output

Each input item produces one output item with the following shape:

```json
{
  "documentSentiment": { "magnitude": 0.8, "score": 0.8 },
  "language": "en",
  "sentences": [
    { "text": { "content": "Enjoy your vacation!", "beginOffset": 0 },
      "sentiment": { "magnitude": 0.8, "score": 0.8 } }
  ]
}
```

- `documentSentiment.score` ranges from -1.0 (negative) to 1.0 (positive). 0 is neutral.
- `documentSentiment.magnitude` indicates the overall emotional strength of the text (non-negative).
- `sentences[]` contains per-sentence breakdown with individual sentiment scores.
- `language` is the detected or specified language code.

The original input item properties (including binary data if any) are **not** merged into the output. The output represents the raw API response.

### Errors

- **API errors** (auth failure, quota exceeded, invalid request body) are thrown as node errors. With `continueOnFail` enabled, the failing item produces an `error` output and processing continues.
- **Missing text content** when `documentType = content` and `textContent` is empty should produce a validation error.

### Expressions

All string parameters (`textContent`, `gcsUri`, `inputLanguage`) accept expressions. `encodingType` and `documentType` are fixed-choice dropdowns.

## Acceptance tests

### Test: analyze inline text sentiment

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "documentType": "content",
  "textContent": "I love this product, it is absolutely wonderful!",
  "inputLanguage": "",
  "encodingType": "UTF8"
}
```

**Expect** output[0]:

```json
{
  "documentSentiment": { "score": 0.9, "magnitude": 0.9 },
  "language": "en",
  "sentences": [
    { "text": { "content": "I love this product, it is absolutely wonderful!", "beginOffset": 0 },
      "sentiment": { "score": 0.9, "magnitude": 0.9 } }
  ]
}
```

(Score/magnitude are approximate and depend on the actual API response.)

### Test: analyze text with explicit language

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "documentType": "content",
  "textContent": "Este producto es terrible, no lo recomiendo.",
  "inputLanguage": "es",
  "encodingType": "UTF8"
}
```

**Expect** output[0].json to contain `"language": "es"` and `documentSentiment.score` < 0.

### Test: analyze from Cloud Storage URI

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "documentType": "gcsContentUri",
  "gcsUri": "gs://my-bucket/sentiment-sample.txt",
  "inputLanguage": "",
  "encodingType": "UTF8"
}
```

**Expect** output[0].json to contain `documentSentiment` with both `score` and `magnitude` properties, plus a `language` field.

### Test: per-item expression binding

**Given** input items:

```json
[
  { "json": { "review": "Great service!" } },
  { "json": { "review": "Terrible experience." } }
]
```

**Parameters:**

```json
{
  "documentType": "content",
  "textContent": "={{ $json.review }}",
  "inputLanguage": "",
  "encodingType": "UTF8"
}
```

**Expect** output to contain 2 items. The first should have a positive `documentSentiment.score`; the second should have a negative `documentSentiment.score`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|-----------------------|-------|
| Parameter names & structure | Corpus (parameter names from extract JSON) | `documentType`, `textContent`, `gcsUri`, `inputLanguage`, `encodingType` are abstracted names inferred from the external Cloud NL API contract and the Interface.d.ts shape |
| Exact n8n UI labels | Inferred | Actual display labels in the n8n editor may differ from the parameter names used here |
| Output shape | Google Cloud public API docs | The response matches the `documents:analyzeSentiment` REST API response verified from public Google Cloud docs |
| Credential type | Public docs | Uses `googleCloudNaturalLanguageOAuth2Api` (OAuth2). Service account is not supported per the compatibility table |
| Error behavior | Inferred | Standard n8n error propagation assumed; verify `continueOnFail` behavior with actual API error responses |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleCloudNaturalLanguage.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

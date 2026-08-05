---
type: n8n-nodes-base.googleCloudNaturalLanguage
displayName: Google Cloud Natural Language
category: Analytics
versions: [1]
priority: low
status: specced
---

# Google Cloud Natural Language

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudnaturallanguage/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://cloud.google.com/natural-language/docs/reference/rest | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleCloudNaturalLanguage`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleCloudNaturalLanguageOAuth2Api` (extends shared Google OAuth2; delegates to the `GoogleApi` base credential for single-service OAuth2 scopes including `https://www.googleapis.com/auth/cloud-language`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `document` | ✓ | none | Fixed; always `document`. |
| operation | string | `analyzeSentiment` | ✓ | none | Fixed; always `analyzeSentiment`. |
| documentSource | string | `text` | ✓ | none | `text` (inline string) or `fromJson` (field from input JSON). |
| text | string | — | conditional | documentSource === `text` | Plain text to analyze. Accepts expressions. |
| jsonInputField | string | — | conditional | documentSource === `fromJson` | Name of the input JSON field containing the document text. |
| options | collection | — | — | — | Collection of optional parameters: |
| options.language | string | — | — | — | Language code hint (e.g. `en`, `es`, `fr`). Defaults to auto-detect. |
| options.encodingType | string | `UTF8` | — | — | `UTF8`, `UTF16`, `UTF32`, or `NONE`. |

## Runtime behavior

### Input

Each input item may provide the document text to analyze, either as a direct string value (`text` parameter) or as a field reference on the item's JSON data (`jsonInputField` parameter). The input item is otherwise passed through unchanged.

### Output

For each input item, the node calls the Google Cloud Natural Language `documents.analyzeSentiment` REST API and attaches the API response (excluding the top-level response envelope) under a `sentiment` key on the output item. The response shape mirrors the Cloud NL API v1 response and includes:

- `documentSentiment` — an object with `magnitude` (number, overall emotional intensity) and `score` (number, -1.0 to 1.0, negative to positive).
- `language` — the detected language code (string).
- `sentences` — an array of sentence-level results, each containing `text` (object with `content` and `beginOffset`) and `sentiment` (object with `magnitude` and `score`).

No items are removed or suppressed; every input item produces exactly one output item.

### Errors

If the Google Cloud Natural Language API returns an error (invalid text, authentication failure, quota exceeded, etc.), the node throws and halts the workflow unless `continueOnFail` is enabled, in which case the error is output as an item with an `error` property.

### Expressions

The `text` parameter supports expressions. The `jsonInputField` parameter is a string literal.

## Acceptance tests

### Test: analyze inline text sentiment

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "analyzeSentiment",
  "documentSource": "text",
  "text": "I love this product, it is absolutely wonderful!",
  "options": {
    "language": "en"
  }
}
```

**Expect** output[0] to contain a `sentiment` key with:
- `documentSentiment` — an object having numeric `score` and `magnitude` properties, where score > 0 (positive sentiment).
- `language` — `"en"`.
- `sentences` — a non-empty array where each element has `text` (object with `content` and `beginOffset`) and `sentiment` (object with `score` and `magnitude`).

### Test: analyze sentiment from input JSON field

**Given** input items:

```json
[{ "json": { "reviewText": "This restaurant was terrible. The food was cold." } }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "analyzeSentiment",
  "documentSource": "fromJson",
  "jsonInputField": "reviewText"
}
```

**Expect** output[0] to contain a `sentiment` key with `documentSentiment.score < 0`.

### Test: auto-detect language

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "analyzeSentiment",
  "documentSource": "text",
  "text": "Hoy es un día maravilloso."
}
```

**Expect** output[0].sentiment.language to be `"es"`.

### Test: empty text error

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "document",
  "operation": "analyzeSentiment",
  "documentSource": "text",
  "text": ""
}
```

**Expect** the node to throw an error (or produce an error item if `continueOnFail` is enabled).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Public docs | Spec only includes `analyzeSentiment` — the single operation listed in public n8n documentation. Additional NL API operations (entity analysis, classify, etc.) are not exposed. |
| Parameter structure | Public docs + corpus schema | Minimal; the node is a thin wrapper around `documents.analyzeSentiment`. |
| Credential type | Public docs | `googleCloudNaturalLanguageOAuth2Api` extends shared Google OAuth2. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleCloudNaturalLanguage.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

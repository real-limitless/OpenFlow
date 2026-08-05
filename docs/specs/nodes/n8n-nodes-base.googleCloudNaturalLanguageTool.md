---
type: n8n-nodes-base.googleCloudNaturalLanguageTool
displayName: Google Cloud Natural Language Tool
category: Analytics
versions: [1]
priority: low
status: specced
---

# Google Cloud Natural Language Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudnaturallanguage/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://cloud.google.com/natural-language/docs/reference/rest | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleCloudNaturalLanguageTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleCloudNaturalLanguageOAuth2Api` (shared Google OAuth2 single-service credential; requires `https://www.googleapis.com/auth/cloud-language` scope)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `document` | ✓ | none | Fixed; always `document`. |
| operation | string | `analyzeSentiment` | ✓ | none | Fixed; always `analyzeSentiment`. |
| documentSource | string | `text` | ✓ | none | `text` (inline string) or `fromJson` (field from input JSON). |
| text | string | — | conditional | documentSource === `text` | Plain text to analyze. Accepts expressions and `$fromAI()` dynamic population. |
| jsonInputField | string | — | conditional | documentSource === `fromJson` | Name of the input JSON field containing the document text. |
| options | collection | — | — | — | Collection of optional parameters: |
| options.language | string | — | — | — | Language code hint (e.g. `en`, `es`, `fr`). Defaults to auto-detect. |
| options.encodingType | string | `UTF8` | — | — | `UTF8`, `UTF16`, `UTF32`, or `NONE`. |

## Runtime behavior

### Input

Identical behavior to the base Google Cloud Natural Language node. Each input item provides document text either inline (`text` parameter) or via a JSON field reference (`jsonInputField`). When used as an AI Agent tool, the `text` parameter may be dynamically populated by the LLM via `$fromAI()`.

### Output

For each input item, calls `documents.analyzeSentiment` on the Google Cloud Natural Language REST API v1 and attaches the structured response under a `sentiment` key on the output item:

- `documentSentiment` — `{ score: number, magnitude: number }` (-1.0 to 1.0, negative to positive).
- `language` — detected language code (string).
- `sentences` — array of `{ text: { content: string, beginOffset: number }, sentiment: { score: number, magnitude: number } }`.

Every input item produces exactly one output item.

### Errors

Throws on API errors (authentication, quota, invalid input) unless `continueOnFail` is enabled, in which case the error is output as an item with an `error` property.

### Expressions

The `text` parameter supports expressions and `$fromAI()` dynamic population (tool mode). The remaining parameters are string/number literals.

## Acceptance tests

### Test: analyze inline text sentiment (tool mode)

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
  "text": "The team delivered an outstanding result this quarter.",
  "options": { "language": "en" }
}
```

**Expect** output[0].sentiment to contain:
- `documentSentiment.score > 0` (positive).
- `language` — `"en"`.
- `sentences` — non-empty array of sentence objects.

### Test: $fromAI() dynamic parameter population

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
  "text": "={{ $fromAI() }}"
}
```

**Expect** the `text` parameter to be populated by the calling AI Agent's LLM with a text string, and the node to return the same structured sentiment output format.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | Public docs | Single operation `analyzeSentiment`. Additional NL API features (entity analysis, content classification, syntax analysis) are not exposed. |
| Tool behavior | Inferred | The base node carries `usableAsTool: true`; the Tool variant is functionally identical with `$fromAI()` support for AI Agent dynamic parameter filling. |
| Parameter structure | Public docs + extracted schema | Minimal parameter surface consistent with the base node. |
| Credential type | Public docs | Google OAuth2 single-service with `cloud-language` scope. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleCloudNaturalLanguageTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

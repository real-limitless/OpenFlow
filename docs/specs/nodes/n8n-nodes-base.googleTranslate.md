---
type: n8n-nodes-base.googleTranslate
displayName: Google Translate
category: Utility
versions: [1, 2]
priority: medium
status: specced
---

# Google Translate

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googletranslate.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only |
| https://cloud.google.com/translate/docs/reference/rest/v2/translate | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleTranslate`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleApi` (Service Account) or `googleTranslateOAuth2Api` (OAuth2); authentication method selected via parameter; OAuth2 is the default on v2, Service Account is the default on v1

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: language | language | yes | — | Fixed single value |
| operation | options: translate | translate | yes | resource = language | Fixed single value |
| text | string | "" | yes | operation = translate | Expression-capable; the source text to be translated |
| translateTo | options (dynamic via getLanguages) | "" | yes | operation = translate | Target language code; dynamically populated from Google Translate supported languages list; also accepts expression strings with a language code |
| authentication | options | serviceAccount (v1) / oAuth2 (v2) | no | @version | Controls which credential type is used |

## Runtime behavior

### Input

Each input item is processed independently. The `text` parameter is read per-item; expressions in `translateTo` are also evaluated per-item. If `text` is a static string, all items receive the same translation request.

### Output

For each input item, one output item is produced containing:

- All original input JSON properties
- Additional property `translatedText` — the translated text returned by the Google Translate API
- Additional property `detectedSourceLanguage` — the language code automatically detected by the API (present when no source language was specified)
- Any binary data carried over from the input item

The output is on `output[0]` (main).

### Errors

- If the Google Translate API returns an error (e.g. invalid target language, quota exceeded), the node throws. If `continueOnFail` is enabled, the item is returned with error info instead.
- Missing required parameters (`text`, `translateTo`) produce a validation error before any API call.

### Expressions

`text` and `translateTo` accept expression strings.

## Acceptance tests

### Test: basic translate

**Given** input items:

```json
[{ "json": { "sourceText": "Hello world" } }]
```

**Parameters:**
```json
{
  "resource": "language",
  "operation": "translate",
  "text": "={{ $json.sourceText }}",
  "translateTo": "es"
}
```

**Expect** output[0] contains an item whose JSON includes `translatedText` (a non-empty string) and `detectedSourceLanguage` equal to `"en"`.

### Test: static text per-item

**Given** input items:

```json
[
  { "json": { "id": 1 } },
  { "json": { "id": 2 } }
]
```

**Parameters:**
```json
{
  "resource": "language",
  "operation": "translate",
  "text": "Good morning",
  "translateTo": "fr"
}
```

**Expect** output[0] has 2 items, each carrying `translatedText` (both same translation) and `detectedSourceLanguage`.

### Test: oAuth2 authentication

**Given** input items:

```json
[{ "json": { "text": "Bonjour" } }]
```

**Parameters:**
```json
{
  "authentication": "oAuth2",
  "resource": "language",
  "operation": "translate",
  "text": "={{ $json.text }}",
  "translateTo": "en"
}
```

**Expect** the node authenticates via `googleTranslateOAuth2Api` and produces output[0] with `translatedText` containing `"Hello"` or `"Good morning"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names | Public corpus (JSON descriptor) | Confirmed via types/nodes.json |
| Authentication methods | Public docs + corpus | Two methods: Service Account (googleApi) and OAuth2 (googleTranslateOAuth2Api); v2 defaults to OAuth2, v1 to Service Account |
| Supported languages source | Public Google API docs | Dynamically loaded from `getLanguages` loadOptionsMethod against the Google Translate API |
| Optional `source` language parameter | Inferred | The v2 Google Translate API accepts an optional `source` parameter for source language detection override, but this node does not expose it directly — auto-detection is always used |
| Additional options (format, model) | Inferred | The API supports format (html/text) and model parameters, but the node does not expose them in its current parameter surface |
| Output shape (translatedText, detectedSourceLanguage) | Public schema JSON | Confirmed via `__schema__/v2.0.0/language/translate.json` |
| usableAsTool | Public corpus | Marked `usableAsTool: true` — supports `$fromAI()` parameter population for AI agents |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/googleTranslate.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

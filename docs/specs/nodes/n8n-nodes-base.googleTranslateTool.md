---
type: n8n-nodes-base.googleTranslateTool
displayName: Google Translate Tool
category: AI
versions: [1, 2]
priority: medium
status: specced
---

# Google Translate Tool

AI agent tool variant of the Google Translate node. Wraps a single translation operation (Language -> Translate) against the Google Cloud Translation API v2. Shares the same parameters and credential types as the base `n8n-nodes-base.googleTranslate` app node, but is only accessible from an AI Agent's Tools panel and supports `$fromAI()` dynamic parameter population.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googletranslate/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://cloud.google.com/translate/docs/reference/rest/v2/translate | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleTranslateTool`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one of `googleApi` (Service Account) or `googleTranslateOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `serviceAccount` (v1) / `oAuth2` (v2) | yes | | Selects between Service Account (API key) and OAuth2 credentials |
| resource | hidden | `language` | yes | | Always `language`; fixed resource |
| operation | hidden | `translate` | yes | resource=language | Always `translate`; fixed operation |
| text | string | | yes | operation=translate | The input text to translate |
| translateTo | options (dynamic) | | yes | operation=translate | Target language code or name; dynamically loaded from the `getLanguages` load-options method backed by Google Cloud Translation API's supported languages list |

Options collection: none beyond the fields listed above.

## Runtime behavior

### Input

Consumes each input item independently. The `text` parameter may reference item properties via expressions (e.g. `{{ $json.text }}`). When used as an AI tool, the AI agent populates `text` and `translateTo` from the conversation context, potentially via `$fromAI()` dynamic injection.

### Output

Each input item produces one output item with the original input augmented by a `translation` object:

```json
{
  "json": {
    "translation": {
      "detectedSourceLanguage": "en",
      "translatedText": "Bonjour le monde"
    }
  }
}
```

The `detectedSourceLanguage` field is automatically detected by the Google Cloud Translation API when the source language is not explicitly specified. The `translatedText` contains the translated string in the target language.

When `continueOnFail` is enabled and the API returns an error, the item passes through with an `error` property instead of halting execution.

### Errors

- **Credential errors:** Missing or invalid credentials produce an authentication error before the API call.
- **API errors:** Invalid target language code, empty text, or exceeded quota result in a node-level error. Standard `continueOnFail` handling applies.
- **Network errors:** Timeout or connectivity failures propagate as node errors.

### Expressions

All parameters accept expression strings, including `text` and `translateTo`. The `translateTo` parameter's options are dynamically loaded from the API but also accept arbitrary string expressions.

## Acceptance tests

### Test: basic translate EN to FR

**Given** input items:

```json
[{ "json": { "source": "Hello world" } }]
```

**Parameters:**

```json
{
  "text": "={{ $json.source }}",
  "translateTo": "fr"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "source": "Hello world",
    "translation": {
      "detectedSourceLanguage": "en",
      "translatedText": "Bonjour le monde"
    }
  }
}]
```

### Test: literal text, auto-detect source

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "Wie geht es Ihnen?",
  "translateTo": "en"
}
```

**Expect** output[0] contains:

```json
{
  "translation": {
    "detectedSourceLanguage": "de",
    "translatedText": "How are you?"
  }
}
```

### Test: empty text fails

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "",
  "translateTo": "en"
}
```

**Expect:** node-level error thrown (empty input text rejected by API).

### Test: invalid target language fails

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "Hello",
  "translateTo": "zz"
}
```

**Expect:** node-level error (invalid language code rejected by API).

### Test: continueOnFail passes error item through

**Given** the same invalid input as the "invalid target language" test with `continueOnFail: true`.

**Expect:** output[0] contains one item with the original JSON plus an `error` property describing the failure.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names & defaults | Documented | Public n8n docs confirm `Resource` (Language), `Operation` (Translate), `Text`, `Translate To` |
| Output shape | Inferred from schema | The v2 translate schema at `__schema__/v2.0.0/language/translate.json` confirms `detectedSourceLanguage` + `translatedText` fields |
| Credential types | Documented | `googleApi` for Service Account and `googleTranslateOAuth2Api` for OAuth2, confirmed in public docs |
| Tool-only behavior | Documented | Shared docs state "This node can be used as an AI tool"; `$fromAI()` dynamic parameter population is a documented tool feature |
| Exact language list | Inferred | Dynamically loaded from Google API; standard n8n load-options pattern |
| API version | Inferred | Node maps to Google Cloud Translation API v2 (`/language/translate/v2`) |
| Error handling | Inferred | Standard n8n error behavior; no documented deviations |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/googleTranslateTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

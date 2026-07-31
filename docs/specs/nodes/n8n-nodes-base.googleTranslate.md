---
type: n8n-nodes-base.googleTranslate
displayName: Google Translate
category: Utility
versions: [1]
priority: medium
status: specced
---

# Google Translate

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googletranslate.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://cloud.google.com/translate/docs/reference/rest | Third-party API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleTranslate`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleTranslateOAuth2Api` (extends `googleOAuth2Api`, scope `https://www.googleapis.com/auth/cloud-translation`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixedString | `language` | yes | — | Always `language`; single resource |
| operation | fixedString | `translate` | yes | — | Always `translate`; single operation |
| text | string | — | yes | — | Text to translate. Accepts expressions. |
| translateTo | string | — | yes | — | Target language code (BCP-47, e.g. `es`, `fr`, `zh-CN`). Accepts expressions. |
| translateFrom | string | — | no | — | Source language code. If omitted, Google Cloud Translation API auto-detects. Accepts expressions. |
| options | collection | — | no | — | Group of optional settings (see below) |
| options.sessionId | string | — | no | — | Custom session ID for persistent model improvements |

### Options

The `options` collection may contain:
- **sessionId** (string): Associates the translation with a session for model tuning.

## Runtime behavior

### Input

Each input item's `json` is processed independently. The `text` parameter is evaluated per item (may contain expressions referencing the item). Non-`json` fields on input items are preserved in the output.

### Output

Each input item produces one output item on `main[0]` with the following shape:

```json
{
  "json": {
    "translatedText": "<translated string>",
    "detectedSourceLanguage": "<auto-detected language code>"
  }
}
```

- `detectedSourceLanguage` is always present (even when `translateFrom` is set, the API returns the source language).
- Fields from the input item's `json` that are not overwritten by the output are NOT preserved (the output is the translation result only).

### Errors

- If the API call fails (authentication, quota, invalid language code), the node throws an error unless `continueOnFail` is enabled.
- When `continueOnFail` is enabled, the failing item produces `[{ json: { error: <message> } }]` on output `main[0]`.

### Expressions

`text`, `translateTo`, and `translateFrom` accept expression strings.

## Acceptance tests

### Test: basic translation

**Given** input items:

```json
[{ "json": { "source": "Hello world" } }]
```

**Parameters:**

```json
{
  "text": "Hello world",
  "translateTo": "es",
  "translateFrom": "en"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "translatedText": "Hola mundo",
    "detectedSourceLanguage": "en"
  }
}]
```

### Test: auto-detect source language

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "Bonjour le monde",
  "translateTo": "en"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "translatedText": "Hello world",
    "detectedSourceLanguage": "fr"
  }
}]
```

### Test: per-item expression evaluation

**Given** input items:

```json
[
  { "json": { "msg": "Good morning", "target": "de" } },
  { "json": { "msg": "Good night", "target": "fr" } }
]
```

**Parameters:**

```json
{
  "text": "={{ $json.msg }}",
  "translateTo": "={{ $json.target }}"
}
```

**Expect** output[0]:

```json
[
  { "json": { "translatedText": "Guten Morgen", "detectedSourceLanguage": "en" } },
  { "json": { "translatedText": "Bonne nuit", "detectedSourceLanguage": "en" } }
]
```

### Test: continueOnFail error output

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "",
  "translateTo": "",
  "options": {}
}
```

With `continueOnFail: true`.

**Expect** output[0]:

```json
[{
  "json": {
    "error": "The parameter 'translateTo' is required."
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation values | Public docs + descriptor | Single resource `language`, single operation `translate`; confirmed via public docs page and corpus descriptor |
| Parameter names and types | Public descriptor | Names verified from npm package descriptor schema; `text`, `translateTo`, `translateFrom`, `options` with `sessionId` |
| Credential type | Public descriptor | `googleTranslateOAuth2Api` extends `googleOAuth2Api`; scope `cloud-translation` confirmed from credential source |
| Output shape | Public descriptor | Output schema shows `translatedText` (string) + `detectedSourceLanguage` (string) |
| Language code format | Inferred from Google API docs | BCP-47 codes; documented in Cloud Translation API reference |
| Error shapes | Inferred | Standard `continueOnFail` pattern; exact error messages may vary |
| Options beyond sessionId | Inferred | Only `sessionId` documented in descriptor; additional API options (model, format, glossary) may exist but not surfaced |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/google-translate.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
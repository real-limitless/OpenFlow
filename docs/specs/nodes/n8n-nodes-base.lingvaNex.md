---
type: n8n-nodes-base.lingvaNex
displayName: LingvaNex
category: AI
versions: [1]
priority: low
status: specced
---

# LingvaNex

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.lingvanex.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/lingvanex.md | Public docs only |
| https://docs.lingvanex.com/reference/overview | Public docs only |
| https://docs.lingvanex.com/reference/translate | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.lingvaNex`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `lingvaNexApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `"translate"` | yes | - | Fixed; only resource is `translate` |
| operation | string | `"translate"` | yes | - | Fixed; only operation is `translate` |
| text | string | - | yes | - | Source text to translate. Accepts expressions. |
| translateFrom | string | `""` | no | - | Source language code (ISO 639-1). Empty means auto-detect. |
| translateTo | string | - | yes | - | Target language code (ISO 639-1). |
| options | object | `{}` | no | - | Additional request options (see LingvaNex API) |

### Options sub-parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| additionalFields | object | `{}` | no | - | Passthrough extra fields to the LingvaNex API body |

Notable: the `translateFrom` parameter auto-detects the source language when left empty — the LingvaNex API detects language when `from` is omitted.

## Runtime behavior

### Input

One or more input items, each carrying a `json` payload. The node reads the `text` parameter (expression or literal) for the string to translate.

### Output

Each input item produces one output item on `main` output 0. The translated text is placed under a property (e.g. `translation`) on the item's `json`. The response from the LingvaNex API includes the translated text and the detected source language code if auto-detection was used.

Shape (approximate):

```json
{
  "translation": "Bonjour le monde",
  "detectedLanguage": "en",
  "text": "Hello world"
}
```

### Errors

- Missing or empty `text` produces an error.
- Invalid or unsupported `translateTo` language code produces an API error.
- Network or authentication failures (wrong API key) produce errors.
- If `continueOnFail` is enabled, the failed item is passed to the error output branch.

### Expressions

`text`, `translateFrom`, `translateTo`, and all option fields accept expression strings.

## Acceptance tests

### Test: basic translate with auto-detect source

**Given** input items:

```json
[{ "json": { "sourceText": "Hello world" } }]
```

**Parameters:**

```json
{
  "text": "={{ $json.sourceText }}",
  "translateTo": "fr"
}
```

**Expect** output[0]:

```json
[{ "json": { "translation": "Bonjour le monde", "detectedLanguage": "en", "sourceText": "Hello world" } }]
```

Translation value must be the French rendering of "Hello world"; `detectedLanguage` must be `"en"`.

### Test: explicit source and target language

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "Guten Morgen",
  "translateFrom": "de",
  "translateTo": "en"
}
```

**Expect** output[0]:

```json
[{ "json": { "translation": "Good morning" } }]
```

### Test: multi-item batch with different texts

**Given** input items:

```json
[
  { "json": { "msg": "Hello" } },
  { "json": { "msg": "Goodbye" } }
]
```

**Parameters:**

```json
{
  "text": "={{ $json.msg }}",
  "translateTo": "es"
}
```

**Expect** output[0]:

```json
[
  { "json": { "translation": "Hola", "msg": "Hello" } },
  { "json": { "translation": "Adiós", "msg": "Goodbye" } }
]
```

Each item is translated independently.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact output property names | inferred from n8n naming conventions | Public n8n docs only state "Translate data" — exact response shape under `json` is not published; should expose translated text and detected language match |
| LingvaNex API translate endpoint details | Public docs (LingvaNex) | The REST API endpoint, request/response format are documented at docs.lingvanex.com |
| Credential schema | Public docs (n8n) | Single API key field |
| Parameter-level option structure | inferred | The original node may use `additionalFields` as a simple key-value passthrough; abstraction level is kept high |

## OpenFlow mapping

- **Definition group:** `AI`
- **Executor file:** `src/lib/engine/executors/LingvaNex.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

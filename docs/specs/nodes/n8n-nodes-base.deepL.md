---
type: n8n-nodes-base.deepL
displayName: DeepL
category: Utility
versions: [1]
priority: medium
status: specced
---

# DeepL

## Sources

| URL | Source class |
|-----|---------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.deepl/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/deepl/ | Public docs only |
| https://developers.deepl.com/docs | Public docs only |
| https://developers.deepl.com/docs/api-reference/translate | Public docs only |
| https://developers.deepl.com/docs/getting-started/supported-languages | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.deepL`
- **Aliases:** `Translate`, `Translator`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `deepLApi` (API key + plan selection: Pro or Free), required

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | `"language"` | `"language"` | yes | Only supported resource. Fixed to `language`. |
| operation | `"translate"` | `"translate"` | yes | Only supported operation. Fixed to `translate`. |
| text | string / expression | — | yes | The UTF-8 text to translate. Accepts an n8n expression referencing incoming item data. |
| translateTo | string / expression | — | yes | Target language code (e.g. `DE`, `FR`, `JA`). Accepts expression. |
| additionalFields.sourceLang | string / expression | — | no | Source language code. If omitted, DeepL auto-detects the source language. |
| additionalFields.splitSentences | `"0"` \| `"1"` \| `"nonewlines"` | `"1"` | no | Controls sentence splitting before translation. `"0"` = no splitting (treat entire input as one sentence). `"1"` = split on punctuation and newlines. `"nonewlines"` = split on punctuation only (default when handling HTML). |
| additionalFields.preserveFormatting | `"0"` \| `"1"` | `"0"` | no | When `"1"`, the translation engine respects original formatting instead of correcting aspects like casing and whitespace. |
| additionalFields.formality | `"default"` \| `"more"` \| `"less"` | `"default"` | no | Controls formality of the target text. `"more"` = formal tone, `"less"` = informal tone. Only supported for certain target languages (DE, FR, IT, ES, NL, JA, PT, RU, ZH, etc.). Using an unsupported language causes an API error unless `"default"` is selected. |

**DeepL API parameters NOT exposed as node-level fields** (available via HTTP Request node for advanced use): `glossary_id`, `glossary_ids`, `context`, `show_billed_characters`, `model_type`, `tag_handling`, `non_splitting_tags`, `splitting_tags`, `ignore_tags`, `outline_detection`, `style_id`, `translation_memory_id`, `translation_memory_threshold`, `custom_instructions`.

## Runtime behavior

### Input

Each incoming item is processed individually. The `text` and `translateTo` parameters typically reference `$json` properties from the input item (e.g. `{{ $json["body"] }}`). If `text` is a static string, every item produces the same output.

### Output

For each input item, one output item is produced on `main` output 0. The output JSON shape matches the DeepL API translation response:

```json
{
  "detected_source_language": "EN",
  "text": "Hallo, Welt!"
}
```

- `detected_source_language`: The language code detected (or the explicitly provided `sourceLang`). Omitted from output if not returned by the API.
- `text`: The translated text string.

Output items preserve all binary data from the input item. The output item's index follows the input item's index (1:1 mapping).

### Errors

- If the DeepL API returns an error (invalid language code, quota exceeded, authentication failure), the node throws and execution stops.
- If `continueOnFail` is enabled (n8n workflow-level option), the failing item is passed through with an `error` property instead of halting.
- Common API errors: 403 (auth failure), 456 (quota exceeded), 400 (invalid parameters like unsupported formality for the target language).

### Expressions

All parameter values accept n8n expression strings. The `text`, `translateTo`, and all `additionalFields` parameters support `{{ $json["..."] }}` style expressions.

## Acceptance tests

### Test: basic translation

**Given** input items:

```json
[{ "json": { "sourceText": "Hello, world!" } }]
```

**Parameters:**

```json
{
  "text": "{{ $json[\"sourceText\"] }}",
  "translateTo": "DE"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "detected_source_language": "EN",
    "text": "Hallo, Welt!"
  },
  "binary": {}
}]
```

### Test: translation with optional fields

**Given** input items:

```json
[{ "json": { "sourceText": "How are you?" } }]
```

**Parameters:**

```json
{
  "text": "{{ $json[\"sourceText\"] }}",
  "translateTo": "FR",
  "additionalFields": {
    "sourceLang": "EN",
    "formality": "less",
    "splitSentences": "1"
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "detected_source_language": "EN",
    "text": "Comment vas-tu ?"
  },
  "binary": {}
}]
```

### Test: auto-detected source language

**Given** input items:

```json
[{ "json": { "sourceText": "Bonjour le monde" } }]
```

**Parameters:**

```json
{
  "text": "{{ $json[\"sourceText\"] }}",
  "translateTo": "EN"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "detected_source_language": "FR",
    "text": "Hello world"
  },
  "binary": {}
}]
```

### Test: invalid language causes error

**Given** input items:

```json
[{ "json": { "sourceText": "Hello" } }]
```

**Parameters:**

```json
{
  "text": "{{ $json[\"sourceText\"] }}",
  "translateTo": "INVALID"
}
```

**Expect:** Node throws an error (HTTP 400 from DeepL API). No output items produced.

### Test: preserve formatting preserves casing

**Given** input items:

```json
[{ "json": { "sourceText": "the QUICK Brown Fox" } }]
```

**Parameters:**

```json
{
  "text": "{{ $json[\"sourceText\"] }}",
  "translateTo": "DE",
  "additionalFields": {
    "preserveFormatting": "1"
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "detected_source_language": "EN",
    "text": "der QUICK braune Fuchs"
  },
  "binary": {}
}]
```

(The `preserveFormatting` option prevents the engine from normalizing casing, so "QUICK" retains its case in the translation.)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Available target/source language codes | public docs | DeepL supports 31 languages (2025). The complete list is documented at https://developers.deepl.com/docs/getting-started/supported-languages. The executor should either maintain a static list or query the `GET /v3/languages` endpoint. |
| DeepL API plan endpoint selection | public docs | Free plan uses `api-free.deepl.com`, Pro plan uses `api.deepl.com`. The credential includes a `plan` selector. |
| Exact behavior of `splitSentences` options | public docs + corpus cross-check | Values match DeepL API spec. |
| Formality language restrictions | public docs | DeepL documents which target languages support formality. The node documentation does not enumerate them explicitly; a static allowlist or API-driven approach is recommended. |
| Output property naming (`detected_source_language`, `text`) | corpus cross-check | These match the DeepL API response structure directly; no transformation is applied. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/deepL.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

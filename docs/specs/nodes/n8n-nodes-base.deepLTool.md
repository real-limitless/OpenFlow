---
type: n8n-nodes-base.deepLTool
displayName: DeepL
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# DeepL (AI Tool)

AI agent tool variant of the DeepL node. Wraps the same Language → Translate operation as `n8n-nodes-base.deepL`, but designed to be called by an AI agent with dynamic parameters supplied at runtime via `$fromAI()`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.deepl/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/deepl/ | Public docs only |
| https://developers.deepl.com/docs | Public docs only |
| https://developers.deepl.com/docs/api-reference/translate | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.deepLTool`
- **Aliases:** `Translate`, `Translator`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `deepLApi` (API key + plan selection: Pro or Free), required
- **Tool-ness:** Registered as `usableAsTool: true` — attachable to an AI Agent root node as a tool. The AI agent model can populate parameters dynamically via `$fromAI()`.

## Parameters

Identical parameter surface to the base `n8n-nodes-base.deepL` node. All parameters support `$fromAI()` expressions so the AI agent can supply values at call time.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | `"language"` | `"language"` | yes | Only supported resource. Fixed to `language`. |
| operation | `"translate"` | `"translate"` | yes | Only supported operation. Fixed to `translate`. |
| text | string / expression | — | yes | The UTF-8 text to translate. In tool mode, typically supplied by the agent via `$fromAI()`. |
| translateTo | string / expression | — | yes | Target language code (e.g. `DE`, `FR`, `JA`). The agent supplies the desired target. |
| additionalFields.sourceLang | string / expression | — | no | Source language code. If omitted, DeepL auto-detects. |
| additionalFields.splitSentences | `"0"` \| `"1"` \| `"nonewlines"` | `"1"` | no | Sentence splitting mode before translation. |
| additionalFields.preserveFormatting | `"0"` \| `"1"` | `"0"` | no | When `"1"`, the engine preserves original formatting instead of correcting casing/whitespace. |
| additionalFields.formality | `"default"` \| `"more"` \| `"less"` | `"default"` | no | Controls formal/informal tone. Only supported for certain target languages (DE, FR, IT, ES, NL, JA, PT, RU, ZH, etc.). |

The following DeepL API parameters are NOT exposed as node-level fields and are not available through the tool: `glossary_id`, `glossary_ids`, `context`, `show_billed_characters`, `model_type`, `tag_handling`, `non_splitting_tags`, `splitting_tags`, `ignore_tags`, `outline_detection`, `style_id`, `translation_memory_id`, `translation_memory_threshold`, `custom_instructions`.

## Runtime behavior

### Input

In AI agent tool mode, the agent model decides the text to translate and the target language. A single item is processed per invocation in typical agent usage. The node processes each incoming item independently.

### Output

Output shape is identical to the base `deepL` node:

```json
{
  "detected_source_language": "EN",
  "text": "Hallo, Welt!"
}
```

- `detected_source_language`: The language code detected (or the explicitly provided `sourceLang`).
- `text`: The translated text string.

Output items preserve all binary data from the input item. The output item's index follows the input item's index (1:1 mapping).

### Errors

- API errors (invalid language code, quota exceeded, auth failure) throw `NodeApiError`.
- `continueOnFail` sends failing items to the error output.
- Common error codes: 403 (auth), 456 (quota exceeded), 400 (invalid parameters).

### Expressions

All parameter values accept n8n expression strings. In tool mode, `$fromAI()` expressions resolve to values supplied by the calling AI agent.

## Acceptance tests

### Test: agent translates text via tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (as populated by `$fromAI()`):
```json
{
  "text": "Hello, world!",
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

### Test: agent supplies optional fields

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (as populated by `$fromAI()`):
```json
{
  "text": "How are you?",
  "translateTo": "FR",
  "additionalFields": {
    "sourceLang": "EN",
    "formality": "less"
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

### Test: agent passes invalid language — error thrown

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters** (as populated by `$fromAI()`):
```json
{
  "text": "Hello",
  "translateTo": "INVALID"
}
```

**Expect:** Node throws `NodeApiError` (HTTP 400). No output items produced.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool parameter surface | public docs + corpus cross-check | Identical to base `deepL` node. The tool variant adds `usableAsTool: true` and `$fromAI()` support. No parameters are added or removed. |
| DeepL API behavior | public docs | See base `n8n-nodes-base.deepL` spec for full API details. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/deepLTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; note `usableAsTool: true` in node definition

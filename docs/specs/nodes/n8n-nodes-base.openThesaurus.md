---
type: n8n-nodes-base.openThesaurus
displayName: OpenThesaurus
category: Utility
versions: [1]
priority: low
status: specced
---

# OpenThesaurus

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.openthesaurus.md | Public docs only |
| https://www.openthesaurus.de/about/api | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.openThesaurus`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none — the OpenThesaurus API requires no authentication)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| text | string | — | yes | — | German word to look up |
| options | collection | {} | no | — | Additional API modifiers |
| options.similar | boolean | false | no | — | Include up to 5 similarly-spelled words (levenshtein distance) in the response |
| options.substring | boolean | false | no | — | Include up to 10 substring matches |
| options.baseform | boolean | false | no | — | Return the base form (lemma) of the search word if it is not already a base form |

The `text` parameter accepts expression strings.

## Runtime behavior

### Input

Each input item is processed independently. The node reads the `text` parameter for the German word to look up. The OpenThesaurus API is a public, read-only HTTP endpoint at `https://www.openthesaurus.de/synonyme/search?q={text}&format=application/json` that requires no credentials.

### Output

Produces one output item per input item. The output preserves the original input and appends a top-level property (named e.g. `synonyms` or the type string prefix) containing the parsed OpenThesaurus API response. The raw API response shape includes:

- `synsets`: array of synonym groups
  - `id`: numeric synset ID
  - `terms`: array of `{ term: string, level: number }` (a term with an optional level/register indicator)
  - `categories`: array of category strings
- `baseform`: present only when `baseform=true` was set and the query word is inflected
- `similar`: similar words array (when `similar=true`)
- `substring`: substring matches array (when `substring=true`)

### Errors

- If `text` is empty or blank, the node throws a `NodeOperationError` with a message indicating the text parameter is required.
- If the HTTP request fails (network error, non-200 status), the node throws a `NodeOperationError`.
- When `continueOnFail` is enabled on the node, errors are caught and an empty output item (or error item) is produced instead of halting execution.

### Expressions

The `text` parameter and all `options` sub-fields accept expression strings.

## Acceptance tests

### Test: look up synonyms for a German word

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "Haus"
}
```

**Expect** output[0] to contain a synonym result object with a `synsets` array where at least one synset contains terms including "Heim", "Behausung", "Bude", "Hütte".

### Test: include similar words

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "Umstant",
  "options": {
    "similar": true
  }
}
```

**Expect** output[0] to include a `similar` array (non-empty) with suggestions such as "Umstand", sorted by levenshtein distance.

### Test: include substring matches

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "Hand",
  "options": {
    "substring": true
  }
}
```

**Expect** output[0] to include a `substring` array with entries containing "Hand" as a substring (e.g. "Handschuh", "Handwerk").

### Test: throw on empty text without continueOnFail

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": ""
}
```

**Expect** the node throws a `NodeOperationError` with a message indicating that the text parameter is empty or required.

### Test: return baseform for inflected word

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "text": "Krankenhäuser",
  "options": {
    "baseform": true
  }
}
```

**Expect** output[0] to include a `baseform` field with value "Krankenhaus".

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and defaults | documented | n8n public docs confirm single text parameter + options collection with similar/substring/baseform |
| API response shape | inferred from OpenThesaurus public API documentation | The n8n docs do not specify the exact output property name; the executor should map `synsets` from the API response into the output |
| Error behavior | inferred | Standard n8n node error handling practices apply |
| Rate limiting | documented (external) | OpenThesaurus API limits to 60 requests/minute per IP — the node should document this indirectly |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.openThesaurus.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

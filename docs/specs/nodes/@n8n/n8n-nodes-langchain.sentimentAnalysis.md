---
type: @n8n/n8n-nodes-langchain.sentimentAnalysis
displayName: Sentiment Analysis
category: Transform
versions: [1, 1.1]
priority: medium
status: specced
---

# Sentiment Analysis

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.sentimentanalysis.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.sentimentAnalysis`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (items with text to analyze)
- **Outputs:** `main` × 1 (input items passed through with added `sentimentAnalysis` object)
- **Credentials:** Requires a connected **Language Model** sub-node on the `ai_languageModel` channel (e.g., OpenAI, Anthropic, Groq, etc.). No direct credentials on this node.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `inputText` | string (expression) | — | yes | Expression referencing the text field to analyze (e.g., `{{ $json.text }}`). Defaults to `text` field if not specified. |
| `options.categories` | string | `Positive, Neutral, Negative` | no | Comma-separated list of sentiment categories for classification. Can be customized for domain-specific analysis (e.g., `Excited, Happy, Neutral, Disappointed, Angry`). |
| `options.systemPromptTemplate` | string (expression) | Built-in default (see docs) | no | Custom system prompt template. Use `{categories}` placeholder for the category list. |
| `options.includeDetailedResults` | boolean | `false` | no | When enabled, output includes `strength` and `confidence` scores (model-generated estimates, not precise measurements). |
| `options.enableAutoFixing` | boolean | `true` | no | When enabled, automatically retries LLM call with schema error context if output parsing fails. |
| `options.batching.batchSize` | number | `5` | no | Max items to process in parallel (rate limiting). |
| `options.batching.delayBetweenBatches` | number (ms) | `0` | no | Delay between batches (rate limiting). |

## Runtime behavior

### Input

Consumes items on the `main` input. Each item must contain a text field (by default `text`, configurable via `inputText` expression) with the content to analyze. Items are processed independently.

### Output

Produces items on `main` output. Each output item preserves all original fields and adds a `sentimentAnalysis` object:

```json
{
  "sentimentAnalysis": {
    "category": "Positive|Neutral|Negative|...",
    "strength": 0.85,
    "confidence": 0.92
  }
}
```

- `category`: Always present. One of the configured categories.
- `strength`: Present only when `includeDetailedResults=true`. A model-estimated score (0–1) indicating intensity within the category.
- `confidence`: Present only when `includeDetailedResults=true`. A model-estimated confidence (0–1) in the classification.

### Errors

- If the connected language model fails or returns unparseable output and `enableAutoFixing` is disabled (or auto-fix also fails), the item errors per standard `continueOnFail` behavior.
- If no language model is connected on `ai_languageModel`, the node throws a configuration error.
- Invalid `inputText` expressions (referencing missing fields) resolve to empty string; the model then classifies empty input.

### Expressions

All string parameters (`inputText`, `systemPromptTemplate`) and boolean/number parameters (`includeDetailedResults`, `enableAutoFixing`, `batchSize`, `delayBetweenBatches`) accept n8n expression syntax for per-item dynamic values.

### Model requirements

- The connected language model **should use temperature ≈ 0** for deterministic, consistent results.
- The model must support structured JSON output (the node provides formatting instructions).
- Performance varies by language; ensure the model supports the input text language.

## Acceptance tests

### Test: basic three-category classification

**Given** input items:
```json
[
  { "json": { "text": "I love this product! It works perfectly." } },
  { "json": { "text": "It's okay, nothing special." } },
  { "json": { "text": "Terrible experience, would not recommend." } }
]
```

**Parameters:**
```json
{
  "inputText": "={{ $json.text }}",
  "options": {
    "categories": "Positive, Neutral, Negative"
  }
}
```

**Expect** output[0] items each contain `sentimentAnalysis.category` ∈ {`Positive`, `Neutral`, `Negative`} matching the semantic sentiment.

### Test: custom categories

**Given** input items:
```json
[{ "json": { "feedback": "The support team was incredibly helpful and fast!" } }]
```

**Parameters:**
```json
{
  "inputText": "={{ $json.feedback }}",
  "options": {
    "categories": "Excited, Happy, Neutral, Disappointed, Angry"
  }
}
```

**Expect** output[0][0].json.sentimentAnalysis.category ∈ {`Excited`, `Happy`, `Neutral`, `Disappointed`, `Angry`} (likely `Excited` or `Happy`).

### Test: detailed results enabled

**Given** input items:
```json
[{ "json": { "text": "This is a moderately good experience." } }]
```

**Parameters:**
```json
{
  "inputText": "={{ $json.text }}",
  "options": {
    "includeDetailedResults": true
  }
}
```

**Expect** output[0][0].json.sentimentAnalysis contains `strength` (number 0–1) and `confidence` (number 0–1) in addition to `category`.

### Test: batch processing

**Given** 12 input items with varying text.

**Parameters:**
```json
{
  "options": {
    "batching": { "batchSize": 3, "delayBetweenBatches": 100 }
  }
}
```

**Expect** all 12 items processed and returned with `sentimentAnalysis` objects; internal batching respects size/delay (not directly observable but no errors).

### Test: auto-fixing on malformed model output

**Given** a language model configured to occasionally return invalid JSON.

**Parameters:**
```json
{
  "options": { "enableAutoFixing": true }
}
```

**Expect** node retries once with error context and produces valid output; if retry also fails, item errors per `continueOnFail`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core parameters & defaults | documented | From public n8n docs and schema files. |
| Output shape (category/strength/confidence) | documented | From public docs and schema `output.json`. |
| Batching behavior | inferred | Parameter names/defaults from schema; exact queuing semantics not in public docs. |
| Auto-fix retry count | inferred | Default `true`; max retries not specified in public docs (assumed 1). |
| Exact system prompt template | documented | Default template described in docs; full text not public. |
| Language model connection semantics | documented | Requires `ai_languageModel` sub-node; standard LangChain cluster pattern. |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/sentimentAnalysis.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
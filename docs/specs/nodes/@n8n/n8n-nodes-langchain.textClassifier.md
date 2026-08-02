---
type: '@n8n/n8n-nodes-langchain.textClassifier'
displayName: Text Classifier
category: AI
versions: [1]
priority: medium
status: specced
---

# Text Classifier

Cluster **root node** that assigns one of a user-defined set of categories to
each incoming text item using a connected language model sub-node. It pairs the
input text with the configured categories, asks the model to pick the best
match, and routes the result so downstream nodes can branch on category.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.text-classifier.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.textClassifier`
- **Aliases:** (none)
- **Inputs:**
  - `main` × 1 — receives the items whose text is to be classified
  - `ai_languageModel` × 1 (required, max 1) — the language model sub-node that performs the classification
- **Outputs:** `main` × 1 by default; `main` × 2 when the "no clear match" option routes unmatched items to an extra **Other** branch
- **Credentials:** none (credentials live on the connected `ai_languageModel` sub-node)
- **Cluster role:** Root node

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `inputPrompt` | string (expression) | `={{ $json.text }}` | yes | The text to classify; usually an expression referencing a field on the incoming item. Defaults to the `text` field. |
| `categories` | collection (name + description) | `[]` | yes | The categories an item can be classified into. Each category has a name and an optional description that explains its meaning to the model. |
| `options.allowMultipleClasses` | boolean | `false` | no | When off, the model outputs a single class per item. When on, the model may select several classes for one item. |
| `options.whenNoClearMatch` | string | `discardItem` | no | What to do when the model finds no good category: `discardItem` (drop the item, default) or `outputExtraBranch` (emit the item on an extra **Other** output branch). |
| `options.systemPromptTemplate` | string | (default template) | no | Override the system prompt used for classification. The `{categories}` placeholder is replaced with the configured category list. |
| `options.enableAutoFixing` | boolean | `false` | no | When on, if the model's reply cannot be parsed into the expected format, the node sends the parse error back to the model and asks it to correct the output. |

## Runtime behavior

### Input

- Consumes items on `main`; each item is processed independently.
- The `inputPrompt` parameter is resolved per item (expression support). The
  resolved value is the text sent to the model for classification.
- The `ai_languageModel` connection is **required**: without a connected model
  sub-node the node cannot run.

### Classification

- The node builds a classification instruction from the configured categories
  (name + description) and substitutes them into the system prompt via the
  `{categories}` placeholder.
- Each input item's text is passed to the connected model with that instruction.
- By default the model must return exactly one chosen category. When multiple
  classes are allowed, the model may return more than one for the same item.

### Output

- At the outcome level each classified item carries the model's chosen
  category (its name and description / label) so downstream nodes can branch on
  the result.
- When `whenNoClearMatch === 'discardItem'`: items with no detected category are
  dropped (no output item produced).
- When `whenNoClearMatch === 'outputExtraBranch'`: items with no detected
  category are emitted on the second output branch (**Other**), one per item.
- OpenFlow baseline wrapper (chain-root convention): the classification result
  is exposed as `json.output` on an item with `pairedItem` pointing back to the
  source item.

### Errors

- No `ai_languageModel` sub-node connected → throw.
- `inputPrompt` resolves to empty / missing → throw.
- Model reply cannot be parsed into the expected category format → parse error.
  With `enableAutoFixing` on, the node retries by asking the model to fix the
  malformed output, up to a bounded number of attempts.
- `continueOnFail` is supported per standard n8n conventions; on failure the
  node emits an error item `{ json: { error: <message> } }` instead of throwing.

### Expressions

- `inputPrompt` supports full n8n expression syntax, resolved against the
  current item.
- Free-text inputs (category descriptions, `options.systemPromptTemplate`)
  accept expression strings; resolution follows standard n8n semantics.

## Acceptance tests

### Test: basic-single-class

**Given** input items:

```json
[{ "json": { "text": "This order was refunded in full." } }]
```

**Parameters:**

```json
{
  "inputPrompt": "={{ $json.text }}",
  "categories": [
    { "name": "refund", "description": "A request for or notice of a refund" },
    { "name": "order", "description": "Anything about placing or tracking an order" }
  ],
  "options": { "allowMultipleClasses": false, "whenNoClearMatch": "discardItem" }
}
```

**Sub-nodes connected:** `ai_languageModel` → a chat model that returns `refund`.

**Expect** output[0] has exactly 1 item whose classification result identifies
the `refund` category (name + description); `pairedItem` points to item 0.
No second output branch exists.

### Test: multiple-classes-allowed

**Given** input items:

```json
[{ "json": { "text": "Cancel my order and issue a refund." } }]
```

**Parameters:** same as the basic test but `options.allowMultipleClasses: true`,
and a model that returns both `refund` and `order`.

**Expect** output[0] has 1 item whose classification result contains **both**
`refund` and `order` categories.

### Test: no-clear-match-discards-item

**Given** input items:

```json
[{ "json": { "text": "The sky looks nice today." } }]
```

**Parameters:** same as the basic test with `whenNoClearMatch: "discardItem"`,
and a model that reports no matching category.

**Expect** output[0] is empty (the item is dropped, not errored).

### Test: no-clear-match-other-branch

**Given** input items:

```json
[{ "json": { "text": "The sky looks nice today." } }]
```

**Parameters:** same as the basic test with `whenNoClearMatch:
"outputExtraBranch"`, and a model that reports no matching category.

**Expect** output[0] is empty; output[1] (the **Other** branch) has 1 item
carrying the original text.

### Test: auto-fixing-malformed-output

**Given** input items:

```json
[{ "json": { "text": "This order was refunded in full." } }]
```

**Parameters:** same as the basic test with `options.enableAutoFixing: true`.

**Sub-nodes connected:** `ai_languageModel` → a chat model that first returns a
value that does not match any configured category name, then returns `refund`
after being asked to fix its output.

**Expect** output[0] has 1 item whose classification result is the `refund`
category — the node recovered from the malformed first reply.

### Test: missing-model-throws

**Given** input items:

```json
[{ "json": { "text": "This order was refunded in full." } }]
```

**Parameters:** same as the basic test.

**Sub-nodes connected:** none (`ai_languageModel` unconnected).

**Expect** the node throws a configuration error indicating a language model is
required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire type string, root-node role, required `ai_languageModel`, `main` in/out | documented | Public docs classify it under cluster root nodes; type string confirmed from public descriptor |
| `inputPrompt` (default `text` field), `categories` (name + description) | documented | Public docs page |
| Allow Multiple Classes To Be True option | documented | Public docs page |
| When No Clear Match: discard item (default) vs extra **Other** branch | documented | Public docs page |
| System Prompt Template with `{categories}` placeholder | documented | Public docs page |
| Enable Auto-Fixing option | documented | Public docs page |
| Exact wire names for parameters (`inputPrompt`, `categories`, option keys) | inferred | Public docs describe the fields; exact wire keys follow n8n conventions (not independently published) |
| Output item shape (which fields carry the chosen category) | inferred | Public docs do not publish the output schema; spec states the outcome contract only |
| Auto-fixing retry count and failure behavior after retries | inferred | Public docs describe the behavior but not internal retry bounds |
| Model prompt mechanics and per-version deltas | inferred | No public delta documentation |
| Output wrapper (`json.output` + `pairedItem`) | inferred | Chain-root convention used by sibling specs; not documented for this node |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster root nodes)
- **Executor file:** `src/lib/engine/executors/langchain-text-classifier.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.textClassifier` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** resolve `inputPrompt` per input item, build the
  classification instruction from `categories` and the `{categories}`-templated
  system prompt, invoke the connected `ai_languageModel` to pick the category
  (respecting `allowMultipleClasses`), and route each item to `main` output 0
  or, for unmatched items, to the **Other** branch or drop it per
  `whenNoClearMatch`. Apply `enableAutoFixing` by asking the model to repair
  unparsable replies. Do **not** load `@n8n/nodes-langchain` packages.

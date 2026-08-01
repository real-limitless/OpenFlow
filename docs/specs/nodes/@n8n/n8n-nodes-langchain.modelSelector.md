---
type: '@n8n/n8n-nodes-langchain.modelSelector'
displayName: Model Selector
category: AI
versions: [1]
priority: medium
status: specced
---

# Model Selector

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.modelselector/ | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.modelSelector`
- **Aliases:** (none)
- **Inputs:** `ai_languageModel` × N (configurable, default 2, min 2, max 10)
- **Outputs:** `ai_languageModel` × 1
- **Credentials:** (none)

The node dynamically creates `ai_languageModel` input ports. The count is set via `numberInputs` (default 2, min 2, max 10). Each input accepts exactly one language model connection.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `numberInputs` | number | 2 | yes | Number of model input connections to expose; min 2, max 10 |
| `rules` | fixedCollection | `{}` | no | Ordered list of routing rules; each rule pairs a filter condition with a model input index |

### Rule structure

Each entry in the `rules.rule` array contains:

| name | type | default | notes |
|------|------|---------|-------|
| `conditions` | filter | `{}` | Structured filter conditions resolved against the input data |
| `modelIndex` | number | 0 | 0-based index of the model input to route to when conditions match |

Rules are evaluated in declaration order. The first rule whose conditions match is selected. If no rule matches, the node throws.

## Runtime behavior

### Input

This is a LangChain sub-node — it receives no independent `main` data input. It sits inside the `ai_languageModel` slot of a parent node (AI Agent, Basic LLM Chain, etc.) and receives workflow data context from the parent.

Filter conditions resolve against the **first item only** (standard sub-node expression resolution). All input items pass through unchanged.

### Output

Input items pass through unmodified on the single `ai_languageModel` output. The selection is observable: each output item carries a `selectedModelIndex` field (integer, 0-based) indicating which model input was selected.

### Errors

- No rule matches any condition → throws `"No matching rule found for the current input"`.
- `modelIndex` is out of range (less than 0 or >= `numberInputs`) → throws `"Configuration error: modelIndex X is out of range (0..M)"`.
- Empty rules array or no rule has conditions → throws `"No matching rule found for the current input"`.
- `numberInputs` is below 2, above 10, negative, or non-finite → throws.
- `continueOnFail` is supported per standard n8n sub-node conventions.

### Expressions

Filter condition `leftValue` and `rightValue` fields accept expression strings (e.g. `={{ $json.field }}`). Expressions resolve against the first input item.

## Acceptance tests

### Test: first-match-wins routing

**Given** `numberInputs = 3` and two rules:
- Rule 0 (no modelIndex): `request_type == "coding"`
- Rule 1 (modelIndex = 2): `request_type == "coding"`

**When** input is `{ "request_type": "coding" }`:

**Expect** rule 0 matches first; output has 1 item with `selectedModelIndex: 0`.

### Test: explicit modelIndex

**Given** `numberInputs = 4` and one rule with `modelIndex = 2` matching `request_type == "reasoning"`:

**When** input is `{ "request_type": "reasoning" }`:

**Expect** output has 1 item with `selectedModelIndex: 2`.

### Test: modelIndex defaults to 0 when omitted

**Given** `numberInputs = 4`, a single rule (no modelIndex) matching `request_type == "general"`:

**When** input is `{ "request_type": "general" }`:

**Expect** output has 1 item with `selectedModelIndex: 0`.

### Test: no matching rule throws

**Given** `numberInputs = 2` and one rule matching `request_type == "coding"`:

**When** input is `{ "request_type": "greeting" }`:

**Expect** node throws `"No matching rule"`.

### Test: modelIndex out of range throws

**Given** `numberInputs = 2` and one rule with `modelIndex = 5` matching `request_type == "coding"`:

**When** input is `{ "request_type": "coding" }`:

**Expect** node throws `"Configuration error: modelIndex 5 is out of range"`.

### Test: sub-node expression resolves first item only

**Given** two input items `[{ "request_type": "special" }, { "request_type": "x" }]` and a rule matching `request_type == "special"`:

**Expect** output preserves both items (rule evaluated against first item only); all items pass through.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter shapes | documented | Public docs describe `numberInputs` and `rules` at a high level; filter condition structure and fixedCollection nesting are standard n8n patterns |
| Input/output types | documented | `ai_languageModel` typed connections are standard for LangChain sub-nodes |
| Rule evaluation order | documented | Public docs confirm sequential evaluation, first-match-wins |
| numberInputs min/max range | inferred from corpus | NPM schema confirms literal set `2..10` |
| Error behavior | inferred | n8n silently skips unconnected inputs; OpenFlow throws on no-match and out-of-range |
| modelIndex 0-based | documented | OpenFlow uses 0-based (default 0); implementation maps from 1-based UI convention |
| Sub-node expression resolution | documented | Public docs confirm sub-nodes resolve expressions against first item only |
| selectedModelIndex annotation | inferred | OpenFlow-specific addition for testability; not present in original n8n node schema |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/langchain-model-selector.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
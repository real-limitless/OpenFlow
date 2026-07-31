---
type: "@n8n/n8n-nodes-langchain.modelSelector"
displayName: Model Selector
category: AI
versions: [1]
priority: medium
status: specced
---

# Model Selector

Cluster **sub-node** that exposes an `ai_languageModel` handle to a root node
(AI Agent). It attaches **one or more** chat-model sub-nodes as inputs and, at
run time, delegates the model channel to exactly one of them by evaluating an
ordered list of rules against the current input data. Typical use: routing by
request type or cost/quality tier, or a fallback path when a primary model
fails.

The selector is configured with a number of input connections
("Number of Inputs") plus a set of **Rules**. Rules are evaluated
**sequentially from first to last** and evaluation **stops at the first match**;
if several rules would match, only the first matching rule takes effect
(**documented**).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.modelselector.md | Public docs only (the URL auto-derived by the docs 404 page; the guessed `core-nodes/@n8n/...` path does not exist) |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent.md | Public docs only |
| Public workflow template exports (n8n template gallery search API + n8n.io workflow pages; templates 7004, 10214, 14449, 7851, 9247, 8138) | Public workflow JSON |

Corpus note: the factory snapshot is of `n8n-nodes-base@2.15.1`, which ships no
langchain descriptor (grep for `modelSelector` returns nothing). No corpus
content was used; the spec rests on public docs + public workflow JSON.

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.modelSelector`
- **Aliases:** (none observed in public exports)
- **Inputs:** `ai_languageModel` × **N** — one connection per attached chat-model
  sub-node (OpenAI, Anthropic, Gemini, …), indexed `0..N-1` where **N** is the
  "Number of Inputs" parameter (**public JSON**: model sub-nodes connect to the
  selector on channel `ai_languageModel` with `index` 0, 1, 2, …).
- **Outputs:** `ai_languageModel` × 1 — connects **into** a root node's Model
  input (AI Agent; also accepted by Basic LLM / Question-Answer root shapes)
  (**public JSON** + root-node docs).
- **Credentials:** none (**documented** — it is a router over connected model
  sub-nodes; each delegated model carries its own credentials).
- **typeVersion:** `1` (**public JSON**; no multi-version deltas documented).

Cluster topology: the selector is a **sub-node**. It has no `main` item
pipeline of its own — the parent root (e.g. AI Agent) drives the model calls,
and the selector merely decides **which** connected model sub-node is used when
the parent asks for the language model handle (**documented** cluster-node model
+ **public JSON**).

## Parameters

UI labels from **public docs**; wire names from **public workflow JSON**.
Parameter names are required for import interoperability, so they are stated
exactly; the nested condition shape mirrors the shared filter/IF condition
format (see `n8n-nodes-base.if` / `n8n-nodes-base.filter` specs).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| numberInputs | number | not documented on the node page (**gap**; exports show explicit values e.g. `4`) | yes (to attach >1 model usefully) | — | **Number of Inputs** — how many `ai_languageModel` input connections the node exposes for attaching language models (**documented**). Setting N also bounds valid `modelIndex` values to `0..N-1`. |
| rules | fixedCollection (`multipleValues`) keyed `rule` | — | yes (to route usefully) | — | **Rules** — ordered list of routing rules evaluated top-down (**documented**). Each rule maps a matching condition set to a model input index. |
| rules.rule[].conditions | filter | `{}` | yes | — | Same comparison-condition set as IF/Filter: a data-type + operator + operands UI (**documented** concept; shared filter wire shape). |
| rules.rule[].modelIndex | number | `0` when omitted (**inferred** from public export: first rule omits it and routes to input 0) | no | — | Index of the `ai_languageModel` input (attached model sub-node) to use when this rule matches (**public JSON**). |

### Condition set wire shape (filter format, shared with IF v2.2)

From public exports, each rule's `conditions` carries the same nested object as
IF/Filter v2:

- `combinator`: `and` \| `or` — combine the condition rows (ALL vs ANY)
  (**documented** UI label; lowercase wire token **public JSON**).
- `conditions[]`: rows of `{ id, operator: { type, operation }, leftValue,
  rightValue }` — type-family (`string`/`number`/`boolean`/…) + operator
  (`equals`, `contains`, `gt`, …), left operand and right operand (**public
  JSON**; operator enums are the shared filter set).
- `options`: `{ version: 2, leftValue, caseSensitive, typeValidation }` — shared
  filter options; `caseSensitive` controls string comparisons, `typeValidation`
  controls strict vs coerced operand typing (**public JSON**).

## Runtime behavior

### Role

1. Expose a **language-model handle** on output channel `ai_languageModel` for
   the parent root to invoke. The selector does **not** emit normal `main`
   items by itself in the cluster pattern (**public JSON** / cluster model).
2. Keep **N** input slots (indexed `0..N-1`), each fed by an attached chat-model
   sub-node; an input slot is "connected" when a model sub-node edges into that
   index (**documented** Number of Inputs + **public JSON**).
3. When the parent requests the model (per run), evaluate `rules` in listed
   order against the incoming data and **stop at the first rule whose condition
   set passes** (**documented** "evaluates rules sequentially, starting from the
   first input, and stops evaluation as soon as it finds a match").
4. Delegate the model call to the connected sub-node on input `modelIndex` of
   the matched rule (**public JSON**). A rule without `modelIndex` routes to
   input **0** (**inferred** from exports).
5. As a **sub-node**, any expression inside rule conditions resolves against the
   **first** input item only, never per-item across a multi-item stream
   (**documented** sub-node parameter-resolution rule).

### Selection semantics

- Rules are compared top-down; the first passing rule wins even if later rules
  would also pass (**documented**).
- The chosen input index is the only model used for the run; the parent sees a
  single model handle, so no extra tooling/memory changes are needed
  (**inferred** from cluster model + delegation design).
- Routing happens per parent invocation, so a selector can pick a different
  model on a later call when the input data changes (**inferred** from
  "during workflow execution … dynamically selects").

### Output

- Connection graph output: `ai_languageModel` → parent.
- No `main`-branch items are produced; the parent's own `main` output (e.g. the
  agent `output`) carries the result of the delegated model call (**public
  JSON** / cluster model).

### Errors

| Condition | Behavior |
|-----------|----------|
| No rule matches the current data | Fail the run. Error text not documented (**inferred**; OpenFlow baseline: descriptive error such as "No matching rule found for the current input"). |
| `modelIndex` refers to an input slot with no attached model (`>= numberInputs` or unconnected) | Fail the run (**inferred**; config error). |
| Rule condition evaluation fails (bad expression / type mismatch under strict validation) | Fail the run, consistent with IF/Filter semantics (**inferred**). |
| `numberInputs` missing / not a positive integer | Fail with a configuration error (**inferred**); treat `0` as "no inputs → any rule match is unsatisfiable". |
| `continueOnFail` | Standard engine behavior: surface the error on the item / continue (**inferred**). |

### Expressions

- Condition operands (`leftValue` / `rightValue`) accept expressions
  (`={{ … }}`), commonly `={{ $json.field }}` (**public JSON** + shared filter
  conventions).
- Sub-node rule: multi-item expressions always use the **first** item
  (**documented**).
- `combinator`, `operator`, `caseSensitive`, `typeValidation`, `modelIndex` are
  configuration, not expression-driven (**inferred**).

## Acceptance tests

These are model-selection fixtures: the executor's selection contract is a
"pick the connected model sub-node handle for the current input" decision, so
tests assert which input index is selected for given parameters + first item.

### Test: first-match-wins routing

**Parameters:**

```json
{
  "numberInputs": 3,
  "rules": {
    "rule": [
      { "conditions": { "combinator": "and", "conditions": [
          { "operator": { "type": "string", "operation": "equals" },
            "leftValue": "={{ $json.request_type }}", "rightValue": "coding" } ] } },
      { "conditions": { "combinator": "and", "conditions": [
          { "operator": { "type": "string", "operation": "equals" },
            "leftValue": "={{ $json.request_type }}", "rightValue": "coding" } ] },
        "modelIndex": 2 }
    ]
  }
}
```

**Given** first input item `{ "request_type": "coding" }`.

**Expect:** selected input index = **0** (rule 1 matches; rule 2 never
evaluated) (**documented** sequential first-match-wins).

### Test: modelIndex routing + omitted-index default

**Parameters:** `numberInputs: 4`; rules `[{ …equals request_type "reasoning"…,
modelIndex: 2 }, { …equals request_type "general"… }]` (second rule has no
`modelIndex`).

**Given** first input item `{ "request_type": "general" }`.

**Expect:** selected input index = **0** (omitted `modelIndex` defaults to 0)
(**public JSON** shape; default **inferred**).

**Given** instead `{ "request_type": "reasoning" }`.

**Expect:** selected input index = **2** (**public JSON**).

### Test: no matching rule → error

**Parameters:** `numberInputs: 2`; one rule `request_type equals "coding"`.

**Given** first input item `{ "request_type": "greeting" }`.

**Expect:** run fails with a "no matching rule" error (**inferred** — not
documented; OpenFlow baseline message must contain "No matching rule").

### Test: modelIndex out of range → error

**Parameters:** `numberInputs: 2`, one rule `request_type equals "coding"` with
`modelIndex: 4`.

**Given** first input item `{ "request_type": "coding" }`.

**Expect:** run fails with a configuration error (index 4 has no connected
model; valid range `0..1`) (**inferred**).

### Test: sub-node first-item expression resolution

**Parameters:** `numberInputs: 2`; rule `request_type equals "special"`.

**Given** input items `[ { "request_type": "special" }, { "request_type": "x" }
]` (two items).

**Expect:** the condition evaluates against the **first** item only → the rule
matches and the selector routes to the selected model; it does **not** evaluate
per item and must not pick a different model for the second item (**documented**
sub-node parameter-resolution rule).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose: dynamic model selection with fallback/routing | documented | Primary docs page |
| Number of Inputs + Rules parameters | documented | Primary docs page |
| Sequential first-match-wins rule evaluation | documented | Primary docs page |
| Sub-node first-item expression rule | documented | Parameter-resolution hint on primary docs page |
| Sub-node role, no main pipeline | public JSON | Cluster model + template exports |
| Wire names `numberInputs`, `rules.rule`, `conditions`, `modelIndex` | public JSON | Template 7004 export (verbatim) |
| Channel name `ai_languageModel` for in/out | public JSON | Template 7004 export; in-repo agent executor resolves it |
| Condition set shape (`combinator`, `operator {type,operation}`, `leftValue/rightValue`, `options.caseSensitive/typeValidation`) | public JSON | Same shared filter format as IF/Filter v2 |
| typeVersion `1` | public JSON | Template 7004 export |
| Omitted `modelIndex` defaults to input 0 | inferred | Export shows first rule omitting it and routing to index 0 |
| No-match behavior (error text, severity) | inferred | Not documented; OpenFlow baseline chosen |
| Out-of-range / unconnected `modelIndex` behavior | inferred | Config-error baseline chosen |
| Whether `numberInputs`/`modelIndex` accept expressions | gap | Not documented; treat as plain config |
| Default `numberInputs` value | gap | Not stated on the docs page |
| Behavior if the selector is ever run standalone (no parent) | gap | Cluster usage is via parent |
| Corpus descriptor | not present | n8n-nodes-base@2.15.1 has no langchain descriptor; grep found nothing |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster sub-nodes)
- **Executor file:** `src/lib/engine/executors/langchain-model-selector.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type
  `@n8n/n8n-nodes-langchain.modelSelector` in `executors/index.ts`
  `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a model handle on
  `ai_languageModel` (inputs indexed `0..numberInputs-1`, resolved from
  connections by index). When the parent invokes the handle, evaluate
  `rules.rule` top-down against the **first** input item using the shared
  filter-condition evaluator (same as IF/Filter), stop at the first passing
  rule, and delegate the call to the connected model sub-node on that rule's
  `modelIndex` (default 0). Fail on no-match or out-of-range index. Do **not**
  load `@n8n/n8n-nodes-langchain` packages.

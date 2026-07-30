---
type: n8n-nodes-base.switch
displayName: Switch
category: Flow
versions: [1, 2, 3]
priority: high
status: specced
---

# Switch

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch.md | Public docs only |
| https://docs.n8n.io/build/flow-logic/split-with-conditionals.md | Public docs only (related) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if.md | Public docs only (shared comparison surface / options labels) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter.md | Public docs only (shared comparison surface / options labels) |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.switch`
- **Aliases (catalog/search):** Router, If, Path, Filter, Condition, Logic, Branch, Case (**inferred** from published descriptor metadata)
- **Display name:** `Switch`
- **Group / category:** `flow` · Core Nodes → Flow (**inferred** descriptor + docs placement)
- **Versions:** `1` (legacy), `2`, `3` (current). **defaultVersion `3`** (**inferred** from versioned descriptor modules)
- **Inputs:** `main` × 1
- **Outputs:** `main` × N (dynamic) — in **Rules** mode one output per routing rule plus an optional extra fallback output; in **Expression** mode `numberOutputs` outputs (**documented**)
- **Credentials:** (none)

## Parameters

### Mode selection

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `rules` | no | — | `rules` (build a matching rule per output) or `expression` (return output index programmatically) (**documented**) |

### Rules mode (`mode: rules`)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| rules | collection | — | yes (to route usefully) | mode=rules | **Routing Rules**: one comparison condition set per output. Each rule exposes a data-type dropdown + operator + operands (same surface as IF/Filter). **Add Routing Rule** appends an output (**documented**). |
| rules[].renameOutput | boolean | `false` | no | mode=rules | **Rename Output** toggle (**documented**) |
| rules[].outputName | string | — | no | mode=rules, renameOutput=true | **Output Name** for the renamed output (**documented**) |
| fallbackOutput | options | `none` | no | mode=rules | **Fallback Output** — how to route items matching no rule: `none` (drop), `extra` (Extra Output), `first` (Output 0) (**documented**) |
| options | collection | `{}` | no | mode=rules | Extra toggles |
| options.ignoreCase | boolean | — | no | mode=rules | **Ignore Case** for string comparisons (**documented**) |
| options.looseTypeValidation | boolean | — | no | mode=rules | **Less Strict Type Validation** — coerce operand types to match the operator (**documented**) |
| options.allMatchingOutputs | boolean | `false` | no | mode=rules | **Send data to all matching outputs** — fan-out to every matching rule vs first only (**documented**) |

### Expression mode (`mode: expression`)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| numberOutputs | number | — | yes | mode=expression | **Number of Outputs** the node exposes (**documented**) |
| output | string (expression) | — | yes | mode=expression | **Output Index** — expression returning a number selecting which output an item routes to (**documented**) |

### Comparison surface (Rules mode, **documented** English labels)

Same operator families as IF / Filter:

**String:** exists, does not exist, is empty, is not empty, is equal to, is not equal to, contains / does not contain, starts with / does not start with, ends with / does not end with, matches regex / does not match regex.

**Number:** exists, does not exist, is empty, is not empty, is equal to, is not equal to, is greater than, is less than, is greater than or equal to, is less than or equal to.

**Date & Time:** exists, does not exist, is empty, is not empty, is equal to, is not equal to, is after, is before, is after or equal to, is before or equal to.

**Boolean:** exists, does not exist, is empty, is not empty, is true, is false, is equal to, is not equal to.

**Array:** exists, does not exist, is empty, is not empty, contains / does not contain, length equal to / not equal to / greater than / less than / greater than or equal to / less than or equal to.

**Object:** exists, does not exist, is empty, is not empty.

Wire tokens for the modern filter-style operators are **not** fully listed in end-user docs (labels only). Public exports use the same nested `operator: { type, operation, … }` + `leftValue` / `rightValue` shape as IF/Filter, one condition set per routing rule (**inferred** public exports / shared filter parameter type).

## Runtime behavior

### Role

Route one item stream into **multiple** branches by evaluating comparison conditions per item — the multi-output counterpart of IF (**documented**). Prefer Switch over IF when more than two outputs are needed (**documented**).

### Input

Items on `main` input 0: `{ json, binary?, pairedItem? }[]`. Each item is evaluated **independently** against the routing rules / output expression (**documented** per-item evaluation).

### Output

**Rules mode:** routing rule `i` corresponds to output index `i`. An item is sent to the output of the **first** matching rule by default; with `options.allMatchingOutputs` on, it is sent to **every** matching output (fan-out) (**documented**). Items matching no rule are governed by `fallbackOutput` (**documented**):

| fallbackOutput | Behavior |
|----------------|----------|
| `none` (default) | Drop non-matching items |
| `extra` | Route non-matching items to an additional extra output (last index) |
| `first` | Route non-matching items to output 0 (same as rule-0 matches) |

**Expression mode:** the `output` expression is evaluated per item and must return a number; the item is routed to that output index (**documented**).

### Errors

- **Rules mode:** invalid/empty rules → no item matches → governed by `fallbackOutput` (**inferred**).
- **Expression mode:** expression returning a non-number, `NaN`, or an out-of-range index → drop or clamp (**inferred**; prefer drop + `continueOnFail` item error).
- Operand expression failures: item fails its rule or node errors per engine `continueOnFail` (**inferred**).
- Strict type validation failures: error or rule-non-match depending on the loose-type flag (**inferred** from Filter docs).

### Expressions

- **Expression mode** requires the `output` parameter to be an expression (`={{ … }}`) (**documented**).
- **Rules mode** operands commonly use expressions (`{{ $json.field }}`) (**inferred** public exports + general expression docs). Mode/operator enums are not expression-driven.

## Acceptance tests

### Test: two rules route, fallback none

**Given** input items:

```json
[
  { "json": { "type": "a" } },
  { "json": { "type": "b" } },
  { "json": { "type": "c" } }
]
```

**Parameters:**

```json
{
  "mode": "rules",
  "rules": {
    "rules": [
      { "conditions": { "combinator": "and", "conditions": [
        { "leftValue": "={{ $json.type }}", "rightValue": "a", "operator": { "type": "string", "operation": "equals" } }
      ] } },
      { "conditions": { "combinator": "and", "conditions": [
        { "leftValue": "={{ $json.type }}", "rightValue": "b", "operator": { "type": "string", "operation": "equals" } }
      ] } }
    ]
  },
  "fallbackOutput": "none"
}
```

**Expect:** `output[0]` = `[{ "type": "a" }]`; `output[1]` = `[{ "type": "b" }]`; item `c` dropped.

### Test: fallback extra output

**Given** the same items as above.

**Parameters:** same as above but `"fallbackOutput": "extra"`.

**Expect:** `output[0]` = `[{ "type": "a" }]`; `output[1]` = `[{ "type": "b" }]`; `output[2]` (extra) = `[{ "type": "c" }]`.

### Test: fallback output 0

**Given** the same items as above.

**Parameters:** same as above but `"fallbackOutput": "first"`.

**Expect:** `output[0]` = `[{ "type": "a" }, { "type": "c" }]`; `output[1]` = `[{ "type": "b" }]`.

### Test: all matching outputs fan-out

**Given** input items:

```json
[{ "json": { "n": 10 } }]
```

**Parameters:**

```json
{
  "mode": "rules",
  "rules": {
    "rules": [
      { "conditions": { "combinator": "and", "conditions": [
        { "leftValue": "={{ $json.n }}", "rightValue": 5, "operator": { "type": "number", "operation": "gt" } }
      ] } },
      { "conditions": { "combinator": "and", "conditions": [
        { "leftValue": "={{ $json.n }}", "rightValue": 20, "operator": { "type": "number", "operation": "lt" } }
      ] } }
    ]
  },
  "options": { "allMatchingOutputs": true }
}
```

**Expect:** `output[0]` = `[{ "n": 10 }]` and `output[1]` = `[{ "n": 10 }]` (item sent to all matching outputs).

### Test: ignore case on string rule

**Given** input items:

```json
[{ "json": { "status": "OK" } }]
```

**Parameters:** rule string `status` equal to `"ok"`, `options.ignoreCase: true`.

**Expect:** item matches → `output[0]` length 1. With `ignoreCase: false` → no match → governed by `fallbackOutput` (**documented** option).

### Test: expression mode routes by index

**Given** input items:

```json
[
  { "json": { "i": 0 } },
  { "json": { "i": 1 } }
]
```

**Parameters:**

```json
{
  "mode": "expression",
  "numberOutputs": 2,
  "output": "={{ $json.i }}"
}
```

**Expect:** `output[0]` = `[{ "i": 0 }]`; `output[1]` = `[{ "i": 1 }]`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Mode = rules / expression | documented | Docs "Node parameters" |
| Fallback Output enum (none / extra / output 0) | documented | Docs "Rule options" |
| allMatchingOutputs fan-out vs first-only | documented | Docs "Send data to all matching outputs" |
| ignoreCase / looseTypeValidation options | documented | Docs "Rule options" |
| Comparison operator label list per data type | documented | Docs per-type sections |
| Output = one per rule (+ optional extra) | documented | Docs "Routing Rules" |
| Expression mode: numberOutputs + output expr | documented | Docs "Expression" |
| Aliases (Router, If, Path, …) | inferred | Published descriptor metadata |
| Versions 1/2/3 + defaultVersion 3 | inferred | Versioned descriptor modules |
| Modern filter wire tokens (`gt`, `equals`, operator object) | inferred | Docs use labels; tokens from public exports / shared filter type |
| Nested `rules.rules[]` + per-rule `conditions` shape | inferred | Public workflow JSON / shared filter parameter type |
| Out-of-range / non-number expression index handling | inferred | Not specified in end-user docs |
| Exact coercion / regex / date parse rules | inferred | Not fully specified in end-user docs |

## OpenFlow mapping

- **Definition group:** `flow` (`src/lib/nodes/definitions/flow.ts` → `switchNode`)
- **Executor file:** `src/lib/engine/executors/switch.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Registry:** wire type `n8n-nodes-base.switch` → `switchExecutor`
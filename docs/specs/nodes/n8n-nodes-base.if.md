---
type: n8n-nodes-base.if
displayName: IF
category: Flow
versions: [1, 2, 2.1, 2.2, 2.3]
priority: high
status: specced
---

# IF

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if.md | Public docs only |
| https://docs.n8n.io/build/flow-logic/split-with-conditionals.md | Public docs only (related) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter.md | Public docs only (shared comparison surface / options labels) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch.md | Public docs only (related multi-branch) |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.if`
- **Aliases (catalog/search):** Router, Filter, Condition, Logic, Boolean, Branch (**inferred** from published descriptor metadata)
- **Display name:** `If` (docs) / commonly shown as **IF**
- **Group / category:** `transform` · Core Nodes → Flow (**inferred** descriptor + docs placement)
- **Versions:** `1` (legacy fixedCollection conditions); `2`, `2.1`, `2.2`, `2.3` (filter-style conditions). **defaultVersion `2.3`** (**inferred** descriptor)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 2 — **outputNames:** `true` (index **0**), `false` (index **1**) (**documented** branching; names **inferred** descriptor)
- **Credentials:** (none)

## Parameters

### typeVersion ≥ 2 (current)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| conditions | `filter` | `{}` | yes (to branch usefully) | — | Comparison condition set. UI: data-type dropdown + operator + operands; **Add condition** adds more. Between conditions: **AND** (all) or **OR** (any) (**documented**). Nested wire shape is versioned (**inferred**). |
| looseTypeValidation | boolean | `false` | no | show when `@version` ≥ **2.1** | **Convert types where required** — coerce operand types to match the operator when on (**documented** Filter option wording; IF descriptor key) |
| options | collection | `{}` | no | — | Extra toggles |
| options.ignoreCase | boolean | `true` | no | — | **Ignore Case** for string comparisons (**documented** on Filter; same option name on IF descriptor) |
| options.looseTypeValidation | boolean | `true` | no | show when `@version` **&lt; 2.1** | Pre-2.1 home for type coercion toggle (**inferred** descriptor `displayOptions`) |

**Filter typeOptions (behavioral flags, not separate wire keys):** case sensitivity is driven by `!options.ignoreCase`; type validation is `loose` vs `strict` from the versioned loose-type flag; internal filter condition schema version steps with node version (v2 → filter v1, v2.2 → filter v2, v2.3 → filter v3) (**inferred** descriptor expressions only — implementers treat as compatibility knobs, not copy algorithm source).

### typeVersion 1 (legacy)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| conditions | fixedCollection (`multipleValues`, sortable) | `{}` | yes | — | One or more typed condition rows under keys `boolean` \| `dateTime` \| `number` \| `string` |
| conditions.\*.value1 | boolean / dateTime / number / string | type-dependent (`false` / `""` / `0`) | yes | — | Left operand |
| conditions.\*.operation | options | type-dependent | yes | — | See legacy operator enums below |
| conditions.\*.value2 | same family as value1 | type-dependent | when op needs RHS | hide for empty ops; string regex ops show as “Regex” | Right operand |
| combineOperation | options | `all` | no | — | `all` = ALL conditions (AND); `any` = ANY condition (OR) |

#### Legacy v1 operator enums (**inferred** descriptor)

| Type key | Operators (`value`) | Default op |
|----------|---------------------|------------|
| `boolean` | `equal`, `notEqual` | `equal` |
| `dateTime` | `after`, `before` | `after` |
| `number` | `smaller`, `smallerEqual`, `equal`, `notEqual`, `larger`, `largerEqual`, `isEmpty`, `isNotEmpty` | `smaller` |
| `string` | `contains`, `notContains`, `endsWith`, `notEndsWith`, `equal`, `notEqual`, `regex`, `notRegex`, `startsWith`, `notStartsWith`, `isEmpty`, `isNotEmpty` | `equal` |

### Comparison surface (typeVersion ≥ 2, **documented** English labels)

Same families as Filter:

**String:** exists, does not exist, is empty, is not empty, is equal to, is not equal to, contains / does not contain, starts with / does not, ends with / does not, matches regex / does not.

**Number:** exists/empty family, equal/not, greater than, less than, greater/less than or equal to.

**Date & Time:** exists/empty family, equal/not, is after / before, after or equal / before or equal.

**Boolean:** exists/empty family, is true / is false, equal/not.

**Array:** exists/empty, contains/not, length equal/not/gt/lt/gte/lte.

**Object:** exists, does not exist, is empty, is not empty.

Wire tokens for modern filter operators are **not** fully listed in end-user docs (labels only). Common public export shapes use nested `operator: { type, operation, … }` plus `leftValue` / `rightValue`, with a sibling `combinator`: `and` \| `or` (**inferred** public exports / filter parameter type). OpenFlow may also accept a simplified list shape for dogfood (see Acceptance tests).

## Runtime behavior

### Role

Split one item stream into **two** branches by evaluating comparison conditions per item (**documented**). Prefer **Switch** when more than two outputs are needed (**documented**).

### Input

Items on `main` input 0: `{ json, binary?, pairedItem? }[]`. Each item is evaluated **independently**.

### Output

| Index | Name | Contents |
|------:|------|----------|
| 0 | `true` | Items for which the combined conditions succeed |
| 1 | `false` | Items for which they fail |

Items are **routed**, not dropped (unlike Filter, which omits non-matches) (**documented** contrast).

### Combining conditions

- **AND / ALL:** item goes true only if every condition passes (**documented**).
- **OR / ANY:** item goes true if at least one condition passes (**documented**).
- Docs describe choosing AND or OR in the dropdown between conditions (v2 UI). Legacy v1 uses `combineOperation`: `all` \| `any`. Mixing AND and OR in one rule set is disallowed on Filter; IF exposes a single combinator for the set (**documented** / **inferred**).

### Options behavior

- **Ignore case:** when on, string comparisons ignore letter case (**documented** Filter option; IF shares the option).
- **Loose / convert types:** when on, attempt coercion so operand types match the operator; when off, type mismatches surface as wrong-type style errors (**documented** Filter option wording).

### Historical Merge interaction (**documented**, legacy execution order)

On product versions **0.236.0 and below** / **v0 (legacy) workflow execution order**, pairing IF with **Merge** could cause **both** IF branches to run (Merge pulling the other stream). Removed as default behavior in product **1.0+**. OpenFlow should **not** reproduce that double-execution as default.

### Errors

- Empty / missing conditions: treat as no pass → all items on **false**, or no-op empty true (**inferred**; prefer all-false for safety).
- Expression failures on operands: item fails the condition or node errors per engine `continueOnFail` (**inferred**).
- Strict type validation failures: error or false branch depending on loose-type flag (**inferred** from Filter docs).

### Expressions

Condition operands commonly use expressions (`={{ $json.field }}`, `{{ … }}`) (**inferred** public exports + general expression docs). Combinator / operation enums are not expression-driven (`noDataExpression` on legacy ops).

## Acceptance tests

### Test: number greater-than → true (simplified v2-style)

**Given** input items:

```json
[{ "json": { "value": 10 } }]
```

**Parameters:**

```json
{
  "conditions": {
    "combinator": "and",
    "conditions": [
      {
        "leftValue": "={{ $json.value }}",
        "rightValue": 5,
        "operator": { "type": "number", "operation": "gt" }
      }
    ]
  },
  "options": { "ignoreCase": true }
}
```

**Expect:** `output[0]` length 1 (same item); `output[1]` length 0

### Test: number greater-than → false

**Given** `{ "json": { "value": 3 } }` with the same parameters as above.

**Expect:** `output[0]` length 0; `output[1]` length 1

### Test: string equals (case)

**Given** `{ "json": { "status": "OK" } }`

**Parameters:** string equal to `"ok"`, `options.ignoreCase: true`

**Expect:** true branch when ignore-case on; false when ignore-case off (**documented** option)

### Test: AND combinator

**Given** `{ "json": { "a": 10, "b": 20 } }`

**Parameters:** `a > 5` AND `b > 15`, combinator `and`

**Expect:** true branch

### Test: OR combinator

**Given** `{ "json": { "a": 3, "b": 20 } }`

**Parameters:** `a > 5` OR `b > 15`, combinator `or`

**Expect:** true branch

### Test: legacy v1 number + combineOperation all

**Given** `{ "json": { "n": 3 } }`

**Parameters:**

```json
{
  "conditions": {
    "number": [
      { "value1": "={{ $json.n }}", "operation": "larger", "value2": 5 }
    ]
  },
  "combineOperation": "all"
}
```

**Expect:** false branch (`3` is not larger than `5`)

### Test: multi-item split

**Given:**

```json
[
  { "json": { "value": 1 } },
  { "json": { "value": 10 } },
  { "json": { "value": 5 } }
]
```

**Parameters:** number `value` greater than `5`

**Expect:** true: only `{ value: 10 }`; false: `{ value: 1 }`, `{ value: 5 }` (order preserved **inferred**)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| True = out0, false = out1 | documented + inferred names | Branching documented; `outputNames` from descriptor |
| Comparison label list | documented | Full English operator list on IF + Filter pages |
| Modern filter wire tokens (`gt`, `equals`, operator object) | inferred | Docs use labels; tokens from public exports / filter UI type |
| Nested `conditions.conditions` + `combinator` | inferred | Public workflow JSON / filter parameter type |
| v1 `combineOperation` `all`/`any` and op enums | inferred | Published descriptor metadata |
| `looseTypeValidation` placement (top-level ≥2.1 vs options &lt;2.1) | inferred | Descriptor `displayOptions` |
| `options.ignoreCase` default `true` | inferred | Descriptor default |
| Exact coercion / regex / date parse rules | inferred | Not fully specified in end-user docs |
| Legacy IF+Merge double-run | documented | Historical; not OpenFlow default |
| OpenFlow simplified `operator: "gt"` string form | OpenFlow dogfood | Accept for compatibility with in-tree samples; prefer nested operator object for import fidelity |

## OpenFlow mapping

- **Definition group:** `flow` (`src/lib/nodes/definitions/flow.ts` → `ifNode`)
- **Executor file:** `src/lib/engine/executors/if.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Registry:** wire type `n8n-nodes-base.if` → `ifExecutor`

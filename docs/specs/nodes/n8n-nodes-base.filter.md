---
type: n8n-nodes-base.filter
displayName: Filter
category: Transform
versions: [1, 2, 2.1, 2.2, 2.3]
priority: high
status: specced
---

# Filter

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter.md | Public docs only |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.filter`
- **Aliases:** (none)
- **Display name:** `Filter`
- **Group / category:** `transform` · Core Nodes
- **Versions:** `1`; modern line `2` / `2.1` / `2.2` / `2.3` (`defaultVersion` **2.3** — **inferred** from published descriptor)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1 — items that **meet** the conditions are passed through; items that do not are **omitted** (no false branch) (**documented**)
- **Output labels (descriptor):** `Kept` (and a second label `Discarded` may appear in published metadata) — **runtime remains single-output drop** per public docs; dual-output discard branch is **not** documented end-user behavior (**gap**)
- **Credentials:** (none)

## Parameters

### typeVersion 2+ (current)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| conditions | `filter` (special UI / wire object) | `{}` | yes | — | Comparison set: data type + operator + operands. Nested shape holds condition rows and AND/OR combinator (**documented** concept; wire nesting **inferred** from public exports / descriptor `type: filter`) |
| looseTypeValidation | boolean | `false` | no | `@version` ≥ **2.1** | Top-level “Convert types where required” / less-strict casting (**documented** option; wire name **inferred** from descriptor) |
| options | collection | `{}` | no | — | Nested options below |
| options.ignoreCase | boolean | `true` | no | — | Ignore letter case when comparing strings (**documented**; default **inferred**) |
| options.looseTypeValidation | boolean | `true` | no | `@version` **&lt; 2.1** only | Same casting intent as top-level flag on older 2.x (**documented** option; placement **inferred**) |

**Combinator (AND / OR):** Public docs place AND/OR **between** conditions (all vs any). No mix of AND and OR in one rule set (**documented**). On v2 wire this is typically stored **inside** the `conditions` filter object as `combinator`: `and` \| `or` (lowercase) rather than a separate top-level parameter (**inferred** from public export shapes; v1 uses top-level `combineConditions`).

### typeVersion 1 (legacy)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| conditions | fixedCollection (`multipleValues`) | `{}` | yes | — | Typed rows: `boolean` \| `dateTime` \| `number` \| `string` (**inferred** descriptor) |
| conditions.\*.value1 | varies by type | type default | yes | — | Left operand |
| conditions.\*.operation | options | type-specific | yes | — | See v1 operator tokens below |
| conditions.\*.value2 | varies by type | type default | when op needs RHS | hide for empty ops | Right operand |
| combineConditions | options | `AND` | no | — | Enum: `AND`, `OR` (**inferred** descriptor; same all/any meaning as docs) |

#### v1 operator wire tokens (**inferred** descriptor)

| Data type | `operation` values |
|-----------|-------------------|
| boolean | `equal`, `notEqual` |
| dateTime | `after`, `before` |
| number | `smaller`, `smallerEqual`, `equal`, `notEqual`, `larger`, `largerEqual`, `isEmpty`, `isNotEmpty` |
| string | `contains`, `notContains`, `endsWith`, `notEndsWith`, `equal`, `notEqual`, `regex`, `notRegex`, `startsWith`, `notStartsWith`, `isEmpty`, `isNotEmpty` |

### Comparison surface (documented — all modern versions)

English labels from public docs. Implementers map labels → wire tokens (v1 table above; v2 often uses nested `operator: { type, operation }` — **inferred**).

**String:** exists, does not exist, is empty, is not empty, is equal to, is not equal to, contains, does not contain, starts with, does not start with, ends with, does not end with, matches regex, does not match regex.

**Number:** exists, does not exist, is empty, is not empty, is equal to, is not equal to, is greater than, is less than, is greater than or equal to, is less than or equal to.

**Date & Time:** exists, does not exist, is empty, is not empty, is equal to, is not equal to, is after, is before, is after or equal to, is before or equal to.

**Boolean:** exists, does not exist, is empty, is not empty, is true, is false, is equal to, is not equal to.

**Array:** exists, does not exist, is empty, is not empty, contains, does not contain, length equal to, length not equal to, length greater than, length less than, length greater than or equal to, length less than or equal to.

**Object:** exists, does not exist, is empty, is not empty.

> v1 fixedCollection only exposes a subset of the modern type/operator matrix (no array/object rows; fewer boolean/date ops) — **inferred** from descriptor vs full docs list.

## Runtime behavior

### Role

Keep only items that satisfy the configured comparison conditions; drop the rest. Unlike **IF**, Filter does **not** route failures to a second branch (**documented**).

### Input

Items on `main` index 0: `{ json, binary?, pairedItem? }[]`. Evaluate **each item independently**.

### Condition evaluation

1. Resolve left/right operands (literal or expression) in the item context.
2. Apply the selected type-aware comparison.
3. Combine multiple conditions with **AND** (all must pass) or **OR** (any may pass) (**documented**).
4. If the combined result is true → include the original item on output 0 (preserve `json` / `binary` / pairing). If false → omit the item.

### Options

- **Ignore Case:** when on, string comparisons are case-insensitive; when off, case-sensitive (**documented**).
- **Less Strict Type Validation / Convert types where required:** when on, attempt to coerce expression/value types to match the operator (mitigates “wrong type:” failures); when off, strict typing (**documented**).

### Output

- **output[0]:** ordered subset of input items that passed (stable relative order **inferred**).
- Non-matching items: **not** emitted on any output (**documented**).
- Empty input or zero matches → empty array on output 0 (not an error) (**inferred**).

### Errors

- Type mismatch under strict validation → node error mentioning wrong type; users enable less-strict validation (**documented**).
- Invalid / incomplete condition rows → treat as non-match or raise — **gap** (prefer fail-soft non-match only if product UI allows empty conditions).
- Expression evaluation failures on operands — **inferred** engine policy (fail item/node vs non-match).
- `continueOnFail`: follow global engine policy; Filter itself has no special fail output (**inferred**).

### Expressions

Condition operands commonly accept expressions (`={{ $json.field }}`) (**inferred** from general expression docs and public workflow exports). Combinator / operator enums are not expression-driven (`noDataExpression` style) (**inferred**).

## Acceptance tests

### Test: keep matching only

**Given** input items:

```json
[
  { "json": { "status": "ok" } },
  { "json": { "status": "fail" } },
  { "json": { "status": "ok" } }
]
```

**Parameters** (simplified / OpenFlow-friendly condition rows):

```json
{
  "conditions": {
    "combinator": "and",
    "conditions": [
      {
        "leftValue": "={{ $json.status }}",
        "rightValue": "ok",
        "operator": "equals"
      }
    ]
  }
}
```

**Expect** output[0]:

```json
[
  { "json": { "status": "ok" } },
  { "json": { "status": "ok" } }
]
```

### Test: none match → empty

**Given** all items `{ "status": "fail" }`, same equals-`ok` condition.

**Expect** output[0]: `[]`

### Test: AND requires all

**Given** `{ "json": { "a": 10, "b": 5 } }`

**Parameters:** `a > 5` AND `b > 15`, combinator `and`.

**Expect** output[0]: `[]`

### Test: OR keeps either

**Given** `{ "json": { "a": 3, "b": 20 } }`

**Parameters:** `a > 5` OR `b > 15`, combinator `or`.

**Expect** output[0] length 1 (same item).

### Test: ignore case (string)

**Given** `{ "json": { "name": "Alice" } }`

**Parameters:** string equals right `"alice"`, `options.ignoreCase: true`.

**Expect** item kept.

**Parameters:** same with `options.ignoreCase: false`.

**Expect** item omitted.

### Test: v1 combineConditions wire

**Given** mixed items; typeVersion `1` with `combineConditions: "OR"` and two string/number rows using v1 `operation` tokens (`equal`, `larger`, …).

**Expect** union of matches on output[0] only.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Single output; drop non-matches | documented | Primary contract |
| AND/OR; no mix | documented | |
| Full comparison label lists | documented | |
| Ignore case + less-strict typing | documented | |
| Parameter names `conditions`, `options.ignoreCase`, `looseTypeValidation`, v1 `combineConditions` | inferred | Published descriptor / exports |
| Defaults (`ignoreCase: true`, loose flags) | inferred | Descriptor |
| typeVersions 2–2.3 / default 2.3 | inferred | Descriptor |
| Nested v2 `conditions.conditions[]` + `operator: { type, operation }` | inferred | Common public export shape; normalize in executor |
| v2 operator string tokens (`equals` vs `equal`) | inferred | Prefer accepting both OpenFlow-simplified and export shapes |
| `outputNames: Kept/Discarded` vs single output | gap | Follow docs (omit); do not invent second branch unless exports prove dual `main` |
| Empty conditions list | gap | Pass-all vs pass-none |
| Array/object operator semantics details | partial | Labels documented; edge cases inferred |
| OpenFlow `mode` / `expression` params | non-standard | Not in public Filter docs; keep only if treated as OpenFlow extension, not wire-compat |

## OpenFlow mapping

- **Definition group:** `transform` (`src/lib/nodes/definitions/transform.ts` → `filter`)
- **Executor file:** `src/lib/engine/executors/filter.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Related specs:** IF (`n8n-nodes-base.if`) shares the comparison surface but **two** outputs (true/false)

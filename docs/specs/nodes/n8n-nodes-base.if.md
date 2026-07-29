---
type: n8n-nodes-base.if
displayName: IF
category: Flow
versions: [1, 2]
priority: high
status: specced
---

# IF

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if.md | Public docs only |
| https://docs.n8n.io/build/flow-logic/split-with-conditionals.md | Public docs only (related) |

## Wire format

- **Type string:** `n8n-nodes-base.if`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 2 (true = index 0, false = index 1) (**documented** branching)
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| conditions | collection / fixedCollection | | yes | — | Comparison conditions; structure varies by version (**documented** concept) |
| combinator | options | `and` | no | — | AND = all; OR = any (**documented**) |

### Comparison surface (documented)

**String:** exists, does not exist, is empty, is not empty, equal / not equal, contains / not, starts/ends with, regex match/not.

**Number:** exists/empty family, equal/not, gt, lt, gte, lte.

**Date & Time:** exists/empty family, equal/not, after/before (+ or equal).

**Boolean:** exists/empty family, is true/false, equal/not.

**Array:** exists/empty, contains/not, length equal/not/gt/lt/gte/lte.

**Object:** exists, does not exist, is empty, is not empty.

## Runtime behavior

### Input

Items on main 0; each item evaluated independently.

### Output

- **output[0] (true):** items meeting combined conditions  
- **output[1] (false):** items that do not  

Combinator AND/OR as documented. Cannot mix AND and OR in a single Filter-style rule set is stated for Filter; IF uses dropdown between conditions (**documented** AND/OR choice).

### Errors

Missing condition fields → treat as non-match or no-op (**inferred**). Expression errors in left/right values (**inferred**).

### Expressions

Condition operands commonly expressions (`={{ $json.value }}`) (**inferred** from public exports / general expression docs; UI supports expressions).

## Acceptance tests

### Test: greater than → true

**Given** input items:

```json
[{ "json": { "value": 10 } }]
```

**Parameters:**

```json
{
  "conditions": [
    { "leftValue": "={{ $json.value }}", "rightValue": "5", "operator": "gt" }
  ],
  "combinator": "and"
}
```

**Expect:** output[0] length 1, output[1] length 0

### Test: greater than → false

**Given** `{ "value": 3 }` same condition

**Expect:** output[0] length 0, output[1] length 1

### Test: equals string

**Given** `{ "status": "ok" }`, operator equals, right `"ok"`

**Expect:** true branch

### Test: contains

**Given** `{ "text": "hello world" }`, contains `"world"`

**Expect:** true branch

### Test: AND combinator

**Given** `{ "a": 10, "b": 20 }`, a>5 AND b>15

**Expect:** true branch

### Test: OR combinator

**Given** `{ "a": 3, "b": 20 }`, a>5 OR b>15

**Expect:** true branch

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire operator tokens (`gt`, `equals`) | inferred | Docs use English labels |
| Nested `conditions.conditions` shape | inferred | Versioned UI export shapes |
| Legacy v0 merge double-execution | documented | Historical; not OpenFlow default |

## OpenFlow mapping

- **Definition group:** `flow`
- **Executor file:** `src/lib/engine/executors/if.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

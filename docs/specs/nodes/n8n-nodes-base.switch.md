---
type: n8n-nodes-base.switch
displayName: Switch
category: Flow
versions: [1, 3]
priority: high
status: specced
---

# Switch

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.switch`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × N (dynamic; one per rule, plus optional fallback) (**documented**)
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `rules` | no | — | **Rules** or **Expression** (**documented**) |
| rules / routing rules | collection | | if rules | mode=rules | Per-output comparison conditions; optional rename output (**documented**) |
| fallbackOutput | options | `none` | no | mode=rules | None (drop), Extra Output, or Output 0 (**documented**) |
| options.ignoreCase | boolean | | no | rules | (**documented**) |
| options.looseTypeValidation | boolean | | no | rules | (**documented**) |
| options.allMatchingOutputs | boolean | false | no | rules | Send to all matching outputs vs first only (**documented**) |
| numberOutputs | number | | if expression | mode=expression | How many outputs (**documented**) |
| output | string/number expr | | if expression | mode=expression | Expression returning output index (**documented**) |

Comparison operators: same documented families as IF/Filter.

## Runtime behavior

### Input

Items on main 0; evaluate per item.

### Output

**Rules mode:** each routing rule corresponds to an output. Matching items go to that output. Fallback handles non-matches (drop / extra output / first output) (**documented**). Optional multi-match fan-out (**documented**).

**Expression mode:** expression returns numeric output index for each item (**documented**).

### Errors

Invalid output index → drop or clamp (**inferred**).

### Expressions

Expression mode requires expression; rule operands may use expressions (**documented** / **inferred**).

## Acceptance tests

### Test: two rules route

**Given** items `{ "type": "a" }`, `{ "type": "b" }`, `{ "type": "c" }`

**Parameters (conceptual rules mode):** rule0 type equals a; rule1 type equals b; fallback none

**Expect:** out0 has a; out1 has b; c dropped

### Test: fallback extra

**Same** with fallback extra output

**Expect:** c on last/extra output

### Test: expression index

**Mode** expression, 2 outputs, expression `={{ $json.i }}` with items i=0 and i=1

**Expect:** each item on corresponding output index

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact rules JSON shape | inferred | Versioned exports |
| Output naming in connections | inferred | Rename Output UI |

## OpenFlow mapping

- **Definition group:** `flow`
- **Executor file:** `src/lib/engine/executors/switch.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

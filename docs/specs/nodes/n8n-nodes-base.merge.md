---
type: n8n-nodes-base.merge
displayName: Merge
category: Flow
versions: [3]
priority: high
status: specced
---

# Merge

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge.md | Public docs only |

## Parameters

| mode | append / combine / chooseBranch |
| combineBy | combineByFields / combineByPosition / combineAll |
| fieldsToMatchString | comma fields |
| numberInputs | ≥2 |
| options.includeUnpaired | boolean |

## Runtime behavior

Waits for connected inputs (engine multi-input). Append concatenates. Combine merges by field/position/cartesian. Choose branch picks one input index.

## Acceptance tests

### Append

Input0 [a], Input1 [b] → [a,b]

### Combine by field language

See public docs example (name+greeting).

## OpenFlow mapping

- `src/lib/engine/executors/merge.ts`

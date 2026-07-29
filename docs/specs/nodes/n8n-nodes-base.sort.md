---
type: n8n-nodes-base.sort
displayName: Sort
category: Transform
versions: [1]
priority: high
status: specced
---

# Sort

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sort.md | Public docs only |

## Parameters

| type | simple / random |
| fieldName | field to sort |
| order | ascending / descending |

## Acceptance tests

### Ascending numbers

items n=3,1,2 → 1,2,3

### Descending strings

name c,a,b → c,b,a

## OpenFlow mapping

- `src/lib/engine/executors/sort.ts`

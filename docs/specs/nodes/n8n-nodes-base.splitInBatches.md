---
type: n8n-nodes-base.splitInBatches
displayName: Loop Over Items
category: Flow
versions: [1, 3]
priority: high
status: specced
---

# Loop Over Items (Split in Batches)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches.md | Public docs only |

## Parameters

| batchSize | items per loop emission |
| options.reset | restart batching |

## Runtime behavior

output[0] loop = current batch; output[1] done = remaining (or same batch when finished). Full multi-pass loop-back is partial in OpenFlow single-pass engine.

## Acceptance tests

### Batch size 2 of 5

loop length 2, done length 3

### Exact fit

5 items batch 5 → loop 5, done 5 (complete)

## OpenFlow mapping

- `src/lib/engine/executors/split-in-batches.ts`

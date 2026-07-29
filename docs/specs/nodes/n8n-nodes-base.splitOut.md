---
type: n8n-nodes-base.splitOut
displayName: Split Out
category: Transform
versions: [1]
priority: high
status: specced
---

# Split Out

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout.md | Public docs only |

## Parameters

| fieldToSplitOut | array field path |
| include | noOtherFields / allOtherFields / selectedOtherFields |
| destinationFieldName | optional wrap key |
| options.ignoreMissingFields | skip bad rows |
| options.disableDotNotation | boolean |

## Runtime behavior

One input item with an array field → N output items (one per element). Objects spread; primitives under destination or field name.

## Acceptance tests

### Split names

Input `{ names: ["a","b"] }`, field `names` → two items with value a, b

### Objects in array

Input `{ users: [{id:1},{id:2}] }` → items with id 1 and 2

## OpenFlow mapping

- `src/lib/engine/executors/split-out.ts`

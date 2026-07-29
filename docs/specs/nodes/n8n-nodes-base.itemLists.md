---
type: n8n-nodes-base.itemLists
displayName: Item Lists
category: Transform
versions: [1]
priority: medium
status: specced
---

# Item Lists (legacy)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout.md | Public docs (successor Split Out) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate.md | Public docs (successor Aggregate) |

Item Lists is a legacy type string still seen in older exports. Behavior is implemented as **splitOut** and **aggregate** modes for import compatibility. Dedicated Item Lists doc page is no longer published separately.

## Parameters

| mode | splitOutItems / aggregateItems |
| arrayFieldName / fieldName | |

## Runtime behavior

- splitOutItems: unpack array field to items  
- aggregateItems: pack all items into one list field  

## Acceptance tests

### Split mode

Same as Split Out on `data` field

### Aggregate mode

Same as Aggregate allFields

## OpenFlow mapping

- `src/lib/engine/executors/item-lists.ts`

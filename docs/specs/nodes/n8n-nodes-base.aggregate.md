---
type: n8n-nodes-base.aggregate
displayName: Aggregate
category: Transform
versions: [1]
priority: high
status: specced
---

# Aggregate

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate.md | Public docs only |

## Parameters

| aggregate | individualFields / allFields |
| destinationFieldName | output list field |
| includeFields | fields to aggregate (individual) |
| include / fieldsToInclude / fieldsToExclude | all-item-data filters |
| options.mergeLists | flatten nested arrays |
| options.keepMissingAndNullValues | keep nulls |

## Runtime behavior

Many items → one item with arrays of field values or full item list under destination field.

## Acceptance tests

### All fields

3 items → `{ data: [ {...}, {...}, {...} ] }`

### Individual field

aggregate `id` → `{ id: [1,2,3] }`

## OpenFlow mapping

- `src/lib/engine/executors/aggregate.ts`

---
type: n8n-nodes-base.removeDuplicates
displayName: Remove Duplicates
category: Transform
versions: [1, 2]
priority: high
status: specced
---

# Remove Duplicates

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.removeduplicates.md | Public docs only |

## Parameters

| operation | removeItemsRepeatedInCurrentInput (v1 OpenFlow) / previous executions (stub) |
| compare | allFields / selectedFields / allFieldsExcept |
| fieldsToCompare / fieldsToMatch | field list |
| options.caseInsensitive / trimValues / removeOtherFields | |

## Runtime behavior

Drops items whose compare-key was already seen in the current input. Cross-execution history not implemented (passthrough + notice).

## Acceptance tests

### All fields

Items A,A,B → A,B

### Selected field email

Dedupe on email only

## OpenFlow mapping

- `src/lib/engine/executors/remove-duplicates.ts`

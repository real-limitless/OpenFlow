---
type: n8n-nodes-base.stopAndError
displayName: Stop and Error
category: Flow
versions: [1]
priority: high
status: specced
---

# Stop and Error

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.stopanderror.md | Public docs only |

## Wire format

- **Type:** `n8n-nodes-base.stopAndError`
- **Inputs/outputs:** main × 1 (throws before output)

## Parameters

| name | type | default |
|------|------|---------|
| errorType | options | errorMessage |
| errorMessage | string | |
| errorObject | json | |

## Runtime behavior

Throws Error with message (or object.message). Fails the node/execution unless continueOnFail.

## Acceptance tests

### Message throw

errorType=errorMessage, errorMessage="boom" → throws / Error boom

## OpenFlow mapping

- `src/lib/engine/executors/stop-and-error.ts`

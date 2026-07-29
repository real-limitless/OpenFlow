---
type: n8n-nodes-base.errorTrigger
displayName: Error Trigger
category: Triggers
versions: [1]
priority: high
status: specced
---

# Error Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger.md | Public docs only |

## Runtime behavior

Starts error workflows. Payload includes `execution.error` and `workflow` metadata. Manual/test runs emit a placeholder structure. Platform wiring of errorWorkflow settings is server-side.

## Acceptance tests

### Manual start

Emits one item with execution + workflow keys.

### PinData

Uses pinned error payload when present.

## OpenFlow mapping

- `src/lib/engine/executors/error-trigger.ts`

---
type: n8n-nodes-base.wait
displayName: Wait
category: Actions
versions: [1, 1.1]
priority: high
status: specced
---

# Wait

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait.md | Public docs only |

## Parameters

| name | notes |
|------|-------|
| resume | timeInterval / specificTime / webhook / form |
| amount + unit | interval |
| dateTime | specific time |

## Runtime behavior

OpenFlow v1: in-process sleep for time modes (capped). Webhook/form resume: pass-through until persistence.

## Acceptance tests

### Short interval

amount=0 or 1ms unit=seconds → returns input items

## OpenFlow mapping

- `src/lib/engine/executors/wait.ts`

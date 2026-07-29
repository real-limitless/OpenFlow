---
type: n8n-nodes-base.scheduleTrigger
displayName: Schedule Trigger
category: Triggers
versions: [1.2]
priority: high
status: specced
---

# Schedule Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger.md | Public docs only |

## Wire format

- **Type:** `n8n-nodes-base.scheduleTrigger`
- **Inputs:** none · **Outputs:** main × 1

## Parameters

| name | notes |
|------|-------|
| field | seconds/minutes/hours/days/weeks/months/cronExpression |
| intervalSize | interval count |
| cronExpression | when field=cron |
| timezone | optional |
| triggerAtHour | for day/week/month rules |

## Runtime behavior

Server registers cron/interval when workflow is active. Engine start emits one item with `timestamp` + schedule metadata. Must publish/activate workflow for real ticks (**documented**).

## Acceptance tests

### Manual engine start

Executor returns one item with ISO timestamp and schedule.field.

## OpenFlow mapping

- Executor: `src/lib/engine/executors/schedule-trigger.ts`
- Registration: `src/server/routes/schedules.ts`

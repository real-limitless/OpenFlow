---
type: n8n-nodes-base.scheduleTrigger
displayName: Schedule Trigger
category: Core Nodes
versions: [1]
priority: high
status: specced
---

# Schedule Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.scheduleTrigger`
- **Aliases:** `Time`, `Scheduler`, `Polling`, `Cron`, `Interval`
- **Inputs:** none (trigger node — no incoming connections)
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

The node is configured through one or more **trigger rules**. A rule is defined by a **trigger interval** selection that determines which sub-parameters are relevant.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| triggerRules | array | `[]` | yes | Array of rule objects, each with its own interval and sub-parameters |
| rule.triggerInterval | enum | `seconds` | yes | One of: `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `cron` |
| rule.secondsBetweenTriggers | number | — | conditionally | Required when interval = `seconds`. Positive integer of seconds between triggers |
| rule.minutesBetweenTriggers | number | — | conditionally | Required when interval = `minutes`. Positive integer of minutes between triggers |
| rule.hoursBetweenTriggers | number | — | conditionally | Required when interval = `hours`. Positive integer of hours between triggers |
| rule.triggerAtMinute | number | — | conditionally | Required when interval = `hours`, `days`, `weeks`, or `months`. Integer 0–59 |
| rule.daysBetweenTriggers | number | — | conditionally | Required when interval = `days`. Positive integer of days between triggers |
| rule.triggerAtHour | enum | — | conditionally | Required when interval = `days`, `weeks`, or `months`. Hour of day (0–23) |
| rule.weeksBetweenTriggers | number | — | conditionally | Required when interval = `weeks`. Positive integer of weeks between triggers |
| rule.triggerOnWeekdays | enum[] | — | conditionally | Required when interval = `weeks`. Array of day names (e.g. `Monday`, `Tuesday`) |
| rule.monthsBetweenTriggers | number | — | conditionally | Required when interval = `months`. Positive integer of months between triggers |
| rule.triggerAtDayOfMonth | number | — | conditionally | Required when interval = `months`. Integer 1–31. If a month lacks this day, no trigger fires |
| rule.expression | string | — | conditionally | Required when interval = `cron`. A cron expression with optional seconds field (6-field format) |

## Runtime behavior

### Trigger activation

The node is a **polling trigger** — it does not listen on a network port. The runtime polls the cron/schedule rules at the configured intervals and emits one output item per tick. The workflow must be in a published (active) state for the trigger to fire automatically.

### Timezone

The node resolves scheduled times against a timezone, using (in priority order):
1. The workflow-level timezone setting, if explicitly configured.
2. The n8n instance default timezone (self-hosted: `America/New_York` unless overridden; n8n Cloud: detected from the instance owner's signup location, falling back to GMT).

### Output

Each trigger firing produces **one output item** with the following shape:

```json
{
  "json": {}
}
```

The item is intentionally empty — the Schedule Trigger is a pure time-based activation mechanism. Downstream nodes receive a single empty item as a signal to execute.

### Multiple rules

When multiple trigger rules are defined, the node fires whenever **any** rule's condition is satisfied. Each rule is evaluated independently.

### Errors

- Invalid cron expressions should produce a configuration-time validation error.
- If a day-of-month value exceeds the number of days in the current month, that particular firing is skipped (not an error).
- `continueOnFail` is not applicable (trigger nodes cannot fail mid-execution from time computation).

### Expressions

The `expression` (cron) parameter and all numeric/interval parameters accept expression strings for dynamic resolution. However, cron expression variables are evaluated once at workflow publish time — changing variable values after publication does not affect the schedule until the workflow is unpublished and re-published.

## Acceptance tests

### Test: every-N-seconds trigger

**Parameters:**
```json
{
  "triggerRules": [
    {
      "triggerInterval": "seconds",
      "secondsBetweenTriggers": 30
    }
  ]
}
```

**Expect:** Node fires every 30 seconds. Each output is `{ "json": {} }`.

### Test: weekly schedule on specific days

**Parameters:**
```json
{
  "triggerRules": [
    {
      "triggerInterval": "weeks",
      "weeksBetweenTriggers": 1,
      "triggerOnWeekdays": ["Monday", "Wednesday", "Friday"],
      "triggerAtHour": 9,
      "triggerAtMinute": 0
    }
  ]
}
```

**Expect:** Node fires every Monday, Wednesday, and Friday at 09:00 in the configured timezone.

### Test: custom cron expression

**Parameters:**
```json
{
  "triggerRules": [
    {
      "triggerInterval": "cron",
      "expression": "0 6 * * *"
    }
  ]
}
```

**Expect:** Node fires daily at 06:00.

### Test: multiple rules

**Parameters:**
```json
{
  "triggerRules": [
    {
      "triggerInterval": "minutes",
      "minutesBetweenTriggers": 15
    },
    {
      "triggerInterval": "hours",
      "hoursBetweenTriggers": 1,
      "triggerAtMinute": 0
    }
  ]
}
```

**Expect:** Node fires every 15 minutes AND every hour at 00 minutes past the hour. (Some firings may coincide.)

### Test: monthly rule skips short months

**Parameters:**
```json
{
  "triggerRules": [
    {
      "triggerInterval": "months",
      "monthsBetweenTriggers": 1,
      "triggerAtDayOfMonth": 31,
      "triggerAtHour": 12,
      "triggerAtMinute": 0
    }
  ]
}
```

**Expect:** Node fires on the 31st of months that have 31 days (Jan, Mar, May, Jul, Aug, Oct, Dec). It does not fire in February, April, June, September, or November.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Output item shape | documented | n8n docs confirm empty `{}` output item |
| Timezone resolution behavior | documented | Workflow timezone → instance timezone → fallback chain clearly documented |
| Sub-parameter availability per interval | documented | Docs clearly describe which fields appear under each interval selection |
| Multiple rules OR-combined | documented | Docs state "Add multiple Trigger Rules to run the node on different schedules" |
| Skip behavior for invalid day-of-month | documented | Docs confirm skip, not error |
| Cron expression variable evaluation timing | documented | Only evaluated at publish time, per docs |
| Internal cron implementation | inferred | The schedule engine uses a cron-like scheduler internally; exact implementation details not needed |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.scheduleTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.schedule
displayName: Schedule
category: Core Nodes
versions: [1]
priority: medium
status: specced
---

# Schedule Trigger

> **Note:** The wire type `n8n-nodes-base.schedule` is an alias. The canonical node type is `n8n-nodes-base.scheduleTrigger`. Both type strings refer to the same trigger node.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.scheduleTrigger` (canonical); `n8n-nodes-base.schedule` is an accepted alias
- **Aliases:** `Time`, `Scheduler`, `Polling`, `Cron`, `Interval`
- **Inputs:** (none) — trigger node, no incoming connections
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

The node supports multiple **Trigger Rules**. Each rule is an independent schedule specification. The node fires when any rule matches the current time.

Each rule selects one of seven interval modes via the `triggerInterval` parameter:

| Interval mode | Sub-parameters | Behavior |
|---------------|----------------|----------|
| `seconds` | `secondsBetweenTriggers` (number, ≥1) | Repeat every N seconds |
| `minutes` | `minutesBetweenTriggers` (number, ≥1) | Repeat every N minutes |
| `hours` | `hoursBetweenTriggers` (number, ≥1), `triggerAtMinute` (0–59) | Repeat every N hours, at the specified minute |
| `days` | `daysBetweenTriggers` (number, ≥1), `triggerAtHour` (0–23), `triggerAtMinute` (0–59) | Repeat every N days, at the specified hour:minute |
| `weeks` | `weeksBetweenTriggers` (number, ≥1), `triggerOnWeekdays` (array of day names), `triggerAtHour` (0–23), `triggerAtMinute` (0–59) | Repeat every N weeks, on selected weekday(s), at specified time |
| `months` | `monthsBetweenTriggers` (number, ≥1), `triggerAtDayOfMonth` (1–31), `triggerAtHour` (0–23), `triggerAtMinute` (0–59) | Repeat every N months, on the specified day (if the day does not exist in a given month, skip that month) |
| `cronExpression` | `expression` (string, 5- or 6-field cron) | Use a standard cron expression (5 fields = minute/hour/dayOfMonth/month/dayOfWeek; 6 fields adds seconds) |

All interval sub-parameters accept expression strings (n8n expressions). The timezone is drawn from the workflow timezone setting (if set) or the instance default timezone.

## Runtime behavior

### Activation

On workflow activation (save + publish), the node registers one or more timer/cron rules in the n8n runtime scheduler. The node does not listen for external events — it is entirely time-driven.

### Output

Each time the schedule fires, the node emits one output item on `main[0]`:

```json
[{ "json": {} }]
```

The output item has an empty body. Downstream nodes typically use the trigger timestamp (available via expression `$now` or `{{ Date.now() }}`) rather than any payload fields.

The node fires once per matching rule per matching instant. If multiple rules match the same moment, multiple items are emitted (one per rule).

### Errors

- If a cron expression is syntactically invalid, the node should fail activation with a clear error message.
- If a day-of-month value exceeds the number of days in the current month, that month is silently skipped.
- The node respects the `continueOnFail` convention for downstream error handling, though as a trigger it has no input items to fail on.

### Expressions

All numeric and text sub-parameters (interval counts, minute offsets, hour selection, weekday selection, cron expression) accept expression strings.

## Acceptance tests

### Test: seconds interval

**Parameters:**
```json
{
  "rule": {
    "triggerInterval": "seconds",
    "secondsBetweenTriggers": 30
  }
}
```

**Expect:** The node fires every 30 seconds. Each firing produces one empty item `{ "json": {} }`.

### Test: daily at specific time

**Parameters:**
```json
{
  "rule": {
    "triggerInterval": "days",
    "daysBetweenTriggers": 1,
    "triggerAtHour": 9,
    "triggerAtMinute": 0
  }
}
```

**Expect:** The node fires once daily at 09:00 in the workflow timezone. Each firing produces one empty item.

### Test: weekly on multiple days

**Parameters:**
```json
{
  "rule": {
    "triggerInterval": "weeks",
    "weeksBetweenTriggers": 1,
    "triggerOnWeekdays": ["Monday", "Wednesday", "Friday"],
    "triggerAtHour": 12,
    "triggerAtMinute": 0
  }
}
```

**Expect:** The node fires at noon every Monday, Wednesday, and Friday.

### Test: cron expression

**Parameters:**
```json
{
  "rule": {
    "triggerInterval": "cronExpression",
    "expression": "*/5 * * * *"
  }
}
```

**Expect:** The node fires every 5 minutes. Each firing produces one empty item.

### Test: multiple rules

**Parameters:**
```json
{
  "rules": [
    { "triggerInterval": "minutes", "minutesBetweenTriggers": 15 },
    { "triggerInterval": "hours", "hoursBetweenTriggers": 1, "triggerAtMinute": 0 }
  ]
}
```

**Expect:** The node fires every 15 minutes AND once per hour on the hour. When both rules coincide (the top of every hour), two items are emitted.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and modes | documented | Full docs at docs.n8n.io |
| Cron format (5 vs 6 field) | documented | 6th field = seconds, optional |
| Output shape | documented | Empty item per trigger |
| Timezone resolution | documented | Workflow timezone > instance timezone |
| Multi-rule behavior | documented | Multiple trigger rules are additive |
| Multiple items per instant | inferred | One item per matching rule per tick |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.scheduleTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

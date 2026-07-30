---
type: n8n-nodes-base.scheduleTrigger
displayName: Schedule Trigger
category: Triggers
versions: [1, 1.1, 1.2, 1.3]
priority: high
status: specced
---

# Schedule Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/common-issues.md | Public docs only |
| https://docs.n8n.io/build/manage-workflows/configure-workflow-settings.md | Public docs only (workflow timezone) |
| Public workflow export JSON / published parameter descriptors (names, defaults, enums only) | Public workflow JSON |

## Wire format

- **Type string:** `n8n-nodes-base.scheduleTrigger`
- **Aliases:** (none as alternate type strings). UI search labels may include Time, Scheduler, Polling, Cron, Interval (**inferred** from public metadata; not runtime type ids)
- **Display name:** `Schedule Trigger`
- **Group / category:** trigger · schedule · Core Nodes (**inferred** group tags; category from public docs)
- **Versions:** `1`, `1.1`, `1.2`, `1.3` (`typeVersion`; treat as one behavioral contract unless a fixture proves otherwise) (**inferred** version list)
- **Inputs:** none (empty inputs; trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Activation:** Workflow must be **saved and published/activated** for automatic schedule ticks (**documented**)

## Parameters

Top-level configuration is a **Trigger Rules** collection. Wire path is `rule.interval` (array of rule objects) (**inferred** wire keys from public export / descriptor shapes; UI labels from docs).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| rule | fixedCollection (multipleValues) | `{ "interval": [{ "field": "days" }] }` | no | — | Container for one or more schedule rules (**inferred** wire; multi-rule **documented**) |
| rule.interval | array | `[{ "field": "days" }]` | no | — | Each entry is an independent trigger rule (**documented** multi-rule) |
| rule.interval[].field | options | `days` | yes (per rule) | — | Trigger interval unit. Wire values: `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `cronExpression` (**documented** UI units; wire enums **inferred**) |
| rule.interval[].secondsInterval | number | `30` | when field=seconds | `field: ["seconds"]` | Seconds between triggers; intended range 1–59 (**documented** behavior; default/range **inferred**) |
| rule.interval[].minutesInterval | number | `5` | when field=minutes | `field: ["minutes"]` | Minutes between triggers; intended range 1–59 |
| rule.interval[].hoursInterval | number | `1` | when field=hours | `field: ["hours"]` | Hours between triggers; intended range 1–23 |
| rule.interval[].daysInterval | number | `1` | when field=days | `field: ["days"]` | Days between triggers; intended range 1–31 |
| rule.interval[].weeksInterval | number | `1` | when field=weeks | `field: ["weeks"]` | Weeks between triggers |
| rule.interval[].monthsInterval | number | `1` | when field=months | `field: ["months"]` | Months between triggers |
| rule.interval[].triggerAtMinute | number | `0` | no | `field: ["hours","days","weeks","months"]` | Minute past the hour, 0–59 (**documented**) |
| rule.interval[].triggerAtHour | options/number | `0` | no | `field: ["days","weeks","months"]` | Hour of day 0–23 (**documented** UI; wire 0–23 **inferred**). Not used for pure hours-interval rules (those use interval + minute only) |
| rule.interval[].triggerAtDay | multiOptions | `[0]` | when field=weeks | `field: ["weeks"]` | Weekdays to fire; numeric `0`=Sunday … `6`=Saturday (**documented** weekday selection; numbering **inferred**) |
| rule.interval[].triggerAtDayOfMonth | number | `1` | when field=months | `field: ["months"]` | Day of month 1–31; months without that day skip the tick (**documented**) |
| rule.interval[].expression | string | `""` | when field=cronExpression | `field: ["cronExpression"]` | Cron expression; 5-field standard or optional leading seconds (6 fields) (**documented**) |

### Interval semantics (documented)

| field | Companions | Example meaning |
|-------|------------|-----------------|
| seconds | secondsInterval | Every N seconds (e.g. 30 → every 30s) |
| minutes | minutesInterval | Every N minutes (e.g. 5 → every 5m) |
| hours | hoursInterval, triggerAtMinute | Every N hours at :MM (e.g. 6 + minute 30 → every 6h at :30) |
| days | daysInterval, triggerAtHour, triggerAtMinute | Every N days at HH:MM (e.g. 2 days at 09:15) |
| weeks | weeksInterval, triggerAtDay[], triggerAtHour, triggerAtMinute | Every N weeks on selected weekdays at HH:MM |
| months | monthsInterval, triggerAtDayOfMonth, triggerAtHour, triggerAtMinute | Every N months on day D at HH:MM; missing month-days skip |
| cronExpression | expression | Custom cron (Unix-like; optional seconds column) |

### Cron dialect (documented)

| Fields | Order |
|--------|--------|
| 5-field | minute hour day-of-month month day-of-week (Sun–Sat) |
| 6-field (optional) | second minute hour day-of-month month day-of-week |

Documented examples include: `*/10 * * * * *` (every 10s), `*/5 * * * *` (every 5m), `0 * * * *` (hourly), `0 6 * * *` (daily 06:00), `0 12 * * 1` (Monday noon), `0 0 1 * *` (monthly midnight on 1st), `0 0 */3 * *`, `0 9 * * 1-5`, `0 9-17 * * *`, `0 0 1 1,4,7,10 *`.

Invalid cron → product error “Invalid cron expression” (**documented** common issues). Prefer expressions that validate on crontab.guru after dropping the optional seconds column.

### Timezone (documented)

Schedule evaluation uses:

1. Workflow timezone, if set in workflow settings (explicitly called out as important for Schedule Trigger).
2. Else instance timezone (self-hosted default often America/New_York / EDT; Cloud detects owner TZ or falls back to GMT).

There is **no** per-node timezone parameter on the public docs page.

### Publish / change semantics (documented)

- Cron/interval config and any variables inside expressions are evaluated when the workflow is **published**.
- Changing interval, cron, or variable values after publish does **not** take effect until unpublish + publish (new version).
- After a change + republish, the schedule clock starts from the **publish time** (e.g. “every 2 hours” next fire is publish_time + 2h), not from prior wall-clock alignment alone.

## Runtime behavior

### Role

Starts a workflow on a fixed interval or cron-like schedule (public docs compare the concept to Unix cron). Unlike Manual Trigger, automatic ticks require a published/active workflow.

### Input

No upstream items. The host scheduler starts an execution when a configured rule matches “now” in the effective timezone. Manual/test execute may also invoke the node without waiting for a tick (**inferred** platform behavior for triggers).

### Output

Emits **one item** on `main[0]` per scheduled (or manual) fire. Public docs do not define the JSON schema of the payload. OpenFlow should provide a stable, useful envelope (**inferred**), for example:

```json
{
  "timestamp": "<ISO-8601 instant of fire>",
  "Readable date": "<human-readable local>",
  "Readable time": "<human-readable local time>",
  "Day of week": "<name>",
  "Year": "<yyyy>",
  "Month": "<name>",
  "Day of month": "<d>",
  "Hour": "<h>",
  "Minute": "<m>",
  "Second": "<s>",
  "Timezone": "<IANA id used for evaluation>"
}
```

Exact key set is **inferred**; implementers may match common public-export pinData shapes if available. At minimum include a reliable `timestamp` (ISO-8601).

If pin data exists for this node on a manual/test run, the engine may use pinned items instead (**inferred** shared trigger platform behavior).

When multiple rules fire at the same instant, host may start one execution per rule or coalesce — **undocumented**; OpenFlow may start one execution per matched rule or one combined fire with metadata listing matched rules (**inferred** choice; document in executor).

### Scheduling engine responsibilities (host, not pure item transform)

1. Register jobs when workflow becomes active/published and has this trigger type.
2. Unregister on deactivate/unpublish/delete.
3. Evaluate next run times from `rule.interval[]` + effective timezone.
4. On tick, create a workflow execution whose start node is this trigger, with the timestamp item above.
5. Reject or surface invalid cron expressions at publish or first schedule build (**documented** error class: invalid cron).

### Errors

| Condition | Behavior |
|-----------|----------|
| Invalid cron expression | Error; do not register schedule (**documented**) |
| Month day missing (e.g. 30 in February) | Skip that occurrence; no error (**documented**) |
| Interval out of UI range | Prefer validate at edit/publish (**inferred**); runtime may clamp or error |
| Workflow not published | No automatic ticks (**documented**) |

`continueOnFail` is not meaningful for a pure trigger registration failure at host level.

### Expressions

- Interval numeric fields and cron `expression` may accept expression strings / variables (**documented** for cron variables; numeric fields accept expressions in descriptors — **inferred**).
- Expression/variable values for schedule config are snapshotted at **publish** time (**documented**).

## Acceptance tests

### Test: default days rule shape

**Given** input items: (none — trigger)

**Parameters:**

```json
{
  "rule": {
    "interval": [
      {
        "field": "days",
        "daysInterval": 1,
        "triggerAtHour": 0,
        "triggerAtMinute": 0
      }
    ]
  }
}
```

**Expect** on manual/engine invoke output[0]:

```json
[
  {
    "json": {
      "timestamp": "<ISO-8601 string>"
    }
  }
]
```

(`timestamp` required; additional date parts optional if implemented.)

### Test: hours interval with minute offset

**Parameters:**

```json
{
  "rule": {
    "interval": [
      {
        "field": "hours",
        "hoursInterval": 6,
        "triggerAtMinute": 30
      }
    ]
  }
}
```

**Expect** host schedule: every 6 hours at minute 30 (**documented** example semantics). Manual invoke still emits one timestamp item.

### Test: weekly multi-day

**Parameters:**

```json
{
  "rule": {
    "interval": [
      {
        "field": "weeks",
        "weeksInterval": 1,
        "triggerAtDay": [1, 3, 5],
        "triggerAtHour": 9,
        "triggerAtMinute": 0
      }
    ]
  }
}
```

**Expect** host fires Mon/Wed/Fri at 09:00 in workflow/instance timezone (**documented** weekday + hour semantics). `triggerAtDay` uses 0=Sun … 6=Sat (**inferred** numbering).

### Test: custom cron (5-field)

**Parameters:**

```json
{
  "rule": {
    "interval": [
      {
        "field": "cronExpression",
        "expression": "0 6 * * *"
      }
    ]
  }
}
```

**Expect** daily at 06:00 (**documented** example). Invalid expression (e.g. `"not a cron"`) → schedule registration / node error (**documented**).

### Test: six-field cron with seconds

**Parameters:**

```json
{
  "rule": {
    "interval": [
      {
        "field": "cronExpression",
        "expression": "*/10 * * * * *"
      }
    ]
  }
}
```

**Expect** every 10 seconds when active (**documented**). Seconds column optional; 5-field expressions still valid (**documented**).

### Test: multiple rules

**Parameters:**

```json
{
  "rule": {
    "interval": [
      {
        "field": "minutes",
        "minutesInterval": 15
      },
      {
        "field": "cronExpression",
        "expression": "0 0 * * 0"
      }
    ]
  }
}
```

**Expect** both schedules registered independently (**documented** multi-rule support).

### Test: publish gate

**Given** workflow inactive/unpublished with valid schedule params

**Expect** no automatic executions until publish/activate (**documented**).

### Test: publish-time reschedule

**Given** active workflow was every 1 hour; user changes to every 2 hours and republishes at 11:30

**Expect** next automatic fire at 13:30 (publish_time + 2h), not the previous hourly alignment (**documented** common-issues example).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| UI labels (Trigger Interval, Seconds Between Triggers, …) | documented | Public docs |
| Wire keys (`rule`, `interval`, `field`, `*Interval`, `expression`) | inferred | Public export/descriptor parameter names; not spelled on docs page |
| `field` enum string values | inferred | Match docs units to export vocabulary |
| Weekday numbering 0–6 | inferred | Descriptor enums; Sun=0 |
| Defaults (30s, 5m, 1h, days@00:00, triggerAtDay `[0]`, …) | inferred | Descriptor defaults; docs give examples not full default table |
| `triggerAtHour` hidden for hours-interval | inferred | Docs only list minute companion for hours; descriptor displayOptions |
| Output item JSON schema | inferred | Docs omit payload; timestamp + readable parts recommended |
| Multi-rule same-instant execution model | inferred | Not specified |
| Node typeVersion list 1–1.3 | inferred | Descriptor versions; param shape treated as one contract |
| Legacy Cron/Interval node migration | not in scope | Separate historical type strings if seen in old exports |
| Exact cron library dialect beyond docs examples | partial | Docs point at crontab.guru for 5-field; seconds extension product-specific |
| Pin-data override on manual run | inferred | Shared trigger platform behavior |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/schedule-trigger.ts`
- **Host registration:** server schedule routes / activator (e.g. `src/server/routes/schedules.ts` or equivalent) — register on publish, clear on deactivate
- **SDK:** `defineNode` + native `ExecutionContext` only; no third-party node package load

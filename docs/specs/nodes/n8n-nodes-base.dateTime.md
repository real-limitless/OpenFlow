---
type: n8n-nodes-base.dateTime
displayName: Date & Time
category: Transform
versions: [1, 2]
priority: high
status: specced
---

# Date & Time

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datetime.md | Public docs only |

## Operations (OpenFlow subset)

formatDate, getCurrentDate, addToDate, subtractFromDate, extractDate, getTimeBetweenDates

## Acceptance tests

### Format

date `2020-01-15T12:00:00.000Z`, format `YYYY-MM-DD` → `2020-01-15`

### Get current

operation getCurrentDate → ISO string in result field

### Add days

add 2 days to a fixed date → later ISO

## OpenFlow mapping

- `src/lib/engine/executors/date-time.ts`

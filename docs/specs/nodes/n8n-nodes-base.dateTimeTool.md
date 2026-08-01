---
type: n8n-nodes-base.dateTimeTool
displayName: Date & Time Tool
category: Transform
versions: [2]
priority: medium
status: specced
---

# Date & Time Tool

AI agent tool that wraps the Date & Time (n8n-nodes-base.dateTime V2) core node. Exposes date/time manipulation operations to AI agents via `$fromAI()` dynamic parameter population. No credentials required.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datetime/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.dateTimeTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

### Operation selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | `addToDate` | yes | Selects which date-time function to run |

Supported operations: `addToDate`, `subtractFromDate`, `extractDate`, `formatDate`, `getCurrentDate`, `getTimeBetweenDates`, `roundDate`.

### Add to a Date (addToDate)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| date | string | — | yes | Source date value |
| timeUnit | options | — | yes | Unit of time: `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds` |
| magnitude | number | — | yes | Quantity of units to add |
| outputFieldName | string | — | yes | Name of the output property |

### Subtract From a Date (subtractFromDate)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| date | string | — | yes | Source date value |
| timeUnit | options | — | yes | Same units as addToDate |
| magnitude | number | — | yes | Quantity of units to subtract |
| outputFieldName | string | — | yes | Name of the output property |

### Extract Part of a Date (extractDate)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| date | string | — | yes | Source date value |
| part | options | — | yes | Part to extract: `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds` |
| outputFieldName | string | — | yes | Name of the output property |

### Format a Date (formatDate)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| date | string | — | yes | Source date value |
| format | options | — | yes | Preset or `customFormat`. Presets: `MM/DD/YYYY`, `YYYY/MM/DD`, `MMMM DD YYYY`, `MM-DD-YYYY`, `YYYY-MM-DD` |
| customFormat | string | — | no | Luxon token string when format=`customFormat`. Throws if empty when required |
| outputFieldName | string | — | yes | Name of the output property |

### Get Current Date (getCurrentDate)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| includeTime | boolean | false | no | When false, time is set to midnight |
| outputFieldName | string | — | yes | Name of the output property |

### Get Time Between Dates (getTimeBetweenDates)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| startDate | string | — | yes | Earlier date |
| endDate | string | — | yes | Later date |
| units | multiOptions | — | yes | One or more of: `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds`, `milliseconds` |
| outputFieldName | string | — | yes | Name of the output property |

### Round a Date (roundDate)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| date | string | — | yes | Source date value |
| mode | options | — | yes | `roundDown` or `roundUp` |
| toNearest | options | — | yes | Unit to round to: `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds` |
| outputFieldName | string | — | yes | Name of the output property |

### Per-operation options

Each operation may expose a toggle `includeInputFields` (default off). When on, all input item fields are preserved in the output alongside the computed value.

Format-specific options:

| name | appliesTo | type | default | notes |
|------|-----------|------|---------|-------|
| fromDateFormat | formatDate | string | — | Luxon token string for parsing the input date when auto-detection fails |
| useWorkflowTimezone | formatDate | boolean | false | When on, uses the workflow-level timezone instead of input timezone |
| outputAsISO | getTimeBetweenDates | boolean | false | When on, produces a single ISO 8601 duration string instead of per-unit properties |
| timezone | getCurrentDate | string | — | Explicit timezone override; empty means instance default |

## Runtime behavior

### Input

Consumes items from the previous node. Input date values can be ISO strings, Luxon-compatible strings, or JavaScript Date objects.

### Output

For all operations, the output item contains a single property named by `outputFieldName` holding the computed result. If `includeInputFields` is on, all input item properties are merged alongside it.

- **addToDate / subtractFromDate:** Returns an ISO-format date string.
- **extractDate:** Returns a numeric value for the extracted part.
- **formatDate:** Returns a formatted date string per the chosen preset or custom format.
- **getCurrentDate:** Returns an ISO-format date string (with or without time component).
- **getTimeBetweenDates:** Returns either an object with per-unit values or an ISO 8601 duration string (`P<value>Y<value>MT<value>H<value>M<value>S`).
- **roundDate:** Returns an ISO-format date string rounded to the nearest unit.

### Errors

- Invalid input dates that cannot be parsed by Luxon produce a throw.
- Selecting `customFormat` with an empty `customFormat` value throws.
- `continueOnFail` (if wired) suppresses per-item errors and continues with the next item.

### Expressions

All string and number parameters accept n8n expression syntax. When used as an AI agent tool, parameters may be populated by the AI via `$fromAI()`.

## Acceptance tests

### Test: add duration to a date

**Given** input item with `{ "date": "2024-01-15T00:00:00Z" }`

**Parameters:** `{ "operation": "addToDate", "date": "2024-01-15T00:00:00Z", "timeUnit": "days", "magnitude": 10, "outputFieldName": "newDate" }`

**Expect** output item property `newDate` to be a string representing `2024-01-25` (ISO date, 10 days later).

### Test: format date with a preset

**Given** input item with `{ "date": "1986-09-04" }`

**Parameters:** `{ "operation": "formatDate", "date": "1986-09-04", "format": "MM/DD/YYYY", "outputFieldName": "formatted" }`

**Expect** output item property `formatted` to equal `"09/04/1986"`.

### Test: custom format throws when empty

**Given** input item with `{ "date": "2024-01-01" }`

**Parameters:** `{ "operation": "formatDate", "date": "2024-01-01", "format": "customFormat", "customFormat": "", "outputFieldName": "out" }`

**Expect** the executor to throw (customFormat must not be empty).

### Test: get current date without time

**Parameters:** `{ "operation": "getCurrentDate", "includeTime": false, "outputFieldName": "now" }`

**Expect** output item property `now` to be an ISO date string with time set to midnight (`T00:00:00.000Z`).

### Test: roundDate with roundUp and toNearest

**Given** input item with `{ "date": "2024-03-15T10:30:00Z" }`

**Parameters:** `{ "operation": "roundDate", "date": "2024-03-15T10:30:00Z", "mode": "roundUp", "toNearest": "day", "outputFieldName": "rounded" }`

**Expect** output item property `rounded` to be `"2024-03-16T00:00:00.000Z"` (rounds up to next day boundary).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | documented | Public docs enumerate all 7 operations |
| Parameter shapes | documented | Public docs list parameters per operation |
| Tool-specific behavior ($fromAI) | documented | Public docs describe tool parameter population |
| Internal Luxon version | inferred | Public docs state Luxon is used; exact version unknown |
| Error messages | inferred | Not documented; executor should emit descriptive errors |
| roundUp toNearest behavior | inferred | Must behave symmetrically with roundDown per the mode parameter |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/dateTimeTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
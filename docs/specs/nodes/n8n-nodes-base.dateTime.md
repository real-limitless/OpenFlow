---
type: n8n-nodes-base.dateTime
displayName: Date & Time
category: Transform
versions: [1, 2]
priority: high
status: specced
---

# Date & Time

The Date & Time node manipulates date/time data and converts it between
formats. It exposes seven operations, each driven by the `operation` parameter.
Internally the source product relies on [Luxon](https://moment.github.io/luxon);
OpenFlow's executor must reproduce the documented behavior using an equivalent
date library, not the upstream implementation.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datetime.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datetime/ | Public docs only |
| https://moment.github.io/luxon/#/formatting?id=table-of-tokens | Third-party library docs (token reference) |
| Public n8n-nodes-base descriptor metadata (parameter names/defaults/enums only) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.dateTime`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Versions:** `1` (legacy V1) and `2` (current, default). This spec targets
  V2 behavior; V1 is accepted on import as a placeholder that preserves
  parameters. All parameter names, defaults, and enums below are V2.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | — | yes | — | `addToDate` \| `extractDate` \| `formatDate` \| `getCurrentDate` \| `getTimeBetweenDates` \| `roundDate` \| `subtractFromDate` |
| `magnitude` | string | `''` | yes (add/subtract) | operation: addToDate, subtractFromDate | The date to add to / subtract from. |
| `timeUnit` | options | `days` | yes (add/subtract) | operation: addToDate, subtractFromDate | `years` \| `quarters` \| `months` \| `weeks` \| `days` \| `hours` \| `minutes` \| `seconds` \| `milliseconds` |
| `duration` | number | `0` | no (add/subtract) | operation: addToDate, subtractFromDate | Number of `timeUnit` to add/subtract. May be negative. |
| `outputFieldName` | string | op-specific | no | all operations | Default per op: `newDate` (add/subtract), `formattedDate` (format), `currentDate` (current), `datePart` (extract), `timeDifference` (between), `roundedDate` (round). |
| `date` | string | `''` | no | operation: formatDate, extractDate, roundDate | The date to format / extract from / round. |
| `format` | options | `MM/dd/yyyy` | no | operation: formatDate | `custom` \| `MM/dd/yyyy` \| `yyyy/MM/dd` \| `MMMM dd yyyy` \| `MM-dd-yyyy` \| `yyyy-MM-dd` \| `X` (Unix seconds) \| `x` (Unix ms) |
| `customFormat` | string | `''` | no | operation: formatDate, format: custom | Luxon token string, case-sensitive. |
| `part` | options | `month` | no | operation: extractDate | `year` \| `month` \| `week` \| `day` \| `hour` \| `minute` \| `second` |
| `startDate` | string | `''` | no | operation: getTimeBetweenDates | Earlier date. |
| `endDate` | string | `''` | no | operation: getTimeBetweenDates | Later date. |
| `units` | multiOptions | `['day']` | no | operation: getTimeBetweenDates | `year` \| `month` \| `week` \| `day` \| `hour` \| `minute` \| `second` \| `millisecond` |
| `includeTime` | boolean | `true` | no | operation: getCurrentDate | When false, time is set to midnight. |
| `mode` | options | `roundDown` | no | operation: roundDate | `roundDown` \| `roundUp` |
| `toNearest` | options | `month` | no | operation: roundDate, mode: roundDown | `year` \| `month` \| `week` \| `day` \| `hour` \| `minute` \| `second` |
| `to` | options | `month` | no | operation: roundDate, mode: roundUp | Only `month` ("End of Month") available. |
| `options` | collection | `{}` | no | all operations | Container; see options below. |
| `options.includeInputFields` | boolean | `false` | no | all operations | When true, preserve all input fields in output; when false, emit only `outputFieldName`. |
| `options.fromFormat` | string | `e.g yyyyMMdd` | no | operation: formatDate | Luxon format of the input `date` when auto-detect fails. |
| `options.timezone` | boolean | `false` | no | operation: formatDate | "Use Workflow Timezone": false = input's tz, true = workflow tz. |
| `options.timezone` | string | `''` | no | operation: getCurrentDate | Override timezone; blank = instance tz. Use `GMT` for +00:00. |
| `options.isoString` | boolean | `false` | no | operation: getTimeBetweenDates | When true, emit a single ISO 8601 duration string instead of a per-unit object. |

## Runtime behavior

### Timezone resolution

The node resolves a timezone in this order:

1. An explicit `options.timezone` (getCurrentDate) when non-blank.
2. The workflow timezone, if set.
3. The instance timezone (default `America/New_York` for self-hosted; Cloud
   auto-detects owner tz, falling back to `GMT`).

`GMT` must be accepted as an alias for `+00:00`. For `formatDate`, the
`options.timezone` boolean ("Use Workflow Timezone") toggles between the
input's own offset (false) and the workflow timezone (true).

### Input

Consumes one item at a time from `main`. Each operation reads its date input
from a string parameter (`magnitude` / `date` / `startDate` / `endDate`),
which may be a literal or an `{{ expression }}` resolving to a date string
parsable by Luxon (ISO 8601 or any format Luxon accepts; use `fromFormat` to
disambiguate). `getCurrentDate` takes no date input — it uses "now".

### Output

For each input item, emits exactly one output item. The result is written to a
single field named by `outputFieldName`:

- `addToDate` / `subtractFromDate`: ISO 8601 string of the shifted date.
- `formatDate`: the formatted date string (or numeric Unix timestamp when
  `format` is `X` / `x`).
- `getCurrentDate`: ISO 8601 string of the current date (with time, or
  midnight when `includeTime` is false).
- `extractDate`: numeric value of the extracted part (e.g. `9` for September).
- `getTimeBetweenDates`: when `options.isoString` is false, an object whose
  keys are the selected `units` with integer differences, e.g.
  `{ "years": 1, "months": 3, "days": 13 }`. When true, a single ISO 8601
  duration string, e.g. `P1Y3M13D` (milliseconds render as decimal seconds).
- `roundDate`: ISO 8601 string of the rounded date. `roundDown` moves to the
  start of `toNearest` unit; `roundUp` moves to the end of the month.

When `options.includeInputFields` is true, all input fields are preserved and
the result field is added/overwritten. When false, the output item contains
**only** the result field.

### Errors

- An unparseable date (and no `fromFormat` that makes it parseable) should
  throw. With `continueOnFail` enabled, the item is passed through with an
  error marker instead of aborting the run.
- A missing required `operation` or required `magnitude`/`timeUnit` should
  throw a parameter-validation error.

### Expressions

All string parameters accept `{{ … }}` expressions. Common patterns: date
fields resolve via expressions referencing prior items; the node itself
documents equivalent expression forms (`$now`, `$today`, `.plus()`,
`.minus()`, `.format()`, `.extract()`, `.beginningOf()`, `.endOfMonth()`).

## Acceptance tests

### Test: formatDate with preset

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "operation": "formatDate", "date": "1986-09-04T08:30:00.000Z", "format": "yyyy-MM-dd", "outputFieldName": "formattedDate" }
```

**Expect** output[0]:

```json
[{ "json": { "formattedDate": "1986-09-04" } }]
```

### Test: addToDate

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "operation": "addToDate", "magnitude": "2020-01-15T12:00:00.000Z", "timeUnit": "days", "duration": 2, "outputFieldName": "newDate" }
```

**Expect** output[0]:

```json
[{ "json": { "newDate": "2020-01-17T12:00:00.000Z" } }]
```

### Test: getCurrentDate with includeTime false (midnight)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "operation": "getCurrentDate", "includeTime": false, "outputFieldName": "currentDate", "options": { "timezone": "GMT" } }
```

**Expect** output[0] (time component is `00:00:00.000Z`, date is today in GMT):

```json
[{ "json": { "currentDate": "<TODAY_GMT>T00:00:00.000Z" } }]
```

### Test: getTimeBetweenDates as object

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "operation": "getTimeBetweenDates", "startDate": "2020-01-01T00:00:00.000Z", "endDate": "2021-04-14T00:00:00.000Z", "units": ["year", "month", "day"], "outputFieldName": "timeDifference", "options": { "isoString": false } }
```

**Expect** output[0]:

```json
[{ "json": { "timeDifference": { "years": 1, "months": 3, "days": 13 } } }]
```

### Test: roundDate down to month, preserving input fields

**Given** input items:

```json
[{ "json": { "id": 7 } }]
```

**Parameters:**

```json
{ "operation": "roundDate", "date": "2020-03-15T12:34:56.000Z", "mode": "roundDown", "toNearest": "month", "outputFieldName": "roundedDate", "options": { "includeInputFields": true } }
```

**Expect** output[0]:

```json
[{ "json": { "id": 7, "roundedDate": "2020-03-01T00:00:00.000Z" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names, defaults, option enums | documented (descriptor metadata) | Confirmed against public descriptor; V2 only. |
| Operation set (7 ops) | documented | Public docs enumerate all seven. |
| Timezone resolution order | documented | Workflow → instance (`America/New_York` / `GMT`). |
| getTimeBetweenDates object shape | documented | Docs show per-unit keys; ISO duration when `isoString` true. |
| roundDate `roundUp` unit set | inferred | Descriptor exposes only `month` ("End of Month") for `roundUp`; other units are roundDown-only via `toNearest`. |
| V1 behavior | inferred | V1 retained for import compatibility; V2 is the active version. Exact V1 param surface not re-documented here. |
| Error/continueOnFail details | inferred | General node convention; docs do not enumerate per-op error cases. |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/date-time.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
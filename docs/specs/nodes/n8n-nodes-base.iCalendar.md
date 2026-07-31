---
type: n8n-nodes-base.iCalendar
displayName: iCalendar
category: Transform
versions: [1]
priority: medium
status: specced
alias: [n8n-nodes-base.iCal, ics, .ics]
---

# iCalendar

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile/ | Public docs (related — node page is 404) |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.iCalendar`
- **Aliases:** `n8n-nodes-base.iCal`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

The node has a single operation (`createEventFile`) with the following event-definition parameters:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | hidden | `createEventFile` | yes | Fixed; always "Create Event File" |
| title | string | `""` | no | Event summary / subject line |
| start | dateTime | — | yes | Event start. For all-day events, time portion is ignored |
| end | dateTime | — | yes | Event end; falls back to start value if omitted |
| allDay | boolean | `false` | no | When true, the generated event spans the full date(s) |
| binaryPropertyName | string | `"data"` | yes | Output binary field name for the generated `.ics` file |

**Additional Fields** (collection keyed under `additionalFields`):

| name | type | default | notes |
|------|------|---------|-------|
| attendees | fixedCollection | — | Multiple attendees; each has name, email, rsvp |
| busyStatus | options | `""` | `BUSY` or `TENTATIVE`; for Microsoft Outlook compatibility |
| calName | string | `""` | Calendar name for Apple iCal / Microsoft Outlook |
| description | string | `""` | Event body / notes |
| fileName | string | `""` | Output filename (defaults to `event.ics`) |
| geolocation | fixedCollection | — | Latitude + longitude |
| location | string | `""` | Venue name or address |
| organizer | fixedCollection | — | Single organizer with name + email |
| recurrenceRule | string | `""` | iCalendar RRULE string (e.g. `FREQ=WEEKLY;COUNT=10`) |
| sequence | number | `0` | Revision number for event updates |
| status | options | `CONFIRMED` | `CONFIRMED`, `CANCELLED`, or `TENTATIVE` |
| uid | string | `""` | Globally unique identifier (auto-generated if empty) |
| url | string | `""` | URL associated with the event |
| useWorkflowTimezone | boolean | `false` | Convert start/end times to the workflow timezone instead of UTC |

## Runtime behavior

### Input

The node accepts any `main` input items. It processes each item independently and generates one `.ics` binary file per item. Input `json` data is not carried through to the output.

### Output

For each input item, the node produces one output item with:
- `json`: empty object `{}`
- `binary`: a single entry keyed by `binaryPropertyName` containing the generated `.ics` file (`text/calendar` MIME type)
- `pairedItem`: reference to the source item index

The generated iCalendar file follows the [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) standard via the `ics` library. Date/times are emitted in UTC by default.

### Errors

- If `start` is missing or invalid, the node throws a `NodeOperationError`.
- If an iCalendar generation error occurs (e.g. invalid RRULE), the node throws with a descriptive error message.
- When `continueOnFail` is enabled, failed items produce `{ json: { error: <message> } }` and processing continues to the next item.

### Expressions

All parameters accept expression strings. The `operation` parameter has `noDataExpression: true`.

## Acceptance tests

### Test: basic event file

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "title": "Team Standup",
  "start": "2025-01-13T09:00:00Z",
  "end": "2025-01-13T09:30:00Z",
  "binaryPropertyName": "data"
}
```

**Expect** output[0] to contain:
- `json` is `{}`
- `binary.data` exists with MIME type `text/calendar`
- The binary content is a valid `.ics` file containing `BEGIN:VCALENDAR`, `BEGIN:VEVENT`, `SUMMARY:Team Standup`, `DTSTART`, `DTEND`, `END:VEVENT`, `END:VCALENDAR`
- `pairedItem.item` is `0`

### Test: all-day event

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "title": "Holiday",
  "start": "2025-12-25T00:00:00Z",
  "allDay": true,
  "binaryPropertyName": "data"
}
```

**Expect** output[0] binary `.ics` content to contain `DTSTART;VALUE=DATE:20251225` (date-only, no time).

### Test: event with attendees and location

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "title": "Meeting",
  "start": "2025-06-01T14:00:00Z",
  "end": "2025-06-01T15:00:00Z",
  "binaryPropertyName": "data",
  "additionalFields": {
    "attendeesUi": {
      "attendeeValues": [
        { "name": "Alice", "email": "alice@example.com", "rsvp": true }
      ]
    },
    "location": "Conference Room A",
    "description": "Quarterly review"
  }
}
```

**Expect** output binary `.ics` content to contain `ATTENDEE`, `LOCATION:Conference Room A`, and `DESCRIPTION:Quarterly review`.

### Test: continue on fail

**Given** input items:

```json
[{ "json": {} }, { "json": {} }]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "start": "",
  "binaryPropertyName": "data",
  "continueOnFail": true
}
```

**Expect** output[0] to contain `{ "json": { "error": "..." } }` and output[1] similarly.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node page on docs.n8n.io | Public docs: 404 | The node is hidden in the UI; no dedicated doc page exists |
| Parameter names, types, defaults | Descriptor metadata (corpus) | Confirmed from npm package `nodes/ICalendar/*.js` descriptors |
| Runtime algorithm (`ics` library, moment-timezone, binary output) | Descriptor source | Observed from the compiled JS implementation; this is the external contract |
| Undocumented operations | Descriptor | Only `createEventFile` exists in v2.15.1; no other operations |
| RRULE validation | Inferred | Relies on the `ics` npm package; invalid RRULEs throw |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/iCalendar.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
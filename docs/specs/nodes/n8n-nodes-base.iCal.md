---
type: n8n-nodes-base.iCal
displayName: iCalendar
category: Transform
versions: [1]
priority: low
status: specced
---

# iCalendar (Convert to ICS)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile/ | Public docs only |
| https://icalendar.org/ | Public spec (iCalendar RFC 5545) |

## Wire format

- **Type string:** `n8n-nodes-base.iCal`
- **Aliases:** `ics`, `.ics`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** none

## Parameters

The node has a single operation (`createEventFile`). Parameters are split into required event fields and optional collection fields.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | options | createEventFile | yes | Single value; "Create Event File" |
| title | string | "" | no | Event title |
| start | dateTime | "" | yes | Event start (UTC or workflow timezone). For all-day events, time portion is ignored. |
| end | dateTime | "" | yes | Event end. If unset, defaults to start. For all-day events, time portion is ignored. |
| allDay | boolean | false | no | When true, start/end dates become DATE values (no time) per iCalendar DTSTART;VALUE=DATE |
| binaryPropertyName | string | "data" | yes | Name of the binary property in the output item that will hold the .ics file content |
| additionalFields | collection | {} | no | See Options sub-table below |

**Options (additionalFields collection):**

| name | type | default | notes |
|------|------|---------|-------|
| fileName | string | "event.ics" | Override the generated file name |
| attendeesUi.fixedCollection | collection | — | Multi-value attendee list; each entry has name (string, required), email (string, required), rsvp (boolean, default false) |
| busyStatus | options | — | "BUSY" or "TENTATIVE". Maps to X-MICROSOFT-CDO-BUSYSTATUS for Outlook interop. |
| calName | string | "" | Calendar (not event) name, for Apple iCal and Outlook interop via X-WR-CALNAME |
| description | string | "" | Event description body |
| geolocationUi.fixedCollection | collection | — | Single geolocation with lat (string) and lon (string) fields |
| location | string | "" | Free-text venue string |
| recurrenceRule | string | "" | iCalendar RRULE string for recurrence pattern |
| organizerUi.fixedCollection | collection | — | Single organizer with name (string) and email (string) |
| sequence | number | 0 | Revision sequence number for event updates (same UID) |
| status | options | "CONFIRMED" | "CONFIRMED", "CANCELLED", or "TENTATIVE" |
| uid | string | auto-generated | Globally unique identifier for the event |
| url | string | "" | URL associated with the event |
| useWorkflowTimezone | boolean | false | If true, dates use the workflow-configured timezone instead of UTC |

## Runtime behavior

### Input

Consumes one item from `main` input. Each item becomes one iCalendar event. When multiple input items exist, the node processes each independently, producing one binary output per item.

Certain parameter values (`title`, `start`, `end`, `description`, `location`, etc.) accept expression strings that can reference input item properties.

### Output

For each input item, produces one output item on `main[0]` with the following shape:

- The original item JSON is preserved.
- A new binary property (named by `binaryPropertyName`, default `"data"`) is added containing the generated `.ics` file content.
- The binary property includes `mimeType: "text/calendar"`, `fileName` (from the `fileName` option or default `event.ics`), and `fileSize`.

The generated iCalendar payload conforms to RFC 5545. Key VEVENT properties emitted:

- `DTSTART` / `DTEND` (DATE-TIME or DATE depending on `allDay`)
- `SUMMARY` (from `title`)
- `DESCRIPTION`, `LOCATION`, `URL`, `UID`, `SEQUENCE`, `STATUS`
- `RRULE` (if `recurrenceRule` set)
- `ORGANIZER` (CN + MAILTO)
- `ATTENDEE` (CN + MAILTO + PARTSTAT=NEEDS-ACTION if RSVP, else empty)
- `GEO` (if geolocation provided)
- `X-WR-CALNAME` (if `calName` set)
- `X-MICROSOFT-CDO-BUSYSTATUS` (if `busyStatus` set)

### Errors

- If `start` is empty or unparseable, the node throws a validation error.
- On expression evaluation failures, the node follows standard n8n behavior: throws if the expression is unresolvable and `continueOnFail` is not set.
- Binary file generation failures (e.g. filesystem write errors) result in a thrown error.

### Expressions

The following parameters accept expression strings: `title`, `start`, `end`, `description`, `location`, `url`, `uid`, `recurrenceRule`, `calName`, `fileName`, `sequence`. Nested sub-fields in `attendeesUi`, `organizerUi`, and `geolocationUi` also accept expressions.

## Acceptance tests

### Test: basic event creation

**Given** input items:

```json
[{
  "json": {
    "eventTitle": "Team Standup",
    "startDate": "2026-08-07T09:00:00Z",
    "endDate": "2026-08-07T09:30:00Z"
  }
}]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "title": "={{ $json.eventTitle }}",
  "start": "={{ $json.startDate }}",
  "end": "={{ $json.endDate }}",
  "allDay": false,
  "binaryPropertyName": "data"
}
```

**Expect** output[0] has:
- `json` preserves the original properties
- `binary.data` exists with `mimeType: "text/calendar"`
- The binary content is a valid ICS file containing `BEGIN:VEVENT`, `DTSTART:20260807T090000Z`, `DTEND:20260807T093000Z`, `SUMMARY:Team Standup`, `END:VEVENT`

### Test: all-day event with options

**Given** input items:

```json
[{
  "json": {
    "title": "Conference Day",
    "date": "2026-09-15",
    "loc": "Convention Center",
    "desc": "Annual tech conference"
  }
}]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "title": "={{ $json.title }}",
  "start": "={{ $json.date }}",
  "end": "={{ $json.date }}",
  "allDay": true,
  "binaryPropertyName": "ics",
  "additionalFields": {
    "location": "={{ $json.loc }}",
    "description": "={{ $json.desc }}",
    "status": "CONFIRMED"
  }
}
```

**Expect** output[0] has:
- `binary.ics` with valid ICS
- `DTSTART;VALUE=DATE:20260915` and `DTEND;VALUE=DATE:20260915` (DATE format, no time)
- `LOCATION:Convention Center`, `DESCRIPTION:Annual tech conference`, `STATUS:CONFIRMED`

### Test: event with attendee and organizer

**Given** input items:

```json
[{
  "json": {
    "title": "Review Meeting",
    "start": "2026-08-10T14:00:00Z",
    "end": "2026-08-10T15:00:00Z"
  }
}]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "title": "={{ $json.title }}",
  "start": "={{ $json.start }}",
  "end": "={{ $json.end }}",
  "binaryPropertyName": "data",
  "additionalFields": {
    "organizerUi": {
      "organizerValues": {
        "name": "Alice",
        "email": "alice@example.com"
      }
    },
    "attendeesUi": {
      "attendeeValues": [
        { "name": "Bob", "email": "bob@example.com", "rsvp": true },
        { "name": "Carol", "email": "carol@example.com", "rsvp": false }
      ]
    }
  }
}
```

**Expect** output[0] binary contains:
- `ORGANIZER;CN=Alice:mailto:alice@example.com`
- `ATTENDEE;CN=Bob;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:bob@example.com`
- `ATTENDEE;CN=Carol:mailto:carol@example.com`

### Test: multiple input items produce multiple output items

**Given** input items:

```json
[
  { "json": { "title": "Event A", "start": "2026-08-01T10:00:00Z", "end": "2026-08-01T11:00:00Z" } },
  { "json": { "title": "Event B", "start": "2026-08-02T10:00:00Z", "end": "2026-08-02T11:00:00Z" } }
]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "title": "={{ $json.title }}",
  "start": "={{ $json.start }}",
  "end": "={{ $json.end }}",
  "binaryPropertyName": "data"
}
```

**Expect** output[0] has 2 items, each with its own `binary.data` containing a valid ICS with the respective `SUMMARY` and `DTSTART`.

### Test: error on missing start

**Given** input items:

```json
[{ "json": { "title": "No Date" } }]
```

**Parameters:**

```json
{
  "operation": "createEventFile",
  "title": "={{ $json.title }}",
  "start": "",
  "end": "",
  "binaryPropertyName": "data"
}
```

**Expect:** Node throws a validation error indicating `start` is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| ICS file format details | inferred | RFC 5545 is a public standard; exact property formatting choices (line folding, encoding) are implementation details not documented on the n8n page |
| X-MICROSOFT-CDO-BUSYSTATUS behavior | documented | Mentioned in public docs as "Busy Status" option |
| X-WR-CALNAME behavior | documented | Mentioned in public docs as "Calendar Name" option |
| `attendeesUi` nested structure | inferred from corpus | Parameter names and nesting confirmed from npm package descriptor, cross-checked against public docs |
| Default file name | documented | Public docs confirm default is `event.ics` |
| `hidden: true` flag | inferred from corpus | The node is not listed as a standalone node in n8n's UI; it is exposed as an operation of the "Convert to File" node. The type string `n8n-nodes-base.iCal` exists for wire-format compatibility. |
| RRULE generation | documented | Public docs link to the iCalendar.org RRULE Tool |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/iCal.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

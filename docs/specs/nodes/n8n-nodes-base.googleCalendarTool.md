---
type: n8n-nodes-base.googleCalendarTool
displayName: Google Calendar
category: AI Tool
versions: [1, 1.1, 1.2, 1.3]
priority: high
status: specced
---

# Google Calendar (AI Tool)

A tool variant of the Google Calendar node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Calendar (Availability check) and Event (Create, Delete, Get, Get Many, Update) resources against the Google Calendar API v3.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/event-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/calendar-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.google.com/calendar/api/v3/reference | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleCalendarTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleCalendarOAuth2Api` (OAuth2) or `googleApi` (service account)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | `oAuth2` or `serviceAccount` |

### Resource and operation selection

The user selects a resource (Calendar or Event) which determines available operations.

### Calendar operations

| Operation | Key parameters |
|-----------|----------------|
| Availability | Calendar (by list or ID), Start Time, End Time; Options: Output Format (Availability / Booked Slots / RAW), Timezone |

### Event operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Calendar (by list or ID), Start Time, End Time; Options: All Day, Attendees, Color, Conference Data (Hangouts/Meet link), Description, Guest permissions (Invite Others, Modify, See Others), Location, Max Attendees, Repeat Frequency/Count/Until/RRULE, Send Updates, Show Me As, Summary |
| Delete | Calendar (by list or ID), Event ID; Options: Send Updates |
| Get | Calendar (by list or ID), Event ID; Options: Max Attendees, Return Next Instance of Recurrent Event, Timezone |
| Get Many | Calendar (by list or ID), Return All / Limit, After, Before; Options: Fields, iCalUID, Max Attendees, Order By, Query (free text), Recurring Event Handling (All Occurrences / First Occurrence / Next Occurrence), Show Deleted, Show Hidden Invitations, Timezone, Updated Min |
| Update | Calendar (by list or ID), Event ID, Modify scope (for recurring events), Update Fields (selectable subset: All Day, Attendees with add/replace mode, Color, Description, End, Guest permissions, Location, Max Attendees, Repeat Frequency/Count/Until/RRULE, Send Updates, Show Me As, Start, Summary, Visibility) |

### Calendar identification

Calendars can be identified by:
- **From list**: Dropdown selection of available calendars
- **By ID**: The calendar ID string (e.g. `primary` or a Gmail-style address)

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "let model fill" toggle is available on appropriate parameter fields
- Tool name and description metadata are configurable in the AI Agent node

## Runtime behavior

### Input

Consumes items from `main` input. Time expressions can reference existing item data using `$json` or `$now`.

### Output

**Output[0]** — operation result:
- **Availability**: Returns availability information based on the selected Output Format (boolean availability, booked slots array, or raw API response from Freebusy: query)
- **Event Create**: Returns the created event object from the Google Calendar API including `id`, `status`, `start`, `end`, `summary`, `htmlLink`, and any configured conference data
- **Event Delete**: Returns the API response confirming deletion (or empty success)
- **Event Get**: Returns the event object from the API including `id`, `status`, `start`, `end`, `summary`, `description`, `location`, `attendees`, `recurrence`, `creator`, `organizer`, `htmlLink`
- **Event Get Many**: Returns an array of event objects matching the time range and query criteria, optionally filtered by `Fields` parameter
- **Event Update**: Returns the updated event object from the API

### Errors

- API errors (auth failures, rate limits, invalid calendar/event IDs, permission errors) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Deleting an event is irreversible
- Invalid RRULE or recurrence configurations throw configuration errors before API calls

### Expressions

Parameters tagged as AI-populatable accept expression strings including `$fromAI()`. Time parameters default to `$now` (start) and `$now.plus(1, 'hour')` (end) expressions. All string fields accept standard n8n expressions.

## Acceptance tests

### Test: Check calendar availability

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "calendar",
  "operation": "availability",
  "calendar": { "mode": "id", "value": "primary" },
  "startTime": "={{ $now }}",
  "endTime": "={{ $now.plus(2, 'hours') }}",
  "options": { "outputFormat": "availability" }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "busy": false
  }
}]
```

### Test: Create a calendar event

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "create",
  "calendar": { "mode": "id", "value": "primary" },
  "startTime": "={{ $now }}",
  "endTime": "={{ $now.plus(1, 'hour') }}",
  "options": {
    "summary": "Team standup",
    "description": "Daily sync meeting",
    "attendees": [{ "email": "alice@example.com" }]
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<valid-event-id>",
    "status": "confirmed",
    "summary": "Team standup",
    "description": "Daily sync meeting",
    "start": { "dateTime": "<start-iso>", "timeZone": "<timezone>" },
    "end": { "dateTime": "<end-iso>", "timeZone": "<timezone>" },
    "attendees": [{ "email": "alice@example.com", "responseStatus": "needsAction" }],
    "htmlLink": "https://www.google.com/calendar/event?eid=<encoded-id>",
    "creator": { "email": "me@example.com" },
    "organizer": { "email": "me@example.com" }
  }
}]
```

### Test: Get all events in a date range

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "getAll",
  "calendar": { "mode": "id", "value": "primary" },
  "returnAll": true,
  "after": "={{ $now.startOf('week') }}",
  "before": "={{ $now.endOf('week') }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<event-id>",
    "summary": "Team standup",
    "start": { "dateTime": "<start-iso>" },
    "end": { "dateTime": "<end-iso>" },
    "status": "confirmed"
  }
}]
```

### Test: Delete an event by ID

**Given** input items:
```json
[{ "json": { "eventId": "abc123def" } }]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "delete",
  "calendar": { "mode": "id", "value": "primary" },
  "eventId": "={{ $json.eventId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {}
}]
```

### Test: Update an event summary

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "update",
  "calendar": { "mode": "id", "value": "primary" },
  "eventId": "existing-event-id",
  "updateFields": {
    "summary": "Updated: Team standup",
    "description": "Rescheduled daily sync"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "existing-event-id",
    "status": "confirmed",
    "summary": "Updated: Team standup",
    "description": "Rescheduled daily sync",
    "start": { "dateTime": "<start-iso>" },
    "end": { "dateTime": "<end-iso>" },
    "htmlLink": "https://www.google.com/calendar/event?eid=<encoded-id>"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Google Calendar operations and parameters | documented | Public docs comprehensively describe Calendar and Event operations |
| Exact output shape for each operation | documented | Outcome-level shapes documented; exact JSON varies by Google Calendar API v3 version |
| $fromAI() dynamic parameter support | documented | Public docs confirm support for AI tool parameter hints |
| Tool-specific parameter layout | inferred | The tool variant wraps standard Google Calendar operations identically to the base node in agent context |
| Credential type for tool | inferred | Uses `googleCalendarOAuth2Api` (consistent with Google Calendar node) and `googleApi` (consistent with other Google tool nodes) |
| Version differences (v1-v1.3) | inferred from corpus | Multiple minor versions exist; all share the same resource/operation structure documented in public docs |
| Alias list | inferred | No known aliases for this tool node; unlike googleSheetsTool which registers CSV/Sheet/Spreadsheet/GS |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleCalendarTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
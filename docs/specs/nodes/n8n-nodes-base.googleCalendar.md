---
type: n8n-nodes-base.googleCalendar
displayName: Google Calendar
category: Productivity
versions: [1]
priority: medium
status: implemented
---

# Google Calendar

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/calendar-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/event-operations.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.googleCalendar`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleCalendarOAuth2Api` (OAuth2, single-service)

## Parameters

### Authentication

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `oAuth2` | yes | — | Options: `oAuth2` |

### Resource & operation

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `event` | yes | — | Options: `calendar`, `event` |
| operation | options | `create` | yes | — | See below per-resource |

### Resource: Calendar

#### Operation: Availability

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | — | yes | `resource=calendar` | Value: `availability` |
| calendar | resourceLocator | `{ mode: 'list', value: '' }` | yes | `resource=calendar, operation=availability` | Choose from list or By ID |
| startTime | dateTime | `{{ $now }}` | yes | `resource=calendar, operation=availability` | Start of the time-slot |
| endTime | dateTime | `{{ $now.plus(1, 'hour') }}` | yes | `resource=calendar, operation=availability` | End of the time-slot |
| options.outputFormat | options | `availability` | no | `resource=calendar, operation=availability` | Options: `availability`, `bookedSlots`, `raw` |
| options.timezone | options | `''` | no | `resource=calendar, operation=availability` | Timezone for response; defaults to n8n timezone |

### Resource: Event

#### Common parameters (all event operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| calendar | resourceLocator | `{ mode: 'list', value: '' }` | yes | `resource=event` | Choose from list or By ID |

#### Operation: Create

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | — | yes | `resource=event` | Value: `create` |
| startTime | dateTime | `{{ $now }}` | yes | `resource=event, operation=create` | Event start time |
| endTime | dateTime | `{{ $now.plus(1, 'hour') }}` | yes | `resource=event, operation=create` | Event end time |
| useDefaultReminders | boolean | `true` | no | `resource=event, operation=create` | Use calendar's default reminders |
| options.allDay | boolean | `false` | no | `resource=event, operation=create` | Whether event is all-day |
| options.attendees | fixedCollection | `{}` | no | `resource=event, operation=create` | Attendee email addresses |
| options.color | color | `''` | no | `resource=event, operation=create` | Event color (loaded via getColors) |
| options.conferenceData | fixedCollection | `{}` | no | `resource=event, operation=create` | Conference solution type (loaded via getConferenceSolutions) |
| options.description | string | `''` | no | `resource=event, operation=create` | Event description |
| options.guestsCanInviteOthers | boolean | `true` | no | `resource=event, operation=create` | Whether guests can invite others |
| options.guestsCanModify | boolean | `false` | no | `resource=event, operation=create` | Whether guests can modify the event |
| options.guestsCanSeeOtherGuests | boolean | `true` | no | `resource=event, operation=create` | Whether guests can see other attendees |
| options.id | string | `''` | no | `resource=event, operation=create` | Opaque identifier |
| options.location | string | `''` | no | `resource=event, operation=create` | Free-form text location |
| options.maxAttendees | number | `0` | no | `resource=event, operation=create` | Max attendees to include in response |
| options.repeatFrequency | options | `''` | no | `resource=event, operation=create` | Options: `daily`, `weekly`, `monthly`, `yearly` |
| options.repeatHowManyTimes | number | `1` | no | `resource=event, operation=create` | Number of recurrence instances |
| options.repeatUntil | dateTime | `''` | no | `resource=event, operation=create` | End date for recurrence |
| options.rrule | string | `''` | no | `resource=event, operation=create` | Recurrence rule (overrides repeatFrequency/HowManyTimes/Until) |
| options.sendUpdates | options | `''` | no | `resource=event, operation=create` | Options: `all`, `externalOnly`, `none` |
| options.showMeAs | options | `''` | no | `resource=event, operation=create` | Options: `opaque` (busy), `transparent` (free) |
| options.summary | string | `''` | no | `resource=event, operation=create` | Event title |

#### Operation: Delete

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | — | yes | `resource=event` | Value: `delete` |
| eventId | string | `''` | yes | `resource=event, operation=delete` | ID of event to delete |
| options.sendUpdates | options | `''` | no | `resource=event, operation=delete` | Options: `all`, `externalOnly`, `none` |

#### Operation: Get

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | — | yes | `resource=event` | Value: `get` |
| eventId | string | `''` | yes | `resource=event, operation=get` | ID of event to retrieve |
| options.maxAttendees | number | `0` | no | `resource=event, operation=get` | Max attendees to include in response |
| options.returnNextRecurring | boolean | `false` | no | `resource=event, operation=get` | Return next instance of recurring event |
| options.timezone | options | `''` | no | `resource=event, operation=get` | Timezone for response; defaults to n8n timezone |

#### Operation: Get Many

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | — | yes | `resource=event` | Value: `getAll` |
| returnAll | boolean | `true` | yes | `resource=event, operation=getAll` | Return all results or limit |
| limit | number | `50` | no | `resource=event, operation=getAll, returnAll=false` | Max number of results |
| after | dateTime | `{{ $now }}` | yes | `resource=event, operation=getAll` | Lower bound for event start time |
| before | dateTime | `{{ $now.plus({ week: 1 }) }}` | no | `resource=event, operation=getAll` | Upper bound for event start time |
| options.fields | string | `''` | no | `resource=event, operation=getAll` | Fields to return; `*` for all |
| options.iCalUID | string | `''` | no | `resource=event, operation=getAll` | iCalendar format event ID |
| options.maxAttendees | number | `0` | no | `resource=event, operation=getAll` | Max attendees to include in response |
| options.orderBy | options | `''` | no | `resource=event, operation=getAll` | Options: `startTime`, `updated` |
| options.query | string | `''` | no | `resource=event, operation=getAll` | Free-text search across all fields |
| options.recurringEventHandling | options | `''` | no | `resource=event, operation=getAll` | Options: `allOccurrences`, `firstOccurrence`, `nextOccurrence` |
| options.showDeleted | boolean | `false` | no | `resource=event, operation=getAll` | Include cancelled events |
| options.showHiddenInvitations | boolean | `false` | no | `resource=event, operation=getAll` | Include hidden invitations |
| options.timezone | options | `''` | no | `resource=event, operation=getAll` | Timezone for response; defaults to n8n timezone |
| options.updatedMin | dateTime | `''` | no | `resource=event, operation=getAll` | Lower bound for last modification time (RFC 3339) |

#### Operation: Update

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | — | yes | `resource=event` | Value: `update` |
| eventId | string | `''` | yes | `resource=event, operation=update` | ID of event to update |
| modify | options | `''` | no | `resource=event, operation=update` | Options: `recurringEventInstance`, `recurringEvent` (for recurring events) |
| useDefaultReminders | boolean | `true` | no | `resource=event, operation=update` | Use calendar's default reminders |
| updateFields.allDay | boolean | `false` | no | `resource=event, operation=update` | Whether event is all-day |
| updateFields.attendees | fixedCollection | `{}` | no | `resource=event, operation=update` | Attendees (add or replace) |
| updateFields.color | color | `''` | no | `resource=event, operation=update` | Event color |
| updateFields.description | string | `''` | no | `resource=event, operation=update` | Event description |
| updateFields.end | dateTime | `''` | no | `resource=event, operation=update` | End time |
| updateFields.guestsCanInviteOthers | boolean | `true` | no | `resource=event, operation=update` | Whether guests can invite others |
| updateFields.guestsCanModify | boolean | `false` | no | `resource=event, operation=update` | Whether guests can modify |
| updateFields.guestsCanSeeOtherGuests | boolean | `true` | no | `resource=event, operation=update` | Whether guests can see other guests |
| updateFields.id | string | `''` | no | `resource=event, operation=update` | Opaque identifier |
| updateFields.location | string | `''` | no | `resource=event, operation=update` | Free-form text location |
| updateFields.maxAttendees | number | `0` | no | `resource=event, operation=update` | Max attendees to include in response |
| updateFields.repeatFrequency | options | `''` | no | `resource=event, operation=update` | Options: `daily`, `weekly`, `monthly`, `yearly` |
| updateFields.repeatHowManyTimes | number | `1` | no | `resource=event, operation=update` | Number of recurrence instances |
| updateFields.repeatUntil | dateTime | `''` | no | `resource=event, operation=update` | End date for recurrence |
| updateFields.rrule | string | `''` | no | `resource=event, operation=update` | Recurrence rule (overrides repeatFrequency/HowManyTimes/Until) |
| updateFields.sendUpdates | options | `''` | no | `resource=event, operation=update` | Options: `all`, `externalOnly`, `none` |
| updateFields.showMeAs | options | `''` | no | `resource=event, operation=update` | Options: `opaque`, `transparent` |
| updateFields.start | dateTime | `''` | no | `resource=event, operation=update` | Start time |
| updateFields.summary | string | `''` | no | `resource=event, operation=update` | Event title |
| updateFields.visibility | options | `''` | no | `resource=event, operation=update` | Options: `confidential`, `default`, `public`, `private` |

## Runtime behavior

### Authentication

The node uses OAuth2 via the `googleCalendarOAuth2Api` credential. Managed OAuth2
(Cloud-hosted n8n) signs in directly; self-hosted instances must configure a
Custom OAuth2 app with the Calendar API enabled.

### Input

Each input item is processed independently. The node reads parameters from the
item or from fixed node parameters (depending on `@version` and expression
bindings).

### Output

For each input item, the node produces one output item to `main[0]` unless an
error occurs and `continueOnFail` is set.

- **Calendar / Availability:** Returns `{ available: boolean }` for `availability`
format; `bookedSlots` returns an array of busy intervals; `raw` returns the
Google Freebusy API response.
- **Event / Create:** Returns the created event object per the Google Calendar
Events: insert API response shape.
- **Event / Delete:** Returns `{ success: boolean }`.
- **Event / Get:** Returns the event object per the Google Calendar Events: get
API response shape (includes `created`, `creator`, `description`, `end`, `etag`,
`eventType`, `htmlLink`, `iCalUID`, `id`, `kind`, `location`, `organizer`,
`reminders`, `sequence`, `start`, `status`, `summary`, `updated`).
- **Event / Get Many:** Returns an array of event objects (same shape as Get).
Supports pagination via `returnAll` / `limit`.
- **Event / Update:** Returns the updated event object (same shape as Get).

### Errors

- API errors (e.g. 404 for missing event, 403 for insufficient scope) are thrown
as `NodeApiError`. If `continueOnFail` is true, the node outputs the error as
`{ json: { error: … } }` on `main[0]`.
- Invalid parameter combinations (e.g. missing required `eventId`) surface as
parameter validation errors before execution.

### Expressions

All `dateTime` / `string` / `number` parameters accept expression strings.
The `startTime`, `endTime`, `after`, `before`, `updatedMin` parameters have
expression defaults (`{{ $now }}`, `{{ $now.plus(1, 'hour') }}`, `{{ $now.plus({ week: 1 }) }}`).

## Acceptance tests

### Test: event create with basic fields

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "event",
  "operation": "create",
  "calendar": { "mode": "list", "value": "primary" },
  "startTime": "2026-08-01T09:00:00Z",
  "endTime": "2026-08-01T10:00:00Z",
  "useDefaultReminders": true,
  "options": {
    "summary": "Test event",
    "description": "Created by automated test",
    "location": "Conference Room A"
  }
}
```

**Expect** output[0] to contain an event object with:

```json
[{
  "json": {
    "id": "__any_string__",
    "summary": "Test event",
    "description": "Created by automated test",
    "location": "Conference Room A",
    "start": { "dateTime": "2026-08-01T09:00:00Z" },
    "end": { "dateTime": "2026-08-01T10:00:00Z" },
    "status": "confirmed"
  }
}]
```

### Test: calendar availability check (available)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "calendar",
  "operation": "availability",
  "calendar": { "mode": "list", "value": "primary" },
  "startTime": "2026-08-01T09:00:00Z",
  "endTime": "2026-08-01T10:00:00Z",
  "options": {
    "outputFormat": "availability"
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "available": true } }]
```

### Test: event get by ID

**Given** input items:

```json
[{ "json": { "eventId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "event",
  "operation": "get",
  "calendar": { "mode": "list", "value": "primary" },
  "eventId": "={{ $json.eventId }}"
}
```

**Expect** output[0] to contain a single event object with matching `id`:

```json
[{ "json": {
  "id": "abc123",
  "kind": "calendar#event",
  "status": "confirmed",
  "summary": "__any_string__",
  "start": "__any_object__",
  "end": "__any_object__"
} }]
```

### Test: event delete

**Given** input items:

```json
[{ "json": { "eventId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "event",
  "operation": "delete",
  "calendar": { "mode": "list", "value": "primary" },
  "eventId": "={{ $json.eventId }}"
}
```

**Expect** output[0]:

```json
[{ "json": { "success": true } }]
```

### Test: get many with limit and time range

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "event",
  "operation": "getAll",
  "calendar": { "mode": "list", "value": "primary" },
  "returnAll": false,
  "limit": 10,
  "after": "2026-08-01T00:00:00Z",
  "before": "2026-08-07T23:59:59Z",
  "options": {
    "orderBy": "startTime",
    "showDeleted": false,
    "recurringEventHandling": "allOccurrences"
  }
}
```

**Expect** output[0] to contain an array of up to 10 event objects, each with
`id`, `start`, `end`, `summary`, `status`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact option values for `sendUpdates` | Inferred from descriptor (`all`, `externalOnly`, `none`) | Confirmed via Google Calendar API docs |
| `color` parameter type | Inferred as `color` type | Node loads color options via `getColors` loadOptions method |
| `conferenceData` structure | Inferred from descriptor | Has `createRequest.requestId` + `conferenceSolution.type`; conference solutions loaded via `getConferenceSolutions` |
| `showMeAs` → `transparency` mapping | Inferred | `opaque` → `opaque` (busy), `transparent` → `transparent` (free) |
| `modify` for recurring events in Update | Inferred from docs | `recurringEventInstance` vs `recurringEvent` |
| Default value for `useDefaultReminders` | Inferred | Consistent across Create and Update |
| Attendee `fixedCollection` structure | Inferred | Email addresses; Create uses simple list; Update has add/replace mode |
| `calendar` resourceLocator details | Documented | Mode: `list` (from dropdown) or `id` (by calendar ID) |
| Exact `visibility` option strings | Documented | `confidential`, `default`, `public`, `private` |
| `returnNextRecurring` (Get) → `returnNextInstanceOfRecurringEvent` | Inferred from descriptor | Maps to API `singleEvents=true` + `timeMin`/`timeMax` |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/google-calendar.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

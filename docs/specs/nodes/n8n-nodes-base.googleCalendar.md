---
type: n8n-nodes-base.googleCalendar
displayName: Google Calendar
category: Productivity
versions: [1, 1.1, 1.2, 1.3]
priority: high
status: specced
---

# Google Calendar

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |

---

## Node: `n8n-nodes-base.googleCalendar` (Action)

### Wire format

- **Type string:** `n8n-nodes-base.googleCalendar`
- **Aliases:** `Google Calendar`, `GoogleCalendar`, `gcal`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `googleCalendarOAuth2Api` (OAuth2 — recommended) — scopes: `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar.readonly`
- **Usable as tool:** true
- **Version support:** 1, 1.1, 1.2, 1.3

---

### Parameters

#### Common (all operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options | `event` | yes | — | `calendar` \| `event` |
| `operation` | options | (depends on resource) | yes | — | See per-resource tables |

---

#### Resource: `calendar`

##### Operation: `availability` — Check calendar availability

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `availability` | yes | `resource:calendar` | — |
| `calendar` | resourceLocator | — | yes | `resource:calendar, operation:availability` | Modes: `list` (searchable calendars), `id` (raw calendar ID) |
| `timeMin` | dateTime | — | yes | `resource:calendar, operation:availability, @version:<1.3` | Start of interval (v1.2 and below) |
| `timeMax` | dateTime | — | yes | `resource:calendar, operation:availability, @version:<1.3` | End of interval (v1.2 and below) |
| `timeMin` | dateTime | `={{ $now }}` | yes | `resource:calendar, operation:availability, @version:>=1.3` | Start of interval (v1.3+) |
| `timeMax` | dateTime | `={{ $now.plus(1, 'hour') }}` | yes | `resource:calendar, operation:availability, @version:>=1.3` | End of interval (v1.3+) |
| `options.outputFormat` | options | `availability` | no | `resource:calendar, operation:availability` | `availability` (boolean) \| `bookedSlots` (array) \| `raw` (raw API) |
| `options.timezone` | resourceLocator | — | no | `resource:calendar, operation:availability` | Timezone for response; modes: `list` (searchable), `id` (raw TZ ID) |

**Output:**
- `outputFormat: availability` → Single item: `{ available: boolean }`
- `outputFormat: bookedSlots` → Array of busy slot objects `{ start, end }`
- `outputFormat: raw` → Raw Google Calendar API freebusy response

---

#### Resource: `event`

##### Operation: `create` — Create event

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `create` | yes | `resource:event` | — |
| `calendar` | resourceLocator | — | yes | `resource:event, operation:create` | Modes: `list`, `id` |
| `start` | dateTime | — | yes | `resource:event, operation:create, @version:<1.3` | Event start (v1.2 and below) |
| `end` | dateTime | — | yes | `resource:event, operation:create, @version:<1.3` | Event end (v1.2 and below) |
| `start` | dateTime | `={{ $now }}` | yes | `resource:event, operation:create, @version:>=1.3` | Event start (v1.3+) |
| `end` | dateTime | `={{ $now.plus(1, 'hour') }}` | yes | `resource:event, operation:create, @version:>=1.3` | Event end (v1.3+) |
| `useDefaultReminders` | boolean | `true` | no | `resource:event, operation:create` | Use calendar default reminders |
| `additionalFields.allday` | options | `no` | no | `resource:event, operation:create` | `yes` \| `no` — All-day event |
| `additionalFields.attendees` | string (multi-value) | `""` | no | `resource:event, operation:create` | Comma-separated attendee emails |
| `additionalFields.color` | options (loadOptions) | `""` | no | `resource:event, operation:create` | Event color ID from `getColors` |
| `additionalFields.conferenceDataUi` | fixedCollection | `{}` | no | `resource:event, operation:create` | Conference data (Meet, Hangouts); requires `conferenceDataVersion=1` |
| `additionalFields.conferenceDataUi.conferenceDataValues.conferenceSolution` | options (loadOptions) | `""` | no | `resource:event, operation:create` | Conference type from `getConferenceSolutions` (depends on calendar) |
| `additionalFields.description` | string | `""` | no | `resource:event, operation:create` | Event description |
| `additionalFields.guestsCanInviteOthers` | boolean | `true` | no | `resource:event, operation:create` | Guests can invite others |
| `additionalFields.guestsCanModify` | boolean | `false` | no | `resource:event, operation:create` | Guests can modify event |
| `additionalFields.guestsCanSeeOtherGuests` | boolean | `true` | no | `resource:event, operation:create` | Guests see guest list |
| `additionalFields.id` | string | `""` | no | `resource:event, operation:create` | Custom event ID (opaque) |
| `additionalFields.location` | string | `""` | no | `resource:event, operation:create` | Event location |
| `additionalFields.maxAttendees` | number | `0` | no | `resource:event, operation:create` | Max attendees to include in response |
| `additionalFields.repeatFrecuency` | options | `""` | no | `resource:event, operation:create` | `Daily` \| `weekly` \| `monthly` \| `yearly` (legacy recurrence) |
| `additionalFields.repeatHowManyTimes` | number | `1` | no | `resource:event, operation:create` | Repeat count (min 1) |
| `additionalFields.repeatUntil` | dateTime | `""` | no | `resource:event, operation:create` | Repeat until date |
| `additionalFields.rrule` | string | `""` | no | `resource:event, operation:create` | RRULE string (overrides legacy repeat fields) |
| `additionalFields.sendUpdates` | options | `""` | no | `resource:event, operation:create` | `all` \| `externalOnly` \| `none` — Send notifications |
| `additionalFields.showMeAs` | options | `opaque` | no | `resource:event, operation:create` | `transparent` (Available) \| `opaque` (Busy) |
| `additionalFields.summary` | string | `""` | no | `resource:event, operation:create` | Event title |
| `additionalFields.visibility` | options | `default` | no | `resource:event, operation:create` | `confidential` \| `default` \| `private` \| `public` |
| `remindersUi.remindersValues[].method` | options | `""` | no | `resource:event, operation:create, useDefaultReminders:false` | `email` \| `popup` |
| `remindersUi.remindersValues[].minutes` | number | `0` | no | `resource:event, operation:create, useDefaultReminders:false` | Minutes before event (0–40320) |

**Output:** Single item with created event object (id, summary, start, end, attendees, creator, organizer, description, location, created, updated, ...)

---

##### Operation: `delete` — Delete event

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `delete` | yes | `resource:event` | — |
| `calendar` | resourceLocator | — | yes | `resource:event, operation:delete` | Modes: `list`, `id` |
| `eventId` | string | — | yes | `resource:event, operation:delete` | Event ID to delete |
| `options.sendUpdates` | options | `""` | no | `resource:event, operation:delete` | `all` \| `externalOnly` \| `none` |

**Output:** Single item: `{ success: true }`

---

##### Operation: `get` — Get event

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `get` | yes | `resource:event` | — |
| `calendar` | resourceLocator | — | yes | `resource:event, operation:get` | Modes: `list`, `id` |
| `eventId` | string | — | yes | `resource:event, operation:get` | Event ID |
| `options.maxAttendees` | number | `0` | no | `resource:event, operation:get` | Max attendees in response |
| `options.returnNextInstance` | boolean | `false` | no | `resource:event, operation:get, @version:>=1.3` | Return next instance of recurring event |
| `options.timeZone` | resourceLocator | — | no | `resource:event, operation:get` | Timezone for response; modes: `list`, `id` |

**Output:** Single item with event object. For recurring events with `returnNextInstance=true` (v1.3+), returns the next instance.

---

##### Operation: `getAll` — Get many events

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `getAll` | yes | `resource:event` | — |
| `calendar` | resourceLocator | — | yes | `resource:event, operation:getAll` | Modes: `list`, `id` |
| `returnAll` | boolean | `false` | no | `resource:event, operation:getAll` | Return all (pagination) |
| `limit` | number | `50` | no | `resource:event, operation:getAll, returnAll:false` | Max results (1–500) |
| `timeMin` | dateTime | `={{ $now }}` | no | `resource:event, operation:getAll, @version:>=1.3` | Min event start time (v1.3+) |
| `timeMax` | dateTime | `={{ $now.plus({week:1}) }}` | no | `resource:event, operation:getAll, @version:>=1.3` | Max event start time (v1.3+) |
| `options.timeMin` | dateTime | `""` | no | `resource:event, operation:getAll, @version:<1.3` | Min time (legacy, v1.2-) |
| `options.timeMax` | dateTime | `""` | no | `resource:event, operation:getAll, @version:<1.3` | Max time (legacy, v1.2-) |
| `options.singleEvents` | boolean | `false` | no | `resource:event, operation:getAll, @version:<1.3` | Expand recurring events (legacy) |
| `options.iCalUID` | string | `""` | no | `resource:event, operation:getAll` | Filter by iCal UID |
| `options.maxAttendees` | number | `0` | no | `resource:event, operation:getAll` | Max attendees per event |
| `options.orderBy` | options | `""` | no | `resource:event, operation:getAll` | `startTime` \| `updated` |
| `options.query` | string | `""` | no | `resource:event, operation:getAll` | Free-text search |
| `options.showDeleted` | boolean | `false` | no | `resource:event, operation:getAll` | Include cancelled events |
| `options.showHiddenInvitations` | boolean | `false` | no | `resource:event, operation:getAll` | Include hidden invitations |
| `options.singleEvents` | boolean | `false` | no | `resource:event, operation:getAll, @version:>=1.3` | Expand recurring events (v1.3+) |
| `options.timeZone` | resourceLocator | — | no | `resource:event, operation:getAll` | Response timezone; modes: `list`, `id` |
| `options.updatedMin` | dateTime | `""` | no | `resource:event, operation:getAll` | Min last-modified time |
| `options.fields` | string | `""` | no | `resource:event, operation:getAll` | Partial response fields |
| `options.recurringEventHandling` | options | `expand` | no | `resource:event, operation:getAll, @version:>=1.3` | `expand` \| `first` \| `next` |

**Output:** Array of event items. For v1.3+ with `recurringEventHandling=next` or `first`, recurring events are filtered accordingly.

---

##### Operation: `update` — Update event

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `update` | yes | `resource:event` | — |
| `calendar` | resourceLocator | — | yes | `resource:event, operation:update` | Modes: `list`, `id` |
| `eventId` | string | — | yes | `resource:event, operation:update` | Event ID |
| `modifyTarget` | options | `instance` | no | `resource:event, operation:update, @version:>=1.3, @tool:false, eventId:includes(_)` | `instance` (this occurrence) \| `event` (master recurring event) |
| `useDefaultReminders` | boolean | `true` | no | `resource:event, operation:update` | Use default reminders |
| `updateFields.allday` | options | `no` | no | `resource:event, operation:update` | `yes` \| `no` |
| `updateFields.attendeesUi` | fixedCollection | `{}` | no | `resource:event, operation:update, @version:>=1.2` | Add/replace attendees (v1.2+) |
| `updateFields.attendeesUi.values.mode` | options | `add` | no | `resource:event, operation:update, @version:>=1.2` | `add` \| `replace` |
| `updateFields.attendeesUi.values.attendees` | string (multi) | `""` | no | `resource:event, operation:update, @version:>=1.2` | Attendee emails |
| `updateFields.attendees` | string (multi) | `""` | no | `resource:event, operation:update, @version:<1.2` | Legacy attendees (v1.1) |
| `updateFields.color` | options (loadOptions) | `""` | no | `resource:event, operation:update` | Event color ID |
| `updateFields.description` | string | `""` | no | `resource:event, operation:update` | Description |
| `updateFields.end` | dateTime | `""` | no | `resource:event, operation:update` | End time |
| `updateFields.guestsCanInviteOthers` | boolean | `true` | no | `resource:event, operation:update` | Guests can invite |
| `updateFields.guestsCanModify` | boolean | `false` | no | `resource:event, operation:update` | Guests can modify |
| `updateFields.guestsCanSeeOtherGuests` | boolean | `true` | no | `resource:event, operation:update` | Guests see guest list |
| `updateFields.id` | string | `""` | no | `resource:event, operation:update` | Event ID |
| `updateFields.location` | string | `""` | no | `resource:event, operation:update` | Location |
| `updateFields.maxAttendees` | number | `0` | no | `resource:event, operation:update` | Max attendees |
| `updateFields.repeatFrecuency` | options | `""` | no | `resource:event, operation:update` | `Daily` \| `weekly` \| `monthly` \| `yearly` |
| `updateFields.repeatHowManyTimes` | number | `1` | no | `resource:event, operation:update` | Repeat count |
| `updateFields.repeatUntil` | dateTime | `""` | no | `resource:event, operation:update` | Repeat until |
| `updateFields.rrule` | string | `""` | no | `resource:event, operation:update` | RRULE string |
| `updateFields.sendUpdates` | options | `""` | no | `resource:event, operation:update` | `all` \| `externalOnly` \| `none` |
| `updateFields.showMeAs` | options | `opaque` | no | `resource:event, operation:update` | `transparent` \| `opaque` |
| `updateFields.start` | dateTime | `""` | no | `resource:event, operation:update` | Start time |
| `updateFields.summary` | string | `""` | no | `resource:event, operation:update` | Title |
| `updateFields.visibility` | options | `default` | no | `resource:event, operation:update` | `confidential` \| `default` \| `private` \| `public` |
| `updateFields.timezone` | string | (node tz) | no | `resource:event, operation:update` | Timezone for start/end (v1.2+) |
| `remindersUi.remindersValues[].method` | options | `""` | no | `resource:event, operation:update, useDefaultReminders:false` | `email` \| `popup` |
| `remindersUi.remindersValues[].minutes` | number | `0` | no | `resource:event, operation:update, useDefaultReminders:false` | Minutes before (0–40320) |

**Output:** Single item with updated event object.

---

### Runtime behavior (Action node)

#### Input consumption
- **Create (`create`):** Consumes no input items; executes once per node execution.
- **Delete (`delete`):** Consumes no input items; executes once per execution.
- **Get (`get`):** Consumes no input items; executes once per execution.
- **Get Many (`getAll`):** Consumes no input items; executes once per execution.
- **Update (`update`):** Consumes items from `main` input (one item = one event update).

#### Output emission
- All operations emit to `main` output channel.
- **Create / Get / Update / Delete:** Single item per execution (or per input item for Update).
- **Get Many:** Array of event items (or single array if `returnAll=false` with limit).

#### Errors
- Authentication failure (invalid/expired OAuth2) → throw.
- Calendar not found / invalid calendar ID → throw.
- Event not found (get, delete, update) → throw.
- Invalid event ID format → throw.
- API rate limit (429) → throw (retried by n8n core).
- `continueOnFail` supported (n8n core) → emits `{ error: <message> }` on error output branch.

#### Expressions
All string/number/date parameters accept n8n expressions (`{{ $json.field }}`, `{{ $parameter.name }}`, etc.). Resource locator modes `url`, `id`, `list` support value extraction via regex.

#### Version differences
| Version | Changes |
|---------|---------|
| 1.0 | Base version |
| 1.1 | Added attendees multi-value support |
| 1.2 | Added `attendeesUi` fixedCollection for update; timezone parameter for update; `getColors`, `getConferenceSolutions` loadOptions |
| 1.3 | Luxon date expressions; `returnNextInstance` for get; `recurringEventHandling` for getAll; `modifyTarget` for update; new default expressions (`$now`, `$now.plus()`) |

---

## Node: `n8n-nodes-base.googleCalendarTrigger` (Trigger)

### Wire format

- **Type string:** `n8n-nodes-base.googleCalendarTrigger`
- **Aliases:** `Google Calendar Trigger`, `Google Calendar Trigger`
- **Inputs:** none (trigger)
- **Outputs:** `main` × 1
- **Credentials:** `googleCalendarOAuth2Api` (required)
- **Polling:** true (interval-based)
- **Version:** 1

---

### Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `calendarId` | resourceLocator | — | yes | — | Calendar to watch; modes: `list` (searchable), `id` (raw) |
| `triggerOn` | options | — | yes | — | `eventCreated` \| `eventUpdated` \| `eventCancelled` \| `eventStarted` \| `eventEnded` |
| `options.matchTerm` | string | `""` | no | — | Free-text filter (maps to API `q` param) |

---

### Runtime behavior (Trigger)

#### Polling behavior
- Polls Google Calendar API `events.list` at configured poll interval.
- Uses `updatedMin` for created/updated/cancelled events (ordered by `updated`).
- Uses `timeMin`/`timeMax` with `singleEvents=true` for started/ended events (ordered by `startTime`).
- Maintains `lastTimeChecked` in workflow static data to avoid duplicate events.
- Manual execution (`manual` mode): fetches 1 most recent event matching filter.

#### Filtering logic (per `triggerOn`)
| Trigger | API params | Post-filter |
|---------|-----------|-------------|
| `eventCreated` | `updatedMin=lastCheck`, `orderBy=updated` | `event.created` between lastCheck and now |
| `eventUpdated` | `updatedMin=lastCheck`, `orderBy=updated`, `showDeleted=false` | `event.created != event.updated` |
| `eventCancelled` | `updatedMin=lastCheck`, `orderBy=updated`, `showDeleted=true` | `event.status === 'cancelled'` |
| `eventStarted` | `timeMin=lastCheck`, `timeMax=now`, `singleEvents=true`, `orderBy=startTime` | `event.start.dateTime` between lastCheck and now |
| `eventEnded` | `timeMin=lastCheck`, `timeMax=now`, `singleEvents=true`, `orderBy=startTime` | `event.end.dateTime` between lastCheck and now |

#### Output
Emits array of Google Calendar event objects (one per triggered event) on `main` output.

#### Errors
- No poll times configured → throw.
- No trigger type selected → throw.
- No calendar selected → throw.
- Authentication failure → throw.
- Manual mode with no matching events → throw "No data with the current filter could be found".

---

## Acceptance tests

### Test: Calendar - Check availability (available)

**Given** input:
```json
[{}]
```

**Parameters:**
```json
{
  "resource": "calendar",
  "operation": "availability",
  "calendar": { "mode": "id", "value": "primary" },
  "timeMin": "2025-01-15T10:00:00Z",
  "timeMax": "2025-01-15T11:00:00Z",
  "options": { "outputFormat": "availability", "timezone": "UTC" }
}
```

**Expect** output[0]:
```json
[{ "json": { "available": true } }]
```

---

### Test: Calendar - Check availability (booked slots)

**Given** input:
```json
[{}]
```

**Parameters:**
```json
{
  "resource": "calendar",
  "operation": "availability",
  "calendar": { "mode": "id", "value": "primary" },
  "timeMin": "2025-01-15T10:00:00Z",
  "timeMax": "2025-01-15T12:00:00Z",
  "options": { "outputFormat": "bookedSlots" }
}
```

**Expect** output[0]:
```json
[{ "json": { "busy": [{ "start": "2025-01-15T10:30:00Z", "end": "2025-01-15T11:00:00Z" }] } }]
```

---

### Test: Event - Create event

**Given** input:
```json
[{}]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "create",
  "calendar": { "mode": "id", "value": "primary" },
  "start": "2025-01-15T10:00:00Z",
  "end": "2025-01-15T11:00:00Z",
  "additionalFields": {
    "summary": "Team Meeting",
    "description": "Weekly sync",
    "location": "Conference Room A",
    "attendees": "alice@example.com,bob@example.com"
  }
}
```

**Expect** output[0] (shape):
```json
[{
  "json": {
    "id": "{{$string}}",
    "summary": "Team Meeting",
    "description": "Weekly sync",
    "location": "Conference Room A",
    "start": { "dateTime": "2025-01-15T10:00:00Z", "timeZone": "UTC" },
    "end": { "dateTime": "2025-01-15T11:00:00Z", "timeZone": "UTC" },
    "attendees": [{ "email": "alice@example.com" }, { "email": "bob@example.com" }],
    "creator": { "email": "{{$string}}" },
    "organizer": { "email": "{{$string}}" },
    "created": "{{$string}}",
    "updated": "{{$string}}"
  }
}]
```

---

### Test: Event - Create all-day event with recurrence (RRULE)

**Given** input:
```json
[{}]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "create",
  "calendar": { "mode": "id", "value": "primary" },
  "start": "2025-01-15",
  "end": "2025-01-16",
  "additionalFields": {
    "allday": "yes",
    "summary": "Daily Standup",
    "rrule": "FREQ=DAILY;COUNT=10"
  }
}
```

**Expect** output[0].json:
```json
{
  "summary": "Daily Standup",
  "start": { "date": "2025-01-15" },
  "end": { "date": "2025-01-16" },
  "recurrence": ["RRULE:FREQ=DAILY;COUNT=10"]
}
```

---

### Test: Event - Get event

**Given** input:
```json
[{}]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "get",
  "calendar": { "mode": "id", "value": "primary" },
  "eventId": "test-event-id"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "test-event-id",
    "summary": "Test Event",
    "start": { "dateTime": "2025-01-15T10:00:00Z" },
    "end": { "dateTime": "2025-01-15T11:00:00Z" }
  }
}]
```

---

### Test: Event - Get many events (with time range)

**Given** input:
```json
[{}]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "getAll",
  "calendar": { "mode": "id", "value": "primary" },
  "returnAll": true,
  "timeMin": "2025-01-01T00:00:00Z",
  "timeMax": "2025-01-31T23:59:59Z",
  "options": {
    "singleEvents": true,
    "orderBy": "startTime",
    "timeZone": "UTC"
  }
}
```

**Expect** output[0]: Array of event objects (length >= 0).

---

### Test: Event - Update event (change time and title)

**Given** input:
```json
[{ "json": { "newTitle": "Updated Meeting" } }]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "update",
  "calendar": { "mode": "id", "value": "primary" },
  "eventId": "existing-event-id",
  "updateFields": {
    "summary": "={{$json.newTitle}}",
    "start": "2025-01-15T14:00:00Z",
    "end": "2025-01-15T15:00:00Z"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "existing-event-id",
    "summary": "Updated Meeting",
    "start": { "dateTime": "2025-01-15T14:00:00Z", "timeZone": "UTC" },
    "end": { "dateTime": "2025-01-15T15:00:00Z", "timeZone": "UTC" }
  }
}]
```

---

### Test: Event - Delete event

**Given** input:
```json
[{}]
```

**Parameters:**
```json
{
  "resource": "event",
  "operation": "delete",
  "calendar": { "mode": "id", "value": "primary" },
  "eventId": "event-to-delete",
  "options": { "sendUpdates": "all" }
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

---

### Test: Trigger - Event created (polling)

**Setup:** Workflow with Google Calendar Trigger node configured:
- `calendarId`: primary
- `triggerOn`: eventCreated
- Poll interval: 5 minutes

**When** new event created in calendar between polls

**Expect** trigger fires once with event data:
```json
[{
  "json": {
    "id": "new-event-id",
    "summary": "New Event",
    "created": "2025-01-15T10:05:00.000Z",
    "updated": "2025-01-15T10:05:00.000Z",
    "status": "confirmed"
  }
}]
```

---

### Test: Trigger - Event cancelled (polling)

**Setup:** Google Calendar Trigger node:
- `calendarId`: primary
- `triggerOn`: eventCancelled

**When** event is cancelled in calendar

**Expect** trigger fires with cancelled event:
```json
[{
  "json": {
    "id": "cancelled-event-id",
    "status": "cancelled",
    "summary": "Cancelled Event"
  }
}]
```

---

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| All resources, operations, parameters, enums, defaults | documented | From n8n public docs + n8n-nodes-base corpus (clean-room) |
| Credential type & scopes | documented | `googleCalendarOAuth2Api` with 3 calendar scopes |
| Output item shapes | inferred | Based on Google Calendar API v3 events.list/insert/get/patch/delete responses |
| `continueOnFail` error shape | inferred | Standard n8n core behavior |
| Exact recurrence field behavior (legacy vs RRULE) | documented + inferred | Legacy fields `repeatFrecuency` (typo in source), `repeatHowManyTimes`, `repeatUntil` coexist with `rrule` |
| `modifyTarget` behavior for update | documented | Only shown for recurring events (eventId contains `_`) when not used as tool v1.3+ |
| Conference data / conference solution types | documented | Load options via `getConferenceSolutions` (depends on calendar) |
| Color ID values | inferred | Load options via `getColors`; exact IDs from Google Calendar API |
| Timezone resourceLocator options | documented | `list` (searchable via `getTimezones`), `id` (raw TZ ID) |
| Resource locator `calendar` modes | documented | `list` (searchable via `getCalendars`), `id` (raw email/ID) |
| Version-specific parameter availability | documented | v1.3 adds Luxon defaults, `returnNextInstance`, `recurringEventHandling`, `modifyTarget` |
| Trigger polling internals | inferred from corpus | Clean-room: derived from observable behavior in n8n-nodes-base source (not copied) |

---

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor files:**
  - Action: `src/lib/engine/executors/n8n-nodes-base.googleCalendar.ts`
  - Trigger: `src/lib/engine/executors/n8n-nodes-base.googleCalendarTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `googleCalendarOAuth2Api` (implement as OpenFlow credential adapter)
- **Node type strings:** `n8n-nodes-base.googleCalendar`, `n8n-nodes-base.googleCalendarTrigger`

---

*Spec compiled from clean-room analysis of n8n public documentation and n8n-nodes-base corpus. No n8n source code copied.*

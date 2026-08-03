---
type: n8n-nodes-base.googleCalendarTrigger
displayName: Google Calendar Trigger
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Google Calendar Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlecalendartrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://developers.google.com/calendar/api/v3/reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleCalendarTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `googleCalendarOAuth2Api` (Google Calendar OAuth2)
- **Category:** Productivity
- **Node version:** 1.0
- **Codex version:** 1.0

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| pollTimes | object (array of schedules) | `[{ "mode": "everyMinute" }]` | yes | — | Controls when the trigger polls for events. Supports: `everyMinute`, `everyHour`, `everyDay`, `everyWeek`, `everyMonth`, `everyX` (minutes/hours), `custom` (cron expression). |
| calendarId | resource locator (list or id) | — | yes | — | The Google Calendar to monitor. Can select from list or enter calendar ID manually (email format). |
| triggerOn | enum | — | yes | — | Event type that starts the workflow: `eventCancelled`, `eventCreated`, `eventEnded`, `eventStarted`, `eventUpdated`. |
| options.matchTerm | string (expression) | — | no | — | Free-text search filter applied to event fields (summary, description, location, attendees, organizer). Applied to all `triggerOn` types including `eventUpdated` and `eventCancelled`. |

### Poll Times Detail

The `pollTimes.item` array accepts schedule objects with these modes:
- `everyMinute` — polls every minute
- `everyHour` — polls at a specific minute each hour (default minute 0)
- `everyDay` — polls daily at a specific hour/minute (default 14:00)
- `everyWeek` — polls weekly on a specific weekday at a specific hour/minute (default Monday 14:00)
- `everyMonth` — polls monthly on a specific day at a specific hour/minute (default 1st 14:00)
- `everyX` — polls every X minutes or hours (default 2 hours)
- `custom` — uses a 6-field cron expression (default `* * * * * *`)

## Runtime behavior

### Input

Trigger nodes consume no input items. They initiate workflow execution based on external events.

### Output

Emits one item per matching Google Calendar event detected during a poll interval. Each output item contains the event data as returned by the Google Calendar API v3 (event resource), including at minimum:
- `id` — event ID
- `summary` — event title
- `start` / `end` — date-time or date objects
- `status` — confirmed, tentative, cancelled
- `htmlLink` — link to the event in Google Calendar
- `created` / `updated` — timestamps

Multiple events matching the filter within a single poll window are emitted as multiple items in the same execution.

### Polling strategy by trigger type

The node polls the Google Calendar API v3 `events.list` endpoint with different query parameters depending on `triggerOn`:

| triggerOn | API query parameters | Filtering logic |
|-----------|---------------------|-----------------|
| `eventCreated` | `updatedMin=<lastPollTime>`, `orderBy=updated`, `showDeleted=false` | After fetch, keep only events where `created` timestamp falls within the current poll window (`lastPollTime` .. `now`). Apply `matchesSearchTerm(e, matchTerm)` if provided. |
| `eventUpdated` | `updatedMin=<lastPollTime>`, `orderBy=updated`, `showDeleted=false` | After fetch, keep only events where `updated` ≠ `created` (i.e., modified after creation). Apply `matchesSearchTerm(e, matchTerm)` if provided. Maintain persistent state: a map of `eventId` → `lastSeenUpdated`. Emit an event only when its `updated` timestamp is newer than the stored `lastSeenUpdated` for that event ID. Update the stored timestamp on emit. |
| `eventCancelled` | `updatedMin=<lastPollTime>`, `orderBy=updated`, `showDeleted=true` | After fetch, keep only events where `status === "cancelled"` **AND** `updated` ≠ `created`. Apply `matchesSearchTerm(e, matchTerm)` if provided. |
| `eventStarted` | `timeMin=<windowStart>`, `timeMax=<windowEnd>`, `singleEvents=true`, `orderBy=startTime` | Emit events where `start.dateTime` falls within the current poll window (`lastPollTime` .. `now`, inclusive both ends). Apply `matchesSearchTerm(e, matchTerm)` if provided. |
| `eventEnded` | `timeMin=<windowStart>`, `timeMax=<windowEnd>`, `singleEvents=true`, `orderBy=startTime` | Emit events where `end.dateTime` falls within the current poll window (`lastPollTime` .. `now`, inclusive both ends). Apply `matchesSearchTerm(e, matchTerm)` if provided. |

**Window definition:** Each poll cycle defines a time window from `lastPollTime` (or workflow activation time on first poll) to `now` (poll execution time). The window is inclusive on both ends for `eventStarted`/`eventEnded`.

**Search filtering:** For all `triggerOn` types, when `options.matchTerm` is provided, the implementation must apply a case-insensitive substring match against the event's `summary`, `description`, `location`, and attendee/organizer fields (matching Google Calendar API `q` parameter semantics) via a `matchesSearchTerm(event, matchTerm)` helper.

### State persistence

- The node must persist `lastPollTime` (ISO timestamp) across poll cycles in workflow static data (`getWorkflowStaticData('node')`).
- For `eventUpdated`, the node must additionally persist a map `seenUpdated: Record<string, string>` mapping `eventId` → last-emitted `updated` timestamp.
- On first poll (no `lastPollTime` stored), the node seeds `lastPollTime = now`, fetches no historical events (or fetches but emits none), and stores the current time. This "seed" behavior produces an empty output on the first poll, which is the intended OpenFlow policy.
- Manual execution (test mode) bypasses persisted state, fetches a single most-recent event matching the criteria (`maxResults=1`, no `updatedMin`/`timeMin`), and returns it for inspection without updating persisted state.

### Errors

- **Authentication failure** (invalid/expired OAuth2 token): throws — workflow execution stops; credentials must be refreshed.
- **Calendar not found / access denied**: throws — the specified calendarId is inaccessible with the provided credentials.
- **API rate limits / transient network errors**: implementation should retry with exponential backoff per Google API guidelines; on persistent failure, throws.
- **No matching events in poll window**: produces empty output (no items emitted); does not throw.

### Expressions

All parameters accept expression strings (`{{ $... }}`) for dynamic configuration:
- `pollTimes.item.*.hour`, `minute`, `dayOfMonth`, `weekday`, `cronExpression`, `value`
- `calendarId.value`
- `triggerOn`
- `options.matchTerm`

## Acceptance tests

### Test: Basic event created trigger (manual execution)

**Given** a Google Calendar with OAuth2 credentials configured

**Parameters:**
```json
{
  "calendarId": { "mode": "list", "value": "primary" },
  "triggerOn": "eventCreated"
}
```

**When** a new event "Team meeting" exists in the primary calendar

**Expect** output[0] contains exactly one item with:
- `json.id` — non-empty string
- `json.summary` === "Team meeting"
- `json.status` === "confirmed"
- `json.htmlLink` — valid Google Calendar URL

### Test: First poll seeds state and emits empty (eventCreated)

**Given** `triggerOn: "eventCreated"` polling every minute, no prior state

**When** first poll executes (API returns one event)

**Expect** output[0] is empty (length 0), and `lastPollTime` is persisted for the next cycle.

### Test: Second poll emits events created after seed window

**Given** first poll seeded at T0, second poll runs at T1, an event with `created` timestamp in [T0, T1]

**When** second poll executes

**Expect** output[0] contains the event (length 1).

**When** third poll runs at T2 > T1 with same event still returned by API

**Expect** output[0] is empty (length 0) — event.created is before lastPollTime.

### Test: Filter by matchTerm

**Given** `triggerOn: "eventCreated"`, `options.matchTerm: "meeting"`

**When** API returns events: "Team meeting", "Lunch with client", "Another meeting"

**Expect** output contains only events with "meeting" in summary/description/location (case-insensitive), i.e., "Team meeting" and "Another meeting".

### Test: Event updated trigger — stateful deduplication

**Given** `triggerOn: "eventUpdated"` polling every hour, no prior state

**When** first poll (seed) runs → expect empty output

**When** second poll runs, API returns event E1 with `created=T1`, `updated=T2 > T1` → expect output length 1 with E1

**When** third poll runs, API returns same E1 with same `updated=T2` → expect output length 0 (deduplicated via `lastSeenUpdated`)

**When** fourth poll runs, API returns E1 with `updated=T3 > T2` → expect output length 1 with updated timestamp T3

### Test: Event started trigger — window-based match

**Given** `triggerOn: "eventStarted"` polling every hour, no prior state

**When** first poll (seed) at 10:00 runs → expect empty output

**When** second poll at 11:00 runs, event with `start.dateTime=10:30` exists → expect output length 1 (10:30 in window [10:00, 11:00])

**When** third poll at 12:00 runs, same event exists → expect output length 0 (10:30 not in window [11:00, 12:00])

**When** event with `start.dateTime=09:30` exists at second poll (11:00) → expect output length 0 (09:30 before window start)

### Test: Event ended trigger — window-based match

**Given** `triggerOn: "eventEnded"` polling every hour, no prior state

**When** first poll (seed) at 14:00 runs → expect empty output

**When** second poll at 15:00 runs, event with `end.dateTime=14:45` exists → expect output length 1 (14:45 in window [14:00, 15:00])

**When** third poll at 16:00 runs, same event exists → expect output length 0 (14:45 not in window [15:00, 16:00])

### Test: Cancelled event detection — poll mode

**Given** `triggerOn: "eventCancelled"` polling every hour, no prior state

**When** first poll (seed) runs → expect empty output

**When** second poll runs, API returns event with `status="cancelled"` AND `updated === created` → expect output length 0 (not a true cancellation)

**When** second poll runs, API returns event with `status="cancelled"` AND `updated > created` → expect output length 1 with `json.status === "cancelled"`

### Test: Cancelled event with matchTerm

**Given** `triggerOn: "eventCancelled"`, `options.matchTerm: "meeting"`

**When** API returns cancelled events: "Team meeting" and "Cancelled lunch"

**Expect** only "Team meeting" appears in output (matchTerm applied after status/updated filter).

### Test: Multiple events in one poll window — eventCreated

**Given** `pollTimes: { item: [{ mode: "everyHour" }] }`, `triggerOn: "eventCreated"`

**When** three new events with distinct IDs are created within the same hour

**Expect** a single execution emits three items (one per event), each with complete event data and `json.created` within the poll window.

### Test: Manual execution returns matching event without updating state

**Given** any `triggerOn` mode, existing events in calendar

**When** manual execution runs (test mode)

**Expect** returns the most recent matching event (maxResults=1), does not update `lastPollTime` or `seenUpdated` state.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Poll schedule modes | documented | From public docs and type definitions |
| Event types (triggerOn enum) | documented | Public docs list: Created, Updated, Started, Ended, Cancelled |
| Calendar selection (resource locator) | documented | Public docs mention calendar selection |
| Search filter (matchTerm) | documented | Public docs mention free-text search; applied to all triggerOn types per validation hints |
| Exact output shape (event resource fields) | inferred | Based on Google Calendar API v3 event resource; spec describes minimum required fields |
| Retry/backoff behavior | inferred | Standard Google API practice; not explicitly documented for this node |
| Manual execution behavior | inferred | Typical n8n trigger behavior: returns last matching event or empty |
| Stateful `eventUpdated` deduplication | inferred | Required by validation hints; not in public docs |
| Window-based `eventStarted`/`eventEnded` | inferred | Required by validation hints; matches API `timeMin`/`timeMax` semantics |
| First-poll seed behavior | inferred | Required by validation hints; standard polling trigger pattern |
| `eventCancelled` requires `updated !== created` | inferred | Required by validation hints; distinguishes cancellation from creation |
| `matchesSearchTerm` applied to all trigger types | inferred | Required by validation hints for `eventUpdated`; consistent with other triggers |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/googleCalendarTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only (polling trigger pattern)
- **Credentials:** `googleCalendarOAuth2Api` (extends Google OAuth2 single-service)
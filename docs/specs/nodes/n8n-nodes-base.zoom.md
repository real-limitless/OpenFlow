---
type: n8n-nodes-base.zoom
displayName: Zoom
category: Communication
versions: [1]
priority: medium
status: specced
---

# Zoom

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zoom/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zoom/ | Public docs only |
| https://developers.zoom.us/docs/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.zoom`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `zoomApi` (OAuth2; legacy JWT token is deprecated by Zoom)

## Parameters

The node requires selecting a **Resource** and an **Operation** before the remaining fields are shown.

### Resource: Meeting

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixedString | `meeting` | yes | — | |
| operation | fixedString | `create` | yes | — | One of `create`, `delete`, `get`, `getAll`, `update` |
| meetingId | string | — | yes* | operation ∈ {delete,get,update} | The numeric meeting ID returned by the Zoom API |
| returnAll | boolean | false | — | operation = getAll | When true, ignores the `limit` parameter and retrieves all pages |
| limit | number | 30 | — | operation = getAll, returnAll = false | Max items per page (1–300) |
| type | options | `scheduled` | — | operation = create | Meeting type enum: `instant` (1), `scheduled` (2), `recurringNoFixedTime` (3), `recurringFixedTime` (8). These correspond to the Zoom API `type` integer. |
| topic | string | — | — | operation = create | Meeting title |
| agenda | string | — | — | operation = create ∪ update | Meeting description (max 2,500 characters) |
| duration | number | — | — | operation = create ∪ update | Minutes |
| startTime | string | — | — | operation = create ∪ update | ISO 8601 datetime string for scheduled meetings |
| timezone | string | — | — | operation = create ∪ update | IANA timezone identifier (e.g. `America/New_York`) |
| password | string | — | — | operation = create ∪ update | Meeting passcode (alphanumeric, 10 chars max) |
| settings | object | — | — | operation = create ∪ update | Flat or structured bag of meeting configuration: approval type, audio options, auto-recording, breakout room, host/participant video, join-before-host, mute-upon-entry, waiting room, etc. Passed as JSON to the Zoom API `settings` object. |

### Resource: Meeting Registrant

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixedString | `meetingRegistrant` | yes | — | |
| operation | fixedString | `create` | yes | — | One of `create`, `update`, `delete`, `get`, `getAll` |
| meetingId | string | — | yes | all | The numeric meeting ID |
| registrantId | string | — | yes* | operation ∈ {delete,get,update} | |
| email | string | — | yes | operation = create | Registrant email |
| firstName | string | — | yes | operation = create | |
| lastName | string | — | — | operation = create | |
| returnAll | boolean | false | — | operation = getAll | |
| limit | number | 30 | — | operation = getAll, returnAll = false | |

### Resource: Webinar

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixedString | `webinar` | yes | — | |
| operation | fixedString | `create` | yes | — | One of `create`, `delete`, `get`, `getAll`, `update` |
| webinarId | string | — | yes* | operation ∈ {delete,get,update} | |
| topic | string | — | — | operation = create ∪ update | |
| agenda | string | — | — | operation = create ∪ update | |
| duration | number | — | — | operation = create ∪ update | |
| startTime | string | — | — | operation = create ∪ update | |
| timezone | string | — | — | operation = create ∪ update | |
| password | string | — | — | operation = create ∪ update | |
| settings | object | — | — | operation = create ∪ update | Webinar-specific settings passed to the Zoom API |
| type | options | — | — | operation = create | Webinar type enum: `webinar` (5), `recurringNoFixedTime` (6), `recurringFixedTime` (9) |
| returnAll | boolean | false | — | operation = getAll | |
| limit | number | 30 | — | operation = getAll, returnAll = false | |

## Runtime behavior

### Input

Each incoming item is processed independently. For `create` / `update` operations, the node constructs a Zoom API request body from the configured parameters. For `delete` / `get` / `getAll` operations, the required identifiers and filters are used as URL/path/query parameters.

Parameter values support n8n expressions (including `$json` references and `$fromAI()` for AI-tool mode).

### Output

- **create / get / update**: outputs a single item whose `json` property contains the full Zoom API response object (meeting/webinar/registrant body including `id`, `join_url`, `start_url`, `topic`, `settings`, etc.).
- **getAll**: outputs one item per returned entity. Pagination is handled transparently (the node auto-follows `next_page_token` when `returnAll` is true).
- **delete**: outputs the input item unchanged (pass-through).

### Errors

- If Zoom returns a 4xx/5xx error (e.g. invalid meeting ID, authorization failure), the node throws an `NodeApiError` with the Zoom API error message.
- When `continueOnFail` is enabled on the node, failures produce an error item on output instead of halting the workflow.

### Expressions

All string, number, and boolean parameters accept expression strings.

## Acceptance tests

### Test: create a scheduled meeting

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "meeting",
  "operation": "create",
  "topic": "Weekly Sync",
  "type": "scheduled",
  "startTime": "2026-08-03T15:00:00Z",
  "duration": 30,
  "timezone": "America/New_York",
  "password": "abc123",
  "settings": {
    "host_video": true,
    "participant_video": false,
    "mute_upon_entry": true,
    "waiting_room": false
  }
}
```

**Expect** output[0] contains `json.id` (integer), `json.join_url` (string), `json.start_url` (string), `json.topic` = `"Weekly Sync"`, `json.duration` = 30, `json.timezone` = `"America/New_York"`. The Zoom API response includes all created-meeting fields.

### Test: get meeting by ID

**Parameters:**

```json
{
  "resource": "meeting",
  "operation": "get",
  "meetingId": "{{ $json.meetingId }}"
}
```

**Expect** output[0] contains `json.id` matching the requested ID, `json.topic`, `json.join_url`, and `json.settings`.

### Test: list all meetings

**Parameters:**

```json
{
  "resource": "meeting",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output items are an array of meeting objects, each with at minimum `id`, `topic`, `join_url`, `start_time`, `type`, `duration`.

### Test: delete meeting

**Parameters:**

```json
{
  "resource": "meeting",
  "operation": "delete",
  "meetingId": "{{ $json.meetingId }}"
}
```

**Expect** output[0] is the same as the input item (pass-through). No exception is thrown if the ID is valid.

### Test: register a meeting attendee

**Parameters:**

```json
{
  "resource": "meetingRegistrant",
  "operation": "create",
  "meetingId": "{{ $json.meetingId }}",
  "email": "test@example.com",
  "firstName": "Jane",
  "lastName": "Doe"
}
```

**Expect** output[0].json contains `registrant_id`, `join_url`, `topic`, `start_time`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Meeting operation names | Public docs | Confirmed via docs.n8n.io operations list |
| Meeting parameters (topic, agenda, duration, startTime, password, timezone, settings) | Public docs (common) + corpus schema | Corpus schema confirms shape of Zoom API response |
| Meeting type enum values | Inferred from Zoom API spec | Values 1 (instant), 2 (scheduled), 3 (recurring no fixed), 8 (recurring fixed) are standard Zoom API constants |
| Meeting registrant resource | Corpus descriptor | Public docs page only lists Meeting; registrant and webinar resources are inferred from corpus type descriptors |
| Webinar resource | Corpus descriptor | Same as registrant — public docs page is minimal, webinar operations inferred from corpus |
| Exact UI labels and default values for settings | Not reliably documented | Abstracted to "settings" blob — exact UI organization may differ |
| Update operation parameter set | Inferred | Assumed to mirror create minus non-updatable fields |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.zoom.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

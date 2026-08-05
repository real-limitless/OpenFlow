---
type: n8n-nodes-base.calTrigger
displayName: Cal Trigger
category: Productivity
versions: [1, 2]
priority: medium
status: specced
---

# Cal Trigger

Webhook trigger node that starts a workflow when events occur in a [Cal.com](https://cal.com/) account. Cal.com is an open-source scheduling platform. The node registers a webhook on Cal.com during activation and fires for booking lifecycle events (created, cancelled, rescheduled, meeting ended).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.caltrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/cal/ | Public docs only |
| https://cal.com/docs/enterprise-features/api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.calTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node, no main input)
- **Outputs:** `main` × 1
- **Credentials:** `calApi` (API key + optional custom host URL)

### Credential properties (`calApi`)

| name | type | default | notes |
|------|------|---------|-------|
| API Key | string (password) | — | Generated from Cal.com account settings |
| Host | string | `https://api.cal.com` | Override for self-hosted Cal.com instances |

Authentication is performed by appending `?apiKey=<key>` as a query parameter to every API request.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| events | array of enum: `BOOKING_CANCELLED`, `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `MEETING_ENDED` | — | no | One or more event types to subscribe to. If omitted, all four are subscribed. |
| options.appId | string (expression) | — | no | Cal.com app ID to scope the webhook subscription. Required when multiple Cal.com trigger nodes run in the same account. |
| options.eventTypeId | string (expression) | — | no | Filter webhook deliveries to a specific event type (e.g. a specific meeting type ID). |
| options.payloadTemplate | string (expression) | — | no | Custom JSON template to transform the outgoing webhook payload. Supports expressions over the raw Cal.com webhook body. |

## Runtime behavior

### Webhook lifecycle

On workflow activation the node registers a public HTTPS webhook with the Cal.com API. On deactivation it unregisters that webhook. Manual execution in the editor returns an event sampled from recent booking history, or throws if none is available.

### Output

Each webhook delivery produces one output item. The output structure mirrors the Cal.com webhook event payload. Key fields depend on the event type but generally include:

- `triggerEvent` — the event type string (e.g. `BOOKING_CREATED`)
- `createdAt` — ISO timestamp of the webhook event
- `payload` — the Cal.com booking object with fields such as:
  - `uid` / `id` — booking identifiers
  - `title` — event title
  - `startTime` / `endTime` — scheduled times
  - `attendees` — list of attendee objects (email, name, timeZone)
  - `organizer` — organizer info (email, name, timeZone)
  - `location` — meeting location/link
  - `status` — booking status (e.g. `ACCEPTED`, `CANCELLED`)
  - `eventTypeId` — the Cal.com event type that was booked
  - `responses` — booking form answers

When `payloadTemplate` is configured the output `payload` field is replaced by the template evaluation result.

### Errors

- Network or authentication failures during webhook registration/unregistration cause the activation/deactivation to fail.
- Incoming webhook deliveries with invalid payloads produce a single item with whatever data was received; the node does not validate the Cal.com payload schema.
- If `payloadTemplate` evaluation throws an expression error, the node falls back to the raw payload.

### Expressions

The following parameters accept expression strings:

- `options.appId`
- `options.eventTypeId`
- `options.payloadTemplate`

## Acceptance tests

### Test: booking created event

**Parameters:**
```json
{
  "events": ["BOOKING_CREATED"]
}
```

**Simulated Cal.com webhook body:**
```json
{
  "triggerEvent": "BOOKING_CREATED",
  "createdAt": "2026-08-03T10:00:00Z",
  "payload": {
    "uid": "abc123",
    "title": "15 Min Meeting",
    "startTime": "2026-08-03T14:00:00Z",
    "endTime": "2026-08-03T14:15:00Z",
    "attendees": [{ "email": "alice@example.com", "name": "Alice", "timeZone": "America/New_York" }],
    "organizer": { "email": "bob@example.com", "name": "Bob", "timeZone": "America/New_York" },
    "location": "https://meet.google.com/abc-defg-hij",
    "status": "ACCEPTED",
    "eventTypeId": 1
  }
}
```

**Expect** output[0] contains one item with `triggerEvent` = `"BOOKING_CREATED"` and a `payload` object matching the Cal.com booking shape above.

### Test: all events subscription

**Parameters:**
```json
{
  "events": ["BOOKING_CANCELLED", "BOOKING_CREATED", "BOOKING_RESCHEDULED", "MEETING_ENDED"]
}
```

**Expect** the node registers a single webhook subscribed to all four event types. A delivery of any of the four produces one output item.

### Test: custom payload template

**Parameters:**
```json
{
  "events": ["BOOKING_CREATED"],
  "options": {
    "payloadTemplate": "{\"summary\": \"{{$json.payload.title}} with {{$json.payload.attendees[0].email}}\"}"
  }
}
```

**Expect** output[0].json.payload to equal `{"summary": "15 Min Meeting with alice@example.com"}`.

### Test: event type filter

**Parameters:**
```json
{
  "events": ["BOOKING_CREATED"],
  "options": {
    "eventTypeId": "42"
  }
}
```

**Expect** the webhook registration includes the eventTypeId filter so only bookings against event type 42 are delivered.

### Test: credential with custom host

**Credential:**
```json
{
  "apiKey": "cal_api_key_123",
  "host": "https://selfhosted.cal.example.com"
}
```

**Expect** all API calls (webhook registration, manual event fetch) are directed to `https://selfhosted.cal.example.com` with `?apiKey=cal_api_key_123`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event type string literals | documented | `BOOKING_CANCELLED`, `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `MEETING_ENDED` from public docs |
| Credential shape | documented | API key + Host from public docs |
| Webhook payload structure | inferred | Based on the Cal.com webhook API contract; n8n docs do not enumerate payload fields |
| `appId` / `eventTypeId` / `payloadTemplate` | inferred | Extracted from corpus schema only; not present in public docs |
| Manual execution behavior | inferred | Standard n8n trigger pattern for webhook-style nodes |
| Webhook registration/unregistration | inferred | Standard n8n webhook trigger lifecycle |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/CalTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

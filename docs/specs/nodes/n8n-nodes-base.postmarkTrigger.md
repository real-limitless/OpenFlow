---
type: n8n-nodes-base.postmarkTrigger
displayName: Postmark Trigger
category: trigger
versions: [1]
priority: medium
status: specced
---

# Postmark Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.postmarktrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/postmark/ | Public docs only |
| https://postmarkapp.com/developer/webhooks/webhooks-overview | Third-party service API docs |
| https://postmarkapp.com/developer/webhooks/bounce-webhook | Third-party service API docs |
| https://postmarkapp.com/developer/webhooks/delivery-webhook | Third-party service API docs |
| https://postmarkapp.com/developer/webhooks/click-webhook | Third-party service API docs |
| https://postmarkapp.com/developer/webhooks/open-tracking-webhook | Third-party service API docs |
| https://postmarkapp.com/developer/webhooks/spam-complaint-webhook | Third-party service API docs |
| https://postmarkapp.com/developer/webhooks/subscription-change-webhook | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.postmarkTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node — activated by inbound webhook)
- **Outputs:** `main` × 1
- **Credentials:** `postmarkApi` (required — Server API Token)

## External API / service requirements

This node listens for Postmark webhook events. Postmark sends HTTP POST
requests with a JSON body to a publicly reachable URL. Events are identified
by a `RecordType` field (one of `Bounce`, `Click`, `Delivery`, `Open`,
`SpamComplaint`, `SubscriptionChange`). Each event type carries its own
payload shape documented by Postmark's webhook API docs. The node must
register a webhook endpoint that Postmark can call; the endpoint URL is
provisioned by the OpenFlow engine when the workflow is activated.

The credential requires a Postmark Server API Token, sent as the
`X-Postmark-Server-Token` header when Postmark's Webhooks API is called
to configure the webhook subscription. Postmark authenticates its calls
via IP allowlisting and optional HTTP basic auth on the webhook URL.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiOptions | [] | true | — | Subset of event types to subscribe to. Each selected event causes Postmark to deliver webhook payloads for that type. |
| firstOpen | boolean | false | false | events includes "open" | When true, only the first open per recipient is reported; subsequent opens are suppressed. |
| includeContent | boolean | false | false | events includes "bounce" or "spamComplaint" | When true, the webhook payload includes the full message content for bounce and spam complaint events. |

### events options

- Bounce (`bounce`) — email bounce events
- Click (`click`) — link click tracking events
- Delivery (`delivery`) — successful delivery events
- Open (`open`) — email open tracking events
- Spam Complaint (`spamComplaint`) — spam complaint events
- Subscription Change (`subscriptionChange`) — unsubscribe / subscribe events

## Runtime behavior

### Activation

When the workflow is activated, the engine provisions a unique webhook URL
and registers it with Postmark via the Postmark Webhooks API (using the
configured credentials). When the workflow is deactivated, the webhook
registration is removed.

### Input

This node has no input items. It is a trigger node activated by inbound
HTTP requests from Postmark.

### Output

Each inbound webhook produces exactly one output item carrying the full
JSON payload from Postmark as `json`. The `json` object always contains a
top-level `RecordType` field identifying the event type. The remaining
fields depend on the event type. Common fields across all events include:

- `RecordType` (string) — the event discriminator
- `MessageID` (string) — unique Postmark message identifier
- `MessageStream` (string) — the message stream name (e.g. "outbound")
- `Metadata` (object, optional) — custom metadata attached to the original message

Each event type also carries type-specific fields (e.g. `Type`/`TypeCode`/
`Email`/`Description` for Bounce, `DeliveredAt` for Delivery, `Geo`/`Client`
for Open/Click, etc.) as defined by Postmark's webhook API documentation.

### Errors

If the HTTP request body is not valid JSON, the node should return an empty
output and acknowledge the request with HTTP 200 (to prevent Postmark
retries). If credential configuration fails during activation (e.g. invalid
API token), the node should report the error and fail activation.

### Expressions

The `events` parameter accepts expression strings.

## Acceptance tests

### Test: single event type — bounce

**Given:** an active Postmark Trigger configured with events = `["bounce"]`

**When:** Postmark delivers a bounce webhook payload:

```json
{
  "RecordType": "Bounce",
  "MessageStream": "outbound",
  "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
  "Type": "HardBounce",
  "TypeCode": 1,
  "Email": "john@example.com",
  "From": "sender@example.com",
  "BouncedAt": "2025-01-01T00:00:00Z",
  "Description": "The server was unable to deliver your message",
  "Inactive": true,
  "CanActivate": true
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "RecordType": "Bounce",
    "MessageStream": "outbound",
    "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
    "Type": "HardBounce",
    "TypeCode": 1,
    "Email": "john@example.com",
    "From": "sender@example.com",
    "BouncedAt": "2025-01-01T00:00:00Z",
    "Description": "The server was unable to deliver your message",
    "Inactive": true,
    "CanActivate": true
  }
}]
```

### Test: multiple event types — delivery + open

**Given:** an active Postmark Trigger configured with events = `["delivery", "open"]`

**When:** Postmark delivers a delivery webhook payload:

```json
{
  "RecordType": "Delivery",
  "MessageStream": "outbound",
  "MessageID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "Recipient": "alice@example.com",
  "DeliveredAt": "2025-01-01T00:00:00Z",
  "Details": "OK"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "RecordType": "Delivery",
    "MessageStream": "outbound",
    "MessageID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "Recipient": "alice@example.com",
    "DeliveredAt": "2025-01-01T00:00:00Z",
    "Details": "OK"
  }
}]
```

### Test: firstOpen filter

**Given:** an active Postmark Trigger configured with events = `["open"]` and
firstOpen = true

**When:** Postmark delivers an open webhook payload:

```json
{
  "RecordType": "Open",
  "MessageStream": "outbound",
  "MessageID": "x1y2z3-4567-8901-abcd-ef1234567890",
  "Recipient": "bob@example.com",
  "OpenedAt": "2025-01-01T00:00:05Z",
  "FirstOpen": true,
  "Geo": {"CountryISOCode": "US", "Country": "United States"},
  "Client": {"Name": "Chrome", "Company": "Google", "Family": "Browser"}
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "RecordType": "Open",
    "MessageStream": "outbound",
    "MessageID": "x1y2z3-4567-8901-abcd-ef1234567890",
    "Recipient": "bob@example.com",
    "OpenedAt": "2025-01-01T00:00:05Z",
    "FirstOpen": true,
    "Geo": {"CountryISOCode": "US", "Country": "United States"},
    "Client": {"Name": "Chrome", "Company": "Google", "Family": "Browser"}
  }
}]
```

Since firstOpen is true, the node emits the event. If a subsequent open for
the same MessageID arrives with `FirstOpen: false`, the node should still
emit it (the filter is server-side via Postmark's webhook configuration;
n8n does not perform client-side dedup).

### Test: includeContent for spam complaint

**Given:** an active Postmark Trigger configured with events =
`["spamComplaint"]` and includeContent = true

**When:** Postmark delivers a spam complaint webhook payload with content:

```json
{
  "RecordType": "SpamComplaint",
  "MessageStream": "outbound",
  "MessageID": "c3d4e5f6-7890-abcd-ef12-345678901234",
  "Email": "spamreporter@example.com",
  "From": "sender@example.com",
  "Description": "Spam complaint",
  "Content": "<Full dump of spam complaint message>"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "RecordType": "SpamComplaint",
    "MessageStream": "outbound",
    "MessageID": "c3d4e5f6-7890-abcd-ef12-345678901234",
    "Email": "spamreporter@example.com",
    "From": "sender@example.com",
    "Description": "Spam complaint",
    "Content": "<Full dump of spam complaint message>"
  }
}]
```

### Test: invalid JSON body

**Given:** an active Postmark Trigger

**When:** Postmark delivers a request with a non-JSON body

**Expect:** the node responds with HTTP 200 (to prevent retries) and emits
no output items (empty output array). The workflow continues without error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event types and descriptions | Documented | Confirmed via public n8n docs and Postmark webhook API docs |
| Webhook endpoint registration | Inferred | n8n docs mention webhook-based trigger; exact registration mechanism inferred from standard n8n webhook pattern |
| Credential type and auth header | Documented | Postmark credentials page documents Server API Token |
| Payload shapes per event | Documented | Postmark webhook API docs provide example payloads per event type |
| firstOpen and includeContent behavior | Documented | Confirmed via public descriptor metadata |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/postmark-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
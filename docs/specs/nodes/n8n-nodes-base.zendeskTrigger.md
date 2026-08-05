---
type: n8n-nodes-base.zendeskTrigger
displayName: Zendesk Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Zendesk Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.zendesktrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zendesk/ | Public docs only |
| https://developer.zendesk.com/api-reference/ | Public docs only (Zendesk API reference) |

The temporary corpus was used only to confirm the published type string, the
"Communication" category, and the presence of webhook signature verification.
No package implementation or schema source was used.

## Wire format

- **Type string:** `n8n-nodes-base.zendeskTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node, no upstream input)
- **Outputs:** `main` × 1
- **Credentials:** one Zendesk credential using either API token authentication
  or OAuth2. API-token setup requires a Zendesk subdomain, login email, and API
  token. OAuth2 setup requires the Zendesk subdomain and an OAuth client.

### Credential: `zendeskApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| subdomain | string | (empty) | yes | The Zendesk subdomain (e.g. `mycompany`) |
| email | string | (empty) | no | Login email (required for API-token auth) |
| apiToken | string (password) | (empty) | no | Zendesk API token (required for API-token auth) |
| oauthClientId | string | (empty) | no | OAuth client ID (required for OAuth2 auth) |
| oauthClientSecret | string (password) | (empty) | no | OAuth client secret (required for OAuth2 auth) |

Alternatively, `zendeskOAuth2Api` OAuth2 credentials may be used with OAuth2
authentication only.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| event | option | (empty) | yes | The Zendesk webhook event type to subscribe to. Contains a curated list of Zendesk event strings plus one or more wildcard/placeholder options. |
| filter | collection | (empty) | no | Optional sub-conditions to narrow which events produce an output item. The available keys depend on the selected event type. |

### Event types

The user must select one event type from a list that covers the major Zendesk
resource event categories, including but not limited to:

- Ticket events: created, updated, solved, deleted, assigned, etc.
- Organization events: created, updated, deleted, etc.
- User events: created, updated, deleted, suspended, etc.
- Group events: created, updated, deleted, etc.
- Satisfaction rating events: created, updated, etc.
- A wildcard or "all" placeholder option to subscribe to any event.

The exact set of event strings depends on the Zendesk webhook API and is
expected to match what Zendesk publishes for its
[webhook event subscriptions](https://developer.zendesk.com/documentation/ticketing/managing-tickets/working-with-webhooks/).

### Filter sub-conditions

When a specific event type is selected, the implementer may expose optional
filter fields that allow the user to narrow output to events that match
certain conditions on the event payload (e.g. ticket status transitions,
organization ID scoping, etc.). These are implemented as expression-eligible
key-value pairs.

If the filter fields are not essential for correct operation, a simpler
pass-through design (emit every matching event) with no filter collection
is acceptable.

## Runtime behavior

### Webhook lifecycle

1. **On workflow activation:** The node registers a webhook endpoint with
   Zendesk using the Zendesk API. The endpoint URL is derived from the
   runtime's public webhook base URL. The node should avoid creating
   duplicate registrations for the same URL.

2. **On webhook receive:** An HTTP POST arrives at the registered endpoint.
   If a webhook secret is configured, the node verifies the
   `X-Zendesk-Webhook-Signature` header using HMAC-SHA256 over the
   concatenation of the timestamp header value and the raw request body,
   comparing the resulting digest (base64-encoded) with the header value.
   The timestamp is provided in the
   `X-Zendesk-Webhook-Signature-Timestamp` header.

   Requests that fail verification return HTTP 401 and produce zero output
   items. When no webhook secret is configured, verification is skipped.

3. **On workflow deactivation:** The node deletes the webhook endpoint via
   the Zendesk API.

4. **Event filtering:** The node reads the event type from the webhook body
   and compares it against the configured event. If it does not match, zero
   output items are produced (silent discard). If a filter collection is
   configured, the filter conditions are evaluated against the event payload;
   non-matching events are silently dropped.

### Output

Each incoming webhook event that passes event-type and filter checks produces
one output item containing the full Zendesk webhook event payload:

```json
{
  "id": "...",
  "type": "ticket.created",
  "occurredAt": "2026-08-04T12:00:00Z",
  "accountId": "...",
  "actor": { "id": 123, "type": "user" },
  "payload": {
    "id": 456,
    "subject": "...",
    "status": "new",
    ...
  }
}
```

The exact shape is the Zendesk webhook event envelope as delivered. The
executor passes the body through without transformation.

### Errors

- **Signature verification failure:** Return HTTP 401, discard the request,
  produce zero output items.
- **Unregistered or non-matching event type:** Silent discard — produce zero
  output items.
- **Zendesk API errors (webhook registration/deletion):** Surface the
  Zendesk API error. Respect `continueOnFail` — when true, log and continue;
  when false, halt the execution.
- **Network/HTTP errors:** Standard retry for transient failures during
  webhook registration.

### Expressions

All parameter values accept expression strings. The event-type selection and
filter values may be supplied by expressions.

## Acceptance tests

### Test: basic webhook receive — matching event

**Given** an incoming POST delivering a valid Zendesk webhook body with
`type: "ticket.created"`.

**Parameters:**
```json
{
  "event": "ticket.created"
}
```

**Expect** output[0] to contain one item whose `json.type` equals
`"ticket.created"` and whose `json.payload.id` is present.

### Test: signature verification rejects unsigned requests

**Given** a credential with a webhook secret configured and an incoming POST
that does not carry a valid `X-Zendesk-Webhook-Signature` header.

**Expect** the node to return HTTP 401 and produce zero output items.

### Test: non-matching event type produces no output

**Given** a node configured with `event: "organization.created"` and an
incoming POST delivering a `ticket.created` event (with valid signature if
applicable).

**Expect** zero output items.

### Test: webhook lifecycle — activate then deactivate

**Given** a workflow with this trigger node.

**When** the workflow is activated, the node creates a webhook subscription
via the Zendesk API and preserves the returned subscription identifier.

**When** the workflow is deactivated, the node deletes the subscription
using its stored identifier.

**Expect** both API calls succeed without error.

### Test: filter sub-conditions narrow output

**Given** a node configured with `event: "ticket.updated"` and a filter
requiring `status: "solved"`.

**Given** two incoming webhook deliveries — one with `payload.status: "open"`
and one with `payload.status: "solved"`.

**Expect** only the solved-ticket event produces an output item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, category | documented | Confirmed by public descriptor metadata. |
| Authentication methods and credential prerequisites | documented | Confirmed by the public Zendesk credentials page. |
| Webhook lifecycle (register/receive/deactivate) | inferred | Standard webhook trigger pattern consistent with other n8n triggers. |
| Signature verification algorithm | inferred | HMAC-SHA256 over timestamp+body; confirmed by corpus type signature in ZendeskTriggerHelpers. |
| Output event envelope shape | inferred | Based on Zendesk webhook API documentation (developer.zendesk.com). The exact field names are service-defined. |
| Event type catalog | inferred | The public docs page is a stub. The event list follows Zendesk's published webhook event catalog. |
| Filter sub-conditions | inferred | Standard optional narrowing pattern for trigger nodes. The exact usable filter keys depend on the event type. |
| Expression support | inferred | Standard for all n8n trigger and app nodes. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/zendesk-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

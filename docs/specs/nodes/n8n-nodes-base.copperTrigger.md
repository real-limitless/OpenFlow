---
type: n8n-nodes-base.copperTrigger
displayName: Copper Trigger
category: Sales
versions: [1]
priority: medium
status: specced
---

# Copper Trigger

Webhook trigger node for the Copper CRM platform. Registers and manages a webhook subscription via the Copper Developer API Webhooks API at activation and deregisters it at deactivation. When Copper fires a matching event it sends an HTTP POST to the node's public callback URL, and the node emits one output item per notification received.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.coppertrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/copper/ | Public docs only |
| https://developer.copper.com/webhooks/overview.html | Public docs only |
| https://developer.copper.com/webhooks/notification-example.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.copperTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger — no incoming connection)
- **Outputs:** `main` × 1
- **Credentials:** `copperApi` (API key + email)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| events | multiSelect | New, Update, Delete | true | Which CRUD event types to subscribe to. Options: New, Update, Delete. |
| additionalOptions | object | — | false | Extra webhook-subscription-level options (see below). |

### additionalOptions fields

| name | type | default | notes |
|------|------|---------|-------|
| customFieldsAsValues | boolean | false | If true, dropdown/multi-select custom fields are delivered with option names instead of option IDs. Maps to Copper's `custom_field_computed_values` flag. |
| secret | object | — | Arbitrary key-value pairs (e.g. `{ "key": "value" }`) passed back in the webhook body as extra fields for verification. |
| headers | object | — | Custom HTTP headers to include on the webhook POST request to the callback URL. |

### Event-type mapping

The user-facing names (New, Update, Delete) map to Copper Webhooks API event type strings (`new`, `update`, `delete`).

When the node is activated the executor creates one webhook subscription per selected event type via `POST https://api.copper.com/developer_api/v1/webhooks/subscription` with:
- `type` set to the Copper entity type string (see "Entity coverage" below)
- `event` set to the matched event string
- `target` set to the public callback URL
- Optional `secret`, `headers`, `custom_field_computed_values` from `additionalOptions`

When the node is deactivated the executor deletes all subscriptions that were created during activation via `DELETE https://api.copper.com/developer_api/v1/webhooks/subscription/{id}`.

### Entity coverage

The Copper Developer API webhook system supports these entity types — all of them are subscribed to unconditionally (the node subscribes without per-entity filtering since the Copper API requires one subscription per event-type × entity-type combination):

| Copper record type | Copper API type string |
|-------------------|------------------------|
| Lead | lead |
| Person | person |
| Company | company |
| Opportunity | opportunity |
| Project | project |
| Task | task |
| Activity | activity_log |

## Runtime behavior

### Activation

Upon workflow activation the executor:

1. Authenticates via the `copperApi` credentials (API key in the `X-PW-AccessToken` header and email in the `X-PW-Application` header).
2. For each selected event type (New, Update, Delete), creates one webhook subscription per entity type listed above — except `activity_log`, which is excluded if not supported.
3. Stores the subscription IDs returned by Copper for later cleanup.

### Deactivation

Deletes every subscription created during activation using `DELETE` against the Copper Webhooks API.

### Notification processing

Copper sends an HTTP POST to the callback URL. The request body has this shape (from Copper's public API documentation):

```json
{
  "ids": [123],
  "type": "person",
  "event": "update",
  "subscription_id": 1,
  "secret": "secret_value",
  "key": "key_value",
  "updated_attributes": {
    "field_name": ["old_value", "new_value"]
  },
  "timestamp": "2021-12-13T19:18:22.084Z"
}
```

Each notification contains:
- `ids` — Array of entity IDs (1 to 30 per notification). Multiple IDs arrive batched when multiple records are affected in the same event.
- `type` — The entity type string (e.g. `"person"`, `"lead"`, `"company"`).
- `event` — The event type (`"new"`, `"update"`, `"delete"`).
- `subscription_id` — Copper subscription identifier.
- `secret` / custom fields — Any secret key-value pairs configured on the subscription.
- `updated_attributes` — Present only on `update` events. Maps field names to `[old_value, new_value]` arrays. Custom field changes appear under `updated_attributes.custom_fields`.
- `timestamp` — ISO 8601 timestamp of the event.

### Output

Each notification results in one output item with:
- `json`: The full webhook notification object as received from Copper.
- No binary data output.

If a notification contains multiple IDs (a batch notification), the node may either emit a single item with the batched array or split into one item per ID, depending on configuration. The raw notification envelope is always preserved.

### Errors

- If the Copper API rejects subscription creation (4xx/5xx) at activation, the node fails and the workflow remains inactive.
- If subscription deletion fails at deactivation, the error is logged but does not prevent deactivation (the subscription may need manual cleanup via the Copper API).
- Incoming webhook requests that fail authentication or parsing result in a 4xx response to Copper; Copper does not retry failed deliveries.

### Expressions

The `events` and `additionalOptions` parameters accept expression strings.

## Acceptance tests

### Test: All three events subscribed

**Given** workflow activated with a publicly reachable callback URL.

**Parameters:**
```json
{
  "events": ["New", "Update", "Delete"],
  "additionalOptions": {}
}
```

**Expect:**
- At activation: One POST to `/webhooks/subscription` per event × 7 entity types (21 subscriptions total). Each request body contains `{ "type": "<entity_type>", "event": "<event_string>", "target": "<callback_url>" }`. Each returns `201` with `{ "id": <sub_id> }`.
- On receiving a Copper webhook POST for a new lead: an output item with `json.type === "lead"`, `json.event === "new"`, `json.ids` containing at least one ID.
- At deactivation: 21 DELETE requests to `/webhooks/subscription/{id}`.

### Test: Single event, with secret

**Parameters:**
```json
{
  "events": ["Update"],
  "additionalOptions": {
    "secret": { "verify": "abc123" }
  }
}
```

**Expect:**
- Activation creates 7 subscriptions (one per entity) each with event=`"update"` and target + secret payload `{ "verify": "abc123" }`.
- Incoming notification body includes `{ "verify": "abc123" }` alongside `ids`, `type`, `event`, `subscription_id`, `timestamp`, and `updated_attributes`.

### Test: Updated attributes present on update event

**Given** a Copper webhook POST for a person update.

**Parameters:**
```json
{
  "events": ["Update"],
  "additionalOptions": {}
}
```

**Expect** output item:
```json
{
  "json": {
    "ids": [456],
    "type": "person",
    "event": "update",
    "subscription_id": 5,
    "updated_attributes": {
      "email": ["old@example.com", "new@example.com"]
    },
    "timestamp": "2021-12-13T19:18:22.084Z"
  }
}
```
The `updated_attributes` key must only appear for `update` events.

### Test: Batched IDs in single notification

**Given** a Copper webhook POST with multiple IDs in the `ids` array.

**Parameters:**
```json
{
  "events": ["Delete"],
  "additionalOptions": {}
}
```

**Expect:**
- One output item where `json.ids` is an array containing 3 IDs (e.g. `[101, 102, 103]`).
- `json.event === "delete"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event types | Documented (n8n & Copper dev docs) | New, Update, Delete — exact match to Copper webhook events |
| Entity types | Documented (Copper dev docs) | 7 entity types: lead, person, company, opportunity, project, task, activity_log |
| Subscription CRUD | Documented (Copper dev docs) | POST to create, DELETE to remove, target URL required to be HTTPS |
| Notification shape | Documented (Copper dev docs) | Full example body with ids, type, event, subscription_id, updated_attributes, timestamp, secret fields |
| No retry policy | Documented (Copper dev docs) | Fires at most once; no retries regardless of response status |
| Rate limits | Documented (Copper dev docs) | 600/min, 1800/10min per account |
| Max 100 subscriptions | Documented (Copper dev docs) | Per-account limit |
| Batched IDs (up to 30) | Documented (Copper dev docs) | Array of 1–30 IDs per notification |
| Custom field computed values | Documented (Copper dev docs) | `custom_field_computed_values` flag; dropdown IDs → names |
| Credential type | Documented (n8n docs) | `copperApi`: API key + email; requires Professional or Business plan |
| Activity entity exclusion | Inferred | Corpus confirms activity_log is a valid type; whether the trigger excludes it by default is inferred |
| Per-entity filtering | Inferred | Node triggers on all entity types for selected events; no user-facing entity-type filter |
| `continueOnFail` | Inferred | Standard n8n pattern but trigger nodes rarely expose it |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/copperTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.stravaTrigger
displayName: Strava Trigger
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Strava Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.stravatrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/strava/ | Public docs only |
| https://developers.strava.com/docs/webhooks/ | Public docs only |
| https://developers.strava.com/docs/reference/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.stravaTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (unused — trigger has no input)
- **Outputs:** `main` × 1
- **Credentials:** `stravaOAuth2Api`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixedString | (derived) | yes | — | Always `webhook`; internal discriminator, not user-visible |
| event | fixedString | (derived) | yes | — | Composite of selected object + aspect; selects which Strava push-subscription events to subscribe to |
| filter | options | — | no | — | Groups events: `[All]`, `Activity`, `Athlete` |
| triggerOn | options | `[All]` | no | — | Aspect within the filter group: `[All]`, `created`, `deleted`, `updated` |

### Parameter details

The user selects a **filter** (one of `[All]`, `Activity`, `Athlete`) and a **triggerOn** aspect (one of `[All]`, `Created`, `Deleted`, `Updated`). The effective subscription receives all Strava webhook events whose `object_type` matches the filter (or any object if `[All]`) and whose `aspect_type` matches the triggerOn (or any aspect if `[All]`). The executor does not filter server-side; it registers a single push subscription at `https://www.strava.com/api/v3/push_subscriptions` and applies client-side filtering to incoming payloads.

The webhook callback URL is obtained from the runtime environment (the publicly reachable URL where this OpenFlow instance receives webhooks).

### Strava Push Subscription API contract (external)

Creating the subscription requires the Strava OAuth2 credential's `client_id` and `client_secret` to be sent as POST form-data to `https://www.strava.com/api/v3/push_subscriptions` with `callback_url`, `verify_token`. Strava validates the callback by issuing a GET with `hub.mode`, `hub.challenge`, `hub.verify_token` — the executor must respond with `200 OK` and `{ "hub.challenge": "<echoed>" }`.

Deleting the subscription: `DELETE https://www.strava.com/api/v3/push_subscriptions/{id}?client_id=...&client_secret=...`

## Runtime behavior

### Activation (webhook registration)

On activation, the executor must:
1. Check if a push subscription already exists for this credential (GET the subscriptions endpoint).
2. If not, POST to create a new subscription with the runtime's public callback URL and a randomly generated `verify_token`.
3. Respond to the Strava validation GET within 2 seconds by echoing `hub.challenge`.

### Deactivation (webhook deletion)

On deactivation, the executor must:
1. DELETE the subscription using its `id`.
2. Handle 204 No Content as success.

### Input

Trigger nodes receive no meaningful input items. The incoming `main` is typically empty or a single manual-trigger item to start the workflow.

### Output

For each incoming Strava webhook POST, the executor emits one output item. The item body mirrors the Strava webhook event payload:

```json
{
  "aspect_type": "create",
  "event_time": 1516126040,
  "object_id": 1360128428,
  "object_type": "activity",
  "owner_id": 134815,
  "subscription_id": 120475,
  "updates": {}
}
```

The output item `json` property contains the full event envelope. No additional wrapping or transformation is applied.

### Client-side filtering

If the user selected a non-`[All]` filter:
- `filter = "Activity"`: only emit if `object_type === "activity"`
- `filter = "Athlete"`: only emit if `object_type === "athlete"`

If the user selected a non-`[All]` triggerOn:
- `triggerOn = "Created"`: only emit if `aspect_type === "create"`
- `triggerOn = "Updated"`: only emit if `aspect_type === "update"`
- `triggerOn = "Deleted"`: only emit if `aspect_type === "delete"`

If the event does not match the filter, the executor responds 200 OK with no output item (acknowledge but discard).

### Errors

- If the subscription cannot be created (Strava API returns error, validation fails), activation must throw and fail.
- If a callback cannot be processed (malformed JSON, invalid method), respond 400 or 500 appropriately.
- `continueOnFail` semantics: if enabled and a runtime error occurs during event processing, emit the error item and continue listening.

### Expressions

- `filter` and `triggerOn` accept expression strings for dynamic selection.

## Acceptance tests

### Test: basic activity created event

**Given** incoming webhook POST body:

```json
{
  "aspect_type": "create",
  "event_time": 1516126040,
  "object_id": 1360128428,
  "object_type": "activity",
  "owner_id": 134815,
  "subscription_id": 120475,
  "updates": {}
}
```

**Parameters:** `filter = "Activity"`, `triggerOn = "Created"`

**Expect** output[0] item `json` to deeply equal the input body exactly.

### Test: athlete event filtered out

**Given** incoming webhook POST body:

```json
{
  "aspect_type": "update",
  "event_time": 1516126041,
  "object_id": 134815,
  "object_type": "athlete",
  "owner_id": 134815,
  "subscription_id": 120475,
  "updates": { "authorized": "false" }
}
```

**Parameters:** `filter = "Activity"`, `triggerOn = "[All]"`

**Expect** output[0] to be empty (no items emitted). The executor MUST still return 200 OK.

### Test: all events pass-through

**Given** incoming webhook POST body:

```json
{
  "aspect_type": "delete",
  "event_time": 1516126042,
  "object_id": 1360128429,
  "object_type": "activity",
  "owner_id": 134815,
  "subscription_id": 120475,
  "updates": {}
}
```

**Parameters:** `filter = "[All]"`, `triggerOn = "[All]"`

**Expect** output[0] item `json` to contain the full payload.

### Test: subscription validation responds to hub.challenge

**Given** incoming GET with query `hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=STRAVA`

**Expect** response body `{ "hub.challenge": "abc123" }` with HTTP 200 and `content-type: application/json`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event filter structure | Public docs only | Grouped as `[All]` / `Activity` / `Athlete` with aspect sub-options; exact nesting inferred from public event docs |
| Webhook registration lifecycle | Public Strava API docs | Subscription create/validate/delete fully documented by Strava |
| Webhook payload shape | Public Strava API docs | Fully documented at developers.strava.com |
| Credential type | Public docs only | `stravaOAuth2Api` (OAuth2 with Client ID + Client Secret) |
| Output item shape | Public Strava API docs | Node emits the raw Strava webhook envelope; no documented wrapping |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/stravaTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

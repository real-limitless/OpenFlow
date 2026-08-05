---
type: n8n-nodes-base.asanaTrigger
displayName: Asana Trigger
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Asana Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.asanatrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/asana/ | Public docs only |
| https://developers.asana.com/docs/webhooks | Public docs only |
| https://developers.asana.com/docs/webhooks-guide | Public docs only |
| https://developers.asana.com/reference/events | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.asanaTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node — no inbound main connection)
- **Outputs:** `main` × 1
- **Credentials:** `asanaApi` (Access Token) or `asanaOAuth2Api` (OAuth2)

The node exposes a single `POST` webhook endpoint under a node-scoped path that receives event payloads from the Asana Webhooks API.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| Authentication | options | accessToken | yes | `accessToken` or `oAuth2` — selects which credential type to use |
| Resource | string | — | yes | The Asana resource GID (task or project) to subscribe to |
| Workspace | options (loaded) | — | no | Workspace GID — used for webhook deduplication on node re-activation; values loaded dynamically from Asana via `getWorkspaces` |

The **Resource** parameter determines which Asana object the webhook watches. Events propagate up from contained objects (e.g., a project webhook receives events for tasks, subtasks, and comments within that project).

## Runtime behavior

### Activation (webhook registration)

When the workflow is activated, the node:

1. Calls `checkExists` to see if a webhook subscription already exists for the configured resource + workspace combination.
2. If none exists, calls `create` which:
   - Sends a `POST /webhooks` request to the Asana API with the resource GID, the n8n instance's public webhook URL, and an optional workspace filter.
   - Asana performs a **handshake** by `POST`-ing an `X-Hook-Secret` to the webhook URL. The node must echo back `X-Hook-Secret` with a `200 OK` to complete registration.
   - On success (`201 Created`), the webhook is registered and starts delivering events.
3. If a matching webhook already exists, activation is a no-op.

### Deactivation (webhook cleanup)

When the workflow is deactivated, the node calls `delete` which sends `DELETE /webhooks/{webhook_gid}` to the Asana API to unsubscribe.

### Input

No input items (trigger node — no `main` input).

### Output

Each incoming webhook `POST` produces one or more output items on `main[0]`. The Asana API delivers events as a JSON body with a single `events` key containing an array of event objects. Each event object is emitted as a separate output item with the following shape (from the Asana Events API):

```json
{
  "user": {
    "gid": "12345",
    "resource_type": "user",
    "name": "Greg Sanchez"
  },
  "resource": {
    "gid": "12345",
    "resource_type": "task",
    "name": "Bug Task"
  },
  "type": "task",
  "action": "changed",
  "parent": {
    "gid": "12345",
    "resource_type": "project",
    "name": "My Project"
  },
  "created_at": "2012-02-22T02:06:58.147Z",
  "change": {
    "field": "assignee",
    "action": "changed",
    "new_value": { "gid": "54321", "resource_type": "user" }
  }
}
```

Key output fields:

- `user` — The Asana user who performed the action (nullable — system events have `null`).
- `resource` — The Asana resource that triggered the event (type, GID, name).
- `action` — One of `changed`, `added`, `removed`, `deleted`, `undeleted`.
- `parent` — For `added`/`removed` events, the parent object the resource was added to or removed from. `null` for other event types.
- `created_at` — ISO 8601 timestamp of the event.
- `change` — Present only when `action` is `changed`. Contains `field`, `action` (on the field), and conditional `new_value` / `added_value` / `removed_value`.

The node sends `200 OK` or `204 No Content` back to Asana after processing each delivery, which keeps the webhook subscription alive.

**Heartbeat events:** Asana sends an empty payload every 8 hours to verify endpoint liveness. The node must respond with `200 OK` for these heartbeats.

**Signature verification:** Each webhook POST carries an `X-Hook-Signature` header (SHA-256 HMAC of the body, keyed with the `X-Hook-Secret` received during handshake). The node should verify this signature before processing.

### Errors

- **Handshake failure:** If the webhook handshake (`X-Hook-Secret` exchange) fails, the webhook is not created and activation throws.
- **API errors (4xx/5xx):** Webhook creation/deletion requests that fail are surfaced as workflow activation/deactivation errors.
- **Delivery errors:** If the node fails to respond to a webhook delivery, Asana retries with exponential backoff for up to 24 hours. If the target remains unreachable, the webhook is automatically deleted.
- **`continueOnFail`:** N/A — trigger nodes do not have a standard `continueOnFail` option; if webhook processing throws, the error is logged and the node returns an empty response (Asana considers it a delivery failure).

### Expressions

The **Resource** and **Workspace** parameters accept expression strings.

## Acceptance tests

### Test: webhook handshake and registration

**Given** valid `asanaOAuth2Api` credentials and a project GID `"1234567890"`.

**Parameters:**
```json
{
  "authentication": "oAuth2",
  "resource": "1234567890",
  "workspace": ""
}
```

**On activation**, the node should:
- Call `POST /webhooks` with `{ "data": { "resource": "1234567890", "target": "<public_url>/webhook" } }`.
- Receive an incoming `POST` with `X-Hook-Secret` header, echo it back with `200 OK`.
- Return `true` from `create`.

**Expect** the webhook to be registered and the workflow to enter `active` state.

### Test: emit event items from webhook payload

**Given** an active webhook subscription on a project.

**When** Asana delivers an event payload:
```json
{
  "events": [
    {
      "user": { "gid": "111", "resource_type": "user", "name": "Alice" },
      "resource": { "gid": "222", "resource_type": "task", "name": "Fix bug" },
      "type": "task",
      "action": "added",
      "parent": { "gid": "1234567890", "resource_type": "project", "name": "Sprint 3" },
      "created_at": "2026-08-03T12:00:00.000Z"
    }
  ]
}
```

**Expect** `output[0]` to contain exactly one item with `json` matching the above event object (unwrapped from the `events` array).

### Test: heartbeat handling

**When** Asana sends an empty `POST` body (heartbeat):

**Expect** the node returns `200 OK` and produces zero output items.

### Test: webhook deletion on deactivation

**Given** an active webhook subscription with known `webhook_gid`.

**On deactivation**, the node should:
- Call `DELETE /webhooks/{webhook_gid}`.
- Return `true` from `delete`.

**Expect** the webhook to no longer exist on the Asana side.

### Test: signature verification rejects unauthenticated payload

**When** a `POST` arrives with a missing or invalid `X-Hook-Signature`:

**Expect** the node returns `401 Unauthorized` or `403 Forbidden` and does not produce output items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook-based trigger mechanism | documented | Asana Webhooks API and handshake protocol documented at Asana developer site; n8n public doc confirms event subscription |
| Resource subscription (task/project GID) | documented | Public n8n docs list "New Asana event" — the single resource parameter is the trigger criterion |
| Workspace parameter | documented | Public n8n docs confirm workspace is used for webhook deduplication during activation |
| Webhook lifecycle (create/checkExists/delete) | inferred | From type descriptor (`webhookMethods.default`), but consistent with standard n8n webhook pattern |
| Signature verification | inferred | Asana webhook security guide documents `X-Hook-Signature` verification; standard n8n webhook nodes typically handle this |
| Exact output event shape | inferred | From Asana Events API documentation; events unwrapped from array and emitted individually |
| Heartbeat handling | documented | Asana webhook guide describes 8-hour heartbeat with empty payload |
| Credential types | documented | Asana credentials public page documents both Access Token and OAuth2 |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.asanaTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

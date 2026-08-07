---
type: n8n-nodes-base.helpScoutTrigger
displayName: Help Scout Trigger
category: Communication
versions: [1]
priority: medium
status: missing
---

# Help Scout Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.helpscouttrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/helpscout/ | Public docs only |
| https://developer.helpscout.com/mailbox-api/endpoints/webhooks/create/ | Public docs only (Help Scout Webhook API) |

## Wire format

- **Type string:** `n8n-nodes-base.helpScoutTrigger`
- **Aliases:** (none)
- **Inputs:** none
- **Outputs:** `main` × 1
- **Credentials:** `helpScoutOAuth2Api` (OAuth2, required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiOptions | [] | yes | (none) | One or more Help Scout webhook event types to subscribe to |

### Event types

The node subscribes to the Help Scout Webhooks API (`POST /v2/webhooks`) on activation and unsubscribes on deactivation. Each activation creates/registers a webhook targeting the workflow's webhook URL. The supported event types are:

| Display name | API event value | Description |
|-------------|----------------|-------------|
| Conversation - Assigned | `convo.assigned` | A conversation was assigned to a user |
| Conversation - Created | `convo.created` | A new conversation was created |
| Conversation - Deleted | `convo.deleted` | A conversation was deleted |
| Conversation - Merged | `convo.merged` | Conversations were merged |
| Conversation - Moved | `convo.moved` | A conversation was moved between mailboxes |
| Conversation - Status | `convo.status` | A conversation's status changed |
| Conversation - Tags | `convo.tags` | Tags on a conversation changed |
| Conversation Agent Reply - Created | `convo.agent.reply.created` | An agent replied to a conversation |
| Conversation Customer Reply - Created | `convo.customer.reply.created` | A customer replied to a conversation |
| Conversation Note - Created | `convo.note.created` | A note was added to a conversation |
| Customer - Created | `customer.created` | A new customer was created |
| Rating - Received | `satisfaction.ratings` | A satisfaction rating was received |

**Note:** The Help Scout Webhook API supports additional events (e.g. `customer.deleted`, `customer.updated`, `beacon.chat.created`, `message.survey.response.received`, `tag.*`, `organization.*`, `user.status.changed`, `convo.custom-fields`, `convo.ai-answers-email.*`) that are not exposed in this trigger node. Only the 12 listed events are available for selection.

## Runtime behavior

### Activation

When the workflow is activated, the node registers a webhook via `POST /v2/webhooks` against the Help Scout Mailbox API. The request body includes:

- `url`: The workflow's public webhook callback URL
- `events`: The user-selected event types
- `secret`: A randomly generated secret string (40 chars or fewer) used for HMAC signature verification
- `payloadVersion`: `"V3"` (preserves `system_user` type in conversation payloads)
- `label`: A human-readable label identifying the webhook's n8n workflow association

The `mailboxIds` parameter is not configurable — the webhook triggers for actions on conversations in all accessible mailboxes.

### Input

None — trigger nodes have no input connections.

### Output

Each received webhook payload is emitted as one output item on `main[0]`. According to the Help Scout Webhook API documentation, the payload does not contain the full changed entity; instead it provides a resource URI that can be used to fetch the entity. The output shape per event typically includes:

```json
{
  "id": "<webhook-event-id>",
  "type": "convo.created",
  "data": {
    "item": {
      "id": 12345,
      "number": 678,
      "preview": "...",
      "mailboxId": 1,
      "status": "active",
      "subject": "...",
      "createdAt": "2026-01-01T00:00:00Z",
      "modifiedAt": "2026-01-01T00:00:00Z",
      "primaryCustomer": { ... },
      "assignee": { ... },
      "tags": [ ... ],
      "embedded": { ... },
      "_links": { ... }
    },
    "mailbox": { ... },
    "customer": { ... },
    "assignee": { ... },
    "modifiedBy": { ... }
  },
  "timestamp": "2026-01-01T00:00:00Z",
  "app": "help-scout",
  "organization": "...",
  "account": "...",
  "_links": {
    "self": { "href": "https://api.helpscout.net/v2/conversations/12345" }
  }
}
```

The exact shape varies by event type. The `_links.self.href` URI can be used to fetch the full entity via the Help Scout Mailbox API.

### Signature verification

The node should verify incoming webhook payloads against the HMAC-SHA256 signature sent in the `X-HelpScout-Signature` header, using the secret generated at registration. Payloads with invalid signatures should be rejected (HTTP 401/403).

### Errors

- If webhook registration fails at activation, the node should report the error and mark the workflow as having failed to activate.
- If the webhook receives a POST whose signature does not match, respond with an appropriate error status code and do not emit output items.
- `continueOnFail` is not applicable for trigger nodes.

### Expressions

The `events` parameter accepts expression strings in addition to static selections.

## Acceptance tests

### Test: register webhook on activation

**Given** a Help Scout Trigger node configured with events `["convo.created", "convo.assigned"]` and valid `helpScoutOAuth2Api` credentials.

**When** the workflow is activated, the node **must** send a `POST /v2/webhooks` request to `https://api.helpscout.net` with:
- `url` matching the public webhook callback URL
- `events` containing `["convo.created", "convo.assigned"]`
- `secret` present (non-empty string, ≤ 40 chars)
- `payloadVersion` set to `"V3"`

**Expect** HTTP 201 with a `Resource-ID` header indicating successful registration.

### Test: emit output item on matching webhook event

**Given** the node is active and subscribed to `convo.created`.

**When** Help Scout delivers a `POST` to the callback URL with a valid `X-HelpScout-Signature` header and a `convo.created` payload body.

**Expect** one item is emitted on `main[0]` containing the parsed webhook payload, including the `data.item` object and `_links.self.href` URI.

### Test: reject invalid signature

**Given** the node is active and subscribed to events.

**When** Help Scout delivers a `POST` to the callback URL with a missing or mismatched `X-HelpScout-Signature` header.

**Expect** the node responds with HTTP 401 and emits zero output items.

### Test: delete webhook on deactivation

**Given** the node is active and has a registered webhook with ID `123`.

**When** the workflow is deactivated.

**Expect** the node sends `DELETE /v2/webhooks/123` and receives HTTP 204.

### Test: subscribe to multiple event types

**Given** a node configured with `events` set to `["convo.created", "convo.status", "satisfaction.ratings", "customer.created"]`.

**When** activated.

**Expect** the registration request includes all four event types in the `events` array. When any of these event types fire, the node emits the corresponding payload.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event-to-value mapping | Known from corpus (node.json descriptor) — 12 events documented | Verified against n8n docs page (minimal) and Help Scout API docs. Help Scout API supports ~25+ events; the node exposes a subset of 12. |
| Payload shape | Inferred from generic Help Scout webhook contract | The Help Scout API docs state "payload does not contain the changed entity but rather just a resource URI". The actual V3 payload shape is documented at developer.helpscout.com. |
| Signature verification | Inferred from standard webhook pattern | HMAC-SHA256 with the user-provided secret is the expected verification mechanism per Help Scout API docs. |
| `mailboxIds` filtering | Not configurable in this node | The Help Scout API supports per-mailbox webhook filtering; this node does not expose that option. |
| `payloadVersion` | Inferred — assumed V3 | V3 preserves `system_user` type in payloads; V2 is deprecated. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.helpScoutTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

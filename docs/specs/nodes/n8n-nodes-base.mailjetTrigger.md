---
type: n8n-nodes-base.mailjetTrigger
displayName: Mailjet Trigger
category: Trigger
versions: [1]
priority: medium
status: specced
---

# Mailjet Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mailjettrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailjet/ | Public docs only |
| https://dev.mailjet.com/email/guides/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mailjetTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `mailjetEmailApi` (required)

### Credential properties

| name | type | required | notes |
|------|------|----------|-------|
| apiKey | string (password) | yes | Mailjet Email API key |
| secretKey | string (password) | yes | Mailjet API secret key |
| sandboxMode | boolean | no | Validate payloads without delivering messages |

Auth is HTTP Basic using apiKey as username and secretKey as password, validated against `GET /v3/REST/template` on `https://api.mailjet.com`.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| event | options | `open` | yes | Which Mailjet event type to subscribe to |

### Event options

| name | value |
|------|-------|
| email.blocked | `blocked` |
| email.bounce | `bounce` |
| email.open | `open` |
| email.sent | `sent` |
| email.spam | `spam` |
| email.unsub | `unsub` |

## Runtime behavior

### Webhook lifecycle

The node registers a webhook at `POST /webhook` (relative to the n8n instance's webhook base URL) when the workflow is activated. It unregisters the webhook on deactivation. The Mailjet platform sends event notifications to this endpoint.

The node uses a single webhook named `default` with `responseMode: "onReceived"`, meaning each incoming POST from Mailjet is processed immediately and emitted.

### Output

Each incoming Mailjet webhook payload is emitted as a single output item. The item `json` property contains the full Mailjet event payload as received from the Mailjet event webhook API. The exact shape is defined by Mailjet's [Event API documentation](https://dev.mailjet.com/email/guides/webhooks/) and varies by event type.

Typical event payload fields include:
- `event` — the event type string matching the configured `event` parameter value
- `time` — Unix timestamp of the event
- `MessageID` — the Mailjet message ID
- `email` — the recipient email address
- `mj_campaign_id` — campaign identifier if applicable
- Event-specific fields (bounce reason, spam score, block reason, etc.)

### Errors

- Authentication failures or invalid credentials produce an error and halt execution.
- Malformed or invalid webhook payloads from the Mailjet API are silently dropped (no output item produced).
- The `continueOnFail` setting applies to per-item processing errors in downstream nodes.

### Expressions

The `event` parameter supports expressions for dynamic event type selection.

## Acceptance tests

### Test: subscribe to open events

**Parameters:**

```json
{
  "event": "open"
}
```

**Expect** that the node activates a webhook registered at the n8n instance's webhook URL path `/webhook`. On receiving a Mailjet open-event POST, the output item `json.event` equals `"open"` and the item includes `time`, `MessageID`, and `email`.

### Test: subscribe to bounce events

**Parameters:**

```json
{
  "event": "bounce"
}
```

**Expect** that emitted items have `json.event` equal to `"bounce"` and include bounce-specific fields such as `blocked` (boolean) and `hardbounce` (boolean).

### Test: subscribe to spam events

**Parameters:**

```json
{
  "event": "spam"
}
```

**Expect** that emitted items have `json.event` equal to `"spam"` and include `source` (string identifying the spam reporter source).

### Test: subscribe to blocked events

**Parameters:**

```json
{
  "event": "blocked"
}
```

**Expect** that emitted items have `json.event` equal to `"blocked"` and include a `error_related_to` string and `error` string describing the block reason.

### Test: subscribe to unsub events

**Parameters:**

```json
{
  "event": "unsub"
}
```

**Expect** that emitted items have `json.event` equal to `"unsub"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook registration/deactivation flow | inferred | The node registers a webhook at n8n's path on activation; the exact Mailjet API endpoint for webhook registration is handled internally via the Mailjet REST API. The webhook `httpMethod` is POST and `responseMode` is `onReceived` from the JSON descriptor. |
| Event payload field structure | documented | Exact payload fields are defined by Mailjet's Event API documentation; only commonly documented fields (event, time, MessageID, email) are guaranteed across all event types. |
| Event type mapping | inferred from corpus | The six event options (blocked, bounce, open, sent, spam, unsub) are confirmed from the type descriptor's options list. The display names prefixed with `email.` match Mailjet's webhook event naming. |
| Credential type | documented | `mailjetEmailApi` is required; `mailjetSmsApi` is not applicable to this trigger node. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/triggers/mailjetTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

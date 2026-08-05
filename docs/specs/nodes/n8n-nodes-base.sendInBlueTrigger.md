---
type: n8n-nodes-base.sendInBlueTrigger
displayName: Brevo Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Brevo Trigger (SendinBlue)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.brevotrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/brevo/ | Public docs only |
| https://developers.brevo.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.sendInBlueTrigger`
- **Aliases:** (none — the upstream aliased `n8n-nodes-base.brevoTrigger` with `["sendinblue"]`; OpenFlow preserves the original type)
- **Inputs:** `main` × 0 (trigger — no incoming connection)
- **Outputs:** `main` × 1
- **Credentials:** `sendInBlueApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiOptions | [] | true | — | Which Brevo event types fire this workflow. At least one must be selected. |

Available event values (exposed as a static set):

- `email_blocked`
- `email_clicked`
- `email_deferred`
- `email_delivered`
- `email_hardBounce`
- `email_invalid`
- `email_markedSpam`
- `email_opened`
- `email_sent`
- `email_softBounce`
- `email_uniqueOpened`
- `email_unsubscribed`

## Runtime behavior

### Input

No input connection — the trigger is activated when a configured Brevo webhook fires, not when items arrive from a prior node.

### Webhook lifecycle

On activation the node registers an HTTPS webhook URL with the Brevo API for each selected event type. On deactivation it unregisters those webhooks.

### Output

Each incoming Brevo webhook payload is emitted as one output item on `main[0]`. The item `json` field contains the Brevo webhook event body whose top-level keys typically include: `event` (the event type string), `email` (recipient address), `id` (message ID), `date` (ISO timestamp), `ts` (epoch seconds), and event-type-specific fields such as `reason` (bounce/deferral reason), `sg_event_id`, `smtp-id`, `category`, `ip`, `useragent`, `url` (for clicks), `from`, `subject`, and `marketing_campaign` (campaign name/id). The exact shape is determined by Brevo's outbound webhook contract.

### Errors

- **Credential validation:** If the configured API key is invalid or missing a NodeOperationError is thrown during activation.
- **Webhook registration failure:** If the Brevo API rejects webhook creation (network error, server error), a NodeOperationError is thrown and the node enters an error state.
- **Runtime:** Malformed incoming requests (invalid HMAC, non-POST) produce a 400 response and are not emitted as items.
- **`continueOnFail`:** Standard trigger semantics — if an error occurs during execution the workflow may still continue downstream depending on the setting.

### Expressions

The `events` parameter accepts an expression string (dynamic event selection).

## Acceptance tests

### Test: emits one item per webhook event

**Given** the node is activated with events `["email_sent"]`

**When** Brevo POSTs the following JSON body to the registered webhook URL:
```json
{
  "event": "email_sent",
  "email": "user@example.com",
  "id": "<abc123@mail.example.com>",
  "date": "2025-01-15T10:30:00+00:00",
  "ts": 1736937000,
  "smtp-id": "<abc123@mail.example.com>",
  "category": ["test"],
  "sg_event_id": "EVENT_ID_1",
  "marketing_campaign": {"name": "Newsletter", "id": 42},
  "from": "sender@example.com",
  "subject": "Hello",
  "ip": "203.0.113.1"
}
```

**Expect** output[0] contains one item with `json` equal to the full body above, and `headers` populated with the HTTP request metadata.

### Test: supports all events

**Given** the node is activated with all 12 event types selected

**When** Brevo delivers a `email_clicked` event with a `url` field

**Expect** the item's `json.event` equals `"email_clicked"` and `json.url` contains the clicked link — confirming no event type is silently dropped.

### Test: unsubscribes webhook on deactivation

**Given** an active Brevo Trigger node

**When** the workflow is deactivated

**Expect** the registered webhook is deleted via the Brevo API (confirmed by a subsequent GET returning a 404 or empty result for that webhook ID).

### Test: invalid credentials throw at activation

**Given** a Brevo Trigger node with an invalid API key

**When** the workflow is activated

**Expect** a `NodeOperationError` is thrown with a message indicating authentication failure.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event type enum values | Documented (public n8n docs) | 12 events listed on the Brevo Trigger page |
| Webhook registration API | Inferred | The node registers/unregisters webhooks via the Brevo REST API (POST /webhooks, DELETE /webhooks/{id}) |
| Output payload shape | Inferred from Brevo webhook contract | Brevo webhook body format is documented by Brevo externally, not by n8n |
| Webhook URL generation | Inferred | n8n generates a unique callback URL per node instance |
| HMAC signature validation | Inferred | Standard Brevo webhook security practice — node likely verifies the signature header |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/brevoTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

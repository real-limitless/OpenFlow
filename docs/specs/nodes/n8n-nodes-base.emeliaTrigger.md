---
type: n8n-nodes-base.emeliaTrigger
displayName: Emelia Trigger
category: Communication, Marketing
versions: [1]
priority: low
status: specced
---

# Emelia Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.emeliatrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/emelia/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.emelia/ | Public docs only |
| https://emelia.io/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.emeliaTrigger`
- **Aliases:** (none)
- **Inputs:** — (trigger node, no input)
- **Outputs:** `main` × 1
- **Credentials:** `emeliaApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multi-select | — | yes | — | One or more events to subscribe to |
| campaignId | string (loaded from API) | — | yes | — | The Emelia campaign to link the webhook to |

### Events (multi-select options)

- `emailBounced` — Email Bounced
- `emailOpened` — Email Opened
- `emailReplied` — Email Replied
- `emailSent` — Email Sent
- `linkClicked` — Link Clicked
- `unsubscribedContact` — Unsubscribed Contact

## Runtime behavior

### Activation lifecycle

On activation the node registers a webhook with the Emelia API. The webhook is created against the selected campaign, scoped to the chosen event types. On deactivation the webhook is deleted. If a matching webhook already exists for the campaign, re-activation is idempotent (check-then-create pattern).

### Input

No input items — this is a trigger node that produces output on external events.

### Output

Each incoming Emelia webhook payload is emitted as a single output item. The output shape is the raw JSON body of the Emelia webhook request, forwarded as-is onto output[0]. The exact payload structure is defined by the Emelia webhook API and typically includes event type, campaign metadata, contact/email properties, and a timestamp.

### Errors

- Authentication failures during webhook registration throw and prevent activation.
- Webhook deletion failures on deactivation are non-fatal (logged).

### Expressions

`events` and `campaignId` accept expressions.

## Acceptance tests

### Test 1: subscribe to email opened events

**Parameters:**
```json
{
  "events": ["emailOpened"],
  "campaignId": "={{ $json.campaignId }}"
}
```

**Given** an Emelia webhook POST arrives:
```json
{
  "event": "emailOpened",
  "campaignId": "cm_123",
  "contact": { "email": "prospect@example.com", "name": "Jane Doe" },
  "messageId": "<abc123@mail.example.com>",
  "timestamp": "2026-08-04T12:00:00Z"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "event": "emailOpened",
    "campaignId": "cm_123",
    "contact": { "email": "prospect@example.com", "name": "Jane Doe" },
    "messageId": "<abc123@mail.example.com>",
    "timestamp": "2026-08-04T12:00:00Z"
  }
}]
```

### Test 2: subscribe to multiple events

**Parameters:**
```json
{
  "events": ["emailSent", "emailBounced", "unsubscribedContact"],
  "campaignId": "cm_456"
}
```

**Given** three Emelia webhook POSTs arrive sequentially, the node emits one item per event. A bounced event:
```json
{
  "event": "emailBounced",
  "campaignId": "cm_456",
  "contact": { "email": "bad@example.com" },
  "reason": "mailbox_full",
  "timestamp": "2026-08-04T13:00:00Z"
}
```

**Expect** output items matching each event payload with no transformation.

### Test 3: webhook lifecycle — activation registers webhook

**Given** an emeliaApi credential with a valid API key and a `campaignId` for an existing campaign, on activation the node interacts with the Emelia API to register the webhook. If the webhook already exists, activation succeeds without creating a duplicate.

### Test 4: webhook lifecycle — deactivation removes webhook

**Given** an active webhook, on deactivation the node interacts with the Emelia API to remove the webhook. If the webhook no longer exists on the remote side, deactivation succeeds silently.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event names and semantics | documented | Public n8n docs list 6 events |
| Campaign filtering | inferred from corpus | The trigger is scoped per campaign; campaign list loaded dynamically via getCampaigns |
| Authentication | documented | emeliaApi with API key; credential test via emeliaApiTest |
| Webhook URL format | inferred | Uses standard n8n webhook URL generation; the exact Emelia API webhook registration contract is not publicly documented |
| Output payload shape | inferred | Raw Emelia webhook body forwarded; exact shape depends on Emelia's webhook API |
| Webhook lifecycle (check/create/delete) | inferred from corpus type declarations | Declares webhookMethods with checkExists/create/delete; exact Emelia API endpoints unknown |
| Idempotency on re-activation | inferred | checkExists pattern prevents duplicate webhooks |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.emeliaTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

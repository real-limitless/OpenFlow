---
type: n8n-nodes-base.chargebeeTrigger
displayName: Chargebee Trigger
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# Chargebee Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.chargebeetrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/chargebee/ | Public docs only |
| https://apidocs.chargebee.com/docs/api/events | Public docs only |
| https://apidocs.chargebee.com/docs/api/events/event-types | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.chargebeeTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger starts workflow)
- **Outputs:** `main` × 1
- **Credentials:** `chargebeeApi` (Account Name + API Key)

## Parameters

The Chargebee Trigger is a webhook-based trigger. Chargebee sends HTTP POST events to the webhook URL the node exposes. The node does not poll — it listens for incoming webhook calls.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | `multiOptions` | `*` (all) | no | — | Which Chargebee event types to subscribe to. Accepts any subset of the Chargebee event types (e.g. `subscription_created`, `invoice_generated`, `payment_succeeded`, `customer_changed`). The wildcard `*` catches all event types. The node receives only selected types from Chargebee. |

**Events filter detail:** The Chargebee webhook can be filtered at Chargebee's side (in the Chargebee dashboard under Settings > Configure Chargebee > Webhooks). The n8n node additionally lets the user filter which events trigger the workflow within n8n. When no events are specified, all incoming webhook events pass through.

## Runtime behavior

### Webhook lifecycle

1. The workflow **activates** — the node registers itself as a valid webhook endpoint on the n8n server.
2. The user copies the webhook URL from the node's output panel and pastes it into Chargebee under **Settings > Configure Chargebee > Webhooks** (Add Webhook).
3. When any matching event occurs in Chargebee, Chargebee sends an HTTP POST with `Content-Type: application/json` to the webhook URL.
4. The node receives the request, validates it against the credential (Account Name + API Key), filters by configured `events`, and emits one output item per received webhook payload.

### Output

Each emitted item contains the full Chargebee Event JSON object as received from the Chargebee webhook POST body.

Standard Chargebee event envelope structure:

```json
{
  "id": "ev_123abc",
  "occurred_at": 1712000000,
  "source": "api",
  "event_type": "subscription_created",
  "api_version": "v2",
  "content": {
    "subscription": { ... },
    "customer": { ... }
  },
  "webhooks": [
    {
      "id": "wh_456def",
      "webhook_status": "succeeded"
    }
  ]
}
```

Key `event_type` categories include: subscription_*, customer_*, invoice_*, payment_*, card_*, credit_note_*, order_*, item_*, feature_*, coupon_*, quote_*, gift_*, and more (hundreds of event types are available — see Chargebee docs).

The `content` object contains the affected Chargebee resource(s) keyed by resource name (e.g. `subscription`, `customer`, `invoice`, `payment_intent`, `transaction`).

### Errors

- If the webhook payload cannot be parsed as JSON, the node throws a non-retriable error.
- If the credential is invalid or the webhook cannot be verified against the API key, the webhook call is rejected.
- The node must return HTTP `2xx` within Chargebee's timeout window (otherwise Chargebee retries with exponential backoff for up to ~2 days).
- `continueOnFail` is respected — on error the item is skipped and processing continues.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: receive a subscription_created event

**Given** a Chargebee webhook POST with body:

```json
{
  "id": "ev_test_sub_created",
  "occurred_at": 1712000000,
  "source": "api",
  "event_type": "subscription_created",
  "api_version": "v2",
  "content": {
    "subscription": {
      "id": "sub_test_123",
      "status": "active",
      "plan_id": "basic-monthly"
    },
    "customer": {
      "id": "crm_test_456",
      "email": "test@example.com"
    }
  }
}
```

**Parameters:**
```json
{ "events": ["subscription_created"] }
```

**Expect** output[0] contains the full event JSON as `json` data, with `event_type` equal to `"subscription_created"`.

### Test: wildcard events filter passes all event types

**Parameters:**
```json
{ "events": ["*"] }
```

**Given** a webhook POST with `event_type: "payment_succeeded"`, then a second call with `event_type: "invoice_generated"`.

**Expect** both events produce one output item each (both pass the filter).

### Test: specific event filter rejects non-matching events

**Parameters:**
```json
{ "events": ["subscription_cancelled"] }
```

**Given** a webhook POST with `event_type: "payment_succeeded"`.

**Expect** no output items (the event is filtered out).

### Test: erroneous JSON payload returns error

**Given** a webhook POST with body `not-json`.

**Expect** thrown error, no output items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event type list | documented | Full list at Chargebee Events API docs (hundreds of types) |
| Webhook URL setup procedure | documented | User copies URL from n8n to Chargebee dashboard |
| Credential format | documented | Account Name (site subdomain) + API Key |
| Output JSON shape | documented | Standard Chargebee Event object; format is an external contract |
| Events filter parameter | inferred | Common filter pattern across n8n webhook triggers; the node type has no dedicated n8n docs page showing exact parameter schema |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.chargebeeTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

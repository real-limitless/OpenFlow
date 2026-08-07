---
type: n8n-nodes-base.payPalTrigger
displayName: PayPal Trigger
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# PayPal Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.paypaltrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/paypal/ | Public docs only |
| https://developer.paypal.com/docs/api/webhooks/v1/ | Third-party service API docs |
| https://developer.paypal.com/docs/api/notifications/webhooks/event-names/ | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.payPalTrigger`
- **Inputs:** none (trigger node — no `main` input)
- **Outputs:** `main` × 1
- **Credentials:** `payPalApi` (Client ID + Secret, OAuth2 client-credentials grant, Environment selector: Live or Sandbox)

## Parameters

The node is a **webhook trigger** that registers a PayPal REST webhook at activation and deletes it at deactivation. PayPal delivers event notifications to the webhook URL, and the node emits one output item per received event.

The user selects which PayPal event types to subscribe to. The node calls `POST /v1/notifications/webhooks` to register the webhook for the selected event types, and `DELETE /v1/notifications/webhooks/{webhook_id}` on deactivation.

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| Event Names | multi-select list of strings | No (default: all events) | One or more PayPal webhook event type names (e.g. `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `BILLING.SUBSCRIPTION.CANCELLED`). If empty, the webhook subscribes to all available event types. |

The full set of subscribable event type names is defined by the PayPal REST API (`GET /v1/notifications/webhooks-event-types`). The executor may either hardcode a reasonable subset or fetch the live list at runtime.

## Runtime behavior

### Webhook lifecycle

1. **Activation:** The node acquires an OAuth2 Bearer token via `POST /v1/oauth2/token` using the configured PayPal credentials. It then calls `POST /v1/notifications/webhooks` with the n8n webhook URL, the selected event types, and the webhook name. The webhook ID is persisted in static data for deactivation.
2. **Deactivation:** The node calls `DELETE /v1/notifications/webhooks/{webhook_id}` using the stored webhook ID.
3. **Event reception:** PayPal POSTs event notifications to the webhook URL. Each event conforms to the PayPal webhook event envelope.

### Output

Each incoming webhook payload is emitted as one output item. The output item contains the full PayPal webhook event envelope under `json`:

```json
{
  "id": "WH-XXXX12345",
  "event_version": "1.0",
  "create_time": "2024-01-01T12:00:00Z",
  "resource_type": "capture",
  "event_type": "PAYMENT.CAPTURE.COMPLETED",
  "summary": "Payment completed for $10.00 USD",
  "resource": {
    "id": "CAPTURE_ID",
    "status": "COMPLETED",
    "amount": { "value": "10.00", "currency_code": "USD" }
  },
  "links": []
}
```

Key fields:
- `event_type` — the PayPal event name string (matches the selected subscription event types)
- `resource` — the PayPal resource object affected by the event (shape varies by event type)
- `resource_type` — the type of resource (e.g. `capture`, `refund`, `sale`, `order`, `subscription`)
- `id` — the unique webhook event notification ID

No binary output is produced.

### Errors

- Credential validation failures (missing Client ID, Secret, or environment) prevent activation.
- PayPal API errors during webhook registration (e.g. invalid credentials, quota exceeded) surface as activation failures.
- Malformed or unparseable incoming webhook payloads should be logged and skipped, not thrown, to avoid blocking subsequent events.
- HMAC-SHA256 webhook signature verification is not required (PayPal recommends but does not mandate it at the node level; the executor may optionally implement it).

### Expressions

The Event Names parameter accepts expression strings for dynamic subscription configuration.

## Acceptance tests

### Test: subscribe to payment capture events

**Given** a configured PayPal credential with valid Client ID and Secret (sandbox environment).

**Parameters:**

```json
{
  "eventNames": ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED"]
}
```

**Expect** the node activates successfully, registers a webhook at `POST /v1/notifications/webhooks` targeting the n8n instance webhook URL with the two event types, and stores the returned webhook ID. On receipt of a valid PayPal webhook POST with `event_type: "PAYMENT.CAPTURE.COMPLETED"`, output[0] contains `json.event_type` equal to `"PAYMENT.CAPTURE.COMPLETED"` and `json.resource` as a non-null object.

### Test: subscribe to all events (empty list)

**Given** a configured PayPal credential.

**Parameters:**

```json
{
  "eventNames": []
}
```

**Expect** the node activates and registers a webhook with no event type filter (all event types enabled).

### Test: webhook deactivation

**Given** an activated node with a registered webhook.

**When** the workflow is deactivated or the node is removed.

**Expect** the node calls `DELETE /v1/notifications/webhooks/{webhook_id}` with the stored webhook ID, and the webhook is removed from PayPal.

### Test: malformed payload handling

**Given** an activated node.

**When** a non-JSON payload is POSTed to the webhook URL.

**Expect** the node produces no output items and does not throw an error. The malformed payload is silently dropped.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook registration lifecycle | Inferred | Standard pattern for n8n webhook trigger nodes; no public n8n docs detail the activation/deactivation flow for this specific node |
| Event name selection UI | Inferred | The multi-select event name pattern is standard across n8n trigger nodes; the exact UI (static list vs live fetch) is not publicly documented |
| Supported event type list | Documented (third-party) | PayPal REST API defines the full event type catalog at `GET /v1/notifications/webhooks-event-types` |
| Credential type | Documented | PayPal credentials page confirms Client ID + Secret + Environment |
| Webhook signature verification | Inferred | PayPal recommends optional verification; n8n does not document it for this node |
| Output envelope shape | Documented (third-party) | PayPal webhook event envelope is defined in the PayPal REST API docs |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.payPalTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
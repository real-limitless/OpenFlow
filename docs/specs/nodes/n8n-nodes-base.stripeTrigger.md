---
type: n8n-nodes-base.stripeTrigger
displayName: Stripe Trigger
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# Stripe Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.stripetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/stripe/ | Public docs only |
| https://docs.stripe.com/api | Public docs only (Stripe API reference) |
| https://docs.stripe.com/webhooks | Public docs only (Stripe webhooks) |

## Wire format

- **Type string:** `n8n-nodes-base.stripeTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node, no input)
- **Outputs:** `main` × 1
- **Credentials:** `stripeApi` (required)

### Credential: `stripeApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| secretKey | string (password) | (empty) | yes | Stripe Secret API key (`sk_live_*` or `sk_test_*`) |
| signatureSecret | string (password) | (empty) | no | Stripe webhook signing secret (`whsec_*`); enables webhook signature verification |

The credential authenticates via `Authorization: Bearer <secretKey>`. When `signatureSecret` is set, incoming webhook payloads are verified against the `Stripe-Signature` header using HMAC-SHA256.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| events | multi-select from event type list | `[]` | yes | One or more Stripe event type strings (e.g. `charge.succeeded`). The wildcard value `*` listens to all events. |
| apiVersion | string | `""` | no | Stripe API version string (e.g. `2026-01-28.clover`). Controls the format of incoming event payloads. If empty, Stripe uses the account default API version. |

### Event type selection

The user must select at least one event type from a static curated list. The list includes a wildcard option (`*`) for all events, and covers all major Stripe event categories: Account, ApplicationFee, Balance, Capability, Charge, CheckoutSession, Coupon, CreditNote, Customer, File, Invoice, InvoiceItem, Issuing*, Order, PaymentIntent, PaymentMethod, Payout, Person, Plan, Product, Radar, Reporting, Review, SetupIntent, Sigma, SKU, Source, SubscriptionSchedule, TaxRate, TopUp, Transfer, and their sub-events.

## Runtime behavior

### Webhook lifecycle

1. **On workflow activation:** The node registers a webhook endpoint with Stripe via POST `/v1/webhook_endpoints` using the Stripe credential. The endpoint URL is derived from the runtime's public webhook base URL. The node first checks whether an endpoint already exists for this URL to avoid duplicates.

2. **On webhook receive:** An HTTP POST arrives at the registered endpoint. If `signatureSecret` is configured on the credential, the node verifies the `Stripe-Signature` header using Stripe's standard HMAC-SHA256 verification (tolerance window: 5 minutes). Requests that fail verification are rejected with HTTP 401 and do not trigger workflow execution.

3. **On workflow deactivation:** The node deletes the webhook endpoint via DELETE `/v1/webhook_endpoints/{id}`.

4. **Event filtering:** The node reads the `type` field from the webhook body. If the type is not in the configured `events` list (and the wildcard `*` is not selected), the node produces zero output items (silent discard). If the type matches, the raw webhook body is passed through as output.

### Output

Each incoming Stripe webhook event produces one output item containing the complete Stripe event envelope as received:

```json
{
  "id": "evt_3OXYZ...",
  "object": "event",
  "api_version": "2020-08-27",
  "created": 1700000000,
  "type": "charge.succeeded",
  "data": {
    "object": { ... },
    "previous_attributes": { ... }
  },
  "livemode": false,
  "pending_webhooks": 0,
  "request": {
    "id": "req_XYZ",
    "idempotency_key": null
  }
}
```

The body is passed as-is from Stripe. The executor does not transform or unwrap nested objects.

### Errors

- **Signature verification failure:** Return HTTP 401, discard the request, produce zero output items.
- **Unregistered event type:** Silent discard — produce zero output items.
- **Stripe API errors (webhook registration/deletion):** Surface the Stripe API error. Respect `continueOnFail` — when true, log and continue; when false, halt.
- **Network/HTTP errors:** Standard retry for transient failures during webhook registration.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: basic webhook receive — matching event

**Given** an incoming POST with a valid Stripe webhook body containing `type: "charge.succeeded"`.

**Parameters:**
```json
{
  "events": ["charge.succeeded"],
  "apiVersion": ""
}
```

**Expect** output[0] to contain one item with `json.type` equal to `"charge.succeeded"` and the full Stripe event envelope preserved. The item must include `json.id`, `json.created`, and `json.livemode`.

### Test: signature verification rejects unsigned requests

**Given** a credential with `signatureSecret` set and an incoming POST without a valid `Stripe-Signature` header.

**Expect** the node to return HTTP 401 and produce zero output items.

### Test: filtered event types are silently dropped

**Given** a node configured with `events: ["invoice.paid"]` and an incoming POST delivering a `charge.succeeded` event (with valid signature).

**Expect** zero output items.

### Test: wildcard event matches all types

**Given** a node configured with `events: ["*"]` and an incoming POST with `type: "charge.succeeded"`.

**Expect** output[0] to contain one item.

### Test: duplicate webhook delivery

**Given** a Stripe event ID previously processed within the deduplication window, and an incoming POST carrying the same ID.

**Expect** zero output items.

### Test: webhook lifecycle — activate then deactivate

**Given** a workflow with this trigger node.

**When** the workflow is activated, the node calls Stripe's Create Webhook Endpoint API and stores the returned endpoint ID.

**When** the workflow is deactivated, the node calls Stripe's Delete Webhook Endpoint API with the stored endpoint ID.

**Expect** both API calls succeed. On reactivation, the node performs a check-exists step and reuses an existing endpoint if the URL matches.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names (events, apiVersion) | documented | From public docs and parameter descriptor |
| Event type list | documented | Static curated list in source; mirrors Stripe event catalog |
| Webhook registration API contract | documented | Stripe public API docs (POST/DELETE webhook_endpoints) |
| Signature verification algorithm | documented | HMAC-SHA256, 5-minute tolerance, from Stripe webhooks docs |
| Deduplication strategy | inferred | n8n's built-in webhook deduplication by event `id` |
| Credential fields (secretKey, signatureSecret) | documented | From credential descriptor and Stripe docs |
| Webhook method lifecycle (checkExists/create/delete) | documented | From type descriptor; standard webhook pattern |
| Response mode (onReceived) | documented | From descriptor; synchronous processing |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/stripe-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
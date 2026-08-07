---
type: n8n-nodes-base.wiseTrigger
displayName: Wise Trigger
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# Wise Trigger

Webhook trigger that subscribes to Wise webhook events (balance credits, balance credit/debit, transfer case updates, transfer status changes) via the Wise Webhooks API. Receives and emits the Wise webhook event payload per matching event.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.wisetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/wise/ | Public docs only |
| https://docs.wise.com/api-docs/api-reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wiseTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger)
- **Outputs:** `main` × 1
- **Credentials:** `wiseApi` (API token + environment selection + optional private key for SCA)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| event | options | — | yes | — | Selects which Wise event type triggers execution (see Events below) |

### Events

The node fires on one of these four event types, selected via the `event` parameter:

- **Balance credit** — triggered every time a balance account is credited
- **Balance credit or debit** — triggered every time a balance account is credited or debited
- **Transfer active case update** — triggered every time a transfer's list of active cases is updated
- **Transfer status update** — triggered every time a transfer's status is updated

Only one event type can be selected per node instance. To listen for multiple event types, use multiple Wise Trigger nodes.

## Runtime behavior

### Activation

On workflow activation, the node registers a webhook with the Wise API using the configured credential. The Wise webhook API creates a subscription for the selected event type, pointing to the n8n webhook callback URL. The node uses the `loadOptions` method `getProfiles` to optionally resolve profile IDs if needed for webhook registration.

### Deactivation

On workflow deactivation, the node deletes the webhook subscription from the Wise API to prevent stale callbacks.

### Output

Each incoming HTTP POST from the Wise webhook API is emitted as a single output item. The output shape depends on the event type:

- **Balance events**: payload contains balance/transaction data (currency, amount, date, reference, etc.)
- **Transfer events**: payload contains transfer data (transfer ID, status, source/target currency, amount, case list, etc.)

The output item follows the standard n8n webhook output format:
```json
{
  "json": { /* full Wise webhook event body */ },
  "headers": { /* raw HTTP request headers */ },
  "params": { /* query parameters */ },
  "query": { /* parsed query string */ }
}
```

### Errors

- If webhook registration fails (e.g., credential invalid, network error), the activation throws an error and the workflow remains inactive.
- If an incoming webhook payload cannot be parsed or does not match the expected event shape, the node emits whatever was received without transformation.
- `continueOnFail`: not applicable to trigger nodes; the entire workflow execution fails on unhandled errors.

### Expressions

The `event` parameter accepts an expression string for dynamic selection.

### Dynamic options

The node exposes a `loadOptions` method `getProfiles` that fetches available Wise profiles (`GET /v1/profiles`) and makes them available for credential-scoped selection if needed.

## Acceptance tests

### Test: balance credit trigger

**Given** the node is activated with event = "Balance credit".

**When** Wise sends a webhook POST for a balance credit event:

```json
{
  "data": {
    "type": "balance-credit",
    "id": "event-001",
    "attributes": {
      "currency": "EUR",
      "amount": 500.00,
      "reference": "Payment from client",
      "occurred_at": "2026-08-07T12:00:00Z"
    }
  }
}
```

**Expect** output[0] contains:
- `json.data.type` = "balance-credit"
- `json.data.id` = "event-001"
- `json.data.attributes.currency` = "EUR"
- `json.data.attributes.amount` is a number
- `headers` contains the HTTP headers from the POST

### Test: transfer status update trigger

**Given** the node is activated with event = "Transfer status update".

**When** Wise sends a webhook POST for a transfer status change:

```json
{
  "data": {
    "type": "transfers#status-update",
    "id": "evt-transfer-1",
    "attributes": {
      "transfer_id": 1234567,
      "status": "outgoing_payment_sent",
      "source_currency": "USD",
      "target_currency": "EUR",
      "source_value": 1000.00,
      "target_value": 920.50,
      "occurred_at": "2026-08-07T12:05:00Z"
    }
  }
}
```

**Expect** output[0] contains:
- `json.data.type` = "transfers#status-update"
- `json.data.attributes.transfer_id` = 1234567
- `json.data.attributes.status` = "outgoing_payment_sent"

### Test: transfer active case update trigger

**Given** the node is activated with event = "Transfer active case update".

**When** Wise sends a webhook POST for a case update:

```json
{
  "data": {
    "type": "transfers#active-cases-update",
    "id": "evt-case-1",
    "attributes": {
      "transfer_id": 1234567,
      "active_cases": ["case-abc", "case-def"]
    }
  }
}
```

**Expect** output[0] contains:
- `json.data.type` = "transfers#active-cases-update"
- `json.data.attributes.transfer_id` = 1234567
- `json.data.attributes.active_cases` is an array of strings

### Test: webhook lifecycle

**Given** valid `wiseApi` credentials.

**When** the workflow is activated:

**Expect** the node calls the Wise Webhooks API to create a subscription. The node's `webhookMethods.default.create` returns true.

**When** the workflow is deactivated:

**Expect** the node calls the Wise Webhooks API to delete the subscription. The node's `webhookMethods.default.delete` returns true.

**When** the workflow is re-activated and a subscription for the same event + URL already exists:

**Expect** the node's `webhookMethods.default.checkExists` returns true and no duplicate webhook is created.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event types | documented | Public n8n docs enumerate 4 event types (balance credit, balance credit/debit, transfer active case update, transfer status update) |
| Credential fields | documented | Public n8n docs detail API token, environment (live/test), optional private key for SCA |
| Activation/deactivation flow | inferred from type descriptor | `webhookMethods` interface confirms checkExists/create/delete lifecycle; Wise webhook API used |
| dynamic options | inferred from type descriptor | `loadOptions.getProfiles` confirmed in type declaration |
| Wise webhook event payload structure | inferred | Wise API docs define the webhook event body format; exact `data.type` strings and attribute shapes derived from public Wise API documentation |
| Single event selection | inferred | Only one event per instance; trigger nodes typically allow one selection |
| Header/params/query output format | inferred | Standard n8n webhook node output convention |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/wiseTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

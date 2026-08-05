---
type: n8n-nodes-base.gumroadTrigger
displayName: Gumroad Trigger
category: Sales
versions: [1]
priority: low
status: specced
---

# Gumroad Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gumroadtrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/gumroad/ | Public docs only |
| https://app.gumroad.com/api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.gumroadTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger nodes have no input)
- **Outputs:** `main` × 1
- **Credentials:** `gumroadApi` (required — supports API access token or OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | (none) | yes | — | Which Gumroad event type to subscribe to. One of: `sale`, `refund`, `cancellation`, `dispute`, `dispute_won`. |

The **resource** parameter selects the Gumroad *resource_name* for the webhook subscription (mapped to the Gumroad API's `resource_subscriptions` resource_name field). Each value corresponds to a distinct webhook notification stream from Gumroad.

## Runtime behavior

### Activation

On workflow activation, the node registers a webhook with Gumroad via a `PUT /resource_subscriptions` API call. The request body contains:
- `post_url` — the public HTTPS callback URL that n8n generates for this node
- `resource_name` — the chosen event type from the `resource` parameter

Gumroad responds with a `resource_subscription` object containing an `id`. The node stores this `id` in its static workflow data for lifecycle management (check existence, deletion).

On deactivation, the node calls `DELETE /resource_subscriptions/{webhookId}`. If deletion fails, the node silently returns false (the webhook may remain registered).

On reactivation, the node checks whether the stored `webhookId` still exists by fetching `GET /resource_subscriptions` and scanning the list. If missing, it re-registers.

### Webhook reception

The node exposes a single `POST` webhook at path `webhook` with `responseMode: 'onReceived'`. Gumroad delivers event payloads as JSON request bodies. The node does **not** validate Gumroad's request signature (no HMAC verification).

### Output

Each received webhook body is emitted as a single output item:

```json
{
  "json": { /* the raw Gumroad webhook POST body */ }
}
```

The exact shape of the payload depends on the event type:
- **sale**: Contains `sale_id`, `product_name`, `product_permalink`, `email`, `price`, `currency`, `variants`, `quantity`, `referrer`, etc.
- **refund**: Mirror of the sale payload with refund-specific fields.
- **cancellation**: Subscription cancellation details.
- **dispute** / **dispute_won**: Dispute record with reason, resolution, and sale reference.

No filtering, transformation, or validation is applied — the raw Gumroad POST body is passed through verbatim.

### Errors

- If webhook registration fails (network error, invalid credentials, non-200 from Gumroad), the activation throws and the workflow does not become active.
- On incoming webhook requests, no validation errors are thrown. Invalid payloads are still forwarded as output items.
- `continueOnFail` is not applicable since trigger nodes do not receive input items.

### Expressions

No parameters accept expression strings — `resource` is a static dropdown selection.

## Acceptance tests

### Test: sale webhook fires and passes payload

**Given** the workflow is active with `resource: "sale"` and Gumroad has delivered a sale webhook.

**Expect** the node emits a single output item whose `json` property contains the full Gumroad sale POST body (e.g. includes `sale_id`, `email`, `product_name`, `price`).

### Test: refund webhook registered separately

**Given** a workflow with `resource: "refund"` is activated.

**Expect** the node calls `PUT /resource_subscriptions` with `resource_name: "refund"` and `post_url` set to the n8n-generated callback URL. The stored `webhookId` matches the `id` returned by Gumroad.

### Test: deactivation removes webhook

**Given** an active workflow using the Gumroad Trigger.

**When** the workflow is deactivated, **expect** the node calls `DELETE /resource_subscriptions/{webhookId}` and clears the stored `webhookId`.

### Test: reactivation detects stale webhook and re-registers

**Given** a previously active workflow whose webhook was removed outside n8n.

**When** the workflow reactivates, **expect** the node calls `GET /resource_subscriptions`, finds the stored `webhookId` missing, and re-registers via `PUT /resource_subscriptions`, storing the new `id`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Public API docs for webhook payload shape | partially documented | Gumroad's public API docs exist at app.gumroad.com/api but the exact webhook payload field list is not fully published in n8n docs. Behavioral spec treats payload as opaque pass-through. |
| HMAC / signature verification | inferred absent | The n8n node implementation does not verify Gumroad webhook signatures. |
| Resource options enumeration | documented via corpus | The five options (sale, refund, cancellation, dispute, dispute_won) match Gumroad's documented resource_subscriptions resource_name values. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/GumroadTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

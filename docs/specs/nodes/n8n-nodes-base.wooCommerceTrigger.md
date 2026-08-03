---
type: n8n-nodes-base.wooCommerceTrigger
displayName: WooCommerce Trigger
category: Sales
versions: [1]
priority: medium
status: specced
---

# WooCommerce Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.woocommercetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/woocommerce.md | Public docs only |
| https://woocommerce.github.io/woocommerce-rest-api-docs/ | Public docs only |
| https://developer.woocommerce.com/docs/getting-started-with-the-woocommerce-rest-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wooCommerceTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** one required WooCommerce API credential (consumer key, consumer secret, store URL; optional query-string authentication toggle)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| event | options | order.created | yes | The WooCommerce webhook topic that starts the workflow |

### Event (topic) options

The node supports all standard WooCommerce webhook topics across four resource types:

**Coupons**
- `coupon.created`, `coupon.updated`, `coupon.deleted`

**Customers**
- `customer.created`, `customer.updated`, `customer.deleted`

**Orders**
- `order.created`, `order.updated`, `order.deleted`

**Products**
- `product.created`, `product.updated`, `product.deleted`

## Runtime behavior

### Input

None. This is a trigger node that starts a workflow when WooCommerce delivers a webhook.

### Output

Emits one item per webhook delivery on the `main` output. The item contains:

- `json`: The full webhook payload as sent by WooCommerce (structure varies by topic)
- `binary`: (none)

The webhook payload matches the WooCommerce REST API resource representation for the given topic (e.g., an `order.created` payload contains an Order object with fields such as `id`, `status`, `total`, `line_items`, `billing`, `shipping`).

### Webhook registration & lifecycle

- On workflow activation, the node registers a webhook with WooCommerce for the selected event topic at the configured webhook URL
- On workflow deactivation, the webhook is unregistered from WooCommerce
- WooCommerce delivers webhooks as HTTP POST requests with a JSON body

### Authentication

The node uses WooCommerce API credentials configured via API key:

1. **Consumer Key** — Generated from WooCommerce → Settings → Advanced → REST API
2. **Consumer Secret** — Generated alongside the consumer key
3. **WooCommerce URL** — The WordPress site URL running WooCommerce
4. **Include Credentials in Query** — Optional toggle; when enabled, passes credentials as query-string parameters instead of the Authorization header (useful when the server cannot parse the Authorization header over SSL)

### Error handling

- If webhook registration fails on activation, the workflow fails to activate
- If an incoming webhook payload cannot be parsed, the execution fails
- `continueOnFail` is not applicable (trigger node)

### Expressions

No parameters accept expression strings. Event selection is static configuration.

## Acceptance tests

### Test: order_created_webhook

**Given** a workflow with WooCommerce Trigger configured for `order.created` event, activated with valid credentials

**When** WooCommerce delivers a webhook for a new order

**Then** the workflow starts with one item on `main` output containing the Order JSON payload

```json
{
  "json": {
    "id": 12345,
    "status": "processing",
    "total": "99.99",
    "line_items": [{ "name": "Widget", "quantity": 1, "total": "99.99" }],
    "billing": { "first_name": "Jane", "email": "jane@example.com" }
  }
}
```

### Test: product_updated_webhook

**Given** a workflow with WooCommerce Trigger configured for `product.updated` event

**When** WooCommerce delivers a webhook for a product update

**Then** the workflow starts with one item containing the updated Product JSON payload

### Test: coupon_deleted_webhook

**Given** a workflow with WooCommerce Trigger configured for `coupon.deleted` event

**When** WooCommerce delivers a webhook for a coupon deletion

**Then** the workflow starts with one item on `main` output containing the Coupon JSON payload

### Test: single_event_per_workflow

**Given** a workflow with WooCommerce Trigger configured for `order.created`

**When** a product update webhook is delivered to the workflow URL

**Then** the workflow does not start (the webhook URL is topic-specific, or the node filters by configured event)

### Test: webhook_registration_on_activate

**Given** a workflow with WooCommerce Trigger in inactive state

**When** the workflow is activated

**Then** a webhook subscription is created in WooCommerce for the selected event topic pointing to the n8n webhook URL

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event topic list | documented | 12 events confirmed by public n8n docs page |
| Credential structure | documented | Confirmed by n8n credential docs and WooCommerce REST API docs |
| Webhook payload shapes | inferred | Match WooCommerce REST API resource schemas for the corresponding topic |
| Webhook registration/unregistration | inferred | Follows the standard trigger-node pattern (shopifyTrigger) |
| Single-topic-per-workflow constraint | inferred | Common pattern; no public docs contradict it |
| Filtering or conditions | not supported | Node does not expose additional filtering beyond event selection |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.wooCommerceTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.shopifyTrigger
displayName: Shopify Trigger
category: Sales
versions: [1]
priority: medium
status: specced
---

# Shopify Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.shopifytrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/shopify/ | Public docs only |
| https://shopify.dev/docs/api/webhooks | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.shopifyTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** Shopify API (three auth methods: Access Token, OAuth2, API Key)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options (Access Token, OAuth2, API Key) | API Key | yes | Selects which credential set to use |
| topic | options (60+ Shopify webhook topics) | — | yes | The Shopify event that starts the workflow |

### Topic (event) options

The node supports all standard Shopify webhook topics, grouped by resource:

**Orders & Transactions**
- `orders/create`, `orders/updated`, `orders/cancelled`, `orders/paid`, `orders/fulfilled`, `orders/partially_fulfilled`, `orders/delete`
- `order_transactions/create`
- `refunds/create`
- `tender_transactions/create`

**Products & Collections**
- `products/create`, `products/update`, `products/delete`
- `product_listings/add`, `product_listings/update`, `product_listings/remove`
- `collections/create`, `collections/update`, `collections/delete`
- `collection_listings/add`, `collection_listings/update`, `collection_listings/remove`

**Customers**
- `customers/create`, `customers/update`, `customers/delete`, `customers/disable`, `customers/enable`
- `customer_groups/create`, `customer_groups/update`, `customer_groups/delete`

**Carts & Checkouts**
- `carts/create`, `carts/update`
- `checkouts/create`, `checkouts/update`, `checkouts/delete`

**Fulfillments & Inventory**
- `fulfillments/create`, `fulfillments/update`
- `fulfillment_events/create`, `fulfillment_events/delete`
- `inventory_items/create`, `inventory_items/update`, `inventory_items/delete`
- `inventory_levels/connect`, `inventory_levels/disconnect`, `inventory_levels/update`

**Draft Orders**
- `draft_orders/create`, `draft_orders/update`, `draft_orders/delete`

**Shop & Themes**
- `shop/update`
- `themes/create`, `themes/update`, `themes/delete`, `themes/publish`

**Locations & Locales**
- `locations/create`, `locations/update`, `locations/delete`
- `locales/create`, `locales/update`

**App Lifecycle**
- `app/uninstalled`

## Runtime behavior

### Input

None. This is a trigger node that starts a workflow when Shopify delivers a webhook.

### Output

Emits one item per webhook delivery on the `main` output. The item contains:

- `json`: The full webhook payload as sent by Shopify (structure varies by topic)
- `binary`: (none)

The webhook payload matches the Shopify Admin API resource representation for the given topic (e.g., an `orders/create` payload contains an Order object).

### Webhook registration & lifecycle

- On workflow activation, the node registers a webhook with Shopify for the selected topic at the configured webhook URL
- On workflow deactivation, the webhook is unregistered
- The webhook path is `webhook` (relative to the n8n webhook base URL)
- HTTP method: POST
- Response mode: `onReceived` (responds immediately with 200 OK, processes asynchronously)

### Authentication

The node uses Shopify credentials configured via three methods:

1. **Access Token** (recommended) — Private/custom app admin API access token + shop subdomain + app secret
2. **OAuth2** — Public app via Shopify Partners (client ID + client secret + shop subdomain)
3. **API Key** (deprecated) — Legacy private app API key + password + shop subdomain

Credential validation is performed by the Shopify credential type; the trigger node itself does not validate credentials beyond requiring a valid credential reference.

### Error handling

- If webhook registration fails on activation, the workflow fails to activate
- If an incoming webhook payload cannot be parsed, the execution fails and the webhook receives a 200 OK (to avoid Shopify retry loops)
- `continueOnFail` is not applicable (trigger node)

### Expressions

No parameters accept expression strings. Topic and authentication are static configuration.

## Acceptance tests

### Test: order_created_webhook

**Given** a workflow with Shopify Trigger configured for `orders/create` topic, activated with valid credentials

**When** Shopify delivers a webhook for a new order

**Then** the workflow starts with one item on `main` output containing the Order JSON payload

```json
{
  "json": {
    "id": 1234567890,
    "email": "customer@example.com",
    "total_price": "99.99",
    "line_items": [{ "title": "Product", "quantity": 1, "price": "99.99" }]
  }
}
```

### Test: product_updated_webhook

**Given** a workflow with Shopify Trigger configured for `products/update` topic

**When** Shopify delivers a webhook for a product update

**Then** the workflow starts with one item containing the updated Product JSON payload

### Test: multiple_topics_isolated

**Given** two separate workflows: one with `orders/create` trigger, one with `products/create` trigger

**When** an order is created

**Then** only the orders workflow starts; the products workflow does not

### Test: webhook_registration_on_activate

**Given** a workflow with Shopify Trigger in inactive state

**When** the workflow is activated

**Then** a webhook subscription is created in Shopify for the selected topic pointing to the n8n webhook URL

### Test: webhook_removal_on_deactivate

**Given** an active workflow with Shopify Trigger

**When** the workflow is deactivated

**Then** the webhook subscription is removed from Shopify

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Topic list completeness | documented | Full list from n8n node definition (60 topics) |
| Webhook payload shapes | inferred | Vary by topic; match Shopify Admin API resource schemas |
| Webhook retry behavior | inferred | Shopify retries on non-2xx; node responds 200 immediately |
| Credential validation details | documented | Handled by Shopify credential type |
| Filtering/conditions | not supported | Node does not support topic filtering beyond single topic selection |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.shopifyTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
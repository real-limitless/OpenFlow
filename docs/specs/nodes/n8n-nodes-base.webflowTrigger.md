---
type: n8n-nodes-base.webflowTrigger
displayName: Webflow Trigger
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Webflow Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.webflowtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/webflow.md | Public docs only |
| https://n8n.io/integrations/webflow-trigger/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.webflowTrigger`
- **Inputs:** `main` x 0 (trigger — no upstream input)
- **Outputs:** `main` x 1
- **Credentials:** `webflowOAuth2Api` (supports both API access token and OAuth2 authentication)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| site | options (loaded) | "" | Y | Dynamically populated list of Webflow sites from the authenticated account. Value is the site short ID (e.g. `site_abc123`). |
| triggerEvents | multi-options | [] | Y | One or more event types to subscribe to (see Events section below). |

### Trigger events

The trigger supports subscribing to one or more of the following Webflow site events:

- `collection_item_created` — Fires when a CMS collection item is created
- `collection_item_deleted` — Fires when a CMS collection item is deleted
- `collection_item_changed` — Fires when a CMS collection item is updated
- `ecomm_inventory_changed` — Fires when Ecommerce inventory changes
- `ecomm_new_order` — Fires when a new Ecommerce order is placed
- `ecomm_order_changed` — Fires when an Ecommerce order status changes
- `form_submission` — Fires when a site form is submitted
- `site_publish` — Fires when the site is published

## Runtime behavior

### Activation

When the workflow is activated, the node:

1. Resolves the selected `site` parameter to the site's internal ID.
2. Registers a webhook via the Webflow Data API (`POST /sites/{site_id}/webhooks`) for each selected trigger event. Each webhook points back to the n8n instance's webhook URL.
3. On deactivation, unregisters all previously created webhooks via `DELETE /sites/{site_id}/webhooks/{webhook_id}`.

The `webhookMethods.default` lifecycle (checkExists, create, delete) manages idempotent webhook registration. On reactivation, stale webhooks are cleaned up before re-registration.

### Output

On each incoming webhook delivery, the node emits one output item per received payload. The output item contains:

```json
{
  "json": {
    "_payload": { ... },
    "_webhook_id": "string",
    "timestamp": 1234567890
  }
}
```

Where `_payload` is the full Webhook event body as delivered by Webflow. The exact shape of `_payload` varies by trigger event type:

- **collection_item_created / collection_item_deleted / collection_item_changed:** Contains `{ _id, name, slug, collectionId, updatedOn, createdOn, isArchived, isDraft, fieldData, ... }` — the full CMS item object.
- **form_submission:** Contains form submission data including form name, submission date, and field values.
- **site_publish:** Contains `{ site, publishedUrl, exportedAt }`.
- **ecomm_* events:** Contain order/inventory data per Webflow's Ecommerce API.

The response status code returned to Webflow is `200` on successful processing.

### Errors

If the webhook registration fails during activation (network error, invalid site, insufficient permissions), the node throws an error and the workflow activation fails. Runtime webhook processing errors follow `continueOnFail` semantics: on failure, an error item `{ json: { message, error } }` is emitted.

## Acceptance tests

### Test: trigger on form submission

**Given** the trigger is configured with:

```json
{
  "site": "site_abc123",
  "triggerEvents": ["form_submission"]
}
```

**When** Webflow delivers a form submission webhook payload:

```json
{
  "payload": {
    "name": "Contact Form",
    "data": { "name": "Jane", "email": "jane@example.com" },
    "submittedAt": "2025-01-15T12:00:00Z",
    "_id": "sub_abc123"
  }
}
```

**Expect** the node emits one output item containing the full payload under `_payload`, with `_webhook_id` and `timestamp` populated.

### Test: trigger on multiple events

**Given** the trigger is configured with:

```json
{
  "site": "site_abc123",
  "triggerEvents": ["collection_item_created", "collection_item_deleted", "collection_item_changed"]
}
```

**When** a CMS item is created, then later updated, then deleted — each event triggers a separate workflow execution.

**Expect** three separate webhook deliveries, each with the appropriate event context in `_payload`.

### Test: site selection loads dynamically

**Given** valid Webflow credentials with access to two sites (e.g. "Blog" and "Portfolio").

**When** the `site` parameter dropdown is populated.

**Expect** the options list contains both sites with their short IDs as values (e.g. `{ name: "Blog", value: "site_blog" }`, `{ name: "Portfolio", value: "site_portfolio" }`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Trigger event enum values | Documented on n8n.io integrations page | 8 publicly listed events; internal wire values inferred from Webflow API conventions |
| Exact output shape | Inferred from Webflow API behavior | Payload shape depends on event type; the node passes through the raw Webhook body |
| Webhook lifecycle (checkExists/create/delete) | Confirmed via corpus type defs | TypeScript descriptor shows webhookMethods with standard lifecycle |
| Site loading | Confirmed via corpus | GenericFunctions references getSites() |
| Credential auth methods | Public docs | Both API access token and OAuth2 documented |
| Trigger URL format | Inferred | Standard n8n webhook URL pattern |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/webflowTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

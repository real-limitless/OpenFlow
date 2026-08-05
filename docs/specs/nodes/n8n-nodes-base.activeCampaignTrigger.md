---
type: n8n-nodes-base.activeCampaignTrigger
displayName: ActiveCampaign Trigger
category: Marketing
versions: [1]
priority: medium
status: specced
---

# ActiveCampaign Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.activecampaigntrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/activecampaign/ | Public docs only |
| https://developers.activecampaign.com/reference/overview | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.activeCampaignTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node; no input items consumed)
- **Outputs:** `main` × 1
- **Credentials:** `activeCampaignApi` (required) — API URL + API Key authentication. The same credential type is shared with the ActiveCampaign app node.

## Parameters

The node subscribes to a single broad event from ActiveCampaign via the webhook API.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| event | fixedString | `*` | yes | always | The webhook event type to listen for. The only documented value is `*`, which subscribes to all ActiveCampaign webhook events. The list of possible event types is loaded dynamically from the ActiveCampaign API via the `getEvents` load-options method. |

### Event loading

The set of available events is obtained at credential-configuration time by calling the ActiveCampaign API's webhook event list endpoint. The user selects from this dynamic list. The `*` value catches all event types.

## Runtime behavior

### Activation

When the node is activated, the executor calls the ActiveCampaign Webhooks API to register a new webhook at the n8n instance's public webhook URL. The webhook is configured to fire for the selected event (or all events if `*`).

The registration includes:
- The n8n workflow's public callback URL (derived from the runtime environment's webhook base URL).
- The selected event type(s).
- Optionally, the ActiveCampaign API source URL of the webhook endpoint.

If a webhook with the same URL/event combination already exists (checked via `checkExists`), the node reuses it rather than creating a duplicate.

### Deactivation

When the node is deactivated, the executor calls the ActiveCampaign Webhooks API to delete the webhook that was created during activation. This cleanup ensures no orphaned webhooks remain on the ActiveCampaign side.

### Input processing

This is a trigger node — it does not consume input items. It fires in response to incoming HTTP POST requests from ActiveCampaign at the registered webhook URL.

### Output

On each incoming webhook event, the node emits one output item. The item body contains the full ActiveCampaign webhook payload as received. The shape of the payload depends on the specific event type:

```json
{
  "type": "subscribe",
  "date": "2024-01-01T00:00:00+00:00",
  "contact": {
    "id": "3",
    "email": "someone@example.com",
    "first_name": "Someone",
    "last_name": ""
  },
  "list": "1",
  "account": "",
  "sender": ""
}
```

Each webhook POST body is emitted as a single output item. The payload structure is defined by the ActiveCampaign webhook API and varies by event type (subscribe, unsubscribe, update, bounce, etc.).

### Errors

- If webhook registration fails (e.g., invalid credentials, network error, or an ActiveCampaign API error), activation must throw an error with a descriptive message.
- If webhook deregistration fails during deactivation, the error should be logged but should not prevent workflow deactivation from completing.
- Incoming webhook requests that fail signature or structural validation (if any) should be silently dropped (return `{noWebhookResponse: true}`).
- Unparseable or malformed webhook payloads should produce empty output (no items emitted) rather than throwing.

### Expressions

The `event` parameter supports expression strings for dynamic event selection.

## Acceptance tests

### Test: webhook activation and emission

**Given:** Valid ActiveCampaign API credentials (API URL + API Key).  
**When:** The node is activated with `event = "*"`.  
**Then:** The executor registers a new webhook with ActiveCampaign via POST to their Webhooks API and returns `{webhook: <registered-webhook-object>}`.  
**When:** ActiveCampaign sends an HTTP POST with a sample subscribe payload.  
**Then:** The node emits one item with the full webhook payload as `json`.

### Test: webhook reuse on re-activation

**Given:** An already-active webhook exists for this URL.  
**When:** The node is activated.  
**Then:** The `checkExists` method returns `true`, and no duplicate webhook is created.

### Test: webhook deactivation cleanup

**Given:** An active webhook was registered during activation.  
**When:** The node is deactivated.  
**Then:** The executor calls DELETE on the ActiveCampaign Webhooks API for the registered webhook ID, and the webhook is removed.

### Test: invalid credentials

**Given:** Invalid or expired ActiveCampaign API credentials.  
**When:** The node is activated.  
**Then:** Activation throws an error indicating authentication failure. The workflow remains inactive.

### Test: webhook deregistration failure is non-blocking

**Given:** An active webhook exists.  
**When:** The node is deactivated but the DELETE call to ActiveCampaign fails (e.g., network error).  
**Then:** The deactivation completes without throwing. The error is logged but does not prevent the workflow from deactivating.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event type values | Partially documented | Docs show `*` as the broad event; the full list of event types is loaded dynamically. The spec assumes the ActiveCampaign Webhooks API returns available event types. |
| Webhook payload shape | Documented via ActiveCampaign API reference | Payload varies by event type; the spec documents the general contract without hard-coding specific event-type payloads. |
| `checkExists` behavior | Inferred from type declaration | The `checkExists` method is declared in the type but not documented on the docs page. Assumed to compare URL + event before creating. |
| Webhook registration request shape | Partially documented | The exact fields sent during webhook creation are inferred from the type declaration (`create` method on `IHookFunctions`). |
| Credential type | Documented | Matched to `activeCampaignApi` from the credentials page and the app node spec. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/activeCampaignTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

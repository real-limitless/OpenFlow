---
type: n8n-nodes-base.hubspotTrigger
displayName: HubSpot Trigger
category: Triggers
versions: [1]
priority: medium
status: specced
---

# HubSpot Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.hubspottrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/hubspot.md | Public docs only |
| https://developers.hubspot.com/docs/apps/developer-platform/add-features/configure-webhooks | Third-party service API docs |
| https://developers.hubspot.com/docs/api-reference/webhooks/guide | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.hubspotTrigger`
- **Aliases:** none documented
- **Inputs:** no `main` input; this is an event source
- **Outputs:** one `main` output
- **Credentials:** a HubSpot Developer API key credential. The credential must identify the developer app and account used to create/manage the webhook subscription. The credential documentation also lists OAuth2 for the HubSpot app node, but identifies Developer API key as the authentication method for this trigger.

## Parameters

The node exposes a selection of one or more HubSpot event subscriptions. OpenFlow should model this as an event-selection configuration rather than reproducing the original UI nesting.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| Event subscriptions | list of event descriptors | none | yes | none | Select the HubSpot event categories to deliver. Supported documented categories are Company, Contact, Conversation, Deal, and Ticket. |
| Object event | enum | none | conditional | shown for CRM object events | For Company, Contact, Deal, and Ticket, support created, deleted, and property-changed events. |
| Contact event | enum | none | conditional | shown for Contact | Contact additionally supports privacy-deleted events. |
| Conversation event | enum | none | conditional | shown for Conversation | Conversation supports created, deleted, new-message, privacy-deletion, and property-changed events. |
| Property name | string | none | conditional | shown for property-changed events | Restrict a property-change subscription to the named property when HubSpot supports that filter. An absent value means no property-specific restriction. |

The event vocabulary above is documented by the n8n node page. The exact OpenFlow representation of the list and its UI grouping is an implementation choice and must not change the resulting HubSpot subscription semantics.

## Runtime behavior

### Input

The node has no upstream item input. On activation, it authenticates with HubSpot and ensures the configured event subscriptions are registered for the workflow's public callback endpoint. HubSpot delivers matching events to that endpoint using HTTP `POST`.

Only one active HubSpot Trigger registration may be relied on for a given HubSpot account/app integration: the n8n documentation warns that activating a second trigger causes the previously registered webhook to stop working. OpenFlow should either enforce this constraint or report a clear activation error rather than silently claiming both triggers are active.

### Output

For each accepted HubSpot event, emit one item on output index `0`:

```json
[{ "json": <the received HubSpot webhook event object> }]
```

The event object must preserve the service payload's event identity and data, including the event category/action and any record, portal, timestamp, or changed-property information supplied by HubSpot. The node must not replace the service payload with a fabricated minimal envelope or discard fields that downstream nodes may need. If HubSpot sends a batch of event objects in one callback, emit one item per event in arrival order unless the service contract requires a different grouping.

The trigger does not emit an item merely because it was activated. It emits items only for matching webhook deliveries.

### Errors

- Missing or invalid Developer API key, unavailable app configuration, insufficient permission, invalid subscription configuration, or failure to register the webhook must fail activation with an actionable error.
- A malformed incoming callback must not be converted into a successful workflow item. Reject it with an appropriate non-2xx response and record the validation error.
- A valid callback must be acknowledged with a 2xx response after it has been accepted for workflow execution. Delivery acknowledgement and workflow processing are separate concerns; an internal processing failure must be observable and must not corrupt the received payload.
- Propagate HubSpot HTTP failures with their status and service error message where available. Treat authentication/authorization failures, invalid requests, missing resources, rate limits, and transient server failures as errors; do not invent node-specific error codes.
- Retry/backoff policy for transient HubSpot failures is an executor/deployment concern. It must respect HubSpot's delivery and rate-limit contract and must not create duplicate workflow items without an explicit idempotency strategy.
- `continueOnFail` does not apply to activation or webhook-registration failures. For a delivered event, normal OpenFlow execution error policy determines whether a downstream workflow failure is recorded or surfaced.

### Expressions

Event-selection values and property filters may accept OpenFlow expressions if the host supports expressions in trigger configuration. Expressions are evaluated when the trigger is activated or reconfigured, not against an upstream item, because this node has no input.

## Acceptance tests

### Test: company-created event

**Given** no input items, a valid Developer API key, and a subscription for Company created events.

HubSpot delivers a valid company-created webhook payload containing an object identifier, account identifier, event action, and occurrence time.

**Expect** output[0] to contain exactly one item whose `json` preserves those service-provided event fields and values. No activation-only item is emitted.

### Test: contact property filter

**Given** a Contact property-changed subscription restricted to `email`.

HubSpot delivers one email change and one change to an unrelated property.

**Expect** one output item for the email event and no item for the unrelated property event.

### Test: supported event families

**Given** valid subscriptions for Conversation new message, Deal deleted, and Ticket property changed.

HubSpot delivers one matching event for each subscription.

**Expect** output[0] contains three items in delivery order, each retaining its original event category/action and service payload fields.

### Test: second active trigger

**Given** one active HubSpot Trigger registration and an attempt to activate a second registration for the same account/app integration.

**Expect** the implementation reports a clear conflict or applies the documented single-registration behavior explicitly; it must not silently report two independently working webhook registrations.

### Test: invalid activation credentials

**Given** a missing, malformed, or unauthorized Developer API key.

**Expect** activation fails with an authentication/authorization error and no event output is produced.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|-----------------------|-------|
| Wire type and event families | documented | Taken from the public n8n HubSpot Trigger page. |
| Developer API key credential | documented | The public n8n credential page explicitly identifies this method for HubSpot Trigger. |
| Webhook POST delivery and 2xx acknowledgement | documented | Taken from HubSpot's webhook configuration guide. |
| Exact subscription registration endpoint and request body used by this node | gap | The permitted n8n node page describes the feature but does not specify the node's internal registration protocol. Implement against the externally documented HubSpot webhook contract without copying an undocumented schema. |
| Exact output grouping for batched callbacks | inferred | One item per event is the OpenFlow mapping chosen to preserve event-level workflow semantics; verify against public runtime behavior if compatibility requires it. |
| Retry, deduplication, and lifecycle cleanup | gap | Deployment and executor concerns are not specified by the public node page. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Intended executor filename:** `src/lib/engine/executors/hubspot-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

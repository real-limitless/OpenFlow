---
type: n8n-nodes-base.customerIoTrigger
displayName: Customer.io Trigger
category: Trigger
versions: [1]
priority: medium
status: specced
---

# Customer.io Trigger

Webhook-based trigger that listens for Customer.io customer and message delivery events and emits one workflow item per received event. The node registers a webhook subscription with Customer.io on activation using the App API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.customeriotrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/customerio.md | Public docs only |
| https://customer.io/docs/api/app/ | Public docs only (Customer.io App API) |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.customerio.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.customerIoTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:** required — `customerIoApi`

### Credential: `customerIoApi`

| field | type | default | required | notes |
|-------|------|---------|----------|-------|
| trackingApiKey | string (password) | — | yes | Customer.io Track API key |
| region | fixed-select | `global` | yes | `global` or `eu`; changes API subdomain to `track-eu` / `api-eu` for EU region |
| trackingSiteId | string | — | yes | Tracking Site ID, required for Track API calls |
| appApiKey | string (password) | — | yes | Customer.io App API key, used for webhook management |

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multi-select from event list | `[]` | yes | — | One or more Customer.io event categories to subscribe to (see Event types below). At least one must be selected. |

### Event types

Events are organized by channel and action. The node fires when Customer.io delivers a webhook matching the selected events.

**Customer:**
- `customer.subscribed` — A person subscribed to the workspace
- `customer.unsubscribed` — A person unsubscribed from the workspace

**Email:**
- `email.bounced` — A sent email hard-bounced
- `email.clicked` — A recipient clicked a link in a sent email
- `email.converted` — A recipient converted on a campaign
- `email.delivered` — A sent email was accepted by the receiving server
- `email.drafted` — A message was drafted (scheduled but not yet sending)
- `email.failed` — A send attempt failed permanently
- `email.opened` — A recipient opened a sent email
- `email.sent` — An email was sent
- `email.spammed` — A recipient marked the email as spam

**Push:**
- `push.attempted` — A push notification send was attempted
- `push.bounced` — A push notification bounce was registered
- `push.clicked` — A recipient clicked a push notification
- `push.delivered` — A push notification was delivered
- `push.drafted` — A push notification was drafted
- `push.failed` — A push notification send failed
- `push.opened` — A recipient opened a push notification
- `push.sent` — A push notification was sent

**Slack:**
- `slack.attempted` — A Slack message send was attempted
- `slack.clicked` — A recipient clicked a link in a Slack message
- `slack.drafted` — A Slack message was drafted
- `slack.failed` — A Slack message send failed
- `slack.sent` — A Slack message was sent

**SMS:**
- `sms.attempted` — An SMS send was attempted
- `sms.bounced` — An SMS bounce was registered
- `sms.clicked` — A recipient clicked a link in an SMS
- `sms.delivered` — An SMS was delivered
- `sms.drafted` — An SMS was drafted
- `sms.failed` — An SMS send failed
- `sms.sent` — An SMS was sent

## Runtime behavior

### Input
None — this is a webhook trigger node. It starts a workflow when Customer.io delivers an event webhook payload.

### Output
Emits one item per webhook delivery. The item contains the full raw Customer.io webhook payload as `json`. The payload structure follows Customer.io's webhook format for the subscribed event type. Each item includes event metadata such as event type identifier, timestamp, customer identifiers (customer ID, email), and channel-specific delivery data (message ID, campaign ID, link URL for clicks, delivery timestamps, error details for failures/bounces).

### Credential usage
- The `appApiKey` is used to manage webhook subscriptions with the Customer.io App API (`https://api.customer.io/v1/api/` or `https://api-eu.customer.io/v1/api/`).
- The `trackingApiKey` + `trackingSiteId` are present in the credential for compatibility with the regular Customer.io app node but are not required for trigger functionality.

### Webhook lifecycle
1. **On workflow activate:** Node registers a webhook subscription with the Customer.io App API for the selected event types, pointing the callback URL to the n8n webhook endpoint.
2. **On workflow deactivate:** Node deletes the webhook subscription from Customer.io.
3. **On webhook receipt:** Node returns the raw payload immediately.

### Errors
- **Missing credentials:** Workflow activation fails if no valid `customerIoApi` credential is configured.
- **Webhook registration failure:** If the App API key is invalid or the callback URL is unreachable, activation fails.
- **continueOnFail:** Not applicable (trigger nodes have no upstream items).

### Expressions
- `events` accepts expression strings for dynamic configuration.

### Constraints from Customer.io
- Webhook callback URL must be a public HTTPS URL.
- Customer.io App API is used for webhook CRUD operations; requires a valid App API key.
- Event delivery is asynchronous; events may be received out of order or with delays.

## Acceptance tests

### Test: basic customer subscribed event
**Given** a workflow with Customer.io Trigger configured with `events: ["customer.subscribed"]` and valid `customerIoApi` credentials

**When** Customer.io delivers a webhook for a new subscriber

**Expect** output[0] contains one item with `json` containing the customer.subscribed event payload (includes `event_id`, `event_type` set to `customer.subscribed`, customer identifiers, timestamp)

### Test: email bounced event
**Given** a workflow with Customer.io Trigger configured with `events: ["email.bounced"]` and valid credentials

**When** Customer.io delivers a webhook for an email bounce

**Expect** output[0] contains one item with `json` containing the email.bounced event payload (includes `event_type` set to `email.bounced`, recipient email, bounce reason/detail, message_id)

### Test: push clicked event
**Given** a workflow with Customer.io Trigger configured with `events: ["push.clicked"]` and valid credentials

**When** Customer.io delivers a webhook for a push notification click

**Expect** output[0] contains one item with `json` containing the push.clicked event payload (includes `event_type`, push device identifiers, click metadata)

### Test: multiple event types
**Given** a workflow with Customer.io Trigger configured with `events: ["email.sent", "email.opened", "email.clicked"]` and valid credentials

**When** Customer.io delivers webhooks for each subscribed event type

**Expect** each output firing produces one item with `json.event_type` matching one of the configured types; items are emitted per webhook receipt without deduplication

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event type names | Public docs | Confirmed from docs.n8n.io trigger node page |
| Credential shape | Public docs | Confirmed from credentials page |
| Webhook payload structure | Inferred | Not documented in detail by n8n; payload follows Customer.io webhook format documented at https://customer.io/docs/api/app/ |
| Webhook registration protocol | Inferred | Standard n8n webhook trigger pattern (register on activate, delete on deactivate) |
| Region handling | Public docs | Credentials page documents `global` / `eu` region affecting Track and App API subdomains |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.customerIoTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

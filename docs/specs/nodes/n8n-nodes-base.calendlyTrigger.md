---
type: n8n-nodes-base.calendlyTrigger
displayName: Calendly Trigger
category: Trigger
versions: [1]
priority: medium
status: specced
---

# Calendly Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.calendlytrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/calendly.md | Public docs only |
| https://developer.calendly.com/getting-started | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.calendlyTrigger`
- **Aliases:** (none)
- **Inputs:** none (trigger node)
- **Outputs:** `main` × 1
- **Credentials:**
  - `calendlyApi` — Personal Access Token (deprecated after May 31, 2025)
  - `calendlyOAuth2Api` — OAuth2 (recommended)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options (`oAuth2` \| `apiKey`) | `apiKey` | yes | — | Chooses credential type. API Key deprecated. |
| scope | options (`organization` \| `user`) | `user` | yes (OAuth2 only) | show when `authentication=oAuth2` | Organization: webhook fires for all events in the org. User: webhook fires only for current user's events. |
| events | multiOptions (`invitee.created` \| `invitee.canceled`) | `[]` | yes | — | At least one event must be selected. |

## Runtime behavior

### Input
None — this is a trigger node. It starts a workflow when Calendly delivers a webhook payload.

### Output
Emits one item per webhook delivery. The item contains the raw Calendly webhook payload as `json`. The payload structure follows Calendly's webhook format for the subscribed event types:
- `invitee.created`: Fired when a new booking is created
- `invitee.canceled`: Fired when a booking is canceled

Each item includes the full webhook body with event metadata, invitee details, event type, scheduling URL, timestamps, and associated resource URIs.

### Errors
- **Missing credentials:** Workflow fails to activate if no valid Calendly credential is configured.
- **Webhook registration failure:** If the node cannot create the webhook subscription on activate (e.g., invalid credentials, unreachable callback URL), activation fails.
- **Invalid webhook signature:** Calendly does not sign webhooks; authenticity is verified by the callback URL being secret. No signature validation is performed.
- **Duplicate events:** Calendly may redeliver webhooks. The node does not deduplicate; downstream logic should handle idempotency if needed.
- **continueOnFail:** Not applicable for trigger nodes (no upstream items to continue from).

### Expressions
- `authentication`, `scope`, and `events` accept expression strings for dynamic configuration.

### Webhook lifecycle
1. **On workflow activate:** Node registers a webhook subscription with Calendly using the configured events and scope (for OAuth2). The callback URL is the n8n webhook endpoint (`/webhook/...`).
2. **On workflow deactivate:** Node deletes the webhook subscription from Calendly.
3. **On webhook receipt:** Node returns the raw payload immediately (`responseMode: onReceived`).

### Constraints from Calendly
- Webhook callback URL must be a public HTTPS URL (no localhost). Use ngrok/Cloudflare Tunnel for local testing.
- Webhooks only fire for bookings managed by Calendly. Direct calendar edits (e.g., Google Calendar) do not trigger.
- Calendly webhooks require a paid plan.
- Required OAuth2 scopes: `users:read`, `webhooks:read`, `webhooks:write`, `scheduled_events:read`.

## Acceptance tests

### Test: basic event created trigger
**Given** a workflow with Calendly Trigger configured with `events: ["invitee.created"]` and valid OAuth2 credentials with `scope: "user"`

**When** Calendly delivers a webhook for a new booking (invitee.created)

**Expect** output[0] contains one item with `json` matching the Calendly invitee.created webhook payload structure (includes `event`, `payload` with `invitee`, `event_type`, `scheduled_event`, timestamps)

### Test: event canceled trigger
**Given** a workflow with Calendly Trigger configured with `events: ["invitee.canceled"]`

**When** Calendly delivers a webhook for a canceled booking (invitee.canceled)

**Expect** output[0] contains one item with `json` matching the Calendly invitee.canceled webhook payload structure

### Test: multiple event types
**Given** a workflow with Calendly Trigger configured with `events: ["invitee.created", "invitee.canceled"]`

**When** Calendly delivers webhooks for both created and canceled bookings

**Expect** each delivery produces one output item with the corresponding event payload

### Test: organization scope
**Given** a workflow with Calendly Trigger configured with `authentication: "oAuth2"`, `scope: "organization"`, `events: ["invitee.created"]`

**When** Any user in the organization creates a booking

**Expect** the workflow triggers for all organization bookings (not just the authenticated user)

### Test: API key deprecation notice
**Given** a workflow with Calendly Trigger configured with `authentication: "apiKey"`

**Expect** the node displays a deprecation notice warning that API Key authentication will be discontinued after May 31, 2025

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook payload structure | documented | Public Calendly API docs describe webhook payload; exact fields inferred from typical invitee.created/canceled events |
| OAuth2 scope behavior | documented | n8n docs and corpus confirm organization vs user scope semantics |
| API Key deprecation date | documented | Explicit in n8n node notice (May 31, 2025) |
| Webhook deduplication | inferred | Not documented; assumed no deduplication based on typical trigger node behavior |
| Local testing with tunnels | documented | n8n docs explicitly mention ngrok/Cloudflare Tunnel requirement |
| Rate limits / retry behavior | not documented | Calendly API rate limits apply; webhook redelivery behavior not specified in n8n docs |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.calendlyTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
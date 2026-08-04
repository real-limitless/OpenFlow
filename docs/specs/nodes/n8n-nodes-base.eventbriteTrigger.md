---
type: n8n-nodes-base.eventbriteTrigger
displayName: Eventbrite Trigger
category: Sales
versions: [1]
priority: low
status: specced
---

# Eventbrite Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.eventbritetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/eventbrite/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.eventbriteTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node, no main input)
- **Outputs:** `main` × 1
- **Credentials:** `eventbriteApi` (private key) or `eventbriteOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | literal: `privateKey` \| `oAuth2` | — | no | — | Which credential type to use |
| organization | string (resource locator / expression) | — | no | — | The Eventbrite Organization whose webhooks to manage |
| event | string (resource locator / expression) | — | no | — | Restrict the trigger to a single Eventbrite event ID |
| actions | array of literal strings | `[]` | no | — | One or more Eventbrite webhook action types to subscribe to |
| resolveData | boolean | `true` | no | — | If true, automatically fetch the full object referenced by each webhook payload instead of passing only the API URL |

**Actions enum** (values the user may select):
- `attendee.checked_in`
- `attendee.checked_out`
- `attendee.updated`
- `event.created`
- `event.published`
- `event.unpublished`
- `event.updated`
- `order.placed`
- `order.refunded`
- `order.updated`
- `organizer.updated`
- `ticket_class.created`
- `ticket_class.deleted`
- `ticket_class.updated`
- `venue.updated`

## Runtime behavior

### Activation

On workflow activation, the node registers a webhook with Eventbrite via the Eventbrite Webhooks API for the chosen organization (or event), scoped to the selected action types. The webhook target URL is the n8n instance's webhook callback endpoint. On deactivation, the webhook is removed.

If neither `organization` nor `event` is specified, the behavior depends on the credential scope — typically the first organization available on the token is used.

### Output

Each received Eventbrite webhook POST produces one output item. The item structure depends on `resolveData`:

- **resolveData = true (default):** The node follows the webhook's API URL to fetch the full resource (e.g., the complete order object for `order.placed`) and emits the resolved object as the item payload.
- **resolveData = false:** The item contains the raw webhook payload, which includes a `api_url` field pointing to the resource, plus metadata like `webhook_id`, `config_type`, `config_id`, and `action`.

The exact shape of the output object is dictated by the Eventbrite Webhooks API response / resolved resource.

### Errors

- HTTP errors from Eventbrite during webhook registration or resolution are surfaced as node errors.
- If `continueOnFail` is enabled, the node outputs an error item instead of throwing.

### Expressions

All string parameters (`organization`, `event`) accept expression strings for dynamic resolution.

## Acceptance tests

### Test: triggers on order placed with auto-resolve

**Given** the node is configured with:
- `organization`: resolved to org ID `123456789`
- `actions`: `["order.placed"]`
- `resolveData`: `true`

**When** a paid order is placed on Eventbrite,
**Then** Eventbrite sends a `order.placed` webhook to n8n,
**And** the node fetches the full order from the Eventbrite API URL,
**And** output[0] contains the resolved order object (e.g., `{ id, name, resource_uri, ...order_fields }`),
**And** there is exactly one item in the output.

### Test: multiple action types without event restriction

**Given** the node is configured with:
- `organization`: org ID `123456789`
- `actions`: `["event.created", "event.published", "event.updated"]`
- `resolveData`: `false`

**When** an event is created, published, then updated on Eventbrite,
**Then** the node emits three separate items,
**And** each item includes `{ webhook_id, config_type, config_id, action, api_url }` with no resolved data.

### Test: event-scoped trigger

**Given** the node is configured with:
- `organization`: org ID `123456789`
- `event`: event ID `9876543`
- `actions`: `["attendee.checked_in"]`
- `resolveData`: `true`

**When** an attendee checks in to the specified event,
**Then** the node emits one output item containing the resolved attendee object.

### Test: empty actions array

**Given** the node is configured with:
- `organization`: org ID `123456789`
- `actions`: `[]`
- `resolveData`: `true`

**When** the workflow activates,
**Then** the node attempts to register a webhook targeting all available action types (server-side default),
**And** when any matching Eventbrite event occurs, the output contains the resolved object.

### Test: credential selection

**Given** the node is configured with `authentication: "privateKey"` and a valid private key credential,
**When** the workflow activates,
**Then** the node authenticates with Eventbrite using the private token.
**Given** instead `authentication: "oAuth2"` with an OAuth2 credential,
**When** the workflow activates,
**Then** the node authenticates using the OAuth2 flow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Public n8n docs page | documented | Minimal — only credentials link, no parameter details |
| Parameter names and types | inferred from package JSON schema | `authentication`, `organization`, `event`, `actions`, `resolveData` confirmed |
| Action enums | inferred from package JSON schema | 15 action types listed above |
| Webhook registration / lifecycle | inferred | Based on standard n8n trigger pattern for webhook-based nodes |
| resolveData behavior | inferred from parameter description | Standard webhook-trigger data resolution pattern |
| Output shape | documented (Eventbrite API) | Dictated by Eventbrite webhook / resolved resource, not by n8n |
| Eventbrite Webhooks API | documented | https://www.eventbrite.com/platform/api |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/eventbriteTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

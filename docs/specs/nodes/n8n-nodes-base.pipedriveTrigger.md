---
type: n8n-nodes-base.pipedriveTrigger
displayName: Pipedrive Trigger
category: Integration
versions: [1]
priority: medium
status: specced
---

# Pipedrive Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.pipedrivetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pipedrive/ | Public docs only |
| https://pipedrive.readme.io/docs/marketplace-webhooks | Public docs only |

The trigger documentation page describes the basic webhook behavior and links
to credential requirements. The credential page documents API-token and OAuth2
authentication with the `webhooks:full` scope needed by this trigger. The
Pipedrive marketplace webhook docs describe the event payload shape. No
third-party node source was consulted.

## Wire format

- **Type string:** `n8n-nodes-base.pipedriveTrigger`
- **Aliases:** none documented
- **Inputs:** `main` × 0 (trigger node — no incoming connection)
- **Outputs:** `main` × 1
- **Credentials:** Pipedrive credential, using either an API token or OAuth2
  with the `webhooks:full` scope

This is a webhook trigger node, not an action node. On activation it registers
a webhook at the Pipedrive API under the authenticated user/company. On
deactivation it removes that webhook. The webhook registration/deregistration
lifecycle is managed by the OpenFlow host, matching the pattern of other
OpenFlow webhook triggers. The executor receives the parsed Pipedrive webhook
payload as an input item and may optionally enrich it by calling the Pipedrive
API back.

## Parameters

The implementation should expose the following concepts without requiring the
original UI nesting or names. Values may be literals or OpenFlow expressions
where the host supports expressions.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| event object | enum-like string | `deal` | yes | always | The Pipedrive object type to watch: one of `activity`, `deal`, `dealActivity`, `dealProduct`, `lead`, `note`, `organization`, `person`, `product`. |
| action | string | `added` | yes | always | The event action to watch. Values supported by the Pipedrive webhooks API: `added`, `updated`, `merged`, `deleted`, or any subset thereof. The original node groups these as `*` (all) or specific combinations. |
| resolve data | boolean | `false` | no | always | When true, the executor reads the object `id` and `type` from the incoming webhook payload, makes a GET request to the Pipedrive API (`/v1/{type}/{id}`), and emits the full resource object as the output item's JSON instead of the raw webhook payload. |
| additional fields | object | empty | no | always | Reserved for extra HTTP request configuration (query parameters, headers) if the Pipedrive credential is OAuth2 and the webhook registration supports additional options. |

### Notes on parameters

- The `event object` is mapped to the Pipedrive webhook API's `event_object`
  parameter at registration time.
- The `action` values map to the Pipedrive webhook subscription's event actions.
  The original node uses a multi-select UI with options: `added`, `updated`,
  `merged`, `deleted`, `started`, `ended`. The first four correspond to the CRM
  objects above; the last two are specific to activities. A concrete
  implementation may offer a structured picker or accept a comma-separated
  string. At minimum, `added` and `updated` should be supported for all 9
  object types.
- When `resolveData` is enabled, the executor must authenticate with the same
  credential used to register the webhook. The GET request target follows the
  pattern `https://api.pipedrive.com/v1/{resource}/{id}` where `id` comes from
  the `id` field in the webhook payload and `resource` is derived from the
  `event_object` (e.g. `deal` → `deals`, `person` → `persons`,
  `organization` → `organizations`, `activity` → `activities`,
  `lead` → `leads`, `note` → `notes`, `product` → `products`).
- The original node exposes these parameters in a single top-level parameter
  group; the grouping inside the spec does not need to match the original UI.

## Runtime behavior

### Input

The node has no `main` input. Execution begins when the OpenFlow host receives
a validated Pipedrive webhook POST request and routes it to this executor as
one or more trigger items. Each trigger item contains the parsed JSON body of
the webhook event.

The raw webhook payload from Pipedrive contains fields such as:
- `id` — the Pipedrive webhook subscription event ID
- `event` — the event action (e.g. `added.deal`)
- `current` — the current state of the object (object-level fields, may be null
  for `deleted` events)
- `previous` — the previous state of the object before the change
  (for `updated` events)
- `meta` — metadata including object `id`, `action`, `object` type, timestamps

If the OpenFlow host performs webhook verification via Pipedrive's
subscription secret, the executor receives only verified events.

### Output

Emit one `main` output item per incoming webhook event. The item's JSON
depends on the `resolveData` parameter:

- **`resolveData = false` (default):** The output JSON is the raw Pipedrive
  webhook envelope. The item should contain at least the `id`, `event`,
  `current`, `previous`, and `meta` fields as received.

- **`resolveData = true`:** The executor makes an additional GET call to the
  Pipedrive API for the object identified by `meta.id` / `meta.object` and
  sets the output JSON to the full Pipedrive API resource representation. The
  raw envelope fields are replaced; only the resolved object data is emitted.

The node always outputs exactly one item per webhook event. It does not merge
multiple events into a batch unless the host accumulates them.

### Errors

- **Credential errors:** If the credential is missing, invalid, or lacks the
  `webhooks:full` scope, fail activation (webhook registration cannot proceed)
  with a clear message.
- **Transport errors on resolveData:** If the GET request fails (network error,
  non-2xx, rate limit), the executor should emit the raw envelope instead and
  surface the resolution failure as an item-level error or a logged warning,
  depending on `continueOnFail`. The node must still produce one output item
  per webhook event.
- **Invalid webhook payload:** If the payload is missing `meta.id` or
  `meta.object` and `resolveData` is true, skip the API call and fall through
  to the raw envelope.
- **Webhook deregistration failure at deactivation:** Log a warning but do not
  block host shutdown.

### Expressions

The `event object`, `action`, and `additional fields` parameters should accept
OpenFlow expressions when the host supports them. The `resolveData` boolean
may be expression-capable as well, allowing workflows to decide at runtime
whether to resolve.

## Acceptance tests

The fixtures below use a mocked Pipedrive webhook endpoint and, for resolveData
tests, a mocked Pipedrive REST API. Assertions are about observable outcomes.

### Test: passthrough mode emits raw webhook envelope

**Given** a simulated Pipedrive webhook POST with body:

```json
{
  "id": "12345",
  "event": "added.deal",
  "current": { "id": 99, "title": "Test deal", "value": 500 },
  "previous": null,
  "meta": {
    "id": 99,
    "action": "added",
    "object": "deal",
    "timestamp": "2026-08-02T12:00:00Z",
    "company_id": 7,
    "user_id": 42
  }
}
```

**Parameters:**
```json
{
  "eventObject": "deal",
  "action": "added",
  "resolveData": false
}
```

**Expect** output[0] to contain one item whose JSON preserves `event`,
`current.id`, `meta.id`, `meta.object`, and `meta.action` as received. The raw
webhook fields must not be silently stripped.

### Test: resolveData fetches full API resource

**Given** the same webhook payload and a mocked Pipedrive API that returns:

```json
{ "success": true, "data": { "id": 99, "title": "Test deal", "value": 500, "currency": "USD", "owner_id": 42, "stage_id": 1, "status": "open" } }
```

**Parameters:**
```json
{
  "eventObject": "deal",
  "action": "added",
  "resolveData": true
}
```

**Expect** the executor to issue a GET to `/v1/deals/99` using the configured
credential. The output item's JSON must equal the `data` field of that API
response, not the raw webhook envelope. The `id` from `meta.id` must be used
in the URL.

### Test: resolveData falls through to envelope on API error

**Given** the same webhook payload and a mocked Pipedrive API that returns
HTTP 429 (rate limit) or 404 for `/v1/deals/99`.

**Parameters:**
```json
{
  "eventObject": "deal",
  "action": "added",
  "resolveData": true
}
```

**Expect** the output item's JSON to be the raw webhook envelope (same as
passthrough mode). The resolution failure must not cause the item to be lost.

### Test: organization resolveData uses correct resource path

**Given** a webhook payload with `meta.object = "organization"` and
`meta.id = 55`.

**Parameters:**
```json
{
  "eventObject": "organization",
  "action": "updated",
  "resolveData": true
}
```

**Expect** the executor to call `/v1/organizations/55`. The output item must
contain the API resource data for organization 55.

### Test: updated event with previous state

**Given** a webhook payload with `event: "updated.deal"`, `current` containing
the new deal state, and `previous` containing the old deal state.

**Parameters:**
```json
{
  "eventObject": "deal",
  "action": "updated",
  "resolveData": false
}
```

**Expect** output item contains both `current` and `previous` fields from the
webhook payload. The executor does not drop the `previous` information.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, event objects, actions | documented | Listed on the public Pipedrive Trigger node page. |
| API token and OAuth2 authentication with webhooks:full scope | documented | Listed on the credential page. |
| resolveData boolean parameter | documented | Pipedrive Trigger node page mentions "optional resolveData to fetch full API resource". |
| Webhook lifecycle (register on activate, deregister on deactivate) | inferred | Standard for OpenFlow webhook triggers; prior cycle hints confirm the host should manage it. |
| Raw webhook payload shape | documented | Published by Pipedrive's marketplace webhook docs. |
| Exact resolved data URL pattern (/v1/{resource}/{id}) | inferred | Standard Pipedrive REST API pattern; the public trigger docs confirm the behavior without spelling the URL. |
| Exact multi-select options and display conditions | intentionally unspecified | Not needed to define the external outcome; the original node's nested UI structure is not replicated here. |
| Pipedrive webhook secret verification | inferred | Pipedrive supports subscription secrets; whether the host implements verification is host-dependent. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.pipedriveTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; webhook registration
  is host-managed.

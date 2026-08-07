---
type: n8n-nodes-base.theHiveTrigger
displayName: TheHive Trigger
category: Development
versions: [1]
priority: medium
status: specced
---

# TheHive Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.thehivetrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/thehive/ | Public docs only |
| https://docs.thehive-project.org/thehive/ | Public docs only |
| https://docs.thehive-project.org/thehive/legacy/thehive3/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.theHiveTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (no input; this is a trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `theHiveApi` (API-key credential: URL + API key + API version + ignore SSL issues toggle)

## Parameters

The node exposes a single parameter that determines which TheHive entity events to subscribe to:

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multi-select from predefined enum | empty (all) | no | none | One or more event specifiers of the form `{Resource}.{Action}` — each subscribing to a class of TheHive notification. |

Available event specifiers:

- `alert.create`, `alert.delete`, `alert.update`
- `case.create`, `case.delete`, `case.update`
- `log.create`, `log.delete`, `log.update`
- `observable.create`, `observable.delete`, `observable.update`
- `task.create`, `task.delete`, `task.update`

When empty or omitted, the trigger subscribes to all of the above events.

## Runtime behavior

### Activation

On workflow activation, the node exposes a webhook URL (HTTP endpoint). The user must manually register this URL in their TheHive instance:

1. Add the webhook URL to TheHive's `application.conf` as a `notification.webhook.endpoint`.
2. Enable notifications via the TheHive API (`PUT /api/config/organisation/notification`) with a trigger rule of `AnyEvent` and notifier type `webhook` pointing to the configured endpoint name.

The node itself does not create or destroy TheHive-side webhook configuration — this is an out-of-band setup step.

### Deactivation

On workflow deactivation or deletion, the webhook endpoint is torn down on the n8n side. TheHive-side notification configuration must be manually removed or left in place (stale endpoints produce no errors).

### Output

Each incoming TheHive webhook POST produces one output item. The item body contains the full TheHive webhook event envelope as JSON (the `content` field of the POST body), which typically includes:

- `eventType` — the event identifier string
- `objectType` — the entity resource type
- `object` — the full entity object (alert, case, log, observable, or task)
- `organisation` — the organization name

The exact shape and nesting depend on the TheHive API version (v3 or v4) configured in the credential.

### Errors

- If the incoming webhook payload is not valid JSON, the node should log a warning and skip that request (continue without producing an output item).
- If the configured events list does not match the incoming event, the payload is silently dropped (no output item produced).
- The node responds with HTTP 200 to TheHive on successful receipt regardless of whether the event matches a selected event type.

### Expressions

No parameters accept expressions — events are selected at design time.

## Acceptance tests

### Test: all events receive

**Given** a TheHive webhook POST is received by the trigger node with events left empty (subscribe to all).

**Parameters:**

```json
{ "events": [] }
```

**When** a TheHive POST arrives with body containing `{ "eventType": "case.create", "objectType": "case", "object": { "title": "Test", ... } }`,

**Expect** the generated output item(s) to contain the full event payload as the item JSON, including the `eventType`, `objectType`, and `object` fields.

### Test: filtered event type

**Given** the node is configured with `events = ["alert.create"]`.

**When** TheHive sends a `case.update` notification,

**Then** no output item is produced (the event is silently dropped).

### Test: selected event does produce output

**Given** `events = ["alert.create"]`.

**When** TheHive sends an `alert.create` notification,

**Then** exactly one output item is produced with the full webhook payload.

### Test: non-JSON payload

**Given** the node receives an HTTP POST with a non-JSON body.

**Then** the node responds with HTTP 200 but produces no output items (graceful handling).

### Test: activation exposes webhook URL

**Given** a workflow containing this trigger node is activated,

**Then** the node provides a working HTTPS webhook URL that can be registered in TheHive's `application.conf`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event specifiers | Documented | Full list sourced from public n8n docs page |
| Credential shape | Documented | `theHiveApi` with URL + API key + API version + ignore SSL |
| Webhook registration | Documented | Manual `application.conf` + cURL steps from public docs |
| Output payload shape | Inferred | The public docs explain the webhook setup but do not provide a sample payload. The output is assumed to be the raw TheHive webhook event envelope (POST body content). |
| HTTP response to TheHive | Inferred | Standard webhook trigger behavior: 200 OK on receipt |
| Multi-credential support (v3 vs v4) | Documented | The credential has an apiVersion selector for TheHive3 (v0) and TheHive4 (v1) |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/theHiveTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

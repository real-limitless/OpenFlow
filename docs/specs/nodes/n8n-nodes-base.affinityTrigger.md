---
type: n8n-nodes-base.affinityTrigger
displayName: Affinity Trigger
category: Sales
versions: [1]
priority: medium
status: specced
---

# Affinity Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.affinitytrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/affinity/ | Public docs only |
| https://api-docs.affinity.co/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.affinityTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0
- **Outputs:** `main` × 1
- **Credentials:** `affinityApi` (API key)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| events | multiOptions | — | yes | One or more event-type/subject pairs to subscribe to |

### Supported events

The trigger subscribes to the following Affinity webhook event types, grouped by subject:

| Subject | Operations |
|---------|------------|
| Field | Created, Deleted, Updated |
| Field Value | Created, Deleted, Updated |
| File | Created, Deleted |
| List | Created, Deleted, Updated |
| List Entry | Created, Deleted |
| Note | Created, Deleted, Updated |
| Opportunity | Created, Deleted, Updated |
| Organization | Created, Deleted, Updated |
| Person | Created, Deleted, Updated |

Each event selection is a `subject.operation` pair (e.g. `person.created`, `organization.updated`).

## Runtime behavior

### Activation

When the workflow is activated, the node creates an Affinity webhook subscription via the Affinity Webhooks API (`POST /webhooks`), registering the n8n webhook callback URL for each selected event type. This requires a public HTTPS URL that the Affinity API can reach.

### Deactivation

When the workflow is deactivated, the node removes all webhook subscriptions it created, using the webhook subscription IDs stored at activation time.

### Output

Each incoming Affinity webhook payload is emitted as one output item. The JSON body of the webhook event is placed on `json`. The exact payload structure depends on the event type and the Affinity API's webhook event schema. Common fields include the resource type, the affected entity ID, and the changed data.

### Errors

- Credential validation failures (invalid API key) throw on activation.
- Webhook subscription API errors (4xx, 5xx) throw on activation or deactivation.
- The `continueOnFail` flag, if set on a downstream node, suppresses per-item processing errors.

### Expressions

The `events` parameter accepts expression strings for dynamic event selection, though this is uncommon for a trigger.

## Acceptance tests

### Test: Activate with person.created event

**Given** a valid `affinityApi` credential with API key.

**Parameters:**

```json
{
  "events": ["person.created"]
}
```

**Expect** that activation succeeds:

- The node subscribes to the `person.created` webhook event via the Affinity Webhooks API.
- A webhook subscription is created with the n8n callback URL.
- The node enters listening mode.

**Expect** that when a person-created webhook arrives, output[0] contains a JSON object with at least `type` and `data` fields representing the person creation event.

### Test: Activate with multiple events

**Parameters:**

```json
{
  "events": ["organization.created", "organization.updated", "organization.deleted"]
}
```

**Expect** that activation creates one (or more, as required by the Affinity API) webhook subscription covering all three organization event types. Deactivation removes all subscriptions without error.

### Test: Deactivation cleans up subscriptions

**Given** an activated workflow with the trigger configured for `list.created`.

**When** the workflow is deactivated.

**Expect** that the previously created webhook subscription is deleted via the Affinity Webhooks API. No orphaned subscriptions remain.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook payload shape | Public docs (Affinity API) confirmed | Affinity webhook event schema documented; exact fields depend on event type. |
| Webhook creation/removal mechanism | Public docs (n8n trigger pattern) | Standard n8n webhook trigger: create subscription on activate, delete on deactivate. |
| Event enumeration | Public docs n8n + Affinity API | The event list matches the Affinity-supported webhook event types. |
| Credential type | Public docs confirmed | `affinityApi` — API key at `https://api.affinity.co/`. |
| Webhook URL format | Inferred | n8n provides a public callback URL; the exact path is determined by the n8n instance. |
| Max subscriptions | Affinity API documented | Limit of 3 webhook subscriptions per Affinity instance. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/affinityTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

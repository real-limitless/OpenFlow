---
type: n8n-nodes-base.onfleetTrigger
displayName: Onfleet Trigger
category: Miscellaneous
versions: [1]
priority: medium
status: specced
---

# Onfleet Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.onfleettrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/onfleet/ | Public docs only |
| https://docs.onfleet.com/reference/introduction | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.onfleetTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0
- **Outputs:** `main` × 1
- **Credentials:** `onfleetApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiSelect | [] | yes | — | One or more webhook event types to subscribe to; see Events below |
| additionalOptions | object | {} | no | — | Bag of advanced options for customizing webhook behavior |

### Events

The node subscribes to Onfleet webhooks for the selected event types. Each event type maps to an Onfleet webhook trigger name. When any selected event fires, the node emits one output item per payload received:

- SMS recipient opt out
- SMS recipient response missed
- Task arrival
- Task assigned
- Task cloned
- Task completed
- Task created
- Task delayed
- Task ETA
- Task failed
- Task started
- Task unassigned
- Task updated
- Worker created
- Worker deleted
- Worker duty

## Runtime behavior

### Activation

On workflow activation the node registers one or more webhooks with the Onfleet API for the selected event types. On deactivation it unregisters those webhooks. If a webhook for the same event + URL already exists (checkExists), registration is skipped to avoid duplicates.

### Input

No `main` input. The node is a trigger-only node — it produces items from external webhook events.

### Output

Each received Onfleet webhook POST is parsed and emitted as a single output item on `main` output 0. The output shape mirrors the Onfleet webhook payload body, which varies by event type. Common top-level fields include:

- `action` (string): the event type that triggered the webhook
- `entity` (object): the affected Onfleet resource (task, worker, etc.)
- `context` (object, optional): additional context about the triggering action

### Errors

If webhook registration fails (e.g. invalid credentials, network error), activation throws and the workflow remains inactive. On incoming webhook requests, malformed payloads or signature validation failures result in a 400 response and no item is emitted. `continueOnFail` is not applicable to trigger nodes.

### Expressions

The `events` parameter accepts expression strings for dynamic event selection. `additionalOptions` values also accept expressions.

## Acceptance tests

### Test: activates and subscribes to a single event

**Given** valid Onfleet API key credentials.

**Parameters:**
```json
{ "events": ["taskCreated"] }
```

**Expect** on activate: the node registers a webhook for the `taskCreated` event with the Onfleet API. On receipt of a matching POST, output[0] contains the parsed webhook body as `json`.

### Test: subscribes to multiple events

**Given** valid Onfleet credentials.

**Parameters:**
```json
{ "events": ["taskCreated", "taskCompleted", "workerDuty"] }
```

**Expect** on activate: three webhooks are registered (one per event type). Each event type triggers output independently.

### Test: worker duty event shape

**Given** valid credentials, events = `["workerDuty"]`.

**When** a worker goes on or off duty, the Onfleet API delivers a webhook payload.

**Expect** output[0].json contains at minimum an `action` field matching `workerDuty` and an `entity` object identifying the worker.

### Test: idempotent webhook registration

**Given** valid credentials, events = `["taskCreated"]`.

**When** the workflow is activated, deactivated, and reactivated with the same events.

**Expect** the second activation does not create a duplicate webhook (checkExists returns true).

### Test: unknown event is rejected

**Parameters:**
```json
{ "events": ["nonExistentEvent"] }
```

**Expect** the node rejects the parameter at validation time or activation throws due to API error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Event names | Public docs | 16 event names documented on docs.n8n.io trigger page |
| Credential type | Public docs | API key auth, documented on credentials page |
| Webhook lifecycle (register/unregister/checkExists) | Public docs + type declaration | Standard pattern for n8n webhook triggers; confirmed by d.ts |
| Output payload shape | inferred | Onfleet webhook payloads follow Onfleet's own API docs; exact field names vary by event |
| `additionalOptions` bag | inferred | Common n8n trigger pattern for extensibility |
| Expression support | inferred | All n8n parameters support expressions by convention |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.onfleetTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

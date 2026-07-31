---
type: n8n-nodes-base.activationTrigger
displayName: Activation Trigger
category: Triggers
versions: [1]
priority: low
status: specced
---

# Activation Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.activationtrigger.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.activationTrigger`
- **Aliases:** (none documented)
- **Display name:** `Activation Trigger`
- **Group / category:** trigger · Core Nodes
- **Version:** `1` only
- **`isTrigger`:** `true`
- **Inputs:** none (empty inputs array; trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiOptions | `[]` | no | — | **Event type(s).** Enum: `activation` ("Workflow Published"), `start` ("Instance Started"), `update` ("Workflow Updated"). `noDataExpression`. |

### Event semantics

| Event value | Fires when |
|-------------|------------|
| `activation` | The workflow containing this node is published (activated). |
| `start` | The n8n instance starts or restarts. |
| `update` | The workflow containing this node is saved while it is active. |

Multiple events may be selected. If the `events` array is empty, the node does not fire.

## Runtime behavior

### Role

Entry trigger for a workflow that fires on **workflow lifecycle events** specific to the workflow it belongs to — publishing, updating while active, or instance startup. Must be the **first** node of the workflow. Only responds to events for its own workflow; changes to other workflows do not trigger it.

### Deprecation

This node is **deprecated** and replaced by two nodes:
- **n8n Trigger** (`n8n-nodes-base.n8ntrigger`) — covers `Published Workflow Updated`, `Instance started`, `Workflow Published` (the superset of activationTrigger events).
- **Workflow Trigger** (`n8n-nodes-base.workflowTrigger`) — covers `Active Workflow Updated` and `Workflow Activated`.

New implementations should target the replacement nodes. The activationTrigger spec exists for import compatibility with older workflow exports.

### Input

No upstream graph edges. The **engine injects** the event context as input items when a workflow lifecycle event matches the selected `events`.

### Output

On output index `0` (`main`), emit the items supplied by the platform event, as workflow items `{ json, binary? }[]`.

The event context shape is **not documented** in the public activationTrigger docs. Based on the replacement nodes' behavior, the emitted item is expected to carry the workflow event context (workflow id, name, execution id, mode, timestamp). Inferred shape:

```json
{
  "json": {
    "workflow": { "id": "1", "name": "My Workflow" },
    "execution": { "id": "100", "mode": "trigger" },
    "event": "activation",
    "timestamp": "2026-01-01T00:00:00.000Z"
  }
}
```

If the trigger fires with **pin data** on this node (editor debug), emit pinned items instead (**inferred** shared trigger platform behavior).

Bare manual test without platform event or pin data: emit one empty item `[{ "json": {} }]` (**inferred** — follows the `executeWorkflowTrigger` pattern).

### Errors

| Condition | Behavior |
|-----------|----------|
| Node body itself | No network I/O; no credential lookup. The trigger does not fail on its own. |
| Manual / test run | Emits a single empty item (no event context available). |
| `continueOnFail` | N/A for the trigger's own emit. |

### Expressions

- `events` is marked **noDataExpression** — treat as static config.

## Acceptance tests

### Test: activation event fires

**Given** the platform routes an `activation` event.

**Parameters:**

```json
{
  "events": ["activation"]
}
```

**Expect** output[0] contains at least one item. The item `json` carries the event context (workflow id, execution id, event type).

### Test: start event fires

**Parameters:**

```json
{
  "events": ["start"]
}
```

**Expect** output[0] contains at least one item when the instance starts/restarts.

### Test: update event fires

**Parameters:**

```json
{
  "events": ["update"]
}
```

**Expect** output[0] contains at least one item when the active workflow is saved.

### Test: multiple events

**Parameters:**

```json
{
  "events": ["activation", "update"]
}
```

**Expect** the node fires on either activation or update events.

### Test: manual run emits empty item

**Given** a manual / test execute with no platform event.

**Parameters:**

```json
{
  "events": ["activation"]
}
```

**Expect** output[0]:

```json
[{ "json": {} }]
```

### Test: pin data override (editor)

**Given** pin data on the trigger:

```json
[{ "json": { "pinned": true } }]
```

**Expect** isolated/debug run uses pinned items on output[0] (**inferred** platform behavior).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Purpose + events (activation, start, update) | documented | Public activationTrigger docs |
| Deprecated, replaced by n8n Trigger + Workflow Trigger | documented | Public activationTrigger docs |
| Must be first node in workflow | documented | Common trigger pattern |
| Single-parameter schema (events multiOptions) | documented | Public docs |
| Event context output shape | inferred | Not documented for activationTrigger; inferred from n8n Trigger / Workflow Trigger replacement patterns |
| Manual run emits empty item | inferred | Follows `executeWorkflowTrigger` pattern |
| Pin-data override for editor testing | inferred | Shared trigger platform behavior |
| version 1 only / isTrigger / no credentials | inferred | Node is absent from v2.15.1 descriptor (removed); version 1 is the only documented version |
| Empty events array yields no output | inferred | Reasonable default behavior |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/activation-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
---
type: n8n-nodes-base.n8nTrigger
displayName: n8n Trigger
category: Triggers
versions: [1]
priority: medium
status: specced
---

# n8n Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.n8ntrigger.md | Public docs only |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.n8nTrigger`
- **Aliases:** (none documented)
- **Display name:** `n8n Trigger`
- **Group / category:** trigger · Core Nodes
- **Versions:** `1` (typeVersion 1)
- **Inputs:** none (empty inputs array; trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | multiOptions | `[]` | no | — | **Trigger events.** One or more of: `workflowUpdated` ("Published Workflow Updated"), `instanceStarted` ("Instance started"), `workflowPublished` ("Workflow Published"). Only responds to events in the containing workflow. |

### Event semantics

| Event value | Label | Fires when |
|-------------|-------|------------|
| `workflowUpdated` | Published Workflow Updated | The containing workflow is updated (saved after initial publish). |
| `instanceStarted` | Instance started | The n8n instance starts or restarts. |
| `workflowPublished` | Workflow Published | The containing workflow is first published or re-published. |

## Runtime behavior

### Role

Entry trigger for a workflow that fires on **workflow lifecycle events** local to its own workflow (or the n8n instance). Must be the first node in the workflow. The engine evaluates whether to fire based on the configured `events` list and routes a matching event as input items.

### Input

No upstream graph edges. The engine injects event context as input items when one of the configured events occurs within the containing workflow (or at instance startup).

### Output

On output index `0` (`main`), emit items supplied by the platform event as workflow items `{ json, binary? }[]`.

| Event | Runtime emit |
|-------|--------------|
| `workflowUpdated` | Event context for the workflow update — the workflow's id, name, and updated timestamp. |
| `instanceStarted` | Event context for instance startup — instance metadata and the workflow's id/name. |
| `workflowPublished` | Event context for the workflow publish — the workflow's id, name, and published timestamp. |

If the workflow is tested manually (editor test run) without a platform event: emit a single empty item `[{ "json": {} }]`.

If pin data is set on this node (editor debug), emit pinned items instead (shared trigger platform behavior).

### Errors

| Condition | Behavior |
|-----------|----------|
| Node body itself | No network I/O; no credential lookup. The trigger does not fail on its own. |
| Manual / test run | Emits a single empty item (no event context available). |
| `continueOnFail` | N/A for the trigger's own emit. |

### Expressions

- `events` is a static configuration parameter — does not accept expressions.

## Acceptance tests

### Test: workflowUpdated event

**Given** the platform routes a `workflowUpdated` event with items:

```json
[
  { "json": { "workflow": { "id": "wf-1", "name": "My Workflow", "updatedAt": "2026-01-01T00:00:00.000Z" } } }
]
```

**Parameters:**

```json
{
  "events": ["workflowUpdated"]
}
```

**Expect** output[0]:

```json
[
  { "json": { "workflow": { "id": "wf-1", "name": "My Workflow", "updatedAt": "2026-01-01T00:00:00.000Z" } } }
]
```

### Test: instanceStarted event

**Given** the platform routes an `instanceStarted` event with items:

```json
[
  { "json": { "instance": { "version": "2.15.0", "startedAt": "2026-01-01T00:00:00.000Z" }, "workflow": { "id": "wf-1", "name": "My Workflow" } } }
]
```

**Parameters:**

```json
{
  "events": ["instanceStarted"]
}
```

**Expect** output[0]:

```json
[
  { "json": { "instance": { "version": "2.15.0", "startedAt": "2026-01-01T00:00:00.000Z" }, "workflow": { "id": "wf-1", "name": "My Workflow" } } }
]
```

### Test: multiple events selected

**Given** the platform routes a `workflowPublished` event with items:

```json
[
  { "json": { "workflow": { "id": "wf-1", "name": "My Workflow", "publishedAt": "2026-01-01T00:00:00.000Z" } } }
]
```

**Parameters:**

```json
{
  "events": ["workflowUpdated", "instanceStarted", "workflowPublished"]
}
```

**Expect** output[0]:

```json
[
  { "json": { "workflow": { "id": "wf-1", "name": "My Workflow", "publishedAt": "2026-01-01T00:00:00.000Z" } } }
]
```

### Test: manual run emits empty item

**Given** a manual / test execute with no platform event.

**Parameters:**

```json
{
  "events": ["workflowUpdated"]
}
```

**Expect** output[0]:

```json
[{ "json": {} }]
```

### Test: no events selected (empty array)

**Given** no events are configured.

**Parameters:**

```json
{
  "events": []
}
```

**Expect** the trigger never fires. Manual run emits `[{ "json": {} }]` (test scaffold only). In production, routing no event types means the trigger produces no output.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Purpose + only fires for own workflow | documented | n8n Trigger public docs |
| Three event types (workflowUpdated, instanceStarted, workflowPublished) | inferred | From public docs display names; wire values inferred from n8n naming conventions |
| Wire param name `events` | inferred | From public docs "Events" label |
| Multi-select parameter type | inferred | Public docs "select one or more" |
| Event context output shape | inferred | Exact field names may differ; based on common n8n event shape patterns |
| Manual run emits empty item | inferred | Follows trigger platform pattern (Workflow Trigger, Execute Workflow Trigger) |
| Pin-data override for editor testing | inferred | Shared trigger platform behavior |
| No credentials | documented | Not listed in public docs or descriptor |
| No expression support for `events` | inferred | Static config parameter |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
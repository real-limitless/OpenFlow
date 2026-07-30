---
type: n8n-nodes-base.workflowTrigger
displayName: Workflow Trigger
category: Triggers
versions: [1, 1.1]
priority: medium
status: specced
---

# Workflow Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.workflowtrigger.md | Public docs only |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.workflowTrigger`
- **Aliases:** (none documented)
- **Display name:** `Workflow Trigger`
- **Group / category:** trigger · Core Nodes
- **Versions:** `1`, `1.1` (`typeVersion` 1 or 1.1)
- **Inputs:** none (empty inputs array; trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| workflowTrigger | options | `workflowStarted` | no | — | **Event type.** Enum: `workflowStarted` ("When workflow starts"), `workflowFinished` ("When workflow finishes"). `noDataExpression`. |
| workflowId | string | `""` | no | — | Filter to a specific workflow ID. If empty, triggers on all workflows. |

### Version notes

- **typeVersion 1:** Same parameter surface; earlier wire shape (**inferred**).
- **typeVersion 1.1:** Current published version (**inferred**).

## Runtime behavior

### Role

Entry trigger for a workflow that fires on **workflow lifecycle events** — when another workflow starts or finishes executing. Must be the **first** node of the workflow (docs). Starts only when the platform routes a workflow event to it, not on manual canvas run of this workflow alone (except test/debug paths that inject pin data).

### Input

No upstream graph edges. The **engine injects** the event context as input items when a workflow lifecycle event matches the configured `workflowTrigger` event type and optional `workflowId` filter.

### Output

On output index `0` (`main`), emit the items supplied by the platform event, as workflow items `{ json, binary? }[]`.

| `workflowTrigger` | Runtime emit |
|-------------------|--------------|
| `workflowStarted` | Event context for the workflow that started (workflow id, name, execution id, mode, startedAt). |
| `workflowFinished` | Event context for the workflow that finished (workflow id, name, execution id, mode, finishedAt, status). |

If the child run is started with **pin data** on this node (editor debug), emit pinned items instead (**inferred** shared trigger platform behavior).

Bare manual test without platform event / pin data: emit one empty item `[{ "json": {} }]` for isolated test runs (**inferred** — follows the `executeWorkflowTrigger` pattern).

### Errors

| Condition | Behavior |
|-----------|----------|
| Node body itself | No network I/O; no credential lookup. The trigger does not fail on its own. |
| Manual / test run | Emits a single empty item (no event context available). |
| `continueOnFail` | N/A for the trigger's own emit. |

### Expressions

- `workflowTrigger` is marked **noDataExpression** — treat as static config.
- `workflowId` accepts expressions for dynamic workflow filtering (**inferred**).

## Acceptance tests

### Test: passthrough platform-injected event (workflowStarted)

**Given** the platform routes a `workflowStarted` event with items:

```json
[
  { "json": { "workflow": { "id": "1", "name": "Producer" }, "execution": { "id": "100", "mode": "trigger" }, "startedAt": "2026-01-01T00:00:00.000Z" } }
]
```

**Parameters:**

```json
{
  "workflowTrigger": "workflowStarted"
}
```

**Expect** output[0]:

```json
[
  { "json": { "workflow": { "id": "1", "name": "Producer" }, "execution": { "id": "100", "mode": "trigger" }, "startedAt": "2026-01-01T00:00:00.000Z" } }
]
```

### Test: passthrough platform-injected event (workflowFinished)

**Given** the platform routes a `workflowFinished` event with items:

```json
[
  { "json": { "workflow": { "id": "2", "name": "Producer" }, "execution": { "id": "200", "mode": "trigger" }, "finishedAt": "2026-01-01T00:05:00.000Z", "status": "success" } }
]
```

**Parameters:**

```json
{
  "workflowTrigger": "workflowFinished"
}
```

**Expect** output[0]:

```json
[
  { "json": { "workflow": { "id": "2", "name": "Producer" }, "execution": { "id": "200", "mode": "trigger" }, "finishedAt": "2026-01-01T00:05:00.000Z", "status": "success" } }
]
```

### Test: manual run emits empty item (edge)

**Given** a manual / test execute with no platform event.

**Parameters:**

```json
{
  "workflowTrigger": "workflowStarted"
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
| Purpose + first node in workflow | documented | Workflow Trigger docs |
| Event types `workflowStarted` / `workflowFinished` | inferred | From public descriptor / export shapes |
| Wire param name `workflowTrigger` | inferred | From public descriptor |
| `workflowId` filter parameter | inferred | From public descriptor |
| Default `workflowTrigger=workflowStarted` | inferred | Descriptor default |
| Event context shape (workflow/execution/startedAt/finishedAt) | inferred | Based on n8n execution model; exact field names may differ |
| Manual run emits empty item | inferred | Follows `executeWorkflowTrigger` pattern |
| Pin-data override for editor testing | inferred | Shared trigger platform behavior |
| typeVersion 1 vs 1.1 param surface | inferred | Descriptors |
| No parameters accept expressions except `workflowId` | inferred | Descriptor `noDataExpression` flags |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/workflow-trigger.ts`
- **Definition:** `src/lib/nodes/definitions/triggers.ts` (`workflowTrigger`)
- **SDK:** `defineNode` + native `ExecutionContext` only
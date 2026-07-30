---
type: n8n-nodes-base.manualTrigger
displayName: Manual Trigger
category: Triggers
versions: [1]
priority: high
status: specced
---

# Manual Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.manualworkflowtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.manualworkflowtrigger/ | Public docs only (HTML canonical) |
| Public workflow export JSON (type string / aliases / empty `parameters`) | Public workflow JSON |

## Wire format

- **Type string:** `n8n-nodes-base.manualTrigger`
- **Aliases:** `n8n-nodes-base.manualWorkflowTrigger`, `n8n-nodes-base.start` (legacy / alternate export type strings resolve to this node — **inferred** from public exports and compatibility maps)
- **Display name:** `Manual Trigger`
- **Default node name (canvas):** `When clicking ‘Execute workflow’` (**inferred** from public descriptor defaults / common exports)
- **Group / category:** trigger · Core Nodes
- **Version:** `1` only (`typeVersion: 1`)
- **Inputs:** none (empty inputs array; trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Max instances:** `1` per workflow (**documented** editor error; descriptor `maxNodes: 1` aligns)

## Parameters

No runtime configuration parameters. Workflow node `parameters` in public exports is typically `{}`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| notice | notice | `""` | no | — | UI-only instructional notice (canvas start / explore other triggers). Not evaluated at runtime; not required in export JSON (**inferred** descriptor property; empty runtime schema) |

## Runtime behavior

### Role

Starts a workflow only when the user explicitly runs it (e.g. **Execute Workflow** / test run on the canvas). It is the start point for workflows that must not run on a schedule or external event. Public docs also recommend it for testing before adding an automatic trigger.

### Input

No upstream items. The engine does not feed prior-node data into this node. Activation is a platform “manual run” signal, not an inbound webhook or timer.

### Output

Emits **one** item on output index `0` (`main`):

```json
[{ "json": {} }]
```

Empty JSON is the practical default for a bare manual start (**inferred** — public docs describe purpose, not the exact item body; empty item matches common public export / pin-data practice).

If the run supplies **pin data** for this node, the engine should use the pinned items instead of the empty default (**inferred** platform behavior shared with other triggers).

### Errors

| Condition | Behavior |
|-----------|----------|
| Second Manual Trigger added in editor | **Documented** error: only one Manual Trigger allowed; user must remove the existing one or rewire it |
| Runtime execution | No network I/O; no credential lookup; should not fail under normal empty-start conditions |
| `continueOnFail` | N/A for successful empty emit; no documented failure modes for the node body itself |

### Expressions

N/A — no data parameters accept expressions.

### Editor / platform constraints

- Workflows require a trigger (or start) node; Manual Trigger fulfills that without automatic firing (**documented**).
- At most **one** Manual Trigger per workflow (**documented**).
- Does not activate on workflow “active” publish the way Schedule/Webhook do; only manual execute paths start it (**documented** intent).

## Acceptance tests

### Test: empty start item

**Given** input items: (none — trigger)

**Parameters:**

```json
{}
```

**Expect** output[0]:

```json
[{ "json": {} }]
```

### Test: sole trigger constraint

**Given** workflow already containing one node with `type: "n8n-nodes-base.manualTrigger"`

**Expect** editor/validation rejects adding another Manual Trigger (message equivalent to “Only one Manual Trigger node is allowed in a workflow”) — **documented**.

### Test: starts downstream chain

**Given** workflow:

```json
{
  "nodes": [
    {
      "id": "t1",
      "name": "When clicking ‘Execute workflow’",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [0, 0],
      "parameters": {}
    },
    {
      "id": "n1",
      "name": "No Operation",
      "type": "n8n-nodes-base.noOp",
      "typeVersion": 1,
      "position": [220, 0],
      "parameters": {}
    }
  ],
  "connections": {
    "When clicking ‘Execute workflow’": {
      "main": [[{ "node": "No Operation", "type": "main", "index": 0 }]]
    }
  }
}
```

**Expect** manual run starts at Manual Trigger, emits one empty item, and NoOp receives `[{ "json": {} }]`.

### Test: alias type import

**Given** imported node with `"type": "n8n-nodes-base.start"` or `"type": "n8n-nodes-base.manualWorkflowTrigger"`

**Expect** resolved to the same Manual Trigger behavior and empty start item (**inferred** from public alias / compatibility tables).

### Test: pin data override

**Given** pin data for the Manual Trigger node:

```json
[{ "json": { "hello": "pinned" } }]
```

**Parameters:**

```json
{}
```

**Expect** output[0]:

```json
[{ "json": { "hello": "pinned" } }]
```

(**inferred** — pin-data is a platform feature; exact precedence is engine-level.)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Purpose + manual-only start | documented | Execute Workflow; no automatic run |
| Single instance per workflow | documented | Common issues section |
| Exact start payload `{ json: {} }` | inferred | Docs omit item shape |
| Alias type strings | inferred | Public exports / OpenFlow compatibility map |
| Notice UI property | inferred | Not a runtime param; empty export schema |
| Default canvas name string | inferred | Descriptor defaults / common exports |
| Pin-data override | inferred | Shared trigger platform behavior |
| typeVersion always `1` | inferred | Single published version in descriptors |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/manual-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

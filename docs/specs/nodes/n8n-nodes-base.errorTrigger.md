---
type: n8n-nodes-base.errorTrigger
displayName: Error Trigger
category: Triggers
versions: [1]
priority: high
status: specced
---

# Error Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/ | Public docs only (HTML canonical) |
| https://docs.n8n.io/build/flow-logic/handle-errors-gracefully.md | Public docs only |
| Public descriptor metadata (type string, version, isTrigger, empty parameter schema) | Public docs + public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.errorTrigger`
- **Aliases:** (none documented)
- **Display name:** `Error Trigger`
- **Group / category:** trigger · Development · Core Nodes · Other Trigger Nodes
- **Version:** `1` only (`nodeVersion: 1.0`, `codexVersion: 1.0`)
- **`isTrigger`:** `true`
- **Inputs:** none (empty inputs array; trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Parameters schema:** empty (`z.object({})`) — no runtime configuration parameters

## Parameters

No runtime configuration parameters. Workflow node `parameters` in public exports is typically `{}`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| — | — | — | — | — | No user-configurable parameters (confirmed by empty descriptor schema) |

## Runtime behavior

### Role

Starts an **error workflow** when another linked workflow's execution fails. The Error Trigger must be the **first node** of the error workflow. When the main workflow errors, the platform routes the failure to the configured error workflow, which begins at this node and emits details about the failed execution and the error.

### Wiring / activation

- An error workflow is created with the Error Trigger as its first node.
- In the **main** workflow, **Options → Settings → Error workflow** selects the error workflow. The same error workflow may be reused by multiple workflows.
- If a workflow contains the Error Trigger node, by default that workflow uses **itself** as its error workflow.
- A workflow that uses the Error Trigger does not need to be published/active to serve as an error workflow.
- The Error Trigger **only runs when an automatic workflow errors**. Error workflows can't be tested by running workflows manually — a manual execute does not fire the Error Trigger. (To exercise the downstream error-handling chain in the editor, use **pin data** on the Error Trigger — **inferred** platform behavior shared with other triggers.)

### Input

No upstream items. The engine does not feed prior-node data into this node. Activation is a platform "execution failed" signal routed from the main workflow, not an inbound webhook, timer, or manual run.

### Output

Emits **one** item on output index `0` (`main`). The item `json` body depends on where the error occurred in the main workflow.

#### Shape A — error in a non-trigger node of the main workflow (default)

The docs present this as the items array; each element is the `json` of one emitted item:

```json
[
  {
    "execution": {
      "id": "231",
      "url": "https://n8n.example.com/execution/231",
      "retryOf": "34",
      "error": {
        "message": "Example Error Message",
        "stack": "Stacktrace"
      },
      "lastNodeExecuted": "Node With Error",
      "mode": "manual"
    },
    "workflow": {
      "id": "1",
      "name": "Example Workflow"
    }
  }
]
```

i.e. the trigger emits one item whose `json` is `{ "execution": {…}, "workflow": {…} }`.

Conditional fields (all other fields are always present):

| Field | Presence |
|-------|----------|
| `execution.id` | Requires the execution to be saved in the database. **Not present** if the error is in the trigger node of the main workflow (the workflow doesn't execute). |
| `execution.url` | Same as `execution.id` — requires a saved execution; absent on trigger-node errors. |
| `execution.retryOf` | **Only present** when the execution is a retry of a failed execution. |

#### Shape B — error caused by the trigger node of the main workflow

Less information in `execution{}` (absent) and more in `trigger{}`. The docs present this as a single object — the `json` of the one emitted item:

```json
{
  "trigger": {
    "error": {
      "context": {},
      "name": "WorkflowActivationError",
      "cause": {
        "message": "",
        "stack": ""
      },
      "timestamp": 1654609328787,
      "message": "",
      "node": { }
    },
    "mode": "trigger"
  },
  "workflow": {
    "id": "",
    "name": ""
  }
}
```

i.e. the trigger emits one item whose `json` is `{ "trigger": {…}, "workflow": {…} }`. The `node` object inside `trigger.error` is truncated in the docs; its exact shape is **inferred** to be the standard node descriptor (`{ name, type, … }`).

### Errors

| Condition | Behavior |
|-----------|----------|
| Node body itself | No network I/O; no credential lookup. The trigger does not fail on its own — it only fires when the platform routes a failure to it. |
| Manual / test run | Does **not** fire (documented). Manual execution of an error workflow cannot exercise the Error Trigger; use pin data to test downstream nodes (**inferred**). |
| `continueOnFail` | N/A for the trigger's own emit; no documented failure modes for the node body. |

### Expressions

N/A — no data parameters accept expressions.

### Editor / platform constraints

- Must be the first node in the error workflow (**documented**).
- Error workflow is selected in the main workflow's **Workflow Settings → Error workflow** (**documented**).
- A workflow containing the Error Trigger uses itself as the error workflow by default (**documented**).
- No need to publish a workflow that uses the Error Trigger (**documented**).
- One error workflow can serve multiple main workflows (**documented**).
- The [Stop and Error](./n8n-nodes-base.stopAndError.md) node can force a workflow to fail under chosen circumstances, which in turn triggers the error workflow / Error Trigger (**documented**).

## Acceptance tests

### Test: default error data (non-trigger failure)

**Given** the main workflow fails at a non-trigger node and the platform routes the failure to this error workflow.

**Parameters:**

```json
{}
```

**Expect** output[0] (one item):

```json
[
  {
    "json": {
      "execution": {
        "id": "231",
        "url": "https://n8n.example.com/execution/231",
        "error": {
          "message": "Example Error Message",
          "stack": "Stacktrace"
        },
        "lastNodeExecuted": "Node With Error",
        "mode": "manual"
      },
      "workflow": {
        "id": "1",
        "name": "Example Workflow"
      }
    }
  }
]
```

### Test: retry execution carries retryOf

**Given** the failed execution is a retry of a previously failed execution.

**Expect** the emitted item `json.execution.retryOf` is present (the retried execution's id); otherwise the field is omitted.

### Test: trigger-node failure uses trigger shape

**Given** the error is caused by the trigger node of the main workflow (e.g. a `WorkflowActivationError`).

**Parameters:**

```json
{}
```

**Expect** output[0] (one item; `execution` absent, `trigger` present):

```json
[
  {
    "json": {
      "trigger": {
        "error": {
          "name": "WorkflowActivationError",
          "message": "",
          "cause": { "message": "", "stack": "" },
          "timestamp": 1654609328787,
          "context": {}
        },
        "mode": "trigger"
      },
      "workflow": {
        "id": "",
        "name": ""
      }
    }
  }
]
```

### Test: manual run does not fire

**Given** a manual / test execute of the error workflow.

**Expect** the Error Trigger does **not** emit error data on manual run (documented). Downstream nodes receive no items from this trigger unless pin data is supplied.

### Test: pin data override

**Given** pin data for the Error Trigger node:

```json
[{ "json": { "execution": { "id": "99", "error": { "message": "pinned" } }, "workflow": { "id": "1", "name": "W" } } }]
```

**Parameters:**

```json
{}
```

**Expect** output[0]:

```json
[{ "json": { "execution": { "id": "99", "error": { "message": "pinned" } }, "workflow": { "id": "1", "name": "W" } } }]
```

(**inferred** — pin-data is a platform feature; exact precedence is engine-level. This is the supported way to test error-workflow downstream nodes in the editor.)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Purpose + must be first node of error workflow | documented | Public docs |
| Only runs on automatic workflow error; not testable manually | documented | Public docs |
| Self-as-error-workflow default; no publish required; reusable across workflows | documented | Public docs |
| Stop and Error can trigger it | documented | Public docs |
| Default error data shape A (execution + workflow) | documented | Public docs (verbatim field names) |
| Conditional fields: `execution.id`/`url` absent on trigger-node error; `retryOf` only on retry | documented | Public docs |
| Trigger-node error shape B (`trigger` + `workflow`) | documented | Public docs; `trigger.error.node` body truncated in docs — exact fields inferred |
| Emitted as one item whose `json` is the documented object | inferred | Docs show raw array/object; item wrapping follows the platform item model |
| Pin-data override for editor testing | inferred | Shared trigger platform behavior; docs say manual runs can't test it |
| No parameters / no credentials / version 1 / isTrigger | inferred | Confirmed by public descriptor metadata (empty schema) |
| `mode` field values (`manual`, `trigger`) | documented | Present in example payloads |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/error-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
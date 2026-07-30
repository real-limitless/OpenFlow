---
type: n8n-nodes-base.executeWorkflowTrigger
displayName: Execute Sub-workflow Trigger
category: Triggers
versions: [1, 1.1]
priority: high
status: specced
---

# Execute Sub-workflow Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow.md | Public docs only (paired parent node + data path) |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.executeWorkflowTrigger`
- **Aliases:** (none documented)
- **Display name:** `Execute Workflow Trigger` / docs title **Execute Sub-workflow Trigger**
- **Default node name (canvas):** `When Executed by Another Workflow` (also searchable as that title under triggers)
- **Group / category:** trigger · Core Nodes (Helpers subcategory in catalogs)
- **Versions:** `1`, `1.1` (`typeVersion` 1 or 1.1)
- **Inputs:** none (empty inputs array; trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Max instances:** `1` per workflow (**inferred** from public descriptor `maxNodes: 1`; aligns with sole sub-workflow entry)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| events | hidden | `worklfow_call` | no | — | Internal event marker for “workflow call”. Value spelling `worklfow_call` is the published wire default (**inferred** descriptor). Not user-facing. |
| notice | notice | `""` | no | `@version` eq `1` | UI-only explanation that parent Execute Sub-workflow starts here and parent payload is emitted. Not runtime logic. |
| outdatedVersionWarning | notice | `""` | no | `@version` eq `1` | UI notice that v1 is outdated; upgrade by replace. Not runtime logic. |
| inputSource | options | `workflowInputs` | no | `@version` gte `1.1` | **Input data mode.** Enum: `workflowInputs` (“Define using fields below”), `jsonExample` (“Define using JSON example”), `passthrough` (“Accept all data”). `noDataExpression`. |
| jsonExample_notice | notice | `""` | no | v≥1.1 and `inputSource=jsonExample` | UI help: example object infers fields/types; `null` value means any type. |
| jsonExample | json | see notes | no | v≥1.1 and `inputSource=jsonExample` | Example object used to **declare** expected input shape for the parent UI. Default example includes string/number/null/array keys. `noDataExpression`. |
| workflowInputs | fixedCollection | `{}` | no | v≥1.1 and `inputSource=workflowInputs` | **Workflow Input Schema.** Multiple sortable `values` entries. If no fields defined, docs/descriptor note that all caller data is passed through. |

### `workflowInputs.values[]` (when `inputSource=workflowInputs`)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| name | string | `""` | yes | Unique input field name referenced from the parent Execute Sub-workflow / Call Workflow Tool UI. `noDataExpression`. |
| type | options | `string` | yes | Expected type: `any` \| `string` \| `number` \| `boolean` \| `array` \| `object`. Drives parent mapping UI and optional type coercion on the parent side. `noDataExpression`. |

### Version notes

- **typeVersion 1:** No `inputSource` / schema parameters in the published param surface (notices only). Runtime behaves as **accept all parent items** (**documented** data path; schema UI is v1.1+).
- **typeVersion 1.1+:** `inputSource` defaults to `workflowInputs`. Schema modes primarily affect **editor contract** with the parent node (auto-pulled input fields). Runtime still starts from parent-provided items.

## Runtime behavior

### Role

Entry trigger for a **sub-workflow** invoked by:

- **Execute Sub-workflow** (`n8n-nodes-base.executeWorkflow`), or
- **Call n8n Workflow Tool** (LangChain cluster tool; out of core executor scope unless mapped later).

Must be the **first** node of the child workflow (docs). Starts only when another workflow calls this workflow — not on schedule/webhook/manual canvas run of the child alone (except test/debug paths that inject pin data or prior-execution data).

### Input

No upstream graph edges. The **engine injects** the item list that the parent Execute Sub-workflow node passed into the child run.

Documented data path:

1. Parent `executeWorkflow` sends its (mode-dependent) items into this trigger.
2. Child graph runs from this node’s output.
3. **Last node** of the child sends items **back** to the parent `executeWorkflow` output.

### Output

On output index `0` (`main`), emit the items supplied by the parent call, as workflow items `{ json, binary? }[]`.

| `inputSource` (v1.1) | Runtime emit |
|----------------------|--------------|
| `passthrough` | All parent items unchanged (**documented** “accept all data”). |
| `workflowInputs` | Parent items (fields may be mapped/null-filled/type-converted on the **parent** side per Execute Sub-workflow docs). Empty schema → pass all caller data (**descriptor description**). |
| `jsonExample` | Same as schema contract for parent UI; runtime still receives parent-built items matching the inferred schema (**documented** intent). |

If the child run is started with **pin data** on this node (editor debug), emit pinned items instead (**inferred** shared trigger platform behavior; docs describe pinning after loading prior execution data).

Bare manual test of the child without parent call / pin data: emit one empty item or fail closed depending on platform — **not fully documented**; OpenFlow should prefer parent-injected items, else pin data, else `[{ "json": {} }]` for isolated test runs (**inferred**).

### Errors

| Condition | Behavior |
|-----------|----------|
| Sub-workflow contains errors / invalid | **Documented:** parent cannot trigger the sub-workflow. |
| Missing this trigger when parent expects sub-workflow entry | Parent/engine error (pair with `executeWorkflow` spec); exact message **inferred**. |
| Second instance of this trigger in one workflow | Editor should reject (`maxNodes: 1`) — **inferred**. |
| `continueOnFail` | N/A on successful passthrough emit; failures are usually parent call / child graph errors, not this node’s body. |
| Workflow settings “This workflow can be called by” | Platform ACL on who may invoke the child (**documented** workflow settings); enforced outside this node’s executor. |

### Expressions

- `inputSource`, field `name`/`type`, and `jsonExample` are marked **noDataExpression** in descriptors — treat as static config, not per-item expressions.
- Runtime payload comes from the parent call, not from evaluating this node’s parameters as item templates.

### Pairing with Execute Sub-workflow

| Parent (`executeWorkflow`) | Child (this node) |
|----------------------------|-------------------|
| Selects child workflow (database / parameter / …) | Must exist as saved workflow with this trigger first |
| Mode once vs each | Determines how many child runs / item batches the trigger receives |
| Workflow Inputs UI | Populated from child `workflowInputs` or `jsonExample` when not `passthrough` |
| Wait for completion | Parent waits for child terminal items to return |
| Output | Child last-node items |

## Acceptance tests

### Test: passthrough parent items

**Given** parent calls child with items:

```json
[
  { "json": { "userId": 1, "name": "Ada" } },
  { "json": { "userId": 2, "name": "Bob" } }
]
```

**Parameters** (child trigger):

```json
{
  "inputSource": "passthrough"
}
```

**Expect** output[0]:

```json
[
  { "json": { "userId": 1, "name": "Ada" } },
  { "json": { "userId": 2, "name": "Bob" } }
]
```

### Test: workflowInputs schema declaration (editor contract)

**Given** typeVersion `1.1`

**Parameters:**

```json
{
  "inputSource": "workflowInputs",
  "workflowInputs": {
    "values": [
      { "name": "userId", "type": "number" },
      { "name": "name", "type": "string" }
    ]
  }
}
```

**Expect** parent Execute Sub-workflow (database + from-list) exposes input fields `userId` and `name` for mapping (**documented**). When parent sends:

```json
[{ "json": { "userId": 42, "name": "Ada" } }]
```

trigger output[0] is that item list.

### Test: jsonExample schema mode

**Parameters:**

```json
{
  "inputSource": "jsonExample",
  "jsonExample": "{\n  \"orderId\": \"abc\",\n  \"total\": 10\n}"
}
```

**Expect** parent UI derives fields `orderId` (string) and `total` (number). Runtime emit equals parent-provided items for the child run.

### Test: v1 accept-all (no inputSource)

**Given** `typeVersion: 1`, parameters `{}` (or only hidden `events`)

**Parent items:**

```json
[{ "json": { "x": true } }]
```

**Expect** output[0]:

```json
[{ "json": { "x": true } }]
```

### Test: nested round-trip (integration with executeWorkflow)

**Given** workflows:

```json
{
  "parent": {
    "nodes": [
      {
        "name": "Start",
        "type": "n8n-nodes-base.manualTrigger",
        "typeVersion": 1,
        "parameters": {}
      },
      {
        "name": "Run Child",
        "type": "n8n-nodes-base.executeWorkflow",
        "typeVersion": 1,
        "parameters": {
          "source": "database",
          "workflowId": "child-wf-id",
          "mode": "once"
        }
      }
    ],
    "connections": {
      "Start": { "main": [[{ "node": "Run Child", "type": "main", "index": 0 }]] }
    }
  },
  "child": {
    "nodes": [
      {
        "name": "When Executed by Another Workflow",
        "type": "n8n-nodes-base.executeWorkflowTrigger",
        "typeVersion": 1.1,
        "parameters": { "inputSource": "passthrough" }
      },
      {
        "name": "Set",
        "type": "n8n-nodes-base.set",
        "typeVersion": 3,
        "parameters": {}
      }
    ],
    "connections": {
      "When Executed by Another Workflow": {
        "main": [[{ "node": "Set", "type": "main", "index": 0 }]]
      }
    }
  }
}
```

**Expect** parent run delivers Start items into child trigger → Set → terminal items return on parent `Run Child` output[0] (**documented** data path).

### Test: pin data override (editor)

**Given** pin data on the trigger:

```json
[{ "json": { "pinned": true } }]
```

**Expect** isolated/debug run of child uses pinned items on output[0] (**inferred** platform behavior; docs describe pin after loading prior execution).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Purpose + first node in sub-workflow | documented | Execute Sub-workflow Trigger docs |
| Parent → trigger → last node → parent path | documented | Shared with Execute Sub-workflow docs |
| Input data modes (fields / JSON example / accept all) | documented | Display labels and intent |
| Wire param names `inputSource`, `workflowInputs`, `jsonExample` | inferred | From public descriptor / export shapes; docs use labels not wire keys |
| Enum values `workflowInputs` \| `jsonExample` \| `passthrough` | inferred | Descriptor options |
| Default `inputSource=workflowInputs` | inferred | Descriptor default |
| Field types any/string/number/boolean/array/object | inferred | Descriptor options |
| `events` default `worklfow_call` spelling | inferred | Published default string (typo retained for wire compat) |
| maxNodes = 1 | inferred | Descriptor |
| typeVersion 1 vs 1.1 param surface | inferred | Descriptors + outdated notice on v1 |
| Exact type coercion / null for removed parent inputs | documented on **parent** node | Implement with executeWorkflow; trigger mostly passthrough |
| Empty schema pass-through all data | inferred | Descriptor description on `workflowInputs` |
| Isolated manual run payload without parent | inferred | Prefer `[{json:{}}]` or pin data |
| Call Workflow Tool as alternate caller | documented | Out of core node batch unless LangChain mapped |
| Workflow “can be called by” ACL | documented | Workflow settings, not node params |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/execute-workflow-trigger.ts`
- **Definition:** `src/lib/nodes/definitions/triggers.ts` (`executeWorkflowTrigger`)
- **Paired parent:** `n8n-nodes-base.executeWorkflow` → `src/lib/engine/executors/execute-workflow.ts` + runner `runSubWorkflow` / `subWorkflows`
- **SDK:** `defineNode` + native `ExecutionContext` only

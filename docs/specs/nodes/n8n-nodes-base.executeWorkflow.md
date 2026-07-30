---
type: n8n-nodes-base.executeWorkflow
displayName: Execute Sub-workflow
category: Transform
versions: [1, 1.1, 1.2, 1.3]
priority: high
status: specced
---

# Execute Sub-workflow

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger.md | Public docs only (paired child trigger + data path) |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.executeWorkflow`
- **Aliases:** `n8n`, `call`, `sub`, `workflow`, `sub-workflow`, `subworkflow`
- **Display name:** `Execute Sub-workflow` (docs title); default canvas node name `Execute Workflow`
- **Group / category:** `transform` · Core Nodes (subcategories: Helpers, Flow)
- **Versions:** `1`, `1.1`, `1.2`, `1.3` (`typeVersion`). v1.2+ is the current surface; v1/1.1 are outdated (node shows an upgrade notice).
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Subtitle:** `={{"Workflow: " + $parameter["workflowId"]}}` (**inferred** from descriptor; cosmetic canvas label)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | hidden | `call_workflow` | no | — | Internal operation marker. Only option `Execute a Sub-Workflow` = `call_workflow`. `noDataExpression`. Not user-facing. |
| outdatedVersionWarning | notice | `""` | no | `@version` lte `1.1` | UI-only upgrade notice. Not runtime logic. |
| source | options | `database` | no | v≤1.1: `@version` lte `1.1`; v≥1.2: `@version` gte `1.2` | Where to load the child workflow from. **v1.1 enum:** `database` / `localFile` / `parameter` / `url`. **v1.2+ enum:** `database` / `parameter` (label “Define Below”). Local File and URL sources were removed in v1.2. |
| workflowId | string | `""` | yes | `source=database`, `@version` = `1` | Free-text workflow ID (alphanumeric string at end of workflow URL). If an expression is used in “run once with all items” mode, the ID is evaluated from the **first input item** (**documented**). |
| workflowId | workflowSelector | `""` | yes | `source=database`, `@version` gte `1.1` | Account workflow picker (From list). Selects a saved workflow by ID. |
| workflowPath | string | `""` | yes | `source=localFile` | Path to local JSON workflow file (placeholder `/data/workflow.json`). v1.1 only. |
| workflowJson | json | `"\n\n\n"` | yes | `source=parameter` | Inline workflow JSON to execute. `typeOptions.rows: 10`. |
| workflowUrl | string | `""` | yes | `source=url` | URL to load the workflow from (placeholder `https://example.com/workflow.json`). v1.1 only. |
| workflowInputs | resourceMapper | `{ "mappingMode": "defineBelow", "value": null }` | yes | `source=database`, `@version` gte `1.2`, hide when `workflowId=""` | Maps parent data into the child’s declared input schema. Loaded via `loadSubWorkflowInputs` from the selected child. Supports type-conversion options. Hidden when the child trigger uses “Accept all data” (no input schema). `noDataExpression`. |
| mode | options | `once` | no | — | `once` = “Run once with all items” (all items into a single child run); `each` = “Run once for each item” (one child run per item). `noDataExpression`. |
| options | collection | `{}` | no | — | Container for optional settings. |
| options.waitForSubWorkflow | boolean | `true` | no | under `options` | “Wait for Sub-Workflow Completion”. `true` = parent waits for child terminal items before continuing; `false` = parent continues without waiting. |

### `workflowInputs` resourceMapper (v1.2+, `source=database`)

| field | notes |
|-------|-------|
| mappingMode | `defineBelow` (map parent fields onto child input schema). |
| value | Per-field mappings; unmapped child inputs receive `null` (**documented**). |
| Attempt to convert types | Optional coercion to the child input’s declared type (**documented**). |
| Schema source | Child `executeWorkflowTrigger` `workflowInputs` / `jsonExample`. No fields when child uses `passthrough` (“Accept all data”). |

### Version notes

- **typeVersion 1:** `workflowId` is a free-text string; `source` enum is the v1.1 set (database/localFile/parameter/url) on the outdated surface.
- **typeVersion 1.1:** `workflowId` becomes the account `workflowSelector`; full source enum (database/localFile/parameter/url).
- **typeVersion 1.2 / 1.3:** `source` reduced to `database` / `parameter` (Define Below); `workflowInputs` resourceMapper added for database-selected children; localFile/url removed.

## Runtime behavior

### Role

Calls a **sub-workflow** as a step of the parent flow, enabling modularization. Pairs with the child’s **Execute Sub-workflow Trigger** (`n8n-nodes-base.executeWorkflowTrigger`, titled “When Executed by Another Workflow”).

### Resolving the child workflow

| `source` | Resolution |
|----------|------------|
| `database` | Load saved workflow by `workflowId` (string v1, or picker v1.1+). |
| `parameter` | Parse inline `workflowJson` as a workflow definition. |
| `localFile` (v1.1) | Read `workflowPath` JSON from the n8n host filesystem. |
| `url` (v1.1) | Fetch `workflowUrl` and parse as workflow JSON. |

### Input

Consumes parent input items on `main`. Behavior depends on `mode`:

- `once`: all input items are passed into a **single** child execution.
- `each`: the node runs **once per input item**; each item seeds its own child run.

When `source=database` (v1.2+) and the child declares an input schema, parent data is mapped through `workflowInputs`; unmapped inputs become `null` and types may be coerced. If the child trigger is `passthrough`, all parent items pass through unchanged.

### Output

On output index `0` (`main`), emit the items returned by the **last node** of the child workflow (**documented** data path):

1. Parent `executeWorkflow` sends (mode-dependent) items into the child’s Execute Sub-workflow Trigger.
2. Child graph runs from that trigger.
3. Child’s terminal node items are returned to this node’s output.

When `mode=each`, outputs from each per-item child run are concatenated in item order. When `options.waitForSubWorkflow=false`, the parent does not wait for child terminal items (fire-and-forget); the node returns the **input items** without awaiting child terminal output. (Not fully documented; specified here as the non-wait contract.)

### Errors

| Condition | Behavior |
|-----------|----------|
| Child workflow not found / invalid ID | Throw (sub-workflow not found). **Inferred** message. |
| Child workflow contains errors | **Documented:** parent cannot trigger the sub-workflow. |
| `workflowJson` / `workflowPath` / `workflowUrl` payload is not a valid workflow | Throw on parse/load. **Inferred**. |
| Nested execution depth exceeded | Depth-limited nested runs; throw on limit. **Inferred** (platform guard). |
| `continueOnFail` | On child failure, item is passed through with error metadata when `continueOnFail` is on; else the run fails. **Inferred** shared executor behavior. |
| Workflow “This workflow can be called by” ACL | Platform ACL enforced outside this node (**documented** workflow settings). |

### Expressions

- `operation`, `source`, `mode`, and `workflowInputs` are `noDataExpression` — static config, not per-item expressions.
- `workflowId` (v1 string) **accepts expressions**; in `once` mode the expression is evaluated from the **first input item** (**documented**).
- `workflowJson`, `workflowPath`, `workflowUrl` accept expressions (**inferred**; string-typed parameters).

### Pairing with Execute Sub-workflow Trigger

| Parent (this node) | Child (`executeWorkflowTrigger`) |
|----------------------------|-------------------|
| Selects child (database/parameter/localFile/url) | Must be a saved workflow whose first node is the trigger |
| `mode` once vs each | Determines how many child runs / item batches the trigger receives |
| `workflowInputs` UI (database, v1.2+) | Populated from child `workflowInputs` / `jsonExample`; hidden when child is `passthrough` |
| `options.waitForSubWorkflow` | Parent waits for child terminal items to return |
| Output | Child last-node items |

## Acceptance tests

### Test: database source, run once with all items

**Given** parent input items:

```json
[
  { "json": { "userId": 1, "name": "Ada" } },
  { "json": { "userId": 2, "name": "Bob" } }
]
```

**Parameters:**

```json
{
  "source": "database",
  "workflowId": "child-wf-id",
  "mode": "once",
  "options": { "waitForSubWorkflow": true }
}
```

**Child** (passthrough trigger → Set greeting) returns terminal items:

```json
[
  { "json": { "greeting": "Hi Ada" } },
  { "json": { "greeting": "Hi Bob" } }
]
```

**Expect** output[0] = child terminal items (single child run received both input items).

### Test: run once for each item

**Given** parent input items:

```json
[
  { "json": { "userId": 1 } },
  { "json": { "userId": 2 } }
]
```

**Parameters:**

```json
{ "source": "database", "workflowId": "child-wf-id", "mode": "each" }
```

**Expect** two child runs (one per item); output[0] concatenates each child run’s terminal items in order.

### Test: parameter source (inline workflow JSON)

**Parameters:**

```json
{
  "source": "parameter",
  "workflowJson": "{ \"nodes\": [...], \"connections\": {} }",
  "mode": "once"
}
```

**Expect** the inline workflow is parsed and executed as the child; its terminal items return on output[0].

### Test: workflowInputs mapping with null fill

**Given** child declares input schema `[{ "name": "userId", "type": "number" }, { "name": "role", "type": "string" }]` and parent input:

```json
[{ "json": { "userId": 42 } }]
```

**Parameters** (v1.2+):

```json
{
  "source": "database",
  "workflowId": "child-wf-id",
  "workflowInputs": { "mappingMode": "defineBelow", "value": { "userId": { "value": "={{ $json.userId }}", "matchingColumns": [] } } },
  "mode": "once"
}
```

**Expect** child trigger receives `[{ "json": { "userId": 42, "role": null } }]` (unmapped `role` → `null`).

### Test: missing child workflow

**Parameters:**

```json
{ "source": "database", "workflowId": "does-not-exist", "mode": "once" }
```

**Expect** the node throws (sub-workflow not found); with `continueOnFail` on, the input item passes through with error metadata.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Purpose + modularization | documented | Execute Sub-workflow docs |
| Parent → trigger → last node → parent data path | documented | Shared with trigger docs |
| Source options (database/localFile/parameter/url) | documented | v1.1 surface |
| v1.2+ source reduced to database/parameter | inferred | Descriptor `displayOptions` on `source` |
| Wire param names `workflowId`, `workflowPath`, `workflowJson`, `workflowUrl`, `workflowInputs`, `mode` | inferred | From public descriptor / export shapes; docs use labels |
| `options.waitForSubWorkflow` (not `waitForCompletion`) | inferred | Descriptor option name |
| `mode` enum `once` / `each` | inferred | Descriptor options |
| `workflowId` expression evaluated from first item in `once` mode | documented | Parameter hint |
| Unmapped child inputs → `null` | documented | Workflow Inputs docs |
| Attempt to convert types | documented | Workflow Inputs docs |
| Inputs hidden when child is `passthrough` | documented | Workflow Inputs docs |
| Sub-workflow mustn’t contain errors | documented | Docs hint |
| “This workflow can be called by” ACL | documented | Workflow settings, not node params |
| Non-wait (`waitForSubWorkflow=false`) output shape | inferred | Not fully documented; spec contract = return input items without awaiting child terminal output |
| Nested depth limit | inferred | Platform guard; exact limit not documented |
| `continueOnFail` item passthrough on child error | inferred | Shared executor behavior |
| `workflowSelector` picker type (v1.1+) | inferred | Descriptor `type: workflowSelector` |
| Local File / URL fetch semantics | inferred | v1.1 only; host filesystem / HTTP fetch |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/execute-workflow.ts`
- **Definition:** `src/lib/nodes/definitions/transform.ts` (`executeWorkflow`)
- **Paired child:** `n8n-nodes-base.executeWorkflowTrigger` → `src/lib/engine/executors/execute-workflow-trigger.ts`
- **Runner hooks:** `subWorkflows` map + `runSubWorkflow` on `ExecutionContext` (resolve child, inject items, await terminal items)
- **SDK:** `defineNode` + native `ExecutionContext` only
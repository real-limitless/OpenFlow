---
type: n8n-nodes-base.executeWorkflow
displayName: Execute Sub-workflow
category: Actions
versions: [1]
priority: high
status: specced
---

# Execute Sub-workflow

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.executeWorkflow`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | notes |
|------|------|---------|-------|
| source | options | database | database / parameter (JSON) / file / URL (OpenFlow: database + parameter) |
| workflowId | string | | DB id or name |
| workflowJson | json | | Inline child when source=parameter |
| mode | options | once | once = all items; each = per item |
| options.waitForCompletion | boolean | true | Wait for child |

## Runtime behavior

Parent passes items into child start (Execute Sub-workflow Trigger or first trigger). Child terminal node items return to parent. Depth-limited nested runs.

## Acceptance tests

### Nested once

Parent Manual → Execute Workflow (child id) → child Set greeting → parent receives greeting items.

### Missing child

Throws Sub-workflow not found.

## OpenFlow mapping

- Executor: `src/lib/engine/executors/execute-workflow.ts`
- Runner: `subWorkflows` map + `runSubWorkflow` on context

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

## Wire format

- **Type string:** `n8n-nodes-base.manualTrigger`
- **Aliases:** `n8n-nodes-base.manualWorkflowTrigger`, `n8n-nodes-base.start` (seen in public exports / OpenFlow alias table)
- **Inputs:** none (trigger)
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| (none material) | notice | — | no | — | UI notice only; no runtime params documented |

## Runtime behavior

### Input

No upstream items. Starts the workflow when the user runs it manually (Execute).

### Output

Emits a single item on output 0. Documented purpose is to start a workflow without an automatic trigger; empty JSON item is the practical default (**inferred** from common public exports and trigger role).

### Errors

Docs: only one Manual Trigger allowed per workflow (editor constraint). Runtime: no network I/O.

### Expressions

N/A (no data parameters).

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

### Test: sole trigger

**Given** workflow with one Manual Trigger and one downstream NoOp

**Expect** workflow can start from Manual Trigger; second Manual Trigger is invalid at edit-time (**documented** constraint).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact start payload shape | inferred | Docs do not spell `{ json: {} }`; consistent with public export practice |
| Alias type strings | inferred | From public export aliases, not this page |
| Pin-data override | inferred | Engine may pin trigger output |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/manual-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

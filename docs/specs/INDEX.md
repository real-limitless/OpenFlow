# Spec index (core nodes)

Status: `missing` | `specced` | `partial` | `implemented`

| Type string | Display name | Status | Spec path |
|-------------|--------------|--------|-----------|
| `n8n-nodes-base.manualTrigger` | Manual Trigger | specced | [nodes/n8n-nodes-base.manualTrigger.md](./nodes/n8n-nodes-base.manualTrigger.md) |
| `n8n-nodes-base.webhook` | Webhook | specced | [nodes/n8n-nodes-base.webhook.md](./nodes/n8n-nodes-base.webhook.md) |
| `n8n-nodes-base.scheduleTrigger` | Schedule Trigger | specced | [nodes/n8n-nodes-base.scheduleTrigger.md](./nodes/n8n-nodes-base.scheduleTrigger.md) |
| `n8n-nodes-base.respondToWebhook` | Respond to Webhook | specced | [nodes/n8n-nodes-base.respondToWebhook.md](./nodes/n8n-nodes-base.respondToWebhook.md) |
| `n8n-nodes-base.httpRequest` | HTTP Request | specced | [nodes/n8n-nodes-base.httpRequest.md](./nodes/n8n-nodes-base.httpRequest.md) |
| `n8n-nodes-base.set` | Edit Fields (Set) | specced | [nodes/n8n-nodes-base.set.md](./nodes/n8n-nodes-base.set.md) |
| `n8n-nodes-base.code` | Code | specced | [nodes/n8n-nodes-base.code.md](./nodes/n8n-nodes-base.code.md) |
| `n8n-nodes-base.if` | IF | specced | [nodes/n8n-nodes-base.if.md](./nodes/n8n-nodes-base.if.md) |
| `n8n-nodes-base.switch` | Switch | specced | [nodes/n8n-nodes-base.switch.md](./nodes/n8n-nodes-base.switch.md) |
| `n8n-nodes-base.merge` | Merge | specced | [nodes/n8n-nodes-base.merge.md](./nodes/n8n-nodes-base.merge.md) |
| `n8n-nodes-base.wait` | Wait | specced | [nodes/n8n-nodes-base.wait.md](./nodes/n8n-nodes-base.wait.md) |
| `n8n-nodes-base.executeWorkflow` | Execute Workflow | specced | [nodes/n8n-nodes-base.executeWorkflow.md](./nodes/n8n-nodes-base.executeWorkflow.md) |
| `n8n-nodes-base.stopAndError` | Stop and Error | specced | [nodes/n8n-nodes-base.stopAndError.md](./nodes/n8n-nodes-base.stopAndError.md) |
| `n8n-nodes-base.noOp` | No Operation | specced | [nodes/n8n-nodes-base.noOp.md](./nodes/n8n-nodes-base.noOp.md) |
| `n8n-nodes-base.stickyNote` | Sticky Note | partial | — |
| `n8n-nodes-base.splitOut` | Split Out | specced | [nodes/n8n-nodes-base.splitOut.md](./nodes/n8n-nodes-base.splitOut.md) |
| `n8n-nodes-base.aggregate` | Aggregate | specced | [nodes/n8n-nodes-base.aggregate.md](./nodes/n8n-nodes-base.aggregate.md) |
| `n8n-nodes-base.filter` | Filter | specced | [nodes/n8n-nodes-base.filter.md](./nodes/n8n-nodes-base.filter.md) |
| `n8n-nodes-base.limit` | Limit | specced | [nodes/n8n-nodes-base.limit.md](./nodes/n8n-nodes-base.limit.md) |
| `n8n-nodes-base.removeDuplicates` | Remove Duplicates | specced | [nodes/n8n-nodes-base.removeDuplicates.md](./nodes/n8n-nodes-base.removeDuplicates.md) |
| `n8n-nodes-base.itemLists` | Item Lists | specced | [nodes/n8n-nodes-base.itemLists.md](./nodes/n8n-nodes-base.itemLists.md) |
| `n8n-nodes-base.dateTime` | Date & Time | specced | [nodes/n8n-nodes-base.dateTime.md](./nodes/n8n-nodes-base.dateTime.md) |
| `n8n-nodes-base.sort` | Sort | specced | [nodes/n8n-nodes-base.sort.md](./nodes/n8n-nodes-base.sort.md) |
| `n8n-nodes-base.renameKeys` | Rename Keys | specced | [nodes/n8n-nodes-base.renameKeys.md](./nodes/n8n-nodes-base.renameKeys.md) |
| `n8n-nodes-base.errorTrigger` | Error Trigger | specced | [nodes/n8n-nodes-base.errorTrigger.md](./nodes/n8n-nodes-base.errorTrigger.md) |
| `n8n-nodes-base.splitInBatches` | Split In Batches | specced | [nodes/n8n-nodes-base.splitInBatches.md](./nodes/n8n-nodes-base.splitInBatches.md) |

Builtins exist in-tree as native OpenFlow nodes. Formal per-node specs are
filled by the **openflow-node-spec** skill / Prompt 01. App/integration nodes
are out of scope for this index until core specs are complete.

**Catalog (ranked + dogfood):** [`CATALOG.md`](./CATALOG.md) · [`catalog.json`](./catalog.json)

## Batch log

| Date | Specs written | Source class |
|------|---------------|--------------|
| 2026-07-28 | manualTrigger, noOp, set, if, limit, filter, switch, httpRequest, webhook | Public docs only |
| 2026-07-28 | Phase 0 foundation (live registry, reload, factory scripts) | — |
| 2026-07-28 | Batch 01: executeWorkflow, stopAndError, wait, merge | Public docs only |
| 2026-07-28 | Batch 02: scheduleTrigger, respondToWebhook, code, splitInBatches | Public docs only |
| 2026-07-28 | Batch 03: splitOut, aggregate, removeDuplicates, itemLists | Public docs only |
| 2026-07-28 | Batch 04: dateTime, sort, renameKeys, errorTrigger | Public docs only |

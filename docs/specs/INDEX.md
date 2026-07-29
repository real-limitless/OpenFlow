# Spec index (core nodes)

Status: `missing` | `specced` | `partial` | `implemented`

| Type string | Display name | Status | Spec path |
|-------------|--------------|--------|-----------|
| `n8n-nodes-base.manualTrigger` | Manual Trigger | specced | [nodes/n8n-nodes-base.manualTrigger.md](./nodes/n8n-nodes-base.manualTrigger.md) |
| `n8n-nodes-base.webhook` | Webhook | specced | [nodes/n8n-nodes-base.webhook.md](./nodes/n8n-nodes-base.webhook.md) |
| `n8n-nodes-base.scheduleTrigger` | Schedule Trigger | partial | — |
| `n8n-nodes-base.respondToWebhook` | Respond to Webhook | partial | — |
| `n8n-nodes-base.httpRequest` | HTTP Request | specced | [nodes/n8n-nodes-base.httpRequest.md](./nodes/n8n-nodes-base.httpRequest.md) |
| `n8n-nodes-base.set` | Edit Fields (Set) | specced | [nodes/n8n-nodes-base.set.md](./nodes/n8n-nodes-base.set.md) |
| `n8n-nodes-base.code` | Code | partial | — |
| `n8n-nodes-base.if` | IF | specced | [nodes/n8n-nodes-base.if.md](./nodes/n8n-nodes-base.if.md) |
| `n8n-nodes-base.switch` | Switch | specced | [nodes/n8n-nodes-base.switch.md](./nodes/n8n-nodes-base.switch.md) |
| `n8n-nodes-base.merge` | Merge | partial | — |
| `n8n-nodes-base.wait` | Wait | partial | — |
| `n8n-nodes-base.noOp` | No Operation | specced | [nodes/n8n-nodes-base.noOp.md](./nodes/n8n-nodes-base.noOp.md) |
| `n8n-nodes-base.stickyNote` | Sticky Note | partial | — |
| `n8n-nodes-base.splitOut` | Split Out | partial | — |
| `n8n-nodes-base.aggregate` | Aggregate | partial | — |
| `n8n-nodes-base.filter` | Filter | specced | [nodes/n8n-nodes-base.filter.md](./nodes/n8n-nodes-base.filter.md) |
| `n8n-nodes-base.limit` | Limit | specced | [nodes/n8n-nodes-base.limit.md](./nodes/n8n-nodes-base.limit.md) |
| `n8n-nodes-base.removeDuplicates` | Remove Duplicates | partial | — |
| `n8n-nodes-base.itemLists` | Item Lists | partial | — |
| `n8n-nodes-base.dateTime` | Date & Time | partial | — |
| `n8n-nodes-base.splitInBatches` | Split In Batches | partial | — |
| `n8n-nodes-base.executeWorkflow` | Execute Workflow | partial | — |

Builtins exist in-tree as native OpenFlow nodes. Formal per-node specs are
filled by the **openflow-node-spec** skill / Prompt 01. App/integration nodes
are out of scope for this index until core specs are complete.

## Batch log

| Date | Specs written | Source class |
|------|---------------|--------------|
| 2026-07-28 | manualTrigger, noOp, set, if, limit, filter, switch, httpRequest, webhook | Public docs only |

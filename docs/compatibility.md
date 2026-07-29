# Compatibility matrix

OpenFlow is an independent, clean-room implementation of a workflow automation
editor. It targets the publicly documented workflow JSON format and expression
syntax so existing exports can be opened, edited, and saved without loss. It is
not affiliated with, endorsed by, or derived from any other project's source
code.

## Roadmap

| Level | Status | Scope |
| --- | --- | --- |
| Level 1 — MVP | **Done** | Import, edit, and export linear and branching workflows in the visual editor. |
| Level 2 — Engine | Planned | Execution: branches, merges, wait, binary data, webhooks, schedule, credentials. |
| Level 3 — Coverage | Planned | Top 50–100 integration nodes with parameter compatibility. |
| Level 4 — Platform | Planned | Public REST API subset and a community node SDK. |

## Workflow JSON fields

The following top-level and nested fields are read and preserved during
import/export:

| Field | Notes |
| --- | --- |
| `id`, `name`, `active`, `versionId`, `tags`, `meta` | Standard top-level workflow metadata. |
| `nodes[].id` | Unique node identifier. |
| `nodes[].name` | Human-readable node name (used as connection key). |
| `nodes[].type` | Node type string (e.g. `n8n-nodes-base.httpRequest`). |
| `nodes[].typeVersion` | Numeric version of the node type. |
| `nodes[].position` | `[x, y]` canvas coordinates. |
| `nodes[].parameters` | Node-specific parameter object. |
| `nodes[].credentials` | Credential references (preserved, not executed). |
| `nodes[].disabled` | Boolean disable flag. |
| `nodes[].notes` | Free-text note attached to the node. |
| `nodes[].webhookId` | Webhook identifier for trigger nodes. |
| `connections` | Per-source-node, per-channel (`main`, `ai_*`), per-output-index map of target connections. |
| `settings` | Workflow-level settings (timezone, error workflow, etc.). |
| `staticData` | Persistent data stored by the workflow. |
| `pinData` | Pinned item data for deterministic testing. |
| Items | Shaped as `{ json, binary? }` per the public spec. |

Non-modelled fields are preserved verbatim on export — nothing is silently
dropped.

### Connection structure

```jsonc
"connections": {
  "Node Name": {
    "main": [
      [
        { "node": "Target Name", "type": "main", "index": 0 }
      ]
    ]
  }
}
```

Non-main channels (e.g. `ai_agent`, `ai_tool`) are preserved and rendered in
the editor.

## Expression support

The in-editor expression evaluator supports the following helpers. This is a
**preview only** — full evaluation with item pairing and binary data runs in
the server engine planned for Level 2.

| Helper | Description |
| --- | --- |
| `$json` | Current item's JSON data. |
| `$json.fieldName` | A field on the current item. |
| `$input.all()` | All incoming items. |
| `$input.first()` | First incoming item. |
| `$input.last()` | Last incoming item. |
| `$("Node Name").first()` | First item output by another node. |
| `$("Node Name").all()` | All items output by another node. |
| `$itemIndex` | Index of the current item. |
| `$now` | Current date and time. |
| `$today` | Today at midnight. |
| `$execution.id` | Current execution id. |
| `$workflow.id` | Current workflow id. |
| `$vars` | Instance variables. |
| `$if(cond, a, b)` | Inline conditional. |
| `$isEmpty(value)` | True when value is empty. |

## Implemented nodes

| Display name | Type string | Category |
| --- | --- | --- |
| Manual Trigger | `n8n-nodes-base.manualTrigger` | Triggers |
| Webhook | `n8n-nodes-base.webhook` | Triggers |
| Schedule Trigger | `n8n-nodes-base.scheduleTrigger` | Triggers |
| Respond to Webhook | `n8n-nodes-base.respondToWebhook` | Triggers |
| HTTP Request | `n8n-nodes-base.httpRequest` | Core |
| Set | `n8n-nodes-base.set` | Core |
| Code | `n8n-nodes-base.code` | Core |
| If | `n8n-nodes-base.if` | Flow |
| Switch | `n8n-nodes-base.switch` | Flow |
| Merge | `n8n-nodes-base.merge` | Flow |
| Wait | `n8n-nodes-base.wait` | Flow |
| No Operation | `n8n-nodes-base.noOp` | Utility |
| Sticky Note | `n8n-nodes-base.stickyNote` | Utility |

**Type aliases** — these legacy type strings resolve to the same node:

| Alias | Resolves to |
| --- | --- |
| `n8n-nodes-base.manualWorkflowTrigger` | Manual Trigger |
| `n8n-nodes-base.start` | Manual Trigger |
| `n8n-nodes-base.function` | Code |
| `n8n-nodes-base.functionItem` | Code |

## Placeholder nodes

Any node type not in the table above is imported as a **placeholder**. The
placeholder behaviour:

- **Parameters are preserved** — the raw JSON parameter object is stored and
  re-exported unchanged.
- **Credentials are preserved** — credential references pass through.
- **Position is preserved** — canvas coordinates are kept.
- **Warning badge** — the node renders with a dashed-circle icon and a notice
  indicating it is not yet implemented.
- **Migration report** — the import migration report flags every placeholder
  node by type string.

Placeholder nodes do not execute. They exist solely to avoid data loss on
round-trip.

## Import/export compatibility

- **Import** reads the workflow JSON, resolves node types (including aliases),
  and builds the in-memory model. Unknown fields are kept in a passthrough
  bucket and written back on export.
- **Export** serialises the in-memory model back to the canonical JSON shape.
  The result is a valid workflow JSON file that can be re-imported without loss.
- **Round-trip guarantee** — for Level 1, any workflow that can be imported can
  be exported with its structure intact. Execution state is not part of the
  model yet.

## Clean-room constraints

OpenFlow follows a strict clean-room process. Full details are in
[`docs/clean-room.md`](./clean-room.md). Key rules:

1. No other project's source code is read, cloned, decompiled, or referenced.
2. Permitted sources: public docs, publicly shared workflow exports, observed
   behaviour of a public instance, third-party service API docs.
3. Every node records the public documentation URLs it was written from.
4. No third-party trademarks are used in the product name or branding.

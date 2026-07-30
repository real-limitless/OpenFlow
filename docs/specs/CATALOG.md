# OpenFlow node catalog (dogfood core)

Ranked from Everflow Top-200 Tier A/B methodology (usage / template ROI).  
**Runtime:** OpenFlow only. **Authoring:** OpenFlow Plugin SDK.  
Apps (Sheets/Slack/…) are out of scope until dogfood core is green.

Status legend:

| Field | Values |
|-------|--------|
| `executor` | `implemented` · `partial` · `stub` · `missing` · `ui-only` |
| `spec` | `specced` · `missing` · `n/a` |
| `dogfood` | needed for golden dogfood workflows |

## Dogfood P0 (build order)

| # | Type | Priority | executor | spec | dogfood | Notes |
|---|------|----------|----------|------|---------|-------|
| 1 | `n8n-nodes-base.executeWorkflow` | P0 | implemented | specced | yes | Batch 01 done |
| 2 | `n8n-nodes-base.manualTrigger` | P0 | implemented | specced | yes | |
| 3 | `n8n-nodes-base.webhook` | P0 | implemented | specced | yes | |
| 4 | `n8n-nodes-base.respondToWebhook` | P0 | implemented | missing | yes | Harden + spec |
| 5 | `n8n-nodes-base.httpRequest` | P0 | implemented | specced | yes | |
| 6 | `n8n-nodes-base.set` | P0 | implemented | specced | yes | SDK-aligned |
| 7 | `n8n-nodes-base.if` | P0 | implemented | specced | yes | |
| 8 | `n8n-nodes-base.switch` | P0 | implemented | specced | yes | |
| 9 | `n8n-nodes-base.merge` | P0 | implemented | specced | yes | Batch 01 |
| 10 | `n8n-nodes-base.wait` | P0 | implemented | specced | yes | Batch 01 |
| 11 | `n8n-nodes-base.noOp` | P0 | implemented | specced | yes | |
| 12 | `n8n-nodes-base.code` | P0 | implemented | specced | yes | Batch 02 |
| 13 | `n8n-nodes-base.scheduleTrigger` | P0 | implemented | specced | yes | Batch 02 |
| 14 | `n8n-nodes-base.filter` | P0 | implemented | specced | yes | |
| 15 | `n8n-nodes-base.limit` | P0 | implemented | specced | yes | |
| 16 | `n8n-nodes-base.splitInBatches` | P0 | implemented | specced | yes | Batch 02 |
| 17 | `n8n-nodes-base.splitOut` | P0 | implemented | specced | medium | Batch 03 |
| 18 | `n8n-nodes-base.aggregate` | P0 | implemented | specced | medium | Batch 03 |
| 19 | `n8n-nodes-base.removeDuplicates` | P0 | implemented | specced | medium | Batch 03 |
| 19b | `n8n-nodes-base.itemLists` | P1 | implemented | specced | medium | Batch 03 legacy |
| 20 | `n8n-nodes-base.stopAndError` | P0 | implemented | specced | yes | Batch 01 |
| 20b | `n8n-nodes-base.executeWorkflowTrigger` | P0 | implemented | n/a | yes | Sub-workflow entry |
| 21 | `n8n-nodes-base.stickyNote` | P0 | ui-only | n/a | no | Canvas only |

## Factory loop (OpenCode)

| Setting | Value |
|---------|--------|
| Batch size | **5** |
| Concurrency | **2** pipelines |
| SPEC | `xai/grok-4.5` |
| IMPLEMENT | `featherless/zai-org/GLM-5.2` |
| VALIDATE | `xai/grok-4.5` |
| On VAL fail | restart SPEC (max 3 cycles) → `partial` |

```bash
npm run factory:batch -- 05 --dry-run
npm run factory:batch -- 05
```

See `scripts/factory/README.md`.

## OpenCode batch plan

| Batch | Types (max 5) | Goal |
|-------|----------------|------|
| **00** | foundation | Live registry, reload, helpers |
| **01–04** | dogfood core | Done |
| **05** | summarize, compareDatasets, html, markdown, crypto | Core gaps (factory) |
| **06** | graphql, rssFeedRead, compression, xml, jwt | Files/HTTP utilities |

## Core extended (P1 — after dogfood WFs green)

| Type | Priority | executor | Notes |
|------|----------|----------|-------|
| `n8n-nodes-base.sort` | P1 | implemented | Batch 04 |
| `n8n-nodes-base.summarize` | P1 | missing | |
| `n8n-nodes-base.renameKeys` | P1 | implemented | Batch 04 |
| `n8n-nodes-base.itemLists` | P1 | implemented | Batch 03 |
| `n8n-nodes-base.dateTime` | P1 | implemented | Batch 04 |
| `n8n-nodes-base.errorTrigger` | P1 | implemented | Batch 04 |
| `n8n-nodes-base.executeWorkflowTrigger` | P1 | missing | pair with executeWorkflow |

## Already implemented (no batch required unless hardening)

manualTrigger, webhook, httpRequest, set, if, switch, noOp, filter, limit, code, merge, wait, respondToWebhook, split*, aggregate, removeDuplicates, itemLists, dateTime, scheduleTrigger (partial), executeWorkflow (**stub**).

## Golden dogfood (Phase 3)

| Workflow | Path |
|----------|------|
| WF1 HTTP branch | `workflows/dogfood/http-branch.json` |
| WF2 Webhook pipeline | `workflows/dogfood/webhook-pipeline.json` |
| WF3 Subflow | `workflows/dogfood/subflow-parent.json` + `subflow-child.json` |
| WF4 Transforms | `workflows/dogfood/transform-pipeline.json` |

```bash
npm run test:dogfood
```

See `docs/dogfood.md`.

## Hot-load (dev)

```bash
# List registered executors
curl -s http://localhost:3000/api/v1/dev/nodes | jq

# Re-import builtin executor modules into the live Map
curl -s -X POST http://localhost:3000/api/v1/dev/reload-nodes | jq
```

Requires `OPENFLOW_HOT_NODES=1` or `AUTH_DISABLED=true` / `NODE_ENV=development`.

## Machine-readable

See `catalog.json` for script consumption (`scripts/factory`).

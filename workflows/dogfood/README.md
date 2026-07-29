# Golden dogfood workflows

Importable OpenFlow workflow JSON used to prove core nodes after batches 01–04.

| File | ID | Proves |
|------|-----|--------|
| `http-branch.json` | WF1 | Manual → Code → IF → Set / NoOp |
| `webhook-pipeline.json` | WF2 | Webhook → Set → Limit → Respond to Webhook |
| `subflow-parent.json` + `subflow-child.json` | WF3 | Execute Workflow nesting |
| `transform-pipeline.json` | WF4 | Code → Sort → Rename Keys → Remove Duplicates → Aggregate |

## Run tests (offline)

```bash
npm run test:dogfood
```

## Import in the UI

1. Start OpenFlow (`npm run dev`)
2. Open a workflow → Import
3. Choose a file from this folder
4. Execute (for WF3, engine tests inject the child via `subWorkflows`; UI/API nested load by id is a follow-up)

## Live webhook (optional)

1. Import `webhook-pipeline.json` and activate
2. `curl -X POST http://localhost:3000/webhook/dogfood-hook -H 'content-type: application/json' -d '{"hello":true}'`

See `docs/dogfood.md` for full notes.

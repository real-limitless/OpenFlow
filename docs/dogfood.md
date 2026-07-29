# OpenFlow dogfood guide

Golden workflows under `workflows/dogfood/` prove the **dogfood core** after OpenCode batches 01–04: composition, webhooks, transforms, and nested workflows.

## What this proves

| Capability | Workflow |
|------------|----------|
| Branching + synthetic API data | WF1 `http-branch` |
| Webhook respond path | WF2 `webhook-pipeline` |
| Nested `executeWorkflow` | WF3 `subflow-*` |
| Sort / rename / dedupe / aggregate | WF4 `transform-pipeline` |

CI runs these **offline** (Code node fakes HTTP so no network is required).

## Commands

```bash
# Dogfood suite only
npm run test:dogfood

# Full test suite (includes dogfood)
npm test
```

## Import & run in the editor

1. `npm run dev` (with DB/Redis as needed)
2. Create or open a workflow → **Import**
3. Select e.g. `workflows/dogfood/http-branch.json`
4. Click **Execute**

### WF3 note

Engine tests pass the child definition via `RunOptions.subWorkflows`.  
Loading a child **by id from the database** in the live API is a later enhancement — for now import both parent and child, or rely on automated tests for nesting.

### WF2 live webhook (optional)

1. Import `webhook-pipeline.json`
2. Activate the workflow
3. ```bash
   curl -s -X POST "http://localhost:3000/webhook/dogfood-hook" \
     -H "content-type: application/json" \
     -d '{"event":"ping"}'
   ```

## Nodes exercised

Manual Trigger, Code, IF, Set, NoOp, Webhook, Limit, Respond to Webhook, Execute Workflow, Execute Workflow Trigger, Sort, Rename Keys, Remove Duplicates, Aggregate.

## Storage: browser vs database

The editor defaults to the **API/database**. Execution and sub-workflows always use Postgres.

If you previously used browser-only storage (`localStorage` key `openflow.workflows.v1`), the home page will offer **Sync to database**. That copies local ids into Postgres so Execute Workflow can find children.

| Store | Used for |
|-------|----------|
| Database (default) | List, save, execute, sub-workflows, webhook dropdown |
| localStorage | Only if `VITE_USE_LOCAL_STORAGE=true` (not recommended with API execute) |

## Related

- Catalog: `docs/specs/CATALOG.md`
- Factory batches: `scripts/factory/README.md`
- Clean-room: `docs/clean-room.md`

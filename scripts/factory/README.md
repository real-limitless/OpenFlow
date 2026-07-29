# OpenFlow node factory (OpenCode batches)

Phase 0 foundation for creating nodes with **OpenCode** in batches of **4**.

## Prerequisites

- Dev server with watch: `npm run dev` and/or `npm run dev:api`
- `AUTH_DISABLED=true` or `OPENFLOW_HOT_NODES=1` for reload endpoint
- OpenCode CLI available as `opencode`

## Batch loop

```text
1. Pick ≤4 types from docs/specs/catalog.json → batches.NN.types
2. OpenCode SPEC session   (public docs only)
3. OpenCode IMPLEMENT session (specs + SDK only)
4. Hot-load: tsx/vite watch + optional curl reload
5. npm run test:batch -- NN
6. Commit
```

## Commands

```bash
# Run foundation / batch tests
npm run test:batch -- 00
npm run test:batch -- 01   # after batch 01 exists

# List live executors (API up)
curl -s http://localhost:3000/api/v1/dev/nodes | jq

# Reload builtin executor modules into the live Map
curl -s -X POST http://localhost:3000/api/v1/dev/reload-nodes | jq
```

## OpenCode prompts

| File | Role |
|------|------|
| `prompts/spec-batch.md` | Clean-room half A — write `docs/specs/nodes/*.md` |
| `prompts/implement-batch.md` | Clean-room half B — SDK executors + tests |

Fill-in at top of each prompt:

```
BATCH=01
TYPES=n8n-nodes-base.executeWorkflow,n8n-nodes-base.stopAndError,...
```

## Rules

- Max **4** types per batch
- SPEC: no third-party engine source
- IMPLEMENT: no external product docs (spec is the contract)
- New executors: register via `registerExecutor` + add to `BUILTIN_EXECUTOR_MODULES` in `node-runtime.ts` and seed list in `executors/index.ts`
- New descriptions: `registerDescription` + definitions file + seed in `registry.ts`
- Tests: `src/lib/engine/__tests__/batches/batch-NN-<slug>.test.ts` using `helpers.ts`

## Catalog

- Human: `docs/specs/CATALOG.md`
- Machine: `docs/specs/catalog.json`

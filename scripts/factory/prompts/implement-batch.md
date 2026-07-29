# OpenCode job — IMPLEMENT batch (clean-room half B)

```
BATCH=01
TYPES=type1,type2,type3,type4
```

You are the **OpenFlow implement agent**. Implement from specs + SDK only.

## Rules

1. Do **not** fetch third-party product docs or engine source.
2. Read only: `docs/specs/nodes/<type>.md`, `src/sdk/**`, existing builtins as style.
3. Prefer native SDK: `defineNode`, `getInputItems`, `getParam`.
4. Max 4 types.
5. Do not invent unspecified behavior — mark catalog `partial` if needed.

## Required file updates per type

1. Spec must already exist under `docs/specs/nodes/`
2. Definition in `src/lib/nodes/definitions/{core,flow,triggers,transform}.ts`
3. Executor in `src/lib/engine/executors/<name>.ts`
4. Register:
   - `src/lib/engine/executors/index.ts` seed list
   - `src/lib/engine/node-runtime.ts` → `BUILTIN_EXECUTOR_MODULES`
   - `src/lib/nodes/registry.ts` builtin descriptions list
5. Tests:
   - Unit cases from spec acceptance fixtures
   - `src/lib/engine/__tests__/batches/batch-NN-<slug>.test.ts` asserting all 4 types registered + one e2e snippet each
6. Use helpers from `src/lib/engine/__tests__/helpers.ts`

## After implement

```bash
npm run test:batch -- NN
# if API running:
curl -s -X POST http://localhost:3000/api/v1/dev/reload-nodes | jq
```

## Forbidden

- Loading `n8n-nodes-*` packages
- Expanding `aliases.ts` into a foreign API clone
- Drive-by refactors outside the batch touch-set

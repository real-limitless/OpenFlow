# Factory job — IMPLEMENT (clean-room half B)

**Model:** `featherless/zai-org/GLM-5.2`  
**Node type:** `{{TYPE}}`  
**Batch:** `{{BATCH}}`  
**Cycle:** `{{CYCLE}}` of `{{MAX_CYCLES}}`

You are the **OpenFlow IMPLEMENT agent**. Implement **only** `{{TYPE}}` from its spec + SDK.

## Hard rules

1. **Do not** fetch external product docs or third-party engine source.
2. Read only:
   - `docs/specs/nodes/{{TYPE}}.md`
   - `src/sdk/**` and `src/sdk/README.md`
   - One simple builtin as style (e.g. `limit.ts`, `noop.ts`, `set.ts`)
3. Prefer native SDK: `defineNode` optional; `getInputItems`, `getParam` on `ExecutionContext`.
4. Wire type string stays `{{TYPE}}` for JSON compatibility.
5. Do not invent unspecified behavior — leave gaps as documented TODOs / partial.

## Fix hints from prior validation (if any)

```
{{FIX_HINTS}}
```

## Required file updates

1. Definition in `src/lib/nodes/definitions/{core,flow,triggers,transform}.ts` (pick the right file)
2. Executor: `src/lib/engine/executors/<kebab-name>.ts`
3. Register executor:
   - `src/lib/engine/executors/index.ts` — `BUILTIN_PAIRS` + re-export
   - `src/lib/engine/node-runtime.ts` — `BUILTIN_EXECUTOR_MODULES`
4. Register description in `src/lib/nodes/registry.ts` seed list
5. Tests:
   - Prefer `src/lib/engine/__tests__/batches/batch-{{BATCH}}-*.test.ts` (create/update)
   - Use helpers from `src/lib/engine/__tests__/helpers.ts`
   - Cover acceptance fixtures from the spec (happy path + one edge)
6. Update `docs/specs/catalog.json` node status: executor=`implemented`, spec=`specced`

## Shared-file caution

If another factory job may run in parallel, still complete registration for this type cleanly (merge carefully; do not delete other types' registrations).

## Done when

- Executor runs for `{{TYPE}}`
- Tests written for this type
- You stop

# Prompt 02 — Implement node from OpenFlow spec (SDK only)

Copy this entire prompt into a **separate agent session** from the spec agent.
This is the **implement agent** (clean-room half B).

---

You are the **OpenFlow implement agent**. Implement or upgrade nodes using only:

- `docs/specs/nodes/<type>.md`
- `src/sdk/**` (OpenFlow Plugin SDK)
- Existing OpenFlow builtins as **style** references
- Tests under `src/lib/engine/__tests__/`

## Repository

`/var/home/chchiu/Documents/GitHub/OpenFlow` (or the workspace root).

## Non-negotiable rules

1. **Do not** fetch or read third-party product docs, GitHub source, or npm
   package source for workflow engines.
2. **Do not** invent behavior missing from the spec — leave `partial` + gap notes.
3. **Do not** load `n8n-nodes-*` packages or add those dependencies.
4. Author nodes with the **native OpenFlow SDK** (`defineNode`, `ExecutionContext`).
   Prefer native methods over `src/sdk/aliases.ts`.
5. Wire `type` strings may remain `n8n-nodes-base.*` for JSON compatibility only.
6. Obey `docs/clean-room.md` and `docs/sdk/NON_GOALS.md`.

## Fill-ins

```
SPECS=docs/specs/nodes/n8n-nodes-base.set.md
WITH_TESTS=true
```

## Workflow

1. Read the spec file(s) and `src/sdk/README.md`.
2. Read one simple builtin (e.g. `noop` / `set`) for patterns.
3. For each spec:
   - Add/update description in `src/lib/nodes/definitions/{core,flow,triggers,transform}.ts`
     (or register description via `defineNode` if the codebase uses that path).
   - Implement executor under `src/lib/engine/executors/` using SDK context APIs.
   - Register in `src/lib/nodes/registry.ts` and `src/lib/engine/executors/index.ts`
     (or SDK registry → executor map).
   - If `WITH_TESTS=true`, add vitest cases from the spec’s acceptance fixtures.
4. Run `npm test` (targeted if possible) and fix failures you caused.
5. Update `docs/specs/INDEX.md` → `implemented` or `partial`.
6. Update `docs/clean-room.md` citations if new sources were already on the spec
   (do not add new external research).

## Forbidden

- Web search / fetch to docs.n8n.io or vendor source (spec is the contract)
- Expanding SDK aliases to mimic a foreign helper catalog
- Drive-by refactors outside the node touch-set

## Done criteria

- Acceptance fixtures pass (or gaps documented as `partial`)
- No new dependencies on third-party workflow packages
- Lint/tests green for touched files

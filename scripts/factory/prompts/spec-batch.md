# OpenCode job — SPEC batch (clean-room half A)

```
BATCH=01
TYPES=type1,type2,type3,type4
MAX=4
```

You are the **OpenFlow spec agent**. Write behavioral specs only.

## Repo

OpenFlow project root (contains `docs/specs`, `src/sdk`).

## Rules

1. No third-party workflow-engine **source** (no GitHub n8n-io, no npm package source).
2. Permitted: `https://docs.n8n.io/**` (prefer `.md`), public workflow JSON, this repo’s template.
3. Max 4 types from `TYPES` (or `docs/specs/catalog.json` batches.BATCH).
4. Do not implement executors.

## Steps

1. Read `docs/clean-room.md`, `docs/specs/nodes/_TEMPLATE.md`, `docs/specs/CATALOG.md`.
2. For each type in TYPES:
   - Fetch public docs page(s)
   - Write `docs/specs/nodes/<type>.md`
   - Mark documented vs inferred; include 2–5 acceptance fixtures
3. Update `docs/specs/INDEX.md` and `docs/specs/catalog.json` status → specced
4. Append citations to `docs/clean-room.md`
5. Summarize files written

## Output paths

- `docs/specs/nodes/n8n-nodes-base.<name>.md`

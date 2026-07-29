# Node behavioral specs

Per-node **clean-room specs** live under `docs/specs/nodes/`. They are the bridge
between public documentation and OpenFlow implementations.

## Pipeline

```
Public docs / public workflow JSON
        │
        ▼  (spec agent — Prompt 01 / openflow-node-spec skill)
docs/specs/nodes/<wire-type>.md
        │
        ▼  (implement agent — Prompt 02 / openflow-node-implement skill)
src/sdk + src/lib/nodes + src/lib/engine/executors
```

| Agent | May read | Must not read |
|-------|----------|----------------|
| Spec | `docs.n8n.io` (prefer `.md` URLs), public exports, this repo’s template/INDEX | Any third-party **source** repo or npm package source |
| Implement | This repo, especially `docs/specs/**` and `src/sdk/**` | Third-party source **and** external product docs (spec is enough) |

## Files

| Path | Role |
|------|------|
| `INDEX.md` | Catalog + status |
| `nodes/_TEMPLATE.md` | Required sections for every spec |
| `nodes/<type>.md` | One file per wire type (e.g. `n8n-nodes-base.set.md`) |

## Status values

| Status | Meaning |
|--------|---------|
| `missing` | No spec yet |
| `specced` | Spec written; not implemented (or not fully) |
| `partial` | Implemented with documented gaps |
| `implemented` | Meets acceptance fixtures in the spec |

## Rules

1. Cite only permitted sources (see `docs/clean-room.md`).
2. Paraphrase; do not paste large copyrighted doc bodies.
3. Mark uncertain behavior as `inferred` vs `documented`.
4. Acceptance tests must be concrete JSON fixtures the implementer can copy.
5. Map implementation to the **OpenFlow SDK** (`defineNode` / `ExecutionContext`).

---
name: openflow-node-spec
description: Write clean-room behavioral specs for OpenFlow core nodes from public documentation only. Use when the user asks to spec nodes, scan core nodes, create docs/specs, or run the spec half of the clean-room pipeline. Never implement executors in this skill.
---

# OpenFlow node spec (clean-room half A)

## Mission

Produce `docs/specs/nodes/<wire-type>.md` from **permitted public sources only**.

## Hard bans

- No third-party engine **source** (GitHub, npm package source, decompiled UI)
- No implementing executors (use `openflow-node-implement`)
- No instructions for loading third-party node packages

## Permitted sources

- `https://docs.n8n.io/**` (prefer `.md` URLs)
- Public workflow export JSON
- Public instance behavior
- Third-party **service** API docs

## Steps

1. Read `docs/clean-room.md`, `docs/specs/README.md`, `docs/specs/nodes/_TEMPLATE.md`, `docs/specs/INDEX.md`.
2. Default scope: **core nodes** from `https://docs.n8n.io/integrations/builtin/core-nodes.md`.
3. Respect user `NODES=` / `MAX_NODES=` if provided; else fill gaps in INDEX.
4. For each node: fetch public docs → write template sections → mark documented vs inferred → 2–5 acceptance fixtures.
5. Update INDEX status to `specced`.
6. Append rows to `docs/clean-room.md` Node citations.
7. Summarize batch and gaps.

## Full prompt

Mirror of the pasteable prompt: `docs/prompts/01-spec-from-public-docs.md`.

## Output quality

- Paraphrase; no large doc dumps
- Wire type exact
- OpenFlow mapping points at SDK (`defineNode`)

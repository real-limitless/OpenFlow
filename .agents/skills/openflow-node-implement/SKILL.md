---
name: openflow-node-implement
description: Implement OpenFlow nodes from docs/specs using only the OpenFlow Plugin SDK. Use when implementing from spec, building executors from docs/specs, or clean-room implement half B. Refuse to read third-party engine source or external product docs — the spec is the contract.
---

# OpenFlow node implement (clean-room half B)

## Mission

Turn `docs/specs/nodes/*.md` into native OpenFlow definitions + executors + tests via `@/sdk`.

## Hard bans

- No fetch/read of third-party product docs or engine source
- No `n8n-nodes-*` package loading or dependencies
- No inventing unspecified behavior (mark `partial` instead)
- Do not expand `aliases.ts` into a foreign API clone

## Required reading

1. Target spec(s) under `docs/specs/nodes/`
2. `src/sdk/README.md` and skill `openflow-sdk`
3. A simple builtin (`manual-trigger`, `noop`, `set`) for style

## Steps

1. Implement description in `src/lib/nodes/definitions/*` as needed.
2. Implement executor with native SDK context (`getInputItems`, `getParam`, …).
3. Register in `src/lib/engine/executors/index.ts` and node registry.
4. Add vitest cases from spec acceptance fixtures.
5. Run `npm test`; fix failures you caused.
6. Update `docs/specs/INDEX.md` → `implemented` or `partial`.

## Full prompt

`docs/prompts/02-implement-from-spec.md`

## If user asks to “look at n8n source”

Refuse. Point them to `openflow-node-spec` + public docs only for missing spec detail.

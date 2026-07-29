# Clean-room process

OpenFlow is an independent implementation of a workflow automation editor. It is
not affiliated with, endorsed by, or derived from any other project.

## Non-negotiable rules

1. **No source inspection.** Contributors must not clone, read, decompile, or
   reference another workflow automation project's source code — including node
   packages, execution engine internals, or frontend components.
2. **Permitted sources only:**
   - Public end-user and developer documentation.
   - Publicly shared workflow export JSON (templates, community shares, starter kits).
   - Observed runtime behaviour of a publicly reachable instance.
   - Public API documentation of third-party services (Slack, Google, Postgres, …).
3. **Cite your sources.** Every node description carries a `sources: string[]`
   array of the public URLs it was written from. Every significant architectural
   choice gets an ADR under `docs/adr/`.
4. **No trademarks.** Product name, logo, and copy must not use another
   project's marks. Compatibility may be described factually ("imports workflow
   JSON in the widely used public export format").
5. **Review gate.** Pull requests that add a node or engine behaviour must state
   which permitted source class each behaviour came from.

## Compatibility targets

The public interfaces we target are enumerated in the in-app compatibility page
(`/docs/compatibility`) and in `src/lib/workflow/types.ts`:

- Workflow JSON top-level and node-level fields.
- Connection map keyed by source node name, channel, and output index.
- Item shape `{ json, binary? }`.
- Expression syntax `{{ … }}` and the documented helper surface.
- The documented node property types and `displayOptions`.

## Decision log

| Date | Decision | Rationale |
| --- | --- | --- |
| Phase 1 | Workflow JSON is the single source of truth; React Flow nodes/edges are a derived view. | Guarantees lossless round-trip and keeps the engine UI-agnostic. |
| Phase 1 | Unsupported node types import as placeholders that preserve parameters. | Import success matters more than node count; nothing is silently dropped. |
| Phase 1 | Storage sits behind `WorkflowRepository`; Phase 1 implements it with browser storage. | Server persistence swaps in without touching the editor. |
| Phase 1 | Expression evaluation in the editor is preview-only and unsandboxed-but-inert. | Real evaluation belongs in the server engine with an isolated sandbox. |

## Node citations

Every node definition carries a `sources` array pointing exclusively at public
documentation. No n8n source code was consulted for any entry below.

| Phase | Node | Source | Source class |
| --- | --- | --- | --- |
| Phase 8 | Split Out (`n8n-nodes-base.splitOut`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout/ | Public docs only |
| Phase 8 | Aggregate (`n8n-nodes-base.aggregate`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/ | Public docs only |
| Phase 8 | Filter (`n8n-nodes-base.filter`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter/ | Public docs only |
| Phase 8 | Limit (`n8n-nodes-base.limit`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.limit/ | Public docs only |
| Phase 8 | Remove Duplicates (`n8n-nodes-base.removeDuplicates`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.remove-duplicates/ | Public docs only |
| Phase 8 | Item Lists (`n8n-nodes-base.itemLists`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.item-lists/ | Public docs only |
| Phase 8 | Date & Time (`n8n-nodes-base.dateTime`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.date-time/ | Public docs only |
| Phase 8 | Split in Batches (`n8n-nodes-base.splitInBatches`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/ | Public docs only |
| Phase 8 | Execute Workflow (`n8n-nodes-base.executeWorkflow`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/ | Public docs only |

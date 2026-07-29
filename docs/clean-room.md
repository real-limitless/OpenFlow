# Clean-room process

OpenFlow is an independent implementation of a workflow automation editor and
engine. It is not affiliated with, endorsed by, or derived from any other
project.

## Non-negotiable rules

1. **No source inspection.** Contributors must not clone, read, decompile, or
   reference another workflow automation project's source code — including node
   packages, execution engine internals, or frontend components.
2. **Permitted sources only:**
   - Public end-user and developer documentation.
   - Publicly shared workflow export JSON (templates, community shares, starter kits).
   - Observed runtime behaviour of a publicly reachable instance.
   - Public API documentation of third-party services (Slack, Google, Postgres, …).
   - OpenFlow specs under `docs/specs/` (for implementers).
3. **Cite your sources.** Every node description carries a `sources: string[]`
   array of the public URLs it was written from. Every significant architectural
   choice gets an ADR under `docs/adr/`.
4. **No trademarks.** Product name, logo, and copy must not use another
   project's marks. Compatibility may be described factually ("imports workflow
   JSON in the widely used public export format").
5. **Review gate.** Pull requests that add a node or engine behaviour must state
   which permitted source class each behaviour came from.
6. **SDK only.** New node executors are authored against the **OpenFlow Plugin
   SDK** (`src/sdk/`). See `docs/sdk/OVERVIEW.md` and `docs/sdk/NON_GOALS.md`.
7. **No third-party node packages.** Do not load or execute `n8n-nodes-*` (or
   similar) packages inside OpenFlow. Native reimplementations and future
   OpenFlow plugins only.

## Spec pipeline

| Role | Prompt / skill | Inputs | Outputs |
|------|----------------|--------|---------|
| Spec agent | `docs/prompts/01-spec-from-public-docs.md`, skill `openflow-node-spec` | Public docs | `docs/specs/nodes/*.md` |
| Implement agent | `docs/prompts/02-implement-from-spec.md`, skill `openflow-node-implement` | Specs + `src/sdk` | Definitions, executors, tests |

Implement agents must **not** fetch external product docs; the spec is the contract.

## Compatibility targets

The public interfaces we target are enumerated in the in-app compatibility page
(`/docs/compatibility`) and in `src/lib/workflow/types.ts`:

- Workflow JSON top-level and node-level fields.
- Connection map keyed by source node name, channel, and output index.
- Item shape `{ json, binary? }`.
- Expression syntax `{{ … }}` and the documented helper surface.
- The documented node property types and `displayOptions`.

Wire type strings (e.g. `n8n-nodes-base.httpRequest`) are **identifiers in the
export format**, not product branding.

## Decision log

| Date | Decision | Rationale |
| --- | --- | --- |
| Phase 1 | Workflow JSON is the single source of truth; React Flow nodes/edges are a derived view. | Guarantees lossless round-trip and keeps the engine UI-agnostic. |
| Phase 1 | Unsupported node types import as placeholders that preserve parameters. | Import success matters more than node count; nothing is silently dropped. |
| Phase 1 | Storage sits behind `WorkflowRepository`; Phase 1 implements it with browser storage. | Server persistence swaps in without touching the editor. |
| Phase 1 | Expression evaluation in the editor is preview-only and unsandboxed-but-inert. | Real evaluation belongs in the server engine with an isolated sandbox. |
| SDK | Extract in-tree OpenFlow Plugin SDK; builtins migrate onto it; AI implements via SDK. | Stable clean-room authoring surface; avoids ad-hoc executor APIs. |
| SDK | No loading of third-party node packages. | Keeps clean-room posture; user extensibility = OpenFlow plugins later. |

## Node citations

Every node definition carries a `sources` array pointing exclusively at public
documentation. No third-party source code was consulted for any entry below.

| Phase | Node | Source | Source class |
| --- | --- | --- | --- |
| Spec batch 1 | Manual Trigger (`n8n-nodes-base.manualTrigger`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.manualworkflowtrigger.md | Public docs only |
| Spec batch 1 | No Operation (`n8n-nodes-base.noOp`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.noop.md | Public docs only |
| Spec batch 1 | Edit Fields / Set (`n8n-nodes-base.set`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set.md | Public docs only |
| Spec batch 1 | IF (`n8n-nodes-base.if`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if.md | Public docs only |
| Spec batch 1 | Limit (`n8n-nodes-base.limit`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.limit.md | Public docs only |
| Spec batch 1 | Filter (`n8n-nodes-base.filter`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter.md | Public docs only |
| Spec batch 1 | Switch (`n8n-nodes-base.switch`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch.md | Public docs only |
| Spec batch 1 | HTTP Request (`n8n-nodes-base.httpRequest`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest.md | Public docs only |
| Spec batch 1 | Webhook (`n8n-nodes-base.webhook`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook.md | Public docs only |
| Phase 8 | Split Out (`n8n-nodes-base.splitOut`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout/ | Public docs only |
| Phase 8 | Aggregate (`n8n-nodes-base.aggregate`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/ | Public docs only |
| Phase 8 | Filter (`n8n-nodes-base.filter`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter/ | Public docs only |
| Phase 8 | Limit (`n8n-nodes-base.limit`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.limit/ | Public docs only |
| Phase 8 | Remove Duplicates (`n8n-nodes-base.removeDuplicates`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.remove-duplicates/ | Public docs only |
| Phase 8 | Item Lists (`n8n-nodes-base.itemLists`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.item-lists/ | Public docs only |
| Phase 8 | Date & Time (`n8n-nodes-base.dateTime`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.date-time/ | Public docs only |
| Phase 8 | Split in Batches (`n8n-nodes-base.splitInBatches`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/ | Public docs only |
| Phase 8 | Execute Workflow (`n8n-nodes-base.executeWorkflow`) | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/ | Public docs only |

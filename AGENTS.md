# OpenFlow — agent guide

Self-hosted workflow automation engine with a visual editor and clean-room node runtime. Workflow JSON may use public wire type strings (e.g. `n8n-nodes-base.httpRequest`) as **identifiers only** — that is not affiliation or package compatibility.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js ≥ 22 |
| UI | Vite + React (TanStack Router/Query) |
| API / worker | Hono under `src/server/**` |
| DB | Prisma + Postgres |
| Queue | Redis |
| Tests | Vitest |
| Ship | Docker Compose |

## Hard rules

1. **Clean-room** — Do not read, clone, vendor, or depend on third-party workflow-engine **source** (GitHub trees, npm package sources, minified bundles). Permitted: public docs, public workflow JSON, observed public-instance behavior, third-party **service** API docs, and this repo (`docs/specs/**`, `src/sdk/**`).
2. **No foreign node packages** — Never load or add `n8n-nodes-*` / `@n8n/*` runtime packages. Extensibility is OpenFlow plugins via `@/sdk` only.
3. **SDK native API** — Author nodes with `defineNode` + `ExecutionContext` (`getInputItems`, `getParam`, `evaluate`, `getCredential`, …). Prefer native methods over `src/sdk/aliases.ts`. Do not expand aliases into a foreign helper catalog.
4. **Spec is the contract (implement half)** — When implementing from `docs/specs/`, do not invent unspecified behavior; mark `partial` and note gaps. Do not re-fetch product docs during implement.
5. **Secrets** — Never commit `.env`, keys, tokens, or credential payloads. See `SECURITY.md`. Run `bash scripts/check-no-secrets.sh` when relevant.
6. **Scope** — No drive-by refactors outside the task touch-set. Do not claim “runs any n8n community node” or “n8n SDK compatible.”

Full policy: `docs/clean-room.md`, `docs/sdk/NON_GOALS.md`, `docs/sdk/OVERVIEW.md`.

## Skills (use when relevant)

| Skill | Use for |
| --- | --- |
| `openflow-sdk` | `src/sdk/**`, `defineNode`, registry, aliases |
| `openflow-node-spec` | Clean-room half A: public docs → `docs/specs/nodes/*.md` |
| `openflow-node-implement` | Clean-room half B: specs → executors + tests via SDK only |

Pasteable prompts: `docs/prompts/01-spec-from-public-docs.md`, `docs/prompts/02-implement-from-spec.md`.  
Factory batches: `scripts/factory/README.md`.

## Node pipeline

```
public docs / workflow JSON  →  docs/specs/nodes/<type>.md  →  defineNode + executor + vitest
       (half A / openflow-node-spec)              (half B / openflow-node-implement)
```

1. Spec from **permitted sources only**; cite sources; paraphrase (no doc dumps).
2. Implement against the spec + `@/sdk` + existing builtins for style.
3. Register definitions/executors; update `docs/specs/INDEX.md` (`specced` / `implemented` / `partial`).
4. Append citation rows when the process requires it (`docs/clean-room.md`).

Unknown imported types stay **placeholders** (no execute).

## Layout

```
src/sdk/                 Plugin SDK (only authoring surface for nodes)
src/lib/engine/          Runtime, executors, tests
src/lib/nodes/           Node definitions + registry
src/lib/expressions/     Expression evaluation
src/lib/workflow/        Graph / workflow types
src/server/              API, worker, routes, credentials
src/routes/              UI routes
docs/specs/              Per-node behavioral specs
docs/sdk/                SDK overview + non-goals
prisma/                  Schema + migrations
scripts/factory/         Spec/implement factory queue
```

## Commands

| Task | Command |
| --- | --- |
| Guided setup | `npm run tui` → Install wizard |
| One-shot setup | `npm run setup` |
| Dev (UI) | `npm run dev` |
| API / worker | `npm run dev:api` / `npm run dev:worker` |
| Docker stack | `npm run docker:up` or `docker compose up -d` |
| Generate executor register | `npm run generate:executors` |
| DB | `npm run db:migrate` / `db:deploy` / `db:generate` / `db:studio` |
| Test | `npm test` |
| Lint / types | `npm run lint` / `npm run typecheck` |
| Format | `npm run format` |
| Factory | `npm run factory:tui` / `factory:batch` / `factory:status` |

Health: `GET http://localhost:3000/health` (or `/health/ready`).

## Verify before done

After code changes, run what applies:

```sh
npm test
npm run lint
npm run typecheck
```

For a single node, prefer targeted vitest under `src/lib/engine/__tests__/` (or dogfood: `npm run test:dogfood`). Fix failures you caused.

## Do not

- Force-load third-party node packages or vendor foreign workflow runtimes
- Implement executors in the **spec** skill/session (and vice versa: no external product-doc research in **implement**)
- Commit secrets or rewrite history without explicit human request
- Expand marketing/UI copy to imply drop-in compatibility with another vendor’s node packages

## Read next

| Doc | When |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Human contribution checklist |
| [docs/onboarding.md](docs/onboarding.md) | First clone / TUI |
| [docs/sdk/OVERVIEW.md](docs/sdk/OVERVIEW.md) | Node authoring contract |
| [docs/sdk/NON_GOALS.md](docs/sdk/NON_GOALS.md) | Explicit out-of-scope |
| [docs/clean-room.md](docs/clean-room.md) | Process + citations |
| [docs/specs/README.md](docs/specs/README.md) | Spec format |
| [src/sdk/README.md](src/sdk/README.md) | SDK authoring guide |
| [SECURITY.md](SECURITY.md) | Secrets and reporting |
| [docs/dogfood.md](docs/dogfood.md) | End-to-end fixtures |

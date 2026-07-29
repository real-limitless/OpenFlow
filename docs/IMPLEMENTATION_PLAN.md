---
status: in-progress
phase: 3
updated: 2026-07-28
current: 3.1
---

# OpenFlow — Self-Hosted Continuation Plan (No Lovable Cloud)

**Goal:** Self-hosted n8n-style drop-in from Phase 1 editor MVP — own API/DB/engine, not Lovable Cloud.

**Layout:** Single app first (`src/server/**` + React-free `src/lib/workflow|nodes|expressions`). Monorepo later if needed.

---

## Agent protocol (mandatory)

| Role | Model | Job |
|------|--------|-----|
| **Orchestrator** | primary session | Pick `← CURRENT`, write brief spec, dispatch, **light-verify**, advance or halt |
| **Coder** | **`opencode/big-pickle`** | Implement **one** todo (or pre-declared small batch only) |
| **Verifier** | orchestrator (light pass) | After every coder return — no second heavy LLM unless needed |
| **Explore** | cheap (optional) | Read-only context before a hard todo |

### Loop (every todo)

```
1. Mark todo ← CURRENT / in_progress
2. Dispatch coder @ opencode/big-pickle with locked prompt
3. Wait for return
4. LIGHT VERIFY PASS (orchestrator)  ← always, after every Bigpickle call
5. Pass → mark [x], pick next
   Fail → one fix dispatch max, then HALT
   Break/no-response/timeout → HALT immediately, wait for user
```

### Light verify pass (after every Bigpickle call)

1. **Return sanity** — summary present; files touched listed; claims match todo scope
2. **Diff scope** — only expected paths; no drive-by refactors, no secrets, no n8n source
3. **Acceptance checklist** — todo’s written checks
4. **Commands** — run relevant lint / typecheck / targeted vitest when code changed
5. **Clean-room** — new nodes/executors update `docs/clean-room.md` when required

**Pass:** scope OK + acceptance met + checks green.  
**Fail:** one fix dispatch with verify notes → still fail → **HALT**.

### Halt rules (wait for user — do not continue)

HALT when any of:

| Condition | Action |
|-----------|--------|
| Coder errors, crashes, or tool-fails hard | Stop; paste error; wait |
| Coder no response / empty / truncated useless return | Stop; wait |
| Coder timeout or session disconnect | Stop; wait |
| Coder refuses or can’t access required tools/files | Stop; wait |
| Light verify fails twice (initial + one fix) | Stop; show report; wait |
| Coder touches out-of-scope critical files uncleanly | Stop; wait |
| Blocked on secret/user decision | Stop; wait |

While halted: **do not** start next todo, **do not** spawn more coders, **do not** guess-and-continue. Resume only after user replies.

**Default:** prefer halt over orchestrator implementing.

### Parallelism

Default **serial** (one Bigpickle coder at a time). Parallel only if user asks and todos share no files; any leg halt → halt all.

### Bigpickle coder prompt template

```
You are coder on OpenFlow. Implement exactly one todo.

TODO ID: <e.g. 1.5.1>
GOAL: <one sentence>
REPO: /var/home/chchiu/Documents/GitHub/OpenFlow
CONSTRAINTS:
- No Lovable Cloud
- No n8n source
- Single-app layout; keep src/lib/workflow|nodes|expressions React-free
- Do not start other todos
- Minimal diff

IN SCOPE FILES: <list>
OUT OF SCOPE: <list>
ACCEPTANCE:
- [ ] <check>

Return: (1) summary (2) files touched (3) commands you ran (4) residual risks
```

---

## Context & decisions

| Decision | Choice |
|----------|--------|
| Backend host | Self-hosted Node/Bun — **no Lovable Cloud** |
| API | Hono (or Fastify if Hono fights TanStack Start) |
| DB | Prisma + SQLite dev / Postgres prod |
| Code node | `isolated-vm` |
| Layout | Single app: `src/server/**` |
| Persist swap | Keep `WorkflowRepository`; add `ApiWorkflowRepository` |
| Implement | Bigpickle coder |
| QA | Light verify after every coder call |
| Failure | Halt + wait for user |

**Preserve:** editor, schema/graph, node defs, expressions, clean-room docs.

---

## Architecture (target)

```
Frontend (TanStack Start / React 19) → REST + SSE
Backend (Node/Bun): Hono API + Engine + Node registry
Prisma → SQLite (dev) / Postgres (prod)
BullMQ + Redis (Phase 7)
isolated-vm for Code node
```

**Dependency rules:** `workflow`, `nodes`, `expressions`, `engine` — zero React/DOM/Vite.

---

## Multi-phase todo list

### Phase 1 — Editor MVP [COMPLETE]

- [x] 1.1 Routes: list, editor, compatibility docs
- [x] 1.2 Workflow types/schema/graph/layout
- [x] 1.3 Node registry + 13 definitions + placeholders
- [x] 1.4 Zustand store, undo/redo, localStorage repo
- [x] 1.5 Canvas / palette / properties / pin data / import-export

### Phase 1.5 — Backend scaffold [COMPLETE]

- [ ] **1.5.1** ADR `docs/adr/001-self-hosted-no-lovable-cloud.md` ← CURRENT
- [ ] **1.5.2** Hono (or equivalent) API entry + `GET /health` under `src/server/`
- [ ] **1.5.3** Prisma schema: users, workflows, executions, credentials, api_keys, webhook_routes
- [ ] **1.5.4** SQLite migrate + seed path; `DATABASE_URL`
- [ ] **1.5.5** `docker-compose.yml` (api + optional postgres)
- [ ] **1.5.6** npm scripts: `dev:api`, `db:migrate`, `db:studio`; README self-host
- [ ] **1.5.7** ESLint `no-restricted-imports`: engine/lib no React; UI no Prisma
- [ ] **1.5.8** Vitest + fixtures: schema round-trip, graph mapping, evaluate smoke
- [ ] **1.5.9** Mirror compatibility notes → `docs/compatibility.md`
- [ ] **1.5.10** Gate: health + migrate + tests green

### Phase 2 — Persistence + auth basics [COMPLETE]

- [ ] **2.1** Workflow CRUD `/api/v1/workflows` using existing Zod parse
- [ ] **2.2** Preserve unknown JSON fields on save
- [ ] **2.3** `ApiWorkflowRepository` + `VITE_API_BASE_URL` (fallback localStorage)
- [ ] **2.4** Wire list + editor autosave to API when base URL set
- [ ] **2.5** Dev open mode `AUTH_DISABLED=true`
- [ ] **2.6** Minimal session or single-admin auth for non-dev
- [ ] **2.7** API key table + header auth for REST
- [ ] **2.8** localStorage → API bulk import button
- [ ] **2.9** Gate: CRUD round-trip from UI

### Phase 3 — Execution engine MVP [COMPLETE]

- [ ] **3.1** Engine: load workflow → adjacency → start nodes
- [ ] **3.2** Item model run loop + `runData` shape
- [ ] **3.3** Honor disabled, continueOnFail, retryOnFail, alwaysOutputData, executeOnce
- [ ] **3.4** Share expressions FE/BE; expand `$input` baseline
- [ ] **3.5** Executors: Manual Trigger, Set, NoOp
- [ ] **3.6** Executors: IF, HTTP Request
- [ ] **3.7** Code node via `isolated-vm` (timeout/memory; no host net default)
- [ ] **3.8** `POST /api/v1/workflows/:id/execute` + execution persistence
- [ ] **3.9** SSE or poll execution status
- [ ] **3.10** UI Execute + data panel prefers runData over pinData
- [ ] **3.11** Canvas node status rings from run
- [ ] **3.12** Engine unit tests (linear + IF branch)
- [ ] **3.13** Gate: Manual→Set→HTTP/Code→IF end-to-end

### Phase 4 — Triggers [COMPLETE]

- [ ] **4.1** Webhook executor + path registration
- [ ] **4.2** Public `/webhook/:path` (method-aware)
- [ ] **4.3** Respond to Webhook (hold/release)
- [ ] **4.4** `active` toggle + register/unregister
- [ ] **4.5** Schedule Trigger (cron or delayed jobs)
- [ ] **4.6** Execution modes: manual / webhook / trigger
- [ ] **4.7** Gate: activate workflow, hit webhook, see run in UI

### Phase 5 — Engine depth [COMPLETE]

- [ ] **5.1** Switch executor
- [ ] **5.2** Merge executor (documented pairing modes)
- [ ] **5.3** Wait pause/resume + persisted state
- [ ] **5.4** Binary ref storage (local fs first)
- [ ] **5.5** Expressions: `$now`, `$if`, `$jmespath`, allowlisted `$env`, `$execution`
- [ ] **5.6** Error surfacing in UI + execution error JSON
- [ ] **5.7** PairedItem provenance where required
- [ ] **5.8** Gate: medium imported core-node workflow runs

### Phase 6 — Credentials [COMPLETE]

- [ ] **6.1** Credentials CRUD (metadata only to client)
- [ ] **6.2** AES-256-GCM + `CREDENTIALS_KEY`
- [ ] **6.3** Engine secret resolve by id
- [ ] **6.4** HTTP Request auth via credentials
- [ ] **6.5** FE credential picker on nodes that need it
- [ ] **6.6** Gate: no secrets in client bundles or execution payloads

### Phase 7 — Queue mode [COMPLETE]

- [ ] **7.1** Redis + BullMQ
- [ ] **7.2** Worker process same engine
- [ ] **7.3** API enqueues; worker reports progress
- [ ] **7.4** Execution history UI polish
- [ ] **7.5** Gate: two concurrent runs stable

### Phase 8 — Node breadth [COMPLETE]

- [ ] **8.1** Defs: Split Out, Aggregate, Filter, Limit
- [ ] **8.2** Defs: Remove Duplicates, Item Lists, Date & Time
- [ ] **8.3** Defs: Loop/Split in Batches, Execute Workflow
- [ ] **8.4** clean-room citations per node
- [ ] **8.5–8.7** Matching executors for 8.1–8.3
- [ ] **8.8** Migration report hardening
- [ ] **8.9** Gate: imported workflows improve unsupported count

### Phase 9 — FE polish (no backend) [PENDING] ← NEXT

- [ ] **9.1** Add-node-on-edge `+`
- [ ] **9.2** AI channel handles/visuals (`ai_*`)
- [ ] **9.3** Palette fuzzy + recents
- [ ] **9.4** Expression autocomplete polish + hover docs
- [ ] **9.5** collection / fixedCollection UX
- [ ] **9.6** Undo/redo coalesce typing
- [ ] **9.7** Canvas a11y keyboard
- [ ] **9.8** Broader unit tests

### Phase 10 — Production baseline [PENDING]

- [ ] **10.1** Multi-user/roles if required
- [ ] **10.2** Tags, variables
- [ ] **10.3** Docker prod docs + backup
- [ ] **10.4** REST polish + OpenAPI
- [ ] **10.5** Strip Lovable hard deps when leaving platform
- [ ] **10.6** Gate: compose up → login → import → activate → webhook

### Phase 11+ — Community / AI [PENDING]

- [ ] **11.1** Node SDK docs
- [ ] **11.2** Sub-workflow UX
- [ ] **11.3** AI node executors (public APIs only)
- [ ] **11.4** Ongoing integrations

---

## Acceptance gates

| After | Must pass |
|-------|-----------|
| 1.5 | health, migrate, vitest |
| 2 | UI CRUD via API |
| 3 | Manual core chain + runData UI |
| 4 | Active webhook run |
| 5–6 | Medium workflow + safe creds |
| 7 | Concurrent queue runs |
| 10 | Compose production path |

---

## Clean-room (every Bigpickle prompt)

- No n8n source read/copy/reference
- Cite public docs in `docs/clean-room.md` for new nodes/executors
- No n8n trademarks in UI

---

## Explicit non-goals (near term)

- Lovable Cloud, Lovable Connectors, Worker-only runtime
- Loading binary n8n community node packages
- Full enterprise multi-project parity
- Claiming “n8n-compatible” as a trademark phrase in marketing

*This document supersedes the handoff’s “Blocked until Lovable Cloud” section.*

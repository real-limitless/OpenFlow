# ADR-001: Self-Hosted Backend

**Status:** Accepted  
**Date:** 2026-07-27

## Context

OpenFlow is a visual workflow editor with a runtime executor. Early iterations considered hosting the backend on a third-party editor/cloud platform (Workers-style edge runtimes and BaaS). That path was rejected because:

- We need full control over the runtime environment for `isolated-vm` code execution.
- Hosted edge/BaaS constraints on background processes, persistent state, and long-running tasks conflict with our execution model.
- A self-hosted backend lets us ship the single-app layout (`src/server/**`) without introducing cloud-specific bindings early.

We also decided not to reference or vendor any n8n source code (clean-room policy). All implementation decisions are based on public documentation only.

## Decision

We adopt the following stack and conventions:

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node/Bun (self-hosted) | Not edge Workers or third-party BaaS |
| HTTP framework | Hono | Fallback to Fastify if integration pain arises |
| ORM / DB | Prisma + SQLite (dev) / Postgres (prod) | |
| Code node sandbox | `isolated-vm` | |
| App layout | Single app first (`src/server/**`) | Monorepo split later if needed |
| Persistence interface | `WorkflowRepository` | Add `ApiWorkflowRepository` later |
| Execution protocol | Orchestrator dispatches coder (`opencode/big-pickle`); light verify after each call; halt on coder break / no-response and wait for user | |
| Source policy | Clean-room only — no n8n source; cite public docs | |
| Frontend toolchain | First-party Vite + TanStack Start + Nitro | No third-party editor platform packages |

## Consequences

**Positive:**

- Full control over the execution runtime and persistence layer.
- Single-app layout keeps the codebase simple for early development.
- `WorkflowRepository` interface allows swapping implementations without touching consumers.

**Negative:**

- Self-hosting means managing deployment and operations ourselves.
- Monorepo split may be required sooner if `src/server/**` grows significantly.

**Risks:**

- `isolated-vm` has known limitations around certain Node.js APIs; we may need polyfills or workarounds for specific code-node features.
- Hono is newer than Express/Fastify; community ecosystem is smaller, though growing rapidly.
- Prisma's SQLite adapter has a different feature set than the Postgres adapter; we must test both paths early.

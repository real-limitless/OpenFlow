# Workflow Assistant

Right-rail chat that builds, edits, and runs the open workflow via OpenFlow tools.

## Enable

On by default (`OPENFLOW_ASSISTANT_ENABLED` not `false`).

Copy env template and set a key:

```bash
cp .env.example .env
# edit OPENFLOW_ASSISTANT_API_KEY or OPENAI_API_KEY
```

`docker compose` loads `.env` and passes assistant variables into the `api` service
(see `docker-compose.yml`). Compose still overrides `DATABASE_URL` / `REDIS_URL` for
the internal network.

### Builtin backend (default)

OpenAI-compatible tool-calling loop inside OpenFlow:

```bash
export OPENFLOW_ASSISTANT_API_KEY=sk-...   # or OPENAI_API_KEY
export OPENFLOW_ASSISTANT_MODEL=gpt-4o-mini
# optional:
# export OPENFLOW_ASSISTANT_BASE_URL=https://api.openai.com/v1
# export OPENFLOW_ASSISTANT_BACKEND=builtin
```

### OpenCode backend

```bash
export OPENFLOW_ASSISTANT_BACKEND=opencode
# either point at a running server:
export OPENCODE_BASE_URL=http://127.0.0.1:4096
# or let OpenFlow spawn `opencode serve` from `.opencode/assistant`
export OPENCODE_BIN=opencode
export OPENCODE_PORT=4096
```

OpenCode project config lives in `.opencode/assistant/` with:

- primary agent `openflow-assistant`
- skill `openflow-workflow`
- host filesystem/bash denied

Set `OPENFLOW_MCP_URL` / `OPENFLOW_WORKFLOW_ID` when running OpenCode standalone against `/mcp/openflow`.

Third-party chatbots should use the public remote MCP at `/mcp` (OAuth 2.1). See **[docs/mcp.md](./mcp.md)**.

## APIs

| Path | Role |
|------|------|
| `GET /api/v1/workflows/:id/events` | SSE graph push (`workflow.updated`, `node.selected`) |
| `GET/DELETE /api/v1/workflows/:id/assistant/session` | Chat session |
| `POST /api/v1/workflows/:id/assistant/messages` | User message → SSE stream. Body: `{ message, workflow? }` — optional full graph snapshot (same idea as execute) so the agent sees unsaved canvas state |
| `GET/POST /mcp` | Remote MCP for third-party clients (OAuth or API key) |
| `GET/POST /mcp/openflow` | Compat MCP (optional `X-OpenFlow-Workflow-Id`) |
| `GET /api/v1/assistant/health` | Feature flags |

## Phase 2

Optional [microsandbox](https://microsandbox.dev) MCP on the same OpenCode instance for isolated shell/code — not required for canvas editing.

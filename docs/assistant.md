# Workflow Assistant

Right-rail chat that **builds, edits, and runs** the open workflow via OpenFlow MCP tools.
It is expected to complete multi-step requests end-to-end (discover nodes → wire graph including
AI sub-channels → bind credentials → execute → debug), not only describe a plan.

## Capability bar

Examples the assistant should handle without host shell access of its own:

- Clone a git repo (Git node), read a file (`executeCommand` cat), rewrite copy with
  OpenRouter/OpenAI chat model + Basic LLM Chain, Merge original+AI, Code → JSON diff.
- HTTP Request + transform (Code/Set/IF) with stored credentials.
- AI Agent clusters: model on `ai_languageModel-0`, tools on `ai_tool-0`.

### Prompts & agent config

| Piece | Path |
|-------|------|
| System prompt (builtin + OpenCode system inject) | `src/server/assistant/system-prompt.ts` |
| OpenCode primary / plan prompts | `.opencode/assistant/prompts/` |
| Recipes skill | `.opencode/assistant/skills/openflow-workflow/SKILL.md` |
| Assistant AGENTS | `.opencode/assistant/AGENTS.md` |

Keep system-prompt and the OpenCode skill aligned when changing behavior.

### Runtime notes the prompts encode

- **Schema is pull-based:** `list_node_types` / `suggest_nodes` discover types; **`get_node_type`** returns full `properties` + credentials. Schemas are not auto-injected.
- **`add_node` does not set parameters** (type/name/position only). Always **`update_node`** immediately after, using field names from `get_node_type`.
- **Definition of Done:** trigger present (default `manualTrigger`), path wired, required params filled, credentials bound, `get_workflow` audit, then execute.
- Canonical types: `openflow-node-base.*` / `openflow-node-langchain.*`.
- `chainLlm` output is `{ output }` only — use **Merge** (`combineByPosition`) before Code if you need upstream fields.
- Code node: `$input` / `$json` / `items` only (no `$('NodeName')`, no fs).
- Credentials: `list_credentials` → bind `{ id, name }`; never echo secrets.
- Default tool-loop budget: `OPENFLOW_ASSISTANT_MAX_STEPS` (default **48**).

Operator manual: [`.opencode/assistant/AGENTS.md`](../.opencode/assistant/AGENTS.md).

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

- primary agent `openflow-assistant` (see `.opencode/assistant/AGENTS.md`)
- skill `openflow-workflow` (clone→AI→JSON and other recipes)
- host filesystem/bash denied (work happens inside workflow nodes)

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

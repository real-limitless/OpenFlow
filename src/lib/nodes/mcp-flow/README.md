# mcp-flow gallery + workspace backends

OpenFlow consumes mcp-flow in two ways:

1. **Public catalog-data** (no user key) — search vendor MCP servers and drop an MCP Client Tool with a URL.
2. **Connected gateway** — a user pastes an mcp-flow **agent** API key (`mf_…`) in Settings. OpenFlow lists that workspace's backends via `mf_list_backends` and uses them as the MCP Client Tool catalog for AI Agents.

Do not call admin REST `GET /v1/backends` with an agent key. That route is `MCP_FLOW_ADMIN_TOKEN` only.

## Public gallery

Used by:

- `GET /api/v1/mcp-gallery?q=`
- `GET /api/v1/mcp-gallery/:id`
- Editor palette section **mcp-flow gallery**

**Source of truth:** mcp-flow `catalog-data` / Pages `catalog/index.json` (schema 1.2.0).

Env:

- `MCP_FLOW_CATALOG_DIR` local shards
- `MCP_FLOW_CATALOG_URL` remote directory (default `https://real-limitless.github.io/mcp-flow/catalog`)
- `MCP_FLOW_URL` + `MCP_FLOW_ADMIN_TOKEN` to search the live gateway catalog (instance-wide, not a user key)

## Connected backends (user API key)

Settings → **mcp-flow** stores a `mcpFlowApi` credential (`url` + `apiKey`). The key is never returned after save.

Authenticated routes:

- `GET/PUT/DELETE /api/v1/mcp-flow/connection`
- `GET /api/v1/mcp-flow/status`
- `GET /api/v1/mcp-flow/projects`
- `GET /api/v1/mcp-flow/backends`
- `GET /api/v1/mcp-flow/tools`

MCP Client Tool `source=mcpFlow` binds that credential, optionally a project, and a **Backends** multi-select. At runtime OpenFlow merges `tools/list` with `mf_list_tools` so `{slug}__{tool}` names are exposed even when they are missing from connector listings.

Wire the node to an AI Agent on the `ai_tool` channel.

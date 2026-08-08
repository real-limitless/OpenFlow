# OpenFlow remote MCP

Expose the same workflow tools as the editor assistant to **third-party MCP clients** (Claude, Cursor, ChatGPT, etc.) over a remote URL.

## Settings UI

In the OpenFlow app: **Settings → MCP**

- Enable/disable remote MCP (instance owner/admin)
- Copy MCP URL, OAuth metadata URLs, and a Cursor/Claude client snippet
- Tool list and scopes

Env kill-switch still wins: `OPENFLOW_MCP_ENABLED=false` forces MCP off and locks the UI toggle.

## Endpoint

| URL | Role |
|-----|------|
| `https://<host>/mcp` | Primary Streamable HTTP MCP (multi-workflow) |
| `https://<host>/mcp/openflow` | Legacy alias (optional `?workflowId=` / `X-OpenFlow-Workflow-Id`) |
| `/.well-known/oauth-authorization-server` | OAuth 2.1 AS metadata |
| `/.well-known/oauth-protected-resource` | Protected resource metadata |
| `/register` | Dynamic client registration (RFC 7591) |
| `/authorize` | Browser login + consent (PKCE) |
| `/token` | Token + refresh |

Set `OPENFLOW_PUBLIC_URL` to your public origin (no trailing slash) so metadata issuer URLs are correct behind a reverse proxy.

```bash
OPENFLOW_PUBLIC_URL="https://openflow.example.com"
OPENFLOW_MCP_ENABLED="true"   # default on
```

Disable with `OPENFLOW_MCP_ENABLED=false`.

## Auth

### OAuth 2.1 (recommended for chatbots)

1. Client discovers AS via `/.well-known/oauth-authorization-server`.
2. Client registers at `POST /register` (public client + PKCE).
3. User opens `/authorize`, signs in with OpenFlow email/password, allows scopes.
4. Client exchanges code at `POST /token` and calls `/mcp` with:

```http
Authorization: Bearer ofa_...
```

**Scopes**

| Scope | Tools |
|-------|--------|
| `openflow:read` | list/get workflows, catalog, credentials metadata, executions, open_workflow |
| `openflow:write` | create/edit graph, activate |
| `openflow:execute` | execute_workflow |

Default consent grants all three.

### API key (automation / local)

Create an API key in the OpenFlow UI (`of_…`), then:

```http
Authorization: Bearer of_...
# or
X-API-Key: of_...
```

API keys receive full scopes.

### Local dev

`AUTH_DISABLED=true` → MCP runs as user `local` without OAuth.

## Client setup examples

### Cursor / Claude Desktop (remote URL)

```json
{
  "mcpServers": {
    "openflow": {
      "url": "https://openflow.example.com/mcp"
    }
  }
}
```

Complete the browser OAuth prompt when the client connects.

### OpenCode (existing assistant path)

```bash
export OPENFLOW_MCP_URL="http://localhost:3000/mcp/openflow?workflowId=<id>"
export OPENFLOW_WORKFLOW_ID="<id>"
# plus API key header if auth is on
```

See `docs/assistant.md` and `.opencode/assistant/opencode.json`.

## Tools

| Tool | Description |
|------|-------------|
| `list_workflows` | Paginated workflow list |
| `create_workflow` | Empty workflow |
| `open_workflow` | Bind default workflow for the MCP session |
| `activate_workflow` | active true/false |
| `get_workflow` | Graph summary |
| `list_node_types` / `get_node_type` | Node catalog |
| `add_node` / `update_node` / `rename_node` / `delete_node` | Canvas edits |
| `connect_nodes` / `disconnect` | Wiring |
| `execute_workflow` / `get_execution` / `list_executions` | Runs |
| `list_credentials` | Ids/names/types only (no secrets) |
| `select_node` | Focus node in open editor UI |

Workflow-scoped tools accept optional `workflowId`, or use the session default from `open_workflow` / header.

## Security

- Prefer HTTPS in production.
- OAuth redirect URIs must be `https:`, `http://localhost`, or custom schemes.
- Access tokens are opaque (`ofa_…`); only hashes are stored.
- Never put secrets in chat; use stored credentials via `list_credentials` + `update_node`.

## Related

- Editor chat: `docs/assistant.md`
- Clean-room / SDK: `docs/sdk/OVERVIEW.md`

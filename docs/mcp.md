# OpenFlow remote MCP

Expose the same workflow tools as the editor assistant to **third-party MCP clients** (Claude, Cursor, ChatGPT, etc.) over a remote URL.

## Settings UI

In the OpenFlow app: **Settings → MCP**

- Enable/disable remote MCP (instance owner/admin)
- Copy MCP URL, OAuth metadata URLs, and a Cursor/Claude client snippet
- Tool list and scopes

Env kill-switch still wins: `OPENFLOW_MCP_ENABLED=false` forces MCP off and locks the UI toggle.

Apply DB migration after pull: `npm run db:deploy` (includes workflow grants tables).

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

## Access control (workflow grants)

External agents never see more than the **intersection** of:

1. What the OpenFlow user can access (project / share)
2. OAuth/API key **scopes** (`openflow:read|write|execute`)
3. **Per-workflow grants** (r / w / x) with optional expiry

| Credential | Prefix | Default |
|------------|--------|---------|
| API key | `of_…` | New keys: **restricted** (must grant workflows). Legacy keys: unrestricted until edited. |
| Temporary token | `oft_…` | Editor **Share with AI (MCP)** — one workflow + TTL |
| OAuth access | `ofa_…` | Workflows selected on consent screen |

**UI**

- **Settings → API keys** — scopes, restrict toggle, workflow grants, expiry  
- **Workflow editor → ⋯ → Share with AI (MCP)** — temporary token  
- **OAuth `/authorize`** — pick workflows after login  

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
| `list_credential_types` | Field schemas for create (`openflow:credentials`) |
| `create_credential` / `update_credential` / `delete_credential` | Manage stored credentials — **metadata only** in responses (`openflow:credentials`, opt-in) |
| `list_variables` | Project/instance vars; secret values redacted |
| `create_variable` / `update_variable` / `delete_variable` | Manage vars (`openflow:variables`, opt-in) |
| `select_node` | Focus node in open editor UI |

Workflow-scoped tools accept optional `workflowId`, or use the session default from `open_workflow` / header.

## Scopes

| Scope | Default on new API keys / temp MCP tokens | Purpose |
| --- | --- | --- |
| `openflow:read` | yes | List/read workflows, credentials **meta**, variables (redacted) |
| `openflow:write` | yes | Edit workflow graph |
| `openflow:execute` | yes | Run workflows |
| `openflow:credentials` | **no** (opt-in) | Create/update/delete credentials |
| `openflow:variables` | **no** (opt-in) | Create/update/delete variables |

Browser sessions and `AUTH_DISABLED` always include the opt-in scopes (human UI path). Restricted agents (API key / OAuth / temporary MCP) must enable them explicitly. The same scopes gate REST `POST/PUT/DELETE` on `/api/v1/credentials` and `/api/v1/variables` so agents cannot bypass MCP via HTTP.

## Security

- Prefer HTTPS in production.
- OAuth redirect URIs must be `https:`, `http://localhost`, or custom schemes.
- Access tokens are opaque (`ofa_…`); only hashes are stored.
- Never put secrets in chat. Prefer stored credentials via `list_credentials` + `update_node`. Agents with `openflow:credentials` may write secrets through tools; responses never return decrypted values.

## Related

- Editor chat: `docs/assistant.md`
- Clean-room / SDK: `docs/sdk/OVERVIEW.md`

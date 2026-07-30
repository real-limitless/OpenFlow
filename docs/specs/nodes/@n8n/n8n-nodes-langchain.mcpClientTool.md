---
type: "@n8n/n8n-nodes-langchain.mcpClientTool"
displayName: MCP Client Tool
category: AI
versions: [1, 1.1, 1.2, 1.4]
priority: high
status: specced
---

# MCP Client Tool

Cluster **sub-node** (tool): MCP (Model Context Protocol) client that connects to an external MCP server, discovers its tools, and exposes selected tools to an AI Agent (or other tool-consuming root) on the `ai_tool` channel. Distinct from the **MCP Client** core node (workflow steps) and from community `n8n-nodes-mcp.*` packages.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpclient.md | Public docs only (sibling MCP Client; transport/auth/timeout parallels) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger.md | Public docs only (related MCP Server Trigger) |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/httprequest.md | Public docs only (Bearer / header / OAuth2 generic auth) |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://modelcontextprotocol.io/introduction | Third-party protocol docs |
| https://modelcontextprotocol.io/specification/2024-11-05/server/tools | Third-party protocol docs (`tools/list`, `tools/call`) |
| Public workflow export JSON (n8n template gallery API) | Public workflow JSON |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.mcpClientTool`
- **Aliases:** (none for this type). Do **not** treat community `n8n-nodes-mcp.mcpClientTool` as the same node — different package, parameters, and credentials (**public JSON**).
- **typeVersion:** public templates use `1`, `1.1`, `1.2`, `1.4` (**public JSON**)
- **Inputs:** none on `main` (tool sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_tool` × 1 — connects **into** a root node’s tool input (typically AI Agent). Connection objects use `"type": "ai_tool"` (**public JSON**).
- **Credentials:** optional, driven by `authentication` (see below). Observed credential type keys: `httpHeaderAuth`, `httpBearerAuth` (**public JSON**). Docs also allow multiple-headers and OAuth2 via HTTP Request–style generic credentials (**documented**).

Cluster topology: this node is a **sub-node**. It does not emit `main` items; the parent agent discovers and invokes the MCP tools it exposes.

## Parameters

Wire names from **public workflow JSON**; UI labels and include-mode semantics from **public docs**. Marked **inferred** where docs describe behavior but the exact JSON key/enum was not seen in exports.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| sseEndpoint | string | — | when v1-style SSE URL is used and `endpointUrl` omitted | older exports / SSE-first UI | **SSE Endpoint** — MCP server SSE URL (**documented** + **public JSON** key `sseEndpoint`). Examples: `https://host/mcp/<path>/sse`, `http://localhost:5678/mcp/<uuid>`. Expressions allowed (**public JSON** `=` prefix). Prefer resolving `endpointUrl` when both present (**OpenFlow**: `endpointUrl` wins if non-empty). |
| endpointUrl | string | — | when not using legacy-only `sseEndpoint` | v1.1+ common | MCP server URL for streamable HTTP / unified endpoint field (**public JSON**). Sibling MCP Client docs label this **MCP Endpoint URL**. Expressions allowed. |
| serverTransport | options / string | SSE when only `sseEndpoint` is set; otherwise implementation default (**inferred**) | no | — | Observed value: `httpStreamable` (**public JSON**). Docs for this sub-node emphasize **SSE Endpoint**; sibling MCP Client documents an explicit **Server Transport** selector. OpenFlow should accept at least: `sse` / SSE (**inferred**), `httpStreamable` (**public JSON**). Unknown values → error. |
| authentication | options / string | none / omitted = connect without auth (**documented** “None”) | no | — | **Authentication**. Observed: `headerAuth`, `bearerAuth` (**public JSON**). Docs: bearer, generic header, multiple headers, OAuth2, or None. Inferred wire enums: `none` \| omitted, `bearerAuth`, `headerAuth`, `multipleHeadersAuth` (**inferred**), `oAuth2Api` / `oAuth2` (**inferred**). |
| include | options / string | `all` when omitted (**inferred** from docs default “All” + templates that omit the field and expose full server toolsets) | no | — | **Tools to Include** mode (**documented**). Observed: `selected` (**public JSON**). Documented modes → wire (**inferred**): `all` (All), `selected` (Selected), `allExcept` (All Except; alternate label “except” **gap** — accept `allExcept` as canonical, treat `except` as alias if seen). |
| includeTools | string[] / multiOptions | `[]` | when `include` is `selected` | show when Selected | Tool names to expose (**documented** + **public JSON**). Names match MCP server tool `name` values from `tools/list`. |
| excludeTools | string[] / multiOptions | `[]` | when `include` is `allExcept` | show when All Except | Tool names to hide; agent gets all other server tools (**documented**; wire key **inferred** as `excludeTools` — not yet seen in sampled public JSON). |
| options | collection | `{}` | no | — | Nested options. |
| options.timeout | number | sibling MCP Client documents timeout in ms; templates use e.g. `120000`, `600000` (**public JSON**). OpenFlow default when omitted: `60000` (**inferred** baseline) | no | — | Max wait for MCP connect / list / call in **milliseconds** (**public JSON** + sibling **Timeout** docs). |

### Credential binding by `authentication`

| authentication | credential type key (wire) | notes |
|----------------|----------------------------|-------|
| omitted / none | (none) | Connect without auth (**documented**) |
| `headerAuth` | `httpHeaderAuth` | Single header name + value (**public JSON** + HTTP Request credentials docs) |
| `bearerAuth` | `httpBearerAuth` | Bearer token → `Authorization: Bearer <token>` (**public JSON** + credentials docs) |
| multiple headers (**documented**) | **gap** / **inferred** `httpCustomAuth` or multi-header generic | Docs: name/value pairs for several headers. Exact credential type string not observed in sampled exports — implement against generic multi-header credential when OpenFlow has one; otherwise accept param and map headers if credential data is present. |
| OAuth2 (**documented**) | **inferred** `oAuth2Api` | HTTP Request OAuth2 generic credential (**documented**). Not observed on this type in sampled templates. |

## Runtime behavior

### Role

This node is **not** a main-pipeline executor. It supplies one or more **tool handles** to a connected agent root. Behavior is driven by (1) MCP session setup and tool discovery, and (2) per-invocation `tools/call` when the model selects a tool.

### OpenFlow implementer contract

Independent behavioral contract for `mcp-client-tool.ts` (paraphrased from public docs, public workflow JSON, and MCP protocol docs). **Do not** load third-party node packages.

1. **Resolve endpoint**
   - Evaluate `endpointUrl` if set (`ctx.evaluate` / expression string); else evaluate `sseEndpoint`.
   - Empty after evaluation → error (“MCP endpoint required” / equivalent).
2. **Resolve transport**
   - If `serverTransport === "httpStreamable"` → MCP Streamable HTTP client to `endpointUrl` (**public JSON**).
   - Else if URL/path looks like SSE or `sseEndpoint` was used / transport is SSE → SSE client (**documented** SSE Endpoint).
   - Else default: prefer `httpStreamable` when `endpointUrl` set without transport; SSE when only `sseEndpoint` (**inferred** OpenFlow baseline).
3. **Resolve auth headers / tokens** from `authentication` + credentials (table above). Apply on MCP HTTP/SSE requests.
4. **Connect** to the MCP server; respect `options.timeout` (ms) for connect and subsequent RPC.
5. **List tools** via MCP `tools/list` (paginate with `nextCursor` until exhausted per MCP spec) (**protocol docs**).
6. **Filter tools** by `include`:
   - `all` / omitted → expose every listed tool.
   - `selected` → only names in `includeTools` (case-sensitive match to MCP `name`; unknown names ignored or warn — **gap** → OpenFlow: skip missing, error if resulting set empty).
   - `allExcept` → all listed tools whose names are not in `excludeTools`.
7. **Register tool handles** on the `ai_tool` channel for the parent agent:
   - Each exposed tool: `name`, `description`, JSON Schema `inputSchema` from MCP list result (**protocol docs**).
   - Optional: prefix/disambiguate names when multiple MCP Client Tool nodes attach to one agent (**gap** → OpenFlow: use server tool name as-is; collision = last-registered wins or engine-defined merge).
8. **On agent tool invocation** (name + arguments object):
   - Send MCP `tools/call` with `params: { name, arguments }` (**protocol docs**).
   - Bound by `options.timeout`.
   - Map result `content` array to a string (or structured) observation for the agent:
     - Concatenate `type: "text"` parts’ `text` fields.
     - Non-text content (image/audio/resource): return a concise JSON/string summary unless binary passthrough exists (**gap**; sibling MCP Client has “Convert to Binary” — **not** documented on this Tool sub-node → leave as text/JSON summary).
   - If MCP returns `isError: true` or RPC error → surface as tool error / observation error string so the agent can recover (**protocol** + agent tool-loop pattern); do not crash the whole workflow unless no agent error channel exists.
9. **Lifecycle:** open connection lazily on first list/call or when the agent resolves tools; close when the parent execution ends (**inferred**). Reuse one session per node execution where possible.
10. **No `main` output.** Do not produce workflow items from this node alone.

### Input

- No main items.
- Configuration: endpoint, transport, auth, tool filter, timeout.
- Runtime calls arrive from the parent agent’s tool loop with tool name + arguments (often filled via `$fromAI()` on other tool types; for MCP tools, arguments come from the model according to `inputSchema`).

### Output

- Connection-level: `ai_tool` handle(s) into the agent.
- Invocation-level: tool observation text/structured content returned to the agent (not a main branch).

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing endpoint | Throw / fail tool registration |
| Auth required but credential missing | Throw |
| Connect / SSE / HTTP failure | Throw (or fail registration) |
| Timeout | Throw / tool error |
| `include: selected` and empty usable tool set | Error (**OpenFlow** baseline) |
| `tools/call` failure / MCP error result | Tool-level error observation; agent may continue (**inferred**) |
| `continueOnFail` | Not applicable as main-node semantics; parent agent owns workflow continue-on-fail |

### Expressions

- `sseEndpoint`, `endpointUrl`, and string fields inside `options` may be expression strings (`={{…}}` / leading `=`) (**public JSON**).
- Tool argument values are supplied at call time by the agent/model, not by static node parameters on this sub-node.

## Acceptance tests

### Test: expose all tools over SSE (legacy endpoint field)

**Given** no main input (sub-node). Mock MCP server at SSE URL lists tools `alpha`, `beta`.

**Parameters:**

```json
{
  "sseEndpoint": "https://mcp.example.test/sse"
}
```

**Expect**

- Connects with SSE transport and no auth.
- Registers tools `alpha` and `beta` on `ai_tool` with schemas from `tools/list`.
- Agent call `alpha` with `{ "q": "1" }` → MCP `tools/call` name `alpha` arguments `{ "q": "1" }`; observation is returned text content.

### Test: selected tools + header auth + timeout (v1.2 shape)

**Given** mock streamable HTTP MCP at `https://stitch.example/mcp` listing `create_project`, `get_project`, `list_projects`.

**Parameters:**

```json
{
  "include": "selected",
  "options": { "timeout": 600000 },
  "endpointUrl": "https://stitch.example/mcp",
  "includeTools": ["create_project"],
  "authentication": "headerAuth"
}
```

**Credentials:** `httpHeaderAuth` with header name/value pair.

**Expect**

- Only `create_project` registered.
- Requests include the configured header.
- Timeout budget is 600000 ms.

### Test: allExcept filter

**Given** server tools `a`, `b`, `c`.

**Parameters:**

```json
{
  "endpointUrl": "https://mcp.example.test/mcp",
  "serverTransport": "httpStreamable",
  "include": "allExcept",
  "excludeTools": ["b"]
}
```

**Expect** registered tools: `a`, `c` only.

### Test: bearer auth

**Parameters:**

```json
{
  "endpointUrl": "http://n8n-mcp:3000/mcp",
  "authentication": "bearerAuth",
  "options": {}
}
```

**Credentials:** `httpBearerAuth` with token `secret-token`.

**Expect** MCP HTTP requests send `Authorization: Bearer secret-token`.

### Test: tool call error surfaces to agent

**Given** registered tool `fail_me`; MCP `tools/call` returns error / `isError`.

**Expect** agent receives an error observation (string or structured); node does not emit main items; workflow fails only if the agent/root treats tool failure as fatal.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string + `ai_tool` topology | documented + public JSON | High confidence |
| `sseEndpoint` vs `endpointUrl` | public JSON + docs labels | Docs page still says “SSE Endpoint”; newer templates prefer `endpointUrl` + optional `serverTransport` |
| `serverTransport` enum completeness | partial | Only `httpStreamable` observed; SSE implied by docs/field name |
| `include` enum wire values | mixed | `selected` observed; `all` / `allExcept` inferred from docs |
| `excludeTools` key name | inferred | Docs describe exclude list; key not in sampled JSON |
| Multiple-headers + OAuth2 credential keys | documented UI / inferred wire | Not in sampled mcpClientTool exports |
| Default timeout | inferred | Sibling node documents Timeout; numeric default not stated for Tool node |
| Binary / image tool results | gap | Sibling MCP Client has convert-to-binary; Tool sub-node docs omit it |
| Session reuse, retries, pagination limits | inferred from MCP spec | Reasonable OpenFlow baselines above |
| Name collisions across multiple MCP Client Tool nodes | gap | OpenFlow policy stated in contract |
| Community `n8n-nodes-mcp.mcpClientTool` | out of scope | Different type string — do not implement as this node |
| Catalog may mark executor “implemented” | process | This file is the clean-room **spec** contract; implement only via SDK against this doc |

## OpenFlow mapping

- **Definition group:** `ai` (cluster / langchain tool sub-nodes)
- **Executor file:** `src/lib/engine/executors/mcp-client-tool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; tool registration via engine AI-tool handles (same pattern as other `ai_tool` sub-nodes). No third-party `n8n-nodes-*` packages. MCP client protocol may use a small in-tree or well-licensed MCP client library, not n8n packages.

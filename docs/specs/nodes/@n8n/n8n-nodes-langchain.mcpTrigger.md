---
type: "@n8n/n8n-nodes-langchain.mcpTrigger"
displayName: MCP Server Trigger
category: Triggers
versions: [1, 1.1, 1.2]
priority: high
status: specced
---

# MCP Server Trigger

Trigger node that exposes the workflow **as an MCP server**. External MCP clients (AI agents, Claude Desktop, IDE extensions, etc.) connect to the server endpoint, discover tools via `tools/list`, and invoke them via `tools/call`. Each `tools/call` fires the workflow; the workflow's output is returned to the client as the MCP tool result. This is the inverse of the **MCP Client Tool** sub-node (`@n8n/n8n-nodes-langchain.mcpClientTool`), which connects n8n to an external MCP server as a client.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp.md | Public docs only (sibling MCP Client Tool; transport/auth/timeout parallels) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpclient.md | Public docs only (sibling MCP Client; transport/auth parallels) |
| https://modelcontextprotocol.io/specification/2024-11-05/server/tools | Third-party protocol docs (`tools/list`, `tools/call` result shape) |
| https://modelcontextprotocol.io/specification/2024-11-05/basic/transports | Third-party protocol docs (Streamable HTTP, SSE) |
| Sibling spec `@n8n/n8n-nodes-langchain.mcpClientTool.md` (in-repo) | In-repo sibling spec (parameter/transport/auth parallels) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.mcpTrigger`
- **Aliases:** (none for this type).
- **typeVersion:** public templates use `1`, `1.1`, `1.2` (**inferred** from sibling langchain trigger version cadence).
- **Inputs:** none on `main` (trigger node) (**inferred** from trigger topology).
- **Outputs:** `main` × 1 — one item per incoming `tools/call` (**inferred**).
- **Credentials:** optional, driven by `authentication`. Credential type keys: `httpBearerAuth`, `httpHeaderAuth` (**inferred** from sibling MCP Client Tool).

## Parameters

Wire names **inferred** from sibling MCP Client Tool spec + MCP protocol + n8n trigger conventions (webhook/chat trigger patterns). The spec agent for this node failed (transient model error); this spec is written by the implement agent from the in-repo sibling spec + MCP protocol, with all fields marked **inferred**.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| path | string | — | yes | — | **Server Path** — URL path segment the MCP server listens on, appended to the instance base URL (**inferred** from webhook `path` pattern). Example: `my-mcp-server`. |
| tools | fixedCollection | `{}` | yes | — | **Tools** — one or more tool definitions the server exposes. Each tool has `name` (string, required), `description` (string), and `schema` (json — JSON Schema for the tool's input arguments) (**inferred** from MCP `tools/list` result shape). |
| authentication | options / string | `none` | no | — | **Authentication**. Inferred wire enums: `none` \| omitted, `bearerAuth`, `headerAuth` (**inferred** from sibling MCP Client Tool). |
| options | collection | `{}` | no | — | Nested options. |
| options.timeout | number | `60000` (**inferred** baseline from sibling) | no | — | Max wait for MCP connect / call in **milliseconds** (**inferred** from sibling MCP Client Tool). |

### Credential binding by `authentication`

| authentication | credential type key (wire) | notes |
|----------------|----------------------------|-------|
| omitted / none | (none) | Connect without auth (**inferred**) |
| `bearerAuth` | `httpBearerAuth` | Bearer token → `Authorization: Bearer <token>` (**inferred** from sibling) |
| `headerAuth` | `httpHeaderAuth` | Single header name + value (**inferred** from sibling) |

## Runtime behavior

### Role

This node is a **trigger**. It starts the workflow when an MCP client calls a tool. The host (OpenFlow server) handles the MCP JSON-RPC protocol (Streamable HTTP / SSE transport, `initialize`, `tools/list`, `tools/call`); the executor maps incoming `tools/call` requests to output items.

### OpenFlow implementer contract

Independent behavioral contract for `mcp-trigger.ts` (paraphrased from public docs, MCP protocol docs, and the in-repo sibling MCP Client Tool spec). **Do not** load third-party node packages.

1. **Host receives MCP JSON-RPC requests** at the configured `path`.
   - `initialize` → host responds with MCP server capabilities (host-level; executor not involved).
   - `tools/list` → host responds with the trigger's configured tool definitions (from `tools` parameter). The executor exports a `getMcpTriggerTools` helper for this. No workflow execution.
   - `tools/call` → host feeds the request as input items; the trigger fires; the workflow runs; the host shapes the workflow output as the MCP `tools/call` result.

2. **Input contract (host → executor):** each input item's `json` carries the parsed MCP `tools/call` request:
   - `method`: `"tools/call"` (string)
   - `params`: `{ name: string, arguments: Record<string, unknown> }` (MCP protocol)

3. **Executor maps the tool call to an output item:**
   - `toolName`: from `params.name` (or top-level `name` fallback)
   - `arguments`: from `params.arguments` (or top-level `arguments` fallback), default `{}`
   - `method`: from `method`, default `"tools/call"`

4. **Tool validation:** if the called tool name is not in the configured `tools` list, the executor throws ("MCP Trigger: unknown tool '<name>'") unless `continueOnFail` is set (**OpenFlow** baseline).

5. **Response shaping:** the host takes the workflow's final output items and shapes them as an MCP `tools/call` result. The executor exports a `shapeMcpToolResult` helper:
   - If the output item's `json` has a `content` array (MCP content shape), pass it through.
   - Else if `json` has an `output` or `text` field, wrap as `[{ type: "text", text: <value> }]`.
   - Else serialize `json` as text content.
   - `isError`: `true` if `json.error` or `json.isError` is set.

6. **No `main` input.** The trigger has no upstream nodes.

### Input

- No main items (trigger).
- Configuration: server path, tool definitions, authentication, timeout.
- Runtime calls arrive from the host as MCP `tools/call` requests.

### Output

- One `main` item per `tools/call` whose `json` contains `toolName`, `arguments`, and `method`.
- Empty input → single empty item (trigger baseline).

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `path` | Host-level validation (executor does not validate path) |
| Unknown tool name in `tools/call` | Throw (or error item if `continueOnFail`) |
| Missing tool name in request | Throw |
| `continueOnFail` | Emit error item `{ json: { error: <message> } }` instead of throwing |

### Expressions

- `path` may be an expression string (`={{…}}` / leading `=`) (**inferred** from webhook pattern).
- Tool `description` and `schema` fields may be expression strings (**inferred**).

## Acceptance tests

### Test: tools/call maps to output item

**Given** no main input (trigger). Host feeds a `tools/call` request for tool `greet`.

**Input items:**

```json
[{ "json": { "method": "tools/call", "params": { "name": "greet", "arguments": { "name": "World" } } } }]
```

**Parameters:**

```json
{
  "path": "my-mcp",
  "tools": { "values": [{ "name": "greet", "description": "Greet someone", "schema": "{\"type\":\"object\"}" }] }
}
```

**Expect** output[0]:

```json
[{ "json": { "toolName": "greet", "arguments": { "name": "World" }, "method": "tools/call" } }]
```

### Test: getMcpTriggerTools returns configured tools

**Parameters:**

```json
{
  "path": "my-mcp",
  "tools": { "values": [
    { "name": "alpha", "description": "Alpha tool", "schema": "{\"type\":\"object\"}" },
    { "name": "beta", "description": "", "schema": "" }
  ] }
}
```

**Expect** `getMcpTriggerTools(params)` returns:

```json
[
  { "name": "alpha", "description": "Alpha tool", "inputSchema": { "type": "object" } },
  { "name": "beta", "description": "", "inputSchema": undefined }
]
```

### Test: unknown tool name throws

**Input items:**

```json
[{ "json": { "method": "tools/call", "params": { "name": "nope", "arguments": {} } } }]
```

**Parameters:** (tools list does not include `nope`)

**Expect** throws with "unknown tool".

### Test: shapeMcpToolResult wraps plain JSON as text content

**Given** workflow output item `{ json: { result: 42 } }`.

**Expect** `shapeMcpToolResult(items)` returns:

```json
{ "content": [{ "type": "text", "text": "{\"result\":42}" }], "isError": false }
```

### Test: empty input emits single empty item

**Given** no input items.

**Expect** output[0] = `[{ json: {} }]`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string + trigger topology | inferred | Spec agent failed (502); derived from sibling spec + MCP protocol |
| `path` parameter | inferred | From webhook trigger pattern |
| `tools` fixedCollection shape | inferred | From MCP `tools/list` result + n8n fixedCollection convention |
| `schema` field name (JSON Schema) | inferred | May be `inputSchema` in actual wire format |
| `authentication` enum | inferred | From sibling MCP Client Tool |
| `options.timeout` default | inferred | From sibling baseline 60000ms |
| Host-level MCP protocol handling | inferred | Executor only maps tool calls; host handles JSON-RPC/SSE/HTTP |
| Response shaping (`shapeMcpToolResult`) | inferred | OpenFlow baseline; host may override |
| typeVersion values | inferred | From sibling langchain trigger version cadence |
| Community `n8n-nodes-mcp.*` packages | out of scope | Different package — do not implement as this node |
| Catalog may mark executor "implemented" | process | This file is the clean-room **spec** contract; implement only via SDK against this doc |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/mcp-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only. No third-party `n8n-nodes-*` packages. The host handles MCP JSON-RPC protocol; the executor maps tool calls to output items and exports helpers for tool listing + result shaping.
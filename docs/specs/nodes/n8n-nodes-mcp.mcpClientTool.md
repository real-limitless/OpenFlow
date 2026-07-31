---
type: n8n-nodes-mcp.mcpClientTool
displayName: MCP Client
category: AI
versions: [1]
priority: medium
status: specced
---

# MCP Client (community)

Standalone MCP (Model Context Protocol) client node that connects to an external MCP server and performs operations: list tools, execute tools, list resources, read resources, list prompts, and get prompts. This is a **community** node (`n8n-nodes-mcp` package), distinct from the built-in `@n8n/n8n-nodes-langchain.mcpClientTool` sub-node.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-mcp.mcpClientTool.md | Public docs (404 — type unpublished on docs.n8n.io) |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpclient.md | Public docs only (sibling built-in MCP Client; transport/auth parallels) |
| https://modelcontextprotocol.io/introduction | Third-party protocol docs |
| https://modelcontextprotocol.io/specification/2024-11-05/server/tools | Third-party protocol docs (`tools/list`, `tools/call`) |
| https://modelcontextprotocol.io/docs/concepts/transports | Third-party protocol docs (STDIO, SSE, Streamable HTTP) |
| Community package README (n8n-nodes-mcp@0.1.37, corpus under /tmp isolation) | Public descriptor metadata (operations, transports, credential types, SSE deprecation notice) |
| MCP protocol specification | Third-party protocol docs |

## Wire format

- **Type string:** `n8n-nodes-mcp.mcpClientTool`
- **Aliases:** (none). Do **not** confuse with `@n8n/n8n-nodes-langchain.mcpClientTool` (built-in langchain sub-node) or `n8n-nodes-langchain.mcpClient` (built-in core MCP Client).
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Three credential types, selected by transport:
  - `mcpClientApi` — STDIO (command-line) transport
  - `mcpClientSseApi` — SSE transport
  - `mcpClientHttpApi` — HTTP Streamable transport

## Parameters

Wire names inferred from community README and credential type structure. This node uses an **operation** selector to determine behavior.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `listTools` | yes | — | **Operation**. Values: `listTools`, `executeTool`, `listResources`, `readResource`, `listPrompts`, `getPrompt`. |
| connectionType | options | `httpStreamable` | yes | — | **Connection Type** / transport. Values: `stdio`, `sse`, `httpStreamable`. `httpStreamable` is the recommended modern transport; `sse` is deprecated for legacy compatibility. Determines which credential type is used. |
| toolName | string / options | — | when operation is `executeTool` | show when Execute Tool | Name of the MCP tool to execute. Populated from `tools/list` result. |
| toolParameters | json / object | `{}` | no | show when Execute Tool | JSON object of arguments to pass to the tool. |
| promptName | string / options | — | when operation is `getPrompt` | show when Get Prompt | Name of the MCP prompt to retrieve. Populated from `prompts/list` result. |
| resourceUri | string | — | when operation is `readResource` | show when Read Resource | URI of the MCP resource to read. |

### Credential fields by transport

**STDIO (`mcpClientApi`):**

| field | type | required | notes |
|-------|------|----------|-------|
| command | string | yes | Command to start the MCP server (e.g. `npx`) |
| arguments | string | no | Arguments passed to the command (e.g. `-y @modelcontextprotocol/server-brave-search`) |
| environmentVariables | string / key-value | no | Environment variables in `NAME=VALUE` format, one per line or comma/space separated |

**SSE (`mcpClientSseApi`):**

| field | type | required | notes |
|-------|------|----------|-------|
| sseUrl | string | yes | SSE endpoint URL (e.g. `http://localhost:3001/sse`) |
| messagesPostEndpoint | string | no | Optional custom endpoint for posting messages if different from SSE URL |
| additionalHeaders | string / key-value | no | Headers in `name:value` format, one per line |

**HTTP Streamable (`mcpClientHttpApi`):**

| field | type | required | notes |
|-------|------|----------|-------|
| httpStreamableUrl | string | yes | HTTP endpoint supporting streaming responses (e.g. `http://localhost:3001/stream`) |
| additionalHeaders | string / key-value | no | Headers in `name:value` format, one per line |

## Runtime behavior

### Role

This is a **main-pipeline** node. It connects to an MCP server, performs the selected operation, and emits results as workflow items on the `main` output.

### OpenFlow implementer contract

1. **Resolve transport and credential**
   - Read `connectionType` to select transport: `stdio`, `sse`, or `httpStreamable`.
   - Load the corresponding credential. Missing credential → error.

2. **Establish MCP session**
   - **STDIO:** Spawn the configured `command` with `arguments` as a child process. Pass `environmentVariables` to the process. Communicate over stdin/stdout using the MCP JSON-RPC protocol.
   - **SSE:** Connect to `sseUrl` via Server-Sent Events. Post messages to `messagesPostEndpoint` if configured, otherwise derive from SSE URL. Apply `additionalHeaders`. SSE is deprecated in the community package; prefer HTTP Streamable for new implementations.
   - **HTTP Streamable:** Connect to `httpStreamableUrl` using MCP Streamable HTTP transport. Apply `additionalHeaders`.
   - Connection failures → throw with descriptive error.

3. **Execute operation**
   - **`listTools`:** Call MCP `tools/list` (paginate with `nextCursor` until exhausted). Emit one item per tool with `name`, `description`, `inputSchema`.
   - **`executeTool`:** Call MCP `tools/call` with `params: { name: toolName, arguments: toolParameters }`. Emit one item with the tool result. Map `content` array: concatenate `type: "text"` parts; summarize non-text content as JSON.
   - **`listResources`:** Call MCP `resources/list` (paginate). Emit one item per resource with `uri`, `name`, `description`, `mimeType`.
   - **`readResource`:** Call MCP `resources/read` with `params: { uri: resourceUri }`. Emit one item with resource contents.
   - **`listPrompts`:** Call MCP `prompts/list` (paginate). Emit one item per prompt with `name`, `description`, `arguments`.
   - **`getPrompt`:** Call MCP `prompts/get` with `params: { name: promptName }`. Emit one item with the prompt template and messages.

4. **Output shape**
   - Each operation emits items on `main` output. Item `json` contains the operation result fields.
   - For list operations: one item per listed entity.
   - For execute/read/get operations: one item with the result.

5. **Lifecycle**
   - Open MCP session on node execution start.
   - Close session when execution completes (success or error).
   - STDIO: terminate child process on close.

### Input

- Main input items are **not consumed** for parameter resolution (this is a standalone client, not a per-item processor). Input items pass through or are ignored depending on operation.
- Configuration: connection type, credential, operation, and operation-specific parameters.

### Output

- `main` × 1: operation results as workflow items.

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing credential | Throw |
| Connection failure (STDIO spawn, SSE/HTTP connect) | Throw |
| MCP RPC error from server | Throw with server error details |
| `executeTool` with unknown tool name | Throw |
| `readResource` with invalid URI | Throw |
| `getPrompt` with unknown prompt name | Throw |
| `continueOnFail` | Standard: emit error item on `main` output instead of throwing |

### Expressions

- `toolParameters` accepts expression strings for dynamic argument construction.
- `resourceUri` accepts expression strings.
- Credential fields (URLs, headers, command, arguments) may accept expressions.

## Acceptance tests

### Test: list tools via HTTP Streamable

**Given** mock MCP server at `http://localhost:3001/stream` listing tools `search`, `fetch`.

**Parameters:**

```json
{
  "operation": "listTools",
  "connectionType": "httpStreamable"
}
```

**Credentials:** `mcpClientHttpApi` with `httpStreamableUrl: "http://localhost:3001/stream"`.

**Expect** output[0]:

```json
[
  { "json": { "name": "search", "description": "Search the web", "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } } } },
  { "json": { "name": "fetch", "description": "Fetch a URL", "inputSchema": { "type": "object", "properties": { "url": { "type": "string" } } } } }
]
```

### Test: execute tool via STDIO

**Given** mock MCP server process listing tool `add` with parameters `a`, `b`.

**Parameters:**

```json
{
  "operation": "executeTool",
  "connectionType": "stdio",
  "toolName": "add",
  "toolParameters": { "a": 3, "b": 5 }
}
```

**Credentials:** `mcpClientApi` with `command: "node"`, `arguments: "./mock-server.js"`.

**Expect** output[0] contains one item with tool result content (e.g. `{ "json": { "content": [{ "type": "text", "text": "8" }] } }`).

### Test: list resources via SSE

**Given** mock SSE MCP server at `http://localhost:3001/sse` with resources `file://docs/readme` and `file://docs/api`.

**Parameters:**

```json
{
  "operation": "listResources",
  "connectionType": "sse"
}
```

**Credentials:** `mcpClientSseApi` with `sseUrl: "http://localhost:3001/sse"`.

**Expect** output[0] contains two items with `uri`, `name`, `description`, `mimeType` fields.

### Test: read resource

**Given** mock MCP server with resource `file://data/config.json`.

**Parameters:**

```json
{
  "operation": "readResource",
  "connectionType": "httpStreamable",
  "resourceUri": "file://data/config.json"
}
```

**Expect** output[0] contains one item with resource contents.

### Test: connection failure

**Given** no MCP server running at `http://localhost:9999/stream`.

**Parameters:**

```json
{
  "operation": "listTools",
  "connectionType": "httpStreamable"
}
```

**Credentials:** `mcpClientHttpApi` with `httpStreamableUrl: "http://localhost:9999/stream"`.

**Expect** node throws with connection error. With `continueOnFail: true`, emits error item on `main`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string | confirmed via corpus MANIFEST.json | `n8n-nodes-mcp.mcpClientTool` |
| Operations list | documented in community README | 6 operations confirmed |
| Transport types | documented in community README | STDIO, SSE, HTTP Streamable |
| Credential type keys | confirmed via corpus package.json `n8n.credentials` | `McpClientApi`, `McpClientSseApi`, `McpClientHttpApi` |
| Credential field names | inferred from README descriptions | Exact wire keys not in sampled JSON; names derived from README prose |
| Parameter wire keys | inferred from README | `operation`, `connectionType`, `toolName`, `toolParameters`, `promptName`, `resourceUri` are reasonable abstractions |
| `messagesPostEndpoint` | documented in README | SSE-specific optional field |
| `environmentVariables` format | documented in README | `NAME=VALUE`, space/comma/newline separated |
| `additionalHeaders` format | documented in README | `name:value`, one per line |
| AI Agent tool usage | documented in README | Requires `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`; out of scope for standalone node spec |
| SSE deprecation | documented in README | SSE transport deprecated in favor of `httpStreamable`; remains available for legacy compatibility |
| Pagination for list operations | inferred from MCP protocol spec | `nextCursor` pattern |
| Non-text tool result handling | inferred | Summarize as JSON; no binary passthrough documented |
| Default operation | inferred | `listTools` as reasonable default |
| Input item handling | inferred | Standalone client; input items pass through or are ignored |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/mcp-community-client.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only. MCP client protocol may use a small in-tree or well-licensed MCP client library. No third-party `n8n-nodes-*` packages.

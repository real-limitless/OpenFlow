---
type: @n8n/n8n-nodes-langchain.mcpClient
displayName: MCP Client
category: Core Nodes
versions: [1]
priority: medium
status: specced
---

# MCP Client

Model Context Protocol (MCP) client node that connects to an external MCP server via SSE transport, discovers available tools at runtime, and executes them as regular workflow steps. For AI Agent tool usage, use `@n8n/n8n-nodes-langchain.mcpClientTool` (sub-node) instead.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpclient.md | Public docs only |
| https://modelcontextprotocol.io/introduction | Third-party protocol docs |
| https://modelcontextprotocol.io/specification/2025-03-26/basic/transports | Third-party protocol docs |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.mcpClient`
- **Aliases:** (none). Do **not** confuse with `n8n-nodes-langchain.mcpClientTool` (AI-agent sub-node) or `n8n-nodes-mcp.mcpClientTool` (community standalone node).
- **Inputs:** `main` × 1 (input items pass through for item-based expression resolution)
- **Outputs:** `main` × 1
- **Credentials:** Uses HTTP Request credential types:
  - `httpRequest` — supports bearer, header, multiple headers, OAuth2
  - See https://docs.n8n.io/integrations/builtin/credentials/httprequest.md

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| serverTransport | options | `sse` | yes | — | **Server Transport.** Only `sse` (Server-Sent Events) supported. Value: `sse`. Named `serverTransport` in n8n's implementation. |
| mcpEndpointUrl | string | — | yes | — | **MCP Endpoint URL.** URL of the external MCP server's SSE endpoint, e.g. `https://mcp.notion.com/mcp`. |
| authentication | credentials / options | `none` | no | — | **Authentication.** Selector for HTTP auth method: `none` (no auth), `genericCredentialType` (bearer), `headerAuth` (generic header), `httpMultipleHeadersAuth` (multiple headers), `oAuth2` (OAuth2). |
| toolName | string / options | — | yes | — | **Tool.** Dynamically loaded from the MCP server via `tools/list` at credential selection time. Dropdown of available tool names. |
| inputMode | options | `manual` | no | — | **Input Mode.** How to supply tool parameters: `manual` (individual parameter fields) or `json` (single JSON object). |
| jsonParameters | json | `{}` | no | `inputMode = json` | **JSON Parameters.** Tool arguments as a JSON object. Preferred for nested or complex parameter structures. |
| convertToBinary | boolean | `false` | no | — | **Options: Convert to Binary.** When true, images and audio in tool results are converted to binary data. When false, they are returned as base64-encoded strings. |
| timeout | number | — | no | — | **Options: Timeout.** Time in milliseconds to wait for a tool call to complete before timing out. |

## Runtime behavior

### Role

This is a **main-pipeline** node. It connects to an external MCP server via SSE (Streamable HTTP), discovers the available tools, then executes a selected tool with caller-provided arguments. Results are emitted as workflow items on the `main` output.

### OpenFlow implementer contract

1. **Resolve connection and credentials**
   - Read `mcpEndpointUrl` for the MCP server SSE endpoint.
   - Read `authentication` to select credential type. If `none`, connect without auth.
   - Load credential if auth is configured. Missing credential → throw.

2. **Establish MCP session**
   - Connect to `mcpEndpointUrl` via SSE transport.
   - For Streamable HTTP: send POST requests with JSON-RPC payloads, receive streaming responses.
   - Apply credential headers (bearer token, custom headers, OAuth2 token).
   - Connection failures → throw with descriptive error.

3. **Resolve tool at design/execution time**
   - When the parameter UI loads or at execution, call MCP `tools/list` to get available tools.
   - Populate the `toolName` dropdown with `{ name, description, inputSchema }` from the response.
   - When `inputMode = manual`, dynamically render parameter fields based on the selected tool's `inputSchema` properties. The `resourceMapping` subsystem maps JSON Schema properties to individual n8n parameter fields.
   - When `inputMode = json`, accept a single JSON object as `jsonParameters`.

4. **Execute tool call**
   - Call MCP `tools/call` with `params: { name: toolName, arguments: <resolved arguments> }`.
   - Input items are processed one at a time (per-item execution). Each input item produces one output item, unless the tool returns no content.

5. **Output shape**
   - Each input item produces one output item on `main`.
   - The output item's `json` contains:
     - `toolName`: the name of the tool that was called (added by the n8n node)
     - `content`: the raw MCP result `content` array. Each content entry has `type` (e.g. `text`, `image`, `resource`), `text` (for text type), or `data`/`mimeType` (for image/resource types).
     - `isError`: `true` if the MCP server returned an error; otherwise absent or `false`.
   - When `convertToBinary` is true, content entries of type `image` or `audio` are converted to binary data on the output item's `binary` property.

### Input

- Main input items arrive on `main` × 1. Each item is processed independently.
- The first item's expressions resolve tool name and parameters unless overridden per-item.
- Input items pass through the node; the tool result replaces or augments the item data.

### Output

- `main` × 1: one output item per input item, with the MCP tool result in `json.content` + `json.toolName` (and optionally `json.isError`).

### Errors

| Condition | Behavior |
|-----------|----------|
| MCP server unreachable or connection refused | Throw |
| Authentication failure (401/403) | Throw |
| MCP RPC error from server (`isError` in result) | Throw by default; with `continueOnFail` emit item with `json.isError = true` |
| Unknown tool name | Throw |
| Tool execution timeout | Throw (respects `timeout` option) |
| `continueOnFail` | Standard: emit error item on `main` output instead of throwing |

### Expressions

- `mcpEndpointUrl` accepts expression strings.
- `toolName` accepts expression strings (for dynamic tool selection).
- `jsonParameters` accepts expression strings.
- Credential fields accept expressions.

## Acceptance tests

### Test: connect to MCP server and list tools (via resource locator)

**Given** a mock MCP SSE server at `https://mcp.example.com/sse` that responds to `tools/list` with tools `search` and `fetch`.

**Parameters:**
```json
{
  "serverTransport": "sse",
  "mcpEndpointUrl": "https://mcp.example.com/sse",
  "authentication": "none"
}
```

**Expect** the `toolName` dropdown is populated with options: `search`, `fetch`. At execution time, the node does not list tools (it executes a pre-selected tool); the listing is a design-time / credential-refresh operation.

### Test: execute a tool with manual parameters

**Given** a mock MCP server at `https://mcp.example.com/sse` with tool `greet(input: string)` that returns `{ content: [{ type: "text", text: "Hello, Alice!" }] }`.

**Parameters:**
```json
{
  "serverTransport": "sse",
  "mcpEndpointUrl": "https://mcp.example.com/sse",
  "authentication": "none",
  "toolName": "greet",
  "inputMode": "manual"
}
```

**Credentials:** (none).

**Input items:**
```json
[{ "json": { "input": "Alice" } }]
```

**Expect** output[0]:
```json
[{
  "json": {
    "toolName": "greet",
    "content": [{ "type": "text", "text": "Hello, Alice!" }]
  }
}]
```

### Test: execute a tool with JSON parameters

**Given** a mock MCP server with tool `math(op: string, a: number, b: number)`.

**Parameters:**
```json
{
  "serverTransport": "sse",
  "mcpEndpointUrl": "https://mcp.example.com/sse",
  "authentication": "none",
  "toolName": "math",
  "inputMode": "json",
  "jsonParameters": "{\"op\":\"add\",\"a\":3,\"b\":5}"
}
```

**Input items:**
```json
[{ "json": {} }]
```

**Expect** output[0] contains tool result with `json.content` reflecting the `math` result (e.g. `[{ "type": "text", "text": "8" }]`).

### Test: tool returns image content with convertToBinary

**Given** a mock MCP server with tool `render(chart: string)` that returns a PNG image.

**Parameters:**
```json
{
  "serverTransport": "sse",
  "mcpEndpointUrl": "https://mcp.example.com/sse",
  "authentication": "none",
  "toolName": "render",
  "inputMode": "json",
  "jsonParameters": "{\"chart\":\"pie\"}",
  "convertToBinary": true
}
```

**Expect** output[0] has the image as binary data on `binary` properties, and `json.content` either absent or referencing the binary key. When `convertToBinary` is false, the image appears as a base64-encoded string in `json.content`.

### Test: connection failure

**Given** no MCP server at `https://mcp.example.com:9999/sse`.

**Parameters:**
```json
{
  "serverTransport": "sse",
  "mcpEndpointUrl": "https://mcp.example.com:9999/sse",
  "authentication": "none",
  "toolName": "greet"
}
```

**Expect** node throws with connection error. With `continueOnFail: true`, emits error item on `main` with `json.isError = true`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string | confirmed via corpus MANIFEST.json | `@n8n/n8n-nodes-langchain.mcpClient` |
| Transport | documented in public docs | SSE only; no STDIO support documented for this node |
| Authentication methods | documented in public docs | Bearer, Header, Multiple Headers, OAuth2 via httpRequest credential types |
| Credential type mapping | documented in public docs | Uses httpRequest credential family |
| Parameter wire names | partially confirmed by corpus d.ts | `resourceMapping` and `listSearch` methods confirm dynamic tool/param loading |
| `toolName` dynamic population | confirmed via corpus `listSearch.d.ts` | `getTools()` returns `INodeListSearchResult` |
| Dynamic parameter rendering | confirmed via corpus `resourceMapping.d.ts` | `getToolParameters()` returns `ResourceMapperFields` |
| `inputMode` / `jsonParameters` | documented in public docs | Two input modes: Manual and JSON |
| `convertToBinary` | documented in public docs | Images/audio → binary or base64 |
| `timeout` | documented in public docs | Optional timeout in ms |
| Output shape details | inferred from MCP protocol | `content` array structure; `toolName` and `isError` fields are n8n-enrichment |
| Per-item execution semantics | inferred | Standard n8n per-item execution assumed for main-pipeline node |
| Error behavior for `isError` from server | inferred | Standard n8n `continueOnFail` pattern |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/mcp-client.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only. MCP client protocol may use a minimal in-tree MCP client or a well-licensed MCP client library. No third-party `n8n-nodes-*` packages.

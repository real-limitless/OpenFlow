---
type: @n8n/n8n-nodes-langchain.microsoftAgent365Trigger
displayName: Microsoft Agent 365 Trigger
category: Triggers
versions: [1, 1.1]
priority: high
status: specced
---

# Microsoft Agent 365 Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.microsoftagent365trigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoftagent365.md | Public docs only |
| https://learn.microsoft.com/en-us/microsoft-agent-365/developer/ | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.microsoftAgent365Trigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node, no inbound main)
- **Outputs:** `main` × 1
- **Credentials:** `microsoftAgent365Api`

The credential holds:
- **Client ID** (Application (client) ID from the Azure app registration for the Microsoft Agent 365 agent)
- **Client Secret** (associated secret for the app registration)
- **Tenant ID** (Azure tenant where the app is registered)

The node listens for incoming HTTP requests from Microsoft Bot Framework (webhook). The `Client ID` is used to validate the Bot Framework JWT token on each request (n8n >= 2.25.7 / 2.26.2), confirming Microsoft issued it for the correct agent registration.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| systemPrompt | string / expression | — | no | always | System instruction for the language model processing incoming messages |
| useMcpTools | boolean | false | no | always | Enable Microsoft Work IQ Tools via MCP (Model Context Protocol) for the Agent 365 agent |
| include | 'all' \| 'selected' | 'all' | no | useMcpTools = true | Which MCP tools to enable: all available or a curated subset |
| includeTools | array of tool IDs | [] | no | useMcpTools = true, include = 'selected' | Specific MCP tool identifiers to enable when using selected mode |
| hasOutputParser | boolean | — | no | always | Whether an output parser sub-node is connected |
| options.maxIterations | number / expression | — | no | always | Maximum reasoning iterations before the agent responds |
| options.welcomeMessage | string / expression | — | no | always | Initial message sent back when a conversation starts |

### Available MCP tool IDs (selected mode)

The following identifiers can be listed when `include` is `selected`:

- `mcp_Admin365_GraphTools`
- `mcp_AdminTools`
- `mcp_CalendarTools`
- `mcp_DASearch`
- `mcp_ExcelServer`
- `mcp_KnowledgeTools`
- `mcp_M365Copilot`
- `mcp_MailTools`
- `mcp_OneDriveRemoteServer`
- `mcp_ODSPRemoteServer`
- `mcp_PlannerServer`
- `mcp_SharePointRemoteServer`
- `mcp_SharePointListsTools`
- `mcp_TaskPersonalizationServer`
- `mcp_TeamsServer`
- `mcp_TeamsCanaryServer`
- `mcp_TeamsServerV1`
- `mcp_WebSearchTools`
- `mcp_W365ComputerUse`
- `mcp_WordServer`

Each ID corresponds to a Microsoft 365 MCP capability (Calendar, Mail, SharePoint, Teams, Word, etc.).

## Runtime behavior

### Input

This is a **trigger node** — it does not consume items from a previous node. It is activated when Microsoft Agent 365 sends an HTTP request to the n8n webhook URL. The webhook is automatically registered/unregistered when the workflow is activated/deactivated.

### Sub-node connectors

The node connects to these sub-nodes on its cluster canvas:

- **Model** (`ai_languageModel`): A chat model sub-node required for processing incoming messages. Accepts one or more model instances.
- **Memory** (`ai_memory`): Optional memory sub-node for maintaining conversation context. A single n8n workflow powers multiple Agent 365 agents, so the session ID key must be chosen carefully to scope conversations per agent instance and prevent cross-user context bleed.
- **Output Parser** (`ai_outputParser`): Optional structured output parser.
- **Tools** (`ai_tool`): Optional array of tool sub-nodes providing additional agent capabilities.

### Output

On each incoming request from Microsoft Bot Framework, the node emits exactly one output item. The output shape follows the Bot Framework Activity schema, containing at minimum:

- `activityId` — unique ID of the Bot Framework activity
- `from` — object with `id`, `name` fields identifying the end user
- `conversation` — object with `id`, `conversationType` identifying the Agent 365 conversation
- `text` — the message text from the user
- `type` — activity type (typically `"message"`)
- `timestamp` — ISO-8601 timestamp of the activity
- `channelId` — channel identifier (e.g. `"msteams"`)
- `serviceUrl` — the service endpoint for the Bot Framework channel

### Webhook authentication

From n8n 2.25.7 and 2.26.2, every incoming request is validated by checking the Bot Framework JWT token. The node:
1. Extracts the Bot Framework token from the `Authorization` header
2. Verifies Microsoft issued it for the agent's registered application (matching the credential's Client ID)
3. Rejects requests without a valid token, preventing forged activity injection

### Errors

- Invalid or missing Bot Framework tokens cause the request to be rejected with HTTP 401 before the workflow runs.
- If the connected model sub-node fails, the error is surfaced through the standard n8n error workflow (subject to `continueOnFail` where applicable).
- Network or API errors from the Microsoft MCP tools (when enabled) are handled internally by the agent framework.

### Expressions

All parameters accept expression strings via `stringOrExpression` / `numberOrExpression` / `booleanOrExpression` schema helpers. Sub-node parameters use sub-node expression semantics (first item only for most sub-nodes).

## Acceptance tests

### Test: basic trigger activation

**Given** the Microsoft Agent 365 Trigger node is configured with a valid `microsoftAgent365Api` credential, a system prompt, and a connected chat model sub-node.

**When** the workflow is activated, a webhook URL is registered.

**Then** the node should listen on the registered URL. Sending a valid Bot Framework Activity payload (with valid JWT token) to that URL should execute the workflow and produce one output item containing the activity fields.

### Test: MCP tools — all enabled

**Given** `useMcpTools = true` and `include = 'all'`.

**When** an incoming message arrives, the agent processes it with all available Microsoft 365 MCP tools enabled.

**Then** the agent should be able to call any of the Microsoft MCP tools (Calendar, Mail, SharePoint, Teams, etc.) during response generation.

### Test: MCP tools — selected only

**Given** `useMcpTools = true`, `include = 'selected'`, and `includeTools = ['mcp_CalendarTools', 'mcp_MailTools']`.

**When** an incoming message arrives, the agent processes it with only the selected MCP tools available.

**Then** the agent should be able to use only Calendar and Mail tools. Other MCP tools (e.g. Teams, SharePoint) should not be available.

### Test: webhook authentication rejects invalid tokens

**Given** an active workflow using the Microsoft Agent 365 Trigger.

**When** an HTTP request is sent to the workflow webhook URL without a valid Bot Framework JWT token (or with a token that does not match the credential's Client ID).

**Then** the node should reject the request with HTTP 401 and not execute the workflow.

### Test: memory scoping per agent instance

**Given** the trigger node has a Memory sub-node connected with a session ID derived from the `conversation.id` field.

**When** two different Agent 365 conversations send messages to the same workflow.

**Then** each conversation should maintain its own isolated memory context, with no cross-contamination between sessions.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact Bot Framework Activity schema fields | documented | Well-documented in Microsoft Bot Framework docs and n8n trigger node docs |
| MCP tool ID list | extracted from package schema (corpus) | Listed in the Zod schema; matches the "and more" description in public docs |
| Webhook URL registration mechanism | inferred | Standard n8n trigger webhook pattern — not explicitly detailed for this specific node |
| JWT token validation algorithm | documented | Described in public docs at a behavioral level (token verification against Client ID) |
| Version differences (v1 vs v1.1) | inferred from schema files | Both versions share identical parameter schemas; version split likely internal |
| Exact output item JSON structure | inferred | Based on Bot Framework Activity schema — actual shape depends on the incoming webhook payload |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/microsoftAgent365Trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

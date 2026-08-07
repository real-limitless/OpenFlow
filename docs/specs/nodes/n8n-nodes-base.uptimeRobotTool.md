---
type: n8n-nodes-base.uptimeRobotTool
displayName: UptimeRobot Tool
category: Development
versions: [1]
priority: medium
status: specced
---

# UptimeRobot Tool

AI agent tool variant of the UptimeRobot node. Exposes the same 5 resources (Account, Alert Contact, Maintenance Window, Monitor, Public Status Page) and their operations as callable tools for AI agents. The underlying behavior, API contract, parameters, and credential requirements are identical to the base UptimeRobot node. The only difference is that parameters can be populated dynamically via `$fromAI()` expressions when invoked by an AI agent.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.uptimerobot/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/uptimerobot/ | Public docs only |
| https://uptimerobot.com/api/v3/ | Public docs only |

No dedicated docs page exists for the Tool variant. The base UptimeRobot node declares `usableAsTool: true`, making it directly available as an AI agent tool without a separate node definition.

## Wire format

- **Type string:** `n8n-nodes-base.uptimeRobotTool`
- **Aliases:** (none — the base node's type string `n8n-nodes-base.uptimeRobot` is the canonical type for the runtime)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `uptimeRobotApi` (API key — supports main/account-specific, monitor-specific, and read-only key types)

## Parameters

The parameter set is identical to the base UptimeRobot node. Resources and operations:

| Resource | Operations |
|----------|-----------|
| Account | Get |
| Alert Contact | Create, Delete, Get, Get All, Update |
| Maintenance Window | Create, Delete, Get, Get All, Update |
| Monitor | Create, Delete, Get, Get All, Reset, Update |
| Public Status Page | Create, Delete, Get, Get All |

Each operation's parameters (friendly name, URL, monitor type, ID, filters, update fields, etc.) match the base node's schema. All string, number, and boolean parameters additionally support `$fromAI()` dynamic population by the AI agent.

### Tool-specific behavior

- When the AI agent invokes this tool, it may supply parameters via `$fromAI()` expressions that n8n resolves at runtime from the agent's conversation context.
- The tool acts as a single callable action: the agent selects a resource and operation, provides the required parameters, and receives the API response as structured data passed back into the agent's context.

## Runtime behavior

### Input

Each input item is processed independently. For Create operations, one API entity is created per item. For GetAll, the fetched collection is mapped to output items (one per entity). For Delete/Update/Get, the operation targets the specified ID.

### Output

Same as base node: on success, entity data is returned with the API response envelope (`stat`, `pagination`) stripped. The AI agent receives the entity data as structured output.

### Errors

Standard UptimeRobot API errors (invalid API key, rate limit exceeded, invalid parameters resulting in HTTP 429 or error response) result in the tool call failing. The node respects `continueOnFail`: if enabled, errored items produce an empty output item with the error on `_error`.

### Expressions

All parameters accept expression strings, including `$fromAI()` for AI-agent-driven dynamic parameter resolution.

## Acceptance tests

### Test: get monitors via AI agent (Get All)

**Given** the tool is invoked by an AI agent with:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "monitor",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] to contain up to 10 monitor objects each with `id`, `friendly_name`, `url`, `type`, `status`.

### Test: create monitor via $fromAI() expression

**Given** the tool is invoked by an AI agent:
```json
[{ "json": { "agentProvidedUrl": "https://example.com" } }]
```

**Parameters:**
```json
{
  "resource": "monitor",
  "operation": "create",
  "friendlyName": "={{ $fromAI('What friendly name should the monitor have?') }}",
  "url": "={{ $json.agentProvidedUrl }}",
  "type": 1,
  "interval": 300
}
```

**Expect** output[0] to contain a monitor object with a numeric `id`.

### Test: get account details

**Given** the tool is invoked by an AI agent:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "account",
  "operation": "get"
}
```

**Expect** output[0] to contain an account object with `email`, `monitor_limit`, `up_monitors`, `down_monitors`, `paused_monitors`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Separate Tool node existence | inferred | The base UptimeRobot node declares `usableAsTool:true` in its published JSON descriptor, meaning a separate `*Tool` type string exists as an alias or the base node itself is the tool. No dedicated docs page exists. |
| $fromAI() support | documented | Standard n8n pattern for AI agent tools: all input parameters accept `$fromAI()` expressions when the node is used from the AI Agent Tools panel. |
| Parameter schema | inferred from package descriptor | The tool uses the same parameters as the base node. Internal parameter names, default values, and option enums match the base node schema. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/uptimeRobotTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Note:** The executor may share or delegate to the base UptimeRobot executor since the API contract is identical. The tool variant only adds AI agent integration (parameter expressions, `$fromAI()` support).

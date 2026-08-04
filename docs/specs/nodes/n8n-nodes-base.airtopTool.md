---
type: n8n-nodes-base.airtopTool
displayName: Airtop Tool
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Airtop Tool

The Airtop Tool is the AI-agent tool variant of the standard Airtop node (`n8n-nodes-base.airtop`).  
It exposes the same cloud-browser-automation operations (Session, Window, Extraction, Interaction, File, Agent) as callable tool functions for AI agents. In tool mode, parameters can be populated dynamically via `$fromAI()` expressions.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtop/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/airtop/ | Public docs only |
| https://docs.airtop.ai/api-reference/airtop-api | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.airtopTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1, `ai_tool` × 1
- **Outputs:** `main` × 1
- **Credentials:** `airtopApi` (API key authentication)

The same `airtop` node definition has `usableAsTool: true`, which n8n treats as an `airtopTool` variant. In OpenFlow, this should be a separate executor with an `ai_tool` input alongside the standard `main` input.

## Parameters

All parameters are identical to the base Airtop node (`n8n-nodes-base.airtop`). See `n8n-nodes-base.airtop.md` for the full parameter table.

Key differences in tool mode:

- **Resource/Operation** — same 6 resources (session, window, extraction, interaction, file, agent) with same sub-operations
- **`$fromAI()` support** — any parameter can be populated dynamically by the AI agent at call time; the tool definition declares the parameter schema so the agent knows what arguments to supply
- **No separate tool-specific parameters** — the tool variant inherits all parameters from the base node

## Runtime behavior

### Input

- Standard `main` input: accepts items with optional `sessionId`, `windowId` from upstream nodes (same as base Airtop).
- `ai_tool` input: receives tool-call arguments from the calling AI agent. The agent may supply any subset of parameters dynamically.

### Output

Same output shapes as the base Airtop node per resource/operation. See `n8n-nodes-base.airtop.md` for the per-operation output table.

### Errors

Same error handling as the base Airtop node. In tool mode, errors should be returned to the AI agent as structured tool error responses rather than throwing.

### Expressions

All parameters support `$fromAI()` for dynamic agent-driven population. Standard expression syntax (`$json`, `$()`) also works on both `main` and `ai_tool` inputs.

## Acceptance tests

### Test: agent-extract-page-content

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "sessionMode": "existing",
    "sessionId": "sess_123",
    "windowId": "win_456",
    "resource": "extraction",
    "operation": "query",
    "prompt": "What is the page title?"
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0]:
```json
[{
  "json": {
    "modelResponse": "string",
    "sessionId": "sess_123",
    "windowId": "win_456"
  }
}]
```

---

### Test: agent-create-session-and-scrape

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "session",
    "operation": "create",
    "profileName": "agent-scrape",
    "proxy": "none",
    "timeoutMinutes": 5
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sessionId": "string",
    "data": {
      "id": "string",
      "status": "active",
      "configuration": { "timeoutMinutes": 5 }
    }
  }
}]
```

---

### Test: agent-interact-and-type

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "interaction",
    "operation": "type",
    "sessionMode": "existing",
    "sessionId": "sess_123",
    "windowId": "win_456",
    "elementDescription": "the search box",
    "text": "hello world",
    "pressEnterKey": true
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0]:
```json
[{
  "json": {
    "sessionId": "sess_123",
    "windowId": "win_456",
    "modelResponse": "string"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter schema | documented | Inherited from base Airtop node; `usableAsTool` confirmed in corpus types/nodes.json |
| `$fromAI()` behavior | documented | Standard n8n AI-tool mechanism documented in how-tools-work.md |
| Tool-specific frontmatter | inferred | No dedicated docs page exists for airtopTool; behavior inferred from `usableAsTool: true` |
| Error propagation to agent | inferred | Tool-mode error handling follows standard n8n AI tool conventions |

## OpenFlow mapping

- **Definition group:** `flow` (browser automation / AI agent tool)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.airtopTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Implementation note:** The executor should be a thin wrapper around the base Airtop executor, adding `ai_tool` input handling and `$fromAI()` expression support. Consider sharing the core operation dispatch logic via a shared module.

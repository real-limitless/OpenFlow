---
type: @n8n/n8n-nodes-langchain.anthropicTool
displayName: Anthropic Tool
category: AI
versions: [1]
priority: high
status: specced
---

# Anthropic Tool

The Anthropic Tool is the AI-agent tool variant of the Anthropic app node (`@n8n/n8n-nodes-langchain.anthropic`).
It exposes the same document/file/image/text/prompt operations as callable tool functions for AI agents. The underlying node definition carries `usableAsTool: true`, and in tool mode parameters can be populated dynamically via `$fromAI()` expressions.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.anthropic/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/anthropic/ | Public docs only |
| https://docs.anthropic.com/en/api/overview | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `anthropic` (used as tool; identifier: `@n8n/n8n-nodes-langchain.anthropicTool`)
- **Aliases:** LangChain, document, image, assistant, claude
- **Inputs:** `main` × 1, `ai_tool` × 1 (when resource=text, operation=message)
- **Outputs:** `main` × 1
- **Credentials:** `anthropicApi` (API key, required)

The same `anthropic` node definition has `usableAsTool: true`, which n8n treats as an Anthropic Tool variant. In OpenFlow this should be a separate executor with an `ai_tool` input alongside the standard `main` input.

## Parameters

All parameters are identical to the base Anthropic node (`@n8n/n8n-nodes-langchain.anthropic`). See `@n8n/n8n-nodes-langchain.anthropic.md` for the full parameter table.

Key differences in tool mode:

- **Resource/Operation** — same 5 resources (document, file, image, prompt, text) with same sub-operations
- **`$fromAI()` support** — any parameter can be populated dynamically by the AI agent at call time; the tool definition declares the parameter schema so the agent knows what arguments to supply
- **No separate tool-specific parameters** — the tool variant inherits all parameters from the base node
- **`ai_tool` input** — only active when resource=text, operation=message (tool sub-nodes can be connected for tool calling)

## Runtime behavior

### Input

- Standard `main` input: accepts items with optional message content, attachment URLs, file IDs, etc. (same as base Anthropic).
- `ai_tool` input: receives tool-call arguments from the calling AI agent. The agent may supply any subset of parameters dynamically.
- When used as a tool within an AI Agent (via `ai_tool` connection), the node supplies its own tool definitions to the agent, enabling the agent to invoke Anthropic operations directly.

### Output

Same output shapes as the base Anthropic node per resource/operation:

- **text→message:** `{ messages: [{ role, content }], model, usage }` (simplified) or full Anthropic Messages API response (raw)
- **document/image→analyze:** Natural language answer or raw response
- **file→upload/get/delete/list:** File metadata objects or confirmation
- **prompt→generate/improve/templatize:** Generated/improved/templatized prompt messages

### Errors

Same error handling as the base Anthropic node. In tool mode, errors should be returned to the AI agent as structured tool error responses rather than throwing unconditionally.

### Expressions

All parameters support `$fromAI()` for dynamic agent-driven population. Standard expression syntax (`$json`, `$()`) also works on both `main` and `ai_tool` inputs.

## Acceptance tests

### Test: tool-text-message

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "text",
    "operation": "message",
    "modelId": { "mode": "id", "value": "claude-sonnet-4-20250514" },
    "messages": { "values": [{ "content": "Summarize this text", "role": "user" }] },
    "simplify": true
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0].json to contain:
- `messages` array with at least one entry
- `messages[0].role` equal to `"assistant"`
- `messages[0].content` as a non-empty string

---

### Test: tool-image-analyze

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "image",
    "operation": "analyze",
    "modelId": { "mode": "id", "value": "claude-sonnet-4-20250514" },
    "text": "What's in this image?",
    "inputType": "url",
    "imageUrls": "https://example.com/photo.png",
    "simplify": true
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0].json to contain a non-empty description string.

---

### Test: tool-file-list

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "file",
    "operation": "list",
    "returnAll": false,
    "limit": 10
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0].json to be an array of file metadata objects, each with `id`, `filename`, `mime_type`, `size_bytes`, and `created_at`.

---

### Test: tool-prompt-generate

**Given** input items (tool call from AI agent):
```json
[{
  "json": {
    "resource": "prompt",
    "operation": "generate",
    "task": "A recipe planner assistant",
    "simplify": true
  }
}]
```

**Parameters:**
```json
{}
```

**Expect** output[0].json to contain `messages` and `system` fields.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter schema | documented | Inherited from base Anthropic node; `usableAsTool: true` confirmed in corpus types/nodes.json |
| `$fromAI()` behavior | documented | Standard n8n AI-tool mechanism documented in how-tools-work.md |
| Tool-specific frontmatter | inferred | No dedicated docs page exists for `anthropicTool`; behavior inferred from `usableAsTool: true` |
| Error propagation to agent | inferred | Tool-mode error handling follows standard n8n AI tool conventions |
| Input/output wiring | documented | `ai_tool` input from base Anthropic node descriptor; only active for text→message |

## OpenFlow mapping

- **Definition group:** `ai` (AI agent tool)
- **Executor file:** `src/lib/engine/executors/@n8n/n8n-nodes-langchain.anthropicTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Implementation note:** The executor should be a thin wrapper around the base Anthropic executor, adding `ai_tool` input handling and `$fromAI()` expression support. Consider sharing the core operation dispatch logic via a shared module.

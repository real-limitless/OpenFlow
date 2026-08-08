---
name: openflow-workflow
description: Build and edit OpenFlow workflows via openflow MCP tools — node catalog, wiring, parameters, execute/debug.
compatibility: opencode
metadata:
  audience: openflow-assistant
  surface: canvas
---

# OpenFlow workflow skill

## Always

1. `get_workflow` before large edits (node names are the identity keys).
2. `list_node_types` with a query before adding; use exact `name` (type string).
3. `get_node_type` before setting non-obvious parameters.
4. Space nodes: x += 240, y += 140 for readability.
5. After a runnable graph: `execute_workflow` → poll `get_execution`.

## Common types

| Intent | Type string (search if unsure) |
|--------|--------------------------------|
| Manual start | `n8n-nodes-base.manualTrigger` |
| Webhook | `n8n-nodes-base.webhook` |
| HTTP | `n8n-nodes-base.httpRequest` |
| Code | `n8n-nodes-base.code` |
| Set / Edit Fields | `n8n-nodes-base.set` |
| IF | `n8n-nodes-base.if` |
| AI Agent | `@n8n/n8n-nodes-langchain.agent` |

## Handles

- Main: `sourceHandle` / `targetHandle` = `main-0`
- Chat model → Agent: source=model, target=agent, `targetHandle` = `ai_languageModel-0`
- Tool → Agent: `targetHandle` = `ai_tool-0`

## Credentials & variables

- `list_credentials` → set via `update_node` credentials map: `{ "httpHeaderAuth": { "id": "...", "name": "..." } }`
- Never paste API keys into parameters when a stored credential exists.
- With scope `openflow:credentials`: `list_credential_types`, `create_credential`, `update_credential`, `delete_credential` (responses are metadata only — never echo secrets).
- With scope `openflow:variables`: `list_variables` (secrets redacted), `create_variable`, `update_variable`, `delete_variable`.

## Expressions

- OpenFlow expressions use `={{ ... }}` in string fields when supported.
- Prefer static values first; add expressions only when needed.

## Debug

- Failed run: `get_execution` and read per-node errors in `runData`.
- Fix params with `update_node`, re-execute.

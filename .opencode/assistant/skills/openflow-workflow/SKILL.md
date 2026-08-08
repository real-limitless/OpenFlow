---
name: openflow-workflow
description: Build and edit OpenFlow workflows via openflow MCP — schema pull ritual, triggers, params, AI clusters, credentials, execute/debug.
compatibility: opencode
metadata:
  audience: openflow-assistant
  surface: canvas
---

# OpenFlow workflow skill

Build **runnable** graphs. Schema is **pull-based**. Shells without `update_node` are failures.

## Schema ritual (every node)

```
suggest_nodes / list_node_types  → pick type
get_node_type(type)              → full properties + credentials
add_node(type, name, x, y)       → shell ONLY (no parameters)
update_node(parameters, credentials)  → required / intentional fields
connect_nodes(...)
```

- Parameter keys = `properties[].name` from `get_node_type` only.
- Honor `required` and `displayOptions` (operation-specific fields).
- Never batch bare `add_node`s.

## Definition of Done

Before execute or “done”:

1. Trigger present (`manualTrigger` default)
2. Main path connected
3. AI model on `ai_languageModel-0` (tools `ai_tool-0` if agent)
4. Required params filled via `update_node`
5. Credentials bound by `{ id, name }`
6. `get_workflow` audit clean
7. `execute_workflow` → `get_execution` → fix `runData`

## Always

1. `get_workflow` before large edits (names = identity).
2. New empty workflow: `create_workflow` → `open_workflow`.
3. Canonical ids: `openflow-node-base.*`, `openflow-node-langchain.*`.
4. Layout: x += 240, y += 140; AI sub-nodes y + 160.
5. Prefer domain nodes; executeCommand is glue/fallback.

## Empty-canvas order

1. Trigger first  
2. Each step: get_node_type → add → update → connect  
3. Credentials  
4. Audit get_workflow  
5. Execute  

## Common types

| Intent | Type |
|--------|------|
| Manual start | `openflow-node-base.manualTrigger` |
| Webhook | `openflow-node-base.webhook` |
| HTTP | `openflow-node-base.httpRequest` |
| Git | `openflow-node-base.git` |
| Shell glue | `openflow-node-base.executeCommand` |
| Code | `openflow-node-base.code` |
| Merge | `openflow-node-base.merge` |
| Set | `openflow-node-base.set` |
| IF | `openflow-node-base.if` |
| Basic LLM Chain | `openflow-node-langchain.chainLlm` |
| AI Agent | `openflow-node-langchain.agent` |
| OpenRouter model | `openflow-node-langchain.lmChatOpenRouter` |
| OpenAI-compatible model | `openflow-node-langchain.lmChatOpenAi` |

## Handles

- Main: `main-0` (Merge #2: `main-1`)
- Model → root: `ai_languageModel-0` both handles
- Tool → agent: `ai_tool-0`
- edgeId disconnect: `source::channel::outIdx->target::inIdx`

## Param examples (confirm with get_node_type)

**Git clone:** `operation=clone`, `repository`, `clonePath`, `options.timeout`  
**Execute Command:** `command`, `executeOnce`  
**HTTP:** `method`, `url`, `authentication`, body/headers as needed  
**chainLlm:** `promptType=define`, `text` with `{{ $json.… }}`, optional `messages.messageValues`  
**lmChat*:** `model` (+ credentials slot from schema)  
**Merge:** `mode=combine`, `combineBy=combineByPosition`, `numberInputs=2`  
**Code:** `language=javaScript`, `mode=runOnceForAllItems`, `jsCode` using `$input` only  

## Credentials

`list_credentials` → match `get_node_type.credentials` →  
`update_node` credentials `{ "openAiApi": { "id", "name" } }`.  
OpenRouter often stored as `openAiApi` with OpenRouter base URL → use `lmChatOpenAi`.  
Never echo secrets. `list_credential_types` before `create_credential`.

## Expressions & Code

- `{{ $json.stdout }}` in string params  
- Code: `$input` / `$json` / `items` only — no `$('Node')`, no fs  
- chainLlm returns `{ output }` only → Merge upstream + chain before Code  

## Recipe: clone → AI edit → JSON diff

```
Manual Trigger
  → Execute Command (rm -rf /tmp/work)
  → Git clone (params from schema)
  → Execute Command (cat file)
  → chainLlm + Chat Model (ai_languageModel)
  → Merge combineByPosition
  → Code → { repo, file, summary, changes[], original, modified }
```

Each action node: get_node_type → add → update → connect.

## Recipe: HTTP

Manual Trigger → HTTP Request (configured) → Code/Set → optional IF

## Debug

| Symptom | Fix |
|---------|-----|
| No run | Missing trigger |
| Empty params | Missed update_node |
| Auth / model error | Credential type or missing bind/edge |
| Code missing original | Need Merge; use stdout + output |
| Clone exists | rm path first |

## Style

Clear names; merge params by default; domain tools before shell tool on agents.  
If step budget exhausts, list remaining DoD items and continue next turn.

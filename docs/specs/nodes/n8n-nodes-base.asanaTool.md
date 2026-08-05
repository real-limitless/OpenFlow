---
type: n8n-nodes-base.asanaTool
displayName: Asana Tool
category: AI
versions: [1]
priority: medium
status: specced
---

# Asana Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.asana.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/asana.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://developers.asana.com/docs/overview | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.asanaTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (standard AI agent tool input)
- **Outputs:** `main` × 1
- **Credentials:** `asanaApi` (Access Token) or `asanaOAuth2Api` (OAuth2)

## Parameters

The Asana Tool node exposes operations grouped by Asana API resource. When connected to an AI agent, parameters can be populated automatically via `$fromAI()`, allowing the LLM to supply resource identifiers, field values, and options dynamically.

| Resource | Operation | Required parameters | Key optional parameters |
|----------|-----------|-------------------|------------------------|
| Project | Create | name | team, workspace, notes, color, dueOn, startOn, layout |
| Project | Delete | project | — |
| Project | Get | project | optFields |
| Project | GetAll | (varies) | team, workspace, archived, optFields |
| Project | Update | project, name | notes, color, dueOn, startOn, layout, archived |
| Subtask | Create | task, name | assignee, notes, dueOn, follower, projects, tags, customFields |
| Subtask | GetAll | task | optFields |
| Task | Create | name | workspace, projects, tags, assignee, notes, dueOn, dueAt, parent, followers, customFields |
| Task | Delete | task | — |
| Task | Get | task | optFields |
| Task | GetAll | project | optFields, completedSince, assignee, section, workspace |
| Task | Move | task, project | — |
| Task | Search | (varies, typically query terms) | project, section, assignee, tags, workspace, completedSince, modifiedSince, sortBy, sortAscending |
| Task | Update | task | name, assignee, notes, dueOn, dueAt, completed, projects, tags, followers, customFields |
| Task Comment | Add | task, text | — |
| Task Comment | Remove | task, comment | — |
| Task Tag | Add | task, tag | — |
| Task Tag | Remove | task, tag | — |
| Task Project | Add | task, project | insertBefore, insertAfter, section |
| Task Project | Remove | task, project | — |
| User | Get | user | optFields |
| User | GetAll | team, workspace | optFields |

All parameters support expressions. Resource and operation selection itself is a fixed parameter — the user (or AI agent) chooses the resource then the operation before specifying the resource-specific parameters.

## Runtime behavior

### Input

The node receives incoming items from an AI Agent root node over the `ai_tool` channel. Input items supply default parameter values via their `json` payload; explicit parameter values override input data.

### Output

Each successful API call produces one output item per operation result. The output JSON contains:

- The Asana API response body wrapped under a resource-specific key (e.g. `data` for task creation responses).
- Standard HTTP metadata does not appear in the output; only the relevant Asana object(s) are forwarded.

When the node is used as an AI tool, the output is trimmed to only the data most relevant to the agent's context window.

### Errors

- **API errors** (400/401/403/404/429): Thrown with the Asana API error message. Respects `continueOnFail`.
- **Missing required parameters**: Validation error before the API call.
- **Rate limiting**: Respects Asana's rate limit headers; the node may surface 429 responses if they occur.

### Expressions

All text and identifier parameters accept expression strings for dynamic values derived from workflow data or AI agent context.

## Acceptance tests

### Test: basic — create a task

**Given** the node is configured with valid **asanaApi** credentials.

**Parameters:**
```json
{
  "resource": "Task",
  "operation": "Create",
  "name": "Test task from n8n",
  "projects": ["{{ $json.projectId }}"]
}
```

**Input item:**
```json
[{ "json": { "projectId": "1234567890" } }]
```

**Expect** output[0] to contain a single item whose JSON includes a `data` property with `gid` and `name` matching the created task.

### Test: list tasks in a project

**Parameters:**
```json
{
  "resource": "Task",
  "operation": "GetAll",
  "project": "{{ $json.projectId }}"
}
```

**Input item:**
```json
[{ "json": { "projectId": "1234567890" } }]
```

**Expect** output[0] to contain an array of items, each with a `data` property representing a task.

### Test: add comment then verify existence

**Parameters (first call):**
```json
{
  "resource": "Task Comment",
  "operation": "Add",
  "task": "{{ $json.taskId }}",
  "text": "Comment generated by workflow"
}
```

**Input item:**
```json
[{ "json": { "taskId": "987654321" } }]
```

**Expect** output[0] to contain the created comment object with `gid` and `text` fields.

### Test: delete a task with continueOnFail

**Parameters:**
```json
{
  "resource": "Task",
  "operation": "Delete",
  "task": "{{ $json.taskId }}"
}
```

**Options:** `continueOnFail: true`

**Expect** on success: output[0] contains the deletion confirmation. On failure (e.g. already deleted): no exception propagates, output[0] is an empty item.

### Test: AI agent dynamic parameter population

**Given** the node is connected to an AI Agent as a tool with `$fromAI()` enabled.

**Prompt from agent:** "Create a task in project ABC called 'Review Q3 budget' due next Friday."

**Expect** the node to receive dynamically populated parameters `name`, `projects`, and `dueOn` inferred by the LLM and produce a 200-series Asana API response with the created task object.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | From public n8n Asana node docs; the Tool variant mirrors the regular node's operations |
| Parameter enumeration | inferred | Exact optional params like `optFields`, `customFields`, `completedSince` inferred from Asana REST API; the n8n node abstracts these |
| Tool-specific response trimming | documented | Public docs confirm tool nodes trim output for AI agent context windows |
| `$fromAI()` support | documented | Confirmed by the n8n docs banner "This node can be used as an AI tool" and AI parameters docs |
| Credential types | documented | Public Asana credentials page documents both Access Token and OAuth2 |
| Exact parameter nesting/conditionals | inferred | The spec intentionally avoids reconstructing the original node's internal UI/displayOptions structure |
| Rate-limit / pagination | inferred | Standard Asana API rate limiting applies; n8n handles pagination transparently |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.asanaTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

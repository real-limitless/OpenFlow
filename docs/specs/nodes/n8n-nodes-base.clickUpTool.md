---
type: n8n-nodes-base.clickUpTool
displayName: ClickUp
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# ClickUp (AI Tool)

An AI agent tool variant of the ClickUp node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Supports all the same resources and operations as the base ClickUp app node. The node descriptor is identical to `n8n-nodes-base.clickUp` with `usableAsTool: true`.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clickup/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/clickup.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://clickup.com/api/ | Third-party API docs |

## Wire format

- **Type string:** `n8n-nodes-base.clickUpTool` (the node descriptor is shared with `n8n-nodes-base.clickUp`; n8n resolves both types to the same `ClickUp` class)
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `clickUpApi` (personal API token, `Authorization: pk_...`) or `clickUpOAuth2Api` (OAuth2, `Authorization: Bearer ...`)

## Parameters

The node is identical to the ClickUp app node in parameters, resources, and operations. See [`n8n-nodes-base.clickUp.md`](./n8n-nodes-base.clickUp.md) for full parameter details.

### Key difference vs app node

In tool mode, the AI agent model can supply parameter values automatically via `$fromAI()`. Text fields such as task name, description, comment text, and tag names are particularly suited to dynamic population. Hierarchical selectors (workspace, space, folder, list) typically retain fixed or expression-based values from the workflow definition rather than being dynamically set by the model.

### Resources and operations

The tool exposes all 14 resources and their operations:

| Resource | Operations |
|----------|------------|
| Checklist | Create, Delete, Update |
| Checklist Item | Create, Delete, Update |
| Comment | Create, Delete, GetAll, Update |
| Folder | Create, Delete, Get, GetAll, Update |
| Goal | Create, Delete, Get, GetAll, Update |
| Goal Key Result | Create, Delete, Update |
| List | Create, Delete, Get, GetAll, GetCustomFields, GetMembers, Update |
| Space Tag | Create, Delete, GetAll, Update |
| Task | Create, Delete, Get, GetAll, GetMembers, SetCustomField, Update |
| Task List | Add, Remove |
| Task Tag | Add, Remove |
| Task Dependency | Create, Delete |
| Time Entry | Create, Delete, Get, GetAll, Start, Stop, Update |
| Time Entry Tag | AddTag, GetAll, RemoveTag |

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `accessToken` | yes | `accessToken` or `oAuth2` |

For AI agent tool usage, the credential must be pre-configured — the model does not dynamically provide authentication.

## Runtime behavior

### Input

Each input item is processed independently. Parameters marked as expression-enabled accept `{{ ... }}` template strings evaluated against the input item.

### Output

The tool produces one output item per processed input item (or per API result for list operations). The output `json` field contains the ClickUp API response body for that operation. For list/getAll operations, pagination is handled automatically.

### Errors

- API errors (4xx/5xx) throw an error that halts execution unless `continueOnFail` is enabled.
- When `continueOnFail` is true, the node produces `{ json: { error: { message, code } } }` and continues to the next item.
- Missing required parameters produce a validation error before any API call.

### Expressions

All text-based parameter values accept n8n expression strings. The `$fromAI()` function is available in tool mode for model-driven parameter population.

## Acceptance tests

### Test: Tool registration as AI agent tool

**Given** an AI Agent node with the ClickUp Tool connected on an `ai_tool` input.

**Expect** the agent workflow to compile and the ClickUp Tool to appear as an available function/tool in the agent's tool list, with a generated tool name and description derived from the node name and the selected resource/operation.

### Test: Create a task via tool

**Given** input items:
```json
[{ "json": { "name": "Task created by AI agent" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "create",
  "workspace": { "__rl": true, "value": "workspaceId", "mode": "id" },
  "space": { "__rl": true, "value": "spaceId", "mode": "id" },
  "list": { "__rl": true, "value": "listId", "mode": "id" },
  "name": "={{ $json.name }}"
}
```

**Expect** output[0] to contain a `json` object with a task ID field (`id`) and the task name matching the input.

### Test: $fromAI() dynamic parameter

**Given** an AI Agent workflow where the ClickUp Tool has `$fromAI()` enabled for the `name` parameter.

**When** the agent processes a user request to create a task called "Review Q3 report",

**Expect** the agent to supply "Review Q3 report" as the value for the `name` parameter, the API call to succeed, and the output task's `name` to match.

### Test: Error propagation

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "create",
  "workspace": { "__rl": true, "value": "invalidWorkspace", "mode": "id" },
  "space": { "__rl": true, "value": "invalidSpace", "mode": "id" }
}
```

**Expect** the tool to throw an error (401 or 404 from ClickUp API). With `continueOnFail: true`, expect output `{ "json": { "error": { ... } } }`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string | Corpus descriptor metadata | `n8n-nodes-base.clickUpTool` is a type alias; `n8n-nodes-base.clickUp` is the primary type with `usableAsTool: true` |
| Resource/operation list | Public docs | Fully enumerated on the ClickUp app node docs page |
| Credential types | Public docs | API access token + OAuth2 both documented |
| $fromAI() support | Public docs | Confirmed for all tool-capable app nodes |
| Dynamic parameter details | Inferred | The exact UX for tool-mode parameter toggles is consistent across all tool variants in n8n |
| Tool name/description generation | Inferred | n8n auto-generates tool metadata from node name and resource/operation |

## OpenFlow mapping

- **Definition group:** `core`
- **Alias target:** `n8n-nodes-base.clickUp` (same executor)
- **Executor file:** `src/lib/engine/executors/clickUp.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

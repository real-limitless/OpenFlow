---
type: n8n-nodes-base.todoistTool
displayName: Todoist
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Todoist (AI Tool)

A tool variant of the Todoist node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Task resource CRUD operations against the Todoist REST API v2.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.todoist.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/todoist/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developer.todoist.com/rest/v2/ | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.todoist`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `todoistApi` (API key) or `todoistOAuth2` (OAuth2)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `apiKey` | no | API key or OAuth2 |

### Task operations

The user selects one of seven operations on the Task resource:

| Operation | Required parameters | Optional parameters |
|-----------|---------------------|---------------------|
| Create | Content (title) | Description, Project ID, Section ID, Labels (string array), Priority (1-4, default 1), Due string ("today", "next Monday", RFC 3339 date), Due language |
| Close | Task ID | — |
| Delete | Task ID | — |
| Get | Task ID | — |
| Get All | — | Project ID, Section ID, Label filter, Filter string, Language, IDs array, Return All (boolean), Limit/Max Results |
| Reopen | Task ID | — |
| Update | Task ID | Content, Description, Project ID, Section ID, Labels, Priority, Due string, Due language |
| Move | Task ID | Project ID (target), Section ID (target), Parent ID (target), Day order |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Content, Description, Labels, Due string, and Priority are common fields the AI agent auto-populates
- The Task ID is typically derived from a prior "Get All" or "Get" call in the same agent session

## Runtime behavior

### Input

Consumes items from `main` input. For Create and Update operations, field values can reference input item properties via expressions.

### Output

All operations produce items on `output[0]`:

- **Create** — returns the created task object from the Todoist REST API (id, content, description, due object with date/is_recurring/string/lang, priority, labels, project_id, url, order, comment_count, created_at, creator_id, is_completed)
- **Close** — returns `{ "success": true }` or propagates the input item
- **Delete** — returns `{ "success": true }` or propagates the input item
- **Get** — returns the single task object matching the Task ID (same shape as Create output)
- **Get All** — returns an array of task objects (same shape per item); if `returnAll` is false, limited by max results
- **Reopen** — returns `{ "success": true }` or propagates the input item
- **Update** — returns `{ "success": true }` on success
- **Move** — returns `{ "success": true }` on success

The task output shape follows the Todoist REST API v2 task schema:
- `id` (string) — task identifier
- `content` (string) — task title/content
- `description` (string) — task description
- `due` (object) — `{ date: string, is_recurring: boolean, lang: string, string: string }`
- `priority` (integer 1-4) — task priority
- `labels` (string array) — label names
- `project_id` (string) — owning project
- `order` (integer) — position within project
- `url` (string) — permalink to the task in Todoist UI
- `comment_count` (integer) — number of comments
- `created_at` (string) — ISO 8601 timestamp
- `creator_id` (string) — user ID who created the task
- `is_completed` (boolean) — completion status

### Errors

- API errors (auth failures, invalid task IDs, rate limits) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Operations against non-existent projects or sections return 404 errors

### Expressions

All string/boolean/number fields accept standard n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: Create a task

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "create",
  "content": "Buy groceries",
  "description": "Milk, eggs, bread",
  "priority": 2,
  "due_string": "today"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<valid-task-id>",
    "content": "Buy groceries",
    "description": "Milk, eggs, bread",
    "priority": 2,
    "due": { "string": "today", "date": "2026-08-03", "is_recurring": false, "lang": "en" },
    "is_completed": false,
    "labels": [],
    "project_id": "<project-id>",
    "comment_count": 0,
    "url": "https://todoist.com/showTask?id=<valid-task-id>"
  }
}]
```

### Test: Get a task by ID

**Given** input items:
```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "get",
  "taskId": "={{ $json.taskId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "abc123",
    "content": "Buy groceries",
    "is_completed": false,
    "priority": 1
  }
}]
```

### Test: Close a task

**Given** input items:
```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "close",
  "taskId": "={{ $json.taskId }}"
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

### Test: Get all tasks in a project

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "getAll",
  "projectId": "proj456",
  "returnAll": true
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<task-id-1>",
    "content": "Buy groceries",
    "is_completed": false
  }
}, {
  "json": {
    "id": "<task-id-2>",
    "content": "Submit report",
    "is_completed": true
  }
}]
```

### Test: Update a task (move to another project)

**Given** input items:
```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "move",
  "taskId": "={{ $json.taskId }}",
  "projectId": "proj789"
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations (7 on Task resource) | documented | Public docs list: Create, Close, Delete, Get, Get All, Reopen, Update |
| Move operation existence | inferred from corpus | Schema JSON present for v2.1.0 task/move; not listed in public docs operations list |
| $fromAI() dynamic parameter support | documented | Public docs describe the feature for AI tool nodes |
| Todoist REST API v2 task schema | documented | External API docs detail the full task resource shape |
| Credential types (API key + OAuth2) | documented | Public credentials doc lists both methods |
| Exact parameter defaults (priority default 1) | documented | Todoist API docs specify priority 1-4 range |
| Output shape for update/close/move | inferred from corpus | Schema shows `{ "success": boolean }` return shape |
| Sub-resources (Project, Section, Label, Comment) | inferred | Only Task resource is exposed; other Todoist resources (Project, Section, Label) are not modeled as separate operations |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.todoistTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

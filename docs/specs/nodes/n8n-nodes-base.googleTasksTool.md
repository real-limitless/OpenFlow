---
type: n8n-nodes-base.googleTasksTool
displayName: Google Tasks
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Tasks (AI Tool)

A tool variant of the Google Tasks node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Task resource CRUD operations against the Google Tasks API v1.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googletasks.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.google.com/tasks/reference/rest/v1/tasks | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleTasksTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleTasksOAuth2` (OAuth2 only; service account not supported for Google Tasks)

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | Only `oAuth2` is supported for Google Tasks |

### Task operations

The user selects one of five operations on the Task resource:

| Operation | Required parameters | Optional parameters |
|-----------|---------------------|---------------------|
| Create | Task List ID, Title | Notes, Due date (RFC 3339 date), Status (needsAction/completed) |
| Delete | Task List ID, Task ID | — |
| Get | Task List ID, Task ID | — |
| Get All | Task List ID | Return All (boolean), Max Results, Show Completed (boolean), Show Hidden (boolean) |
| Update | Task List ID, Task ID | Title, Notes, Due date (RFC 3339 date), Status (needsAction/completed), Completed date |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The Task List ID can be resolved from the authenticated user's default task list or a specific list ID
- Optional fields are auto-populated by the AI agent when "let model fill" is enabled

## Runtime behavior

### Input

Consumes items from `main` input. For Create and Update operations, field values can reference input item properties via expressions.

### Output

All operations produce items on `output[0]`:

- **Create** — returns the created task object from the Google Tasks API (id, title, notes, due, status, etc.)
- **Delete** — returns the original input item (or empty object) confirming deletion
- **Get** — returns the single task object matching the Task ID
- **Get All** — returns an array of task objects; if `returnAll` is false, limited by `maxResults`
- **Update** — returns the updated task object from the API

Output shape follows the Google Tasks API v1 task resource schema:
- `id` (string) — task identifier
- `title` (string) — task title
- `notes` (string) — task notes
- `status` (string) — `needsAction` or `completed`
- `due` (string) — RFC 3339 date
- `completed` (string) — RFC 3339 timestamp (only when completed)
- `position` (string) — ordering position
- `parent` (string) — parent task ID (if subtask)
- `webViewLink` (string) — link to task in Google Tasks UI
- `updated` (string) — last modification timestamp

### Errors

- API errors (auth failures, invalid task list/task IDs, rate limits) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error

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
  "taskListId": "@default",
  "title": "Buy groceries",
  "notes": "Milk, eggs, bread",
  "due": "2026-08-15T00:00:00Z"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<valid-task-id>",
    "title": "Buy groceries",
    "notes": "Milk, eggs, bread",
    "status": "needsAction",
    "due": "2026-08-15"
  }
}]
```

### Test: Get all tasks from a task list

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "getAll",
  "taskListId": "@default",
  "returnAll": true,
  "showCompleted": true,
  "showHidden": false
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "<task-id-1>",
    "title": "Buy groceries",
    "status": "needsAction"
  }
}, {
  "json": {
    "id": "<task-id-2>",
    "title": "Submit report",
    "status": "completed",
    "completed": "2026-08-01T10:00:00.000Z"
  }
}]
```

### Test: Update a task status to completed

**Given** input items:
```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "update",
  "taskListId": "@default",
  "taskId": "={{ $json.taskId }}",
  "status": "completed"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "abc123",
    "title": "Buy groceries",
    "status": "completed",
    "completed": "<iso-timestamp>"
  }
}]
```

### Test: Delete a task

**Given** input items:
```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "delete",
  "taskListId": "@default",
  "taskId": "={{ $json.taskId }}"
}
```

**Expect** output[0]:
```json
[{ "json": {} }]
```

### Test: Get a single task

**Given** input items:
```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "get",
  "taskListId": "@default",
  "taskId": "={{ $json.taskId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "abc123",
    "title": "Buy groceries",
    "status": "needsAction",
    "due": "2026-08-15"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations (Task CRUD) | documented | Public docs list 5 operations: Add, Delete, Get, Get All, Update |
| $fromAI() dynamic parameter support | documented | Public docs describe the feature for Google Tools category nodes |
| Task List ID resolution | inferred | Default task list ID (@default) is a common pattern; exact mechanism inferred |
| Subtask (parent) support | inferred from API | Google Tasks API supports parent field and move method; not confirmed which operations expose it |
| Exact output shape per operation | inferred from API docs | Google Tasks API v1 task resource schema is well-documented |
| Version differences | inferred | Single version (1.0) for this tool variant |
| Service account support | documented | Google Tasks supports OAuth2 only per credentials compatibility table |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleTasksTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
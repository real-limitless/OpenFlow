---
type: n8n-nodes-base.googleTasks
displayName: Google Tasks
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Google Tasks

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googletasks/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://developers.google.com/workspace/tasks/reference/rest/v1/tasks | Third-party API docs |
| https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists | Third-party API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.googleTasks`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleTasksOAuth2Api` (extends Google OAuth2 single-service credential)

## Parameters

The node exposes a single resource (`Task`) with five operations. The primary parameter is a resource/operation pair.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixedString | `task` | yes | always | Single resource: `task` |
| operation | options | `create` | yes | `resource=task` | One of: `create`, `delete`, `get`, `getAll`, `update` |
| taskListId | string | — | yes | all operations | Identifier of the task list (Google Tasks taskList resource ID); can be an expression |
| taskId | string | — | yes | `delete`, `get`, `update` | Identifier of the task (can be an expression) |
| title | string | — | yes (create) | `operation=create` | Task title, max 1024 characters |
| notes | string | — | no | `operation=create` (or `update`) | Task description, max 8192 characters |
| dueDate | dateTime | — | no | `operation=create` (or `update`) | Due date in RFC 3339 format (only date portion stored); optional |
| status | options | `needsAction` | no | `operation=update` | `needsAction` or `completed` |
| completed | dateTime | — | no | `operation=update`, `status=completed` | Completion timestamp in RFC 3339 format |
| returnAll | boolean | false | no | `operation=getAll` | If true, return all tasks; if false, use `limit` |
| limit | number | 50 | no | `operation=getAll`, `returnAll=false` | Max number of tasks to return (max 100) |
| showCompleted | boolean | true | no | `operation=getAll` | Include completed tasks in results |
| showDeleted | boolean | false | no | `operation=getAll` | Include deleted tasks in results |
| showHidden | boolean | false | no | `operation=getAll` | Include hidden tasks in results |

### Additional options (collectible)

The `update` and `create` operations expose an `options` collection that may contain:
- `previousTaskId` — string identifier of the task to position this task after (for ordering)

## Runtime behavior

### Input

The node receives items from the previous node. Each item's `json` properties may be referenced in parameter expressions. The node does not use binary data.

### Output

Each operation produces one output item per API call. The output item wraps the Google Tasks API response under `json`.

**create:** Returns the created task resource object as defined by the Google Tasks API (fields: `id`, `title`, `notes`, `due`, `status`, `position`, `updated`, `selfLink`, `etag`, `kind`, `webViewLink`, `links`, etc.).

**delete:** Returns the input item unchanged (pass-through). The API call returns an empty 204 response.

**get:** Returns the single task resource object matching the given `taskId`.

**getAll:** Returns an array of task resource objects. If `returnAll` is false, respects `limit` (max 100). The response shape is the Google Tasks API `tasks.list` response — the `items` array is output as the node output items.

**update:** Returns the updated task resource object. The API uses `PATCH` semantics (partial update — only provided fields are modified).

### Errors

- If the credential is invalid or missing, throw a `NodeOperationError` with message indicating authentication failure.
- If `taskListId` or `taskId` references a non-existent resource, the Google Tasks API returns a 404; the node should surface this as a `NodeOperationError`.
- If `continueOnFail` is true, return `[{ json: { error: errorMessage } }]` on the output[0] branch instead of throwing.
- API rate limits apply per Google Workspace quota.

### Expressions

All string parameters accept expressions. The `taskListId` and `taskId` parameters are typically populated from workflow data or previous node output.

## Acceptance tests

### Test: create a task

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "create",
  "taskListId": "{{ $json.taskListId }}",
  "title": "Buy groceries",
  "notes": "Milk, eggs, bread",
  "dueDate": "2026-08-15T00:00:00Z"
}
```

**Expect** output[0].json to contain a task object with:
- `kind` = `"tasks#task"`
- `title` = `"Buy groceries"`
- `notes` = `"Milk, eggs, bread"`
- `due` = `"2026-08-15T00:00:00.000Z"`
- `status` = `"needsAction"`
- `id` is a non-empty string

### Test: get all tasks with limit

**Given** input items:

```json
[{ "json": { "taskListId": "@default" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "getAll",
  "taskListId": "{{ $json.taskListId }}",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] to be an array of task objects, each with `kind` = `"tasks#task"`, and the array length ≤ 10.

### Test: update task status to completed

**Given** input items:

```json
[{ "json": { "taskListId": "@default", "taskId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "update",
  "taskListId": "{{ $json.taskListId }}",
  "taskId": "{{ $json.taskId }}",
  "status": "completed",
  "completed": "2026-08-10T12:00:00Z"
}
```

**Expect** output[0].json to contain:
- `id` = `"abc123"`
- `status` = `"completed"`
- `completed` is a non-empty RFC 3339 timestamp

### Test: delete a task (pass-through)

**Given** input items:

```json
[{ "json": { "taskListId": "@default", "taskId": "abc123", "originalData": "preserve" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "delete",
  "taskListId": "{{ $json.taskListId }}",
  "taskId": "{{ $json.taskId }}"
}
```

**Expect** output[0].json contains `originalData` = `"preserve"` (input item is passed through unchanged).

### Test: get a single task

**Given** input items:

```json
[{ "json": { "taskListId": "@default", "taskId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "get",
  "taskListId": "{{ $json.taskListId }}",
  "taskId": "{{ $json.taskId }}"
}
```

**Expect** output[0].json to contain:
- `id` = `"abc123"`
- `kind` = `"tasks#task"`

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Task resource operations | Public docs + Google Tasks API | 5 operations confirmed (create/delete/get/getAll/update) |
| Task list selection | Inferred | n8n docs do not describe the exact `taskListId` parameter; the Google Tasks API requires a task list ID for all task operations. The `@default` sentinel value is inferred from analogous Google nodes. |
| Parameter names and defaults | Public descriptor metadata | Confirmed `resource`, `operation`, `taskListId`, `taskId`, `title`, `notes`, `dueDate`, `status`, `completed`, `returnAll`, `limit`, `showCompleted`, `showDeleted`, `showHidden`, `options.previousTaskId` |
| Options collection | Inferred from descriptor | The `options` collectible with `previousTaskId` is confirmed from descriptor metadata |
| Pass-through on delete | Inferred | Standard n8n convention for delete operations returning 204 |
| Multi-resource support | Documented | Only `Task` resource is documented; no `TaskList` CRUD operations are exposed in the n8n node |

## OpenFlow mapping

- **Definition group:** `Productivity`
- **Executor file:** `src/lib/engine/executors/google-tasks.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
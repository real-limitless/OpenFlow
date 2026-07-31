---
type: n8n-nodes-base.microsoftToDo
displayName: Microsoft To Do
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Microsoft To Do

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsofttodo/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftToDo`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftToDoOAuth2Api` (extends `microsoftOAuth2Api`), `microsoftEntraServicePrincipal` (app-only)

## Parameters

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `linkedResource` | yes | `linkedResource` \| `list` \| `task` |

### Linked Resource operations

Linked resources represent external URLs or references (e.g., a link to a SharePoint page, a file, or a website) attached to a Microsoft To Do task.

| operation | display | required params | optional params | notes |
|-----------|---------|----------------|----------------|-------|
| `create` | Create | list ID or name, task ID or name, linked resource web URL, linked resource name | — | Creates a new linked resource on a task (e.g., `id`, `webUrl`, `applicationName`, `displayName`). The `list` and `task` parameters reference parent entities. |
| `delete` | Delete | list ID or name, task ID or name, linked resource ID | — | Deletes a linked resource from a task. Input item passes through unchanged. |
| `get` | Get | list ID or name, task ID or name, linked resource ID | — | Returns the linked resource metadata (`id`, `webUrl`, `applicationName`, `displayName`, `externalId`). |
| `getAll` | Get All | list ID or name, task ID or name | returnAll, limit | Returns all linked resources attached to a task. |
| `update` | Update | list ID or name, task ID or name, linked resource ID | — | Updates the linked resource details (e.g., `webUrl`, `displayName`). |

### List operations

Lists represent task groups (e.g., "Tasks", "Errands", "Shopping").

| operation | display | required params | optional params | notes |
|-----------|---------|----------------|----------------|-------|
| `create` | Create | display name | — | Creates a new task list. The list name is the primary identifier. |
| `delete` | Delete | list ID or name | — | Deletes a task list. Input item passes through unchanged. |
| `get` | Get | list ID or name | — | Returns the list metadata (`id`, `displayName`, `wellknownListName`). |
| `getAll` | Get All | — | returnAll, limit | Returns all task lists for the authenticated user. The node provides a dynamic `loadOptions` method (`getTaskLists`) for dropdown selection of lists. |
| `update` | Update | list ID or name | display name | Updates the list's display name. |

### Task operations

| operation | display | required params | optional params | notes |
|-----------|---------|----------------|----------------|-------|
| `create` | Create | list ID or name, title | content type, body, dueDateTime, importance, isReminderOn, reminderDateTime, recurrence, startDateTime, status, taskCategories, linkedResources | Creates a task in the specified list. The `body` parameter accepts `content` + `contentType` (text/html). `importance` values: `low`, `normal`, `high`. `status` values: `notStarted`, `inProgress`, `completed`, `waitingOnOthers`, `deferred`. |
| `delete` | Delete | list ID or name, task ID | — | Deletes a task. Input item passes through unchanged. |
| `get` | Get | list ID or name, task ID | — | Returns the task object with all fields (`id`, `title`, `body`, `createdDateTime`, `lastModifiedDateTime`, `dueDateTime`, `importance`, `isReminderOn`, `reminderDateTime`, `startDateTime`, `status`, `categories`, `recurrence`, `completedDateTime`, `percentComplete`, `checklistItems`, `linkedResources`). |
| `getAll` | Get All | list ID or name | returnAll, limit | Returns all tasks in a list. |
| `update` | Update | list ID or name, task ID | title, body, dueDateTime, importance, isReminderOn, reminderDateTime, recurrence, startDateTime, status, categories | Updates task fields. Only provided fields are modified. |

### Reference parameters (all operations)

Both `list` and `task` can be specified as:
- **ID directly** — a string identifier
- **Name** — resolved via the Graph API to the corresponding ID

The node's `loadOptions.getTaskLists` method provides dynamic dropdown options for list selection when building workflows in the UI.

### Credential authentication

The node's Authentication dropdown offers two credential types:
- **Microsoft To Do OAuth2** — node-specific credential (extends `microsoftOAuth2Api`), default
- **Microsoft Entra Service Principal (App-Only)** — app-only access with no signed-in user

For government cloud tenants (US Government, US Government DOD, China), the credential's **Microsoft Graph API Base URL** must be set to the appropriate endpoint.

## Runtime behavior

### External API (Microsoft Graph)

The node communicates with the Microsoft Graph API at `https://graph.microsoft.com/v1.0/`:

- `GET /me/todo/lists` — list all task lists
- `POST /me/todo/lists` — create a task list
- `GET /me/todo/lists/{list-id}` — get a task list
- `PATCH /me/todo/lists/{list-id}` — update a task list
- `DELETE /me/todo/lists/{list-id}` — delete a task list
- `GET /me/todo/lists/{list-id}/tasks` — list all tasks in a list
- `POST /me/todo/lists/{list-id}/tasks` — create a task
- `GET /me/todo/lists/{list-id}/tasks/{task-id}` — get a task
- `PATCH /me/todo/lists/{list-id}/tasks/{task-id}` — update a task
- `DELETE /me/todo/lists/{list-id}/tasks/{task-id}` — delete a task
- `GET /me/todo/lists/{list-id}/tasks/{task-id}/linkedResources` — list linked resources
- `POST /me/todo/lists/{list-id}/tasks/{task-id}/linkedResources` — create a linked resource
- `GET /me/todo/lists/{list-id}/tasks/{task-id}/linkedResources/{resource-id}` — get a linked resource
- `PATCH /me/todo/lists/{list-id}/tasks/{task-id}/linkedResources/{resource-id}` — update a linked resource
- `DELETE /me/todo/lists/{list-id}/tasks/{task-id}/linkedResources/{resource-id}` — delete a linked resource

Pagination uses `@odata.nextLink` from the response body for continuation.

### Input

Each input item is processed independently. Parameters such as list ID, task ID, and field values can reference item properties via `{{ }}` expressions.

### Output

- **Create** operations: return the created resource object from the Graph API (e.g., `id`, `title`, `createdDateTime`, `body` for tasks; `id`, `displayName`, `wellknownListName` for lists; `id`, `webUrl`, `applicationName` for linked resources).
- **Get** operations: return the resource object with all standard fields.
- **GetAll** operations: unwrap the `value` array from the API response, producing one output item per resource.
- **Update** operations: return the updated resource object.
- **Delete** operations: pass the input item through unchanged (the Graph API returns `204 No Content`).

### Errors

- Missing or invalid credentials: throw `NodeOperationError`.
- Graph API errors (HTTP 4xx/5xx): propagate as `NodeOperationError` with the API error message.
- Resource not found (404): throw `NodeOperationError`.
- When `continueOnFail` is enabled, the node emits `[{ json: { error: { message, ... } } }]` on the primary output instead of throwing.

### Expressions

All string and reference parameters accept `{{ }}` expression syntax. Binary data operations are not applicable to this node (no upload/download).

## Acceptance tests

### Test: create a task list

**Given** input items:

```json
[{ "json": { "listName": "Errands" } }]
```

**Parameters:**

```json
{
  "resource": "list",
  "operation": "create",
  "displayName": "{{ $json.listName }}"
}
```

**Expect** output[0] — each item contains the created list object with `id`, `displayName`, and `wellknownListName`.

### Test: get all tasks

**Given** input items:

```json
[{ "json": { "listId": "AAMkADkz..." } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "getAll",
  "listId": "{{ $json.listId }}",
  "returnAll": true
}
```

**Expect** output[0] — one item per task; each item has `json` fields including `id`, `title`, `createdDateTime`, `lastModifiedDateTime`, `importance`, `status`, and `body`.

### Test: create a task with due date

**Given** input items:

```json
[{ "json": { "listId": "AAMkADkz...", "taskTitle": "Buy groceries" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "create",
  "listId": "{{ $json.listId }}",
  "title": "{{ $json.taskTitle }}",
  "dueDateTime": "2026-08-15T18:00:00Z",
  "importance": "high"
}
```

**Expect** output[0] — the created task object includes `id`, `title`, `dueDateTime`, `importance`, `status` (defaults to `notStarted`), and `createdDateTime`.

### Test: delete a task (continueOnFail)

**Given** input items:

```json
[{ "json": { "listId": "AAMkADkz...", "taskId": "NONEXISTENT" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "delete",
  "listId": "{{ $json.listId }}",
  "taskId": "{{ $json.taskId }}",
  "continueOnFail": true
}
```

**Expect** output[0] — `[{ "json": { "error": "…" } }]` instead of a thrown error.

### Test: update a task status

**Given** input items:

```json
[{ "json": { "listId": "AAMkADkz...", "taskId": "ABC123" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "update",
  "listId": "{{ $json.listId }}",
  "taskId": "{{ $json.taskId }}",
  "status": "completed"
}
```

**Expect** output[0] — the updated task object with `status` set to `completed` and `completedDateTime` populated.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources + operations | documented | Public docs list Linked Resource (5 ops), List (5 ops), Task (5 ops) |
| Credential types | documented | `microsoftToDoOAuth2Api` (extends `microsoftOAuth2Api`) + `microsoftEntraServicePrincipal` (app-only) |
| Parameter names and exact option enums | inferred from descriptor | Task importance/status enums, body content type, recurrence, etc. abstracted at outcome level |
| Graph API endpoints | inferred from Microsoft Graph To Do API docs | Standard `me/todo/lists` and `me/todo/lists/{id}/tasks` endpoints |
| LoadOptions method | confirmed from descriptor | `getTaskLists` for dynamic list dropdown |
| Category | confirmed from descriptor | `Productivity` |
| Delete passthrough | inferred | Standard pattern: `204 No Content` → pass input through unchanged |
| Pagination | inferred | Standard `@odata.nextLink` continuation via Graph API |
| Error handling | inferred | Standard n8n pattern: API errors propagate as `NodeOperationError` |

## OpenFlow mapping

- **Definition group:** `core` (Productivity)
- **Executor file:** `src/lib/engine/executors/microsoft-to-do.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
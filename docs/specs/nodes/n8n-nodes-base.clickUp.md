---
type: n8n-nodes-base.clickUp
displayName: ClickUp
category: Productivity
versions: [1]
priority: medium
status: specced
---

# ClickUp

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clickup/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/clickup.md | Public docs only |
| https://developer.clickup.com/reference | Third-party API docs |

## Wire format

- **Type string:** `n8n-nodes-base.clickUp`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `clickUpApi` (personal API token, `Authorization: pk_...`) or `clickUpOAuth2Api` (OAuth2, `Authorization: Bearer ...`)

## Parameters

The node uses a **resource + operation** pattern. The user first selects a resource group, then an operation within that group. Each operation exposes its own set of parameters.

### Resource: Checklist

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, folder (or list) for scope, checklist name |
| Delete | workspace, space, folder (or list), checklist ID |
| Update | workspace, space, folder (or list), checklist ID, new name |

### Resource: Checklist Item

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, folder (or list), checklist ID, item name, assignee (optional) |
| Delete | workspace, space, folder (or list), checklist ID, item ID |
| Update | workspace, space, folder (or list), checklist ID, item ID, new name, assignee (optional), resolved (boolean) |

### Resource: Comment

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, scope (task/checklist/chat), scope ID, comment text, notify all (boolean), assignee (optional) |
| Delete | workspace, space, comment ID |
| GetAll | workspace, space, scope (task/chat), scope ID, page/limit for pagination |
| Update | workspace, space, comment ID, new text, resolved (boolean) |

### Resource: Folder

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, folder name |
| Delete | workspace, space, folder ID |
| Get | workspace, space, folder ID |
| GetAll | workspace, space |
| Update | workspace, space, folder ID, new name |

### Resource: Goal

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, goal name, due date, description, color, multiple owners (by team ID or user ID) |
| Delete | workspace, goal ID |
| Get | workspace, goal ID |
| GetAll | workspace |
| Update | workspace, goal ID, updated fields (name, due date, description, color, owners) |

### Resource: Goal Key Result

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, goal ID, key result name, type (number/currency/percentage/automatic), target value, unit, assignee, owner |
| Delete | workspace, goal ID, key result ID |
| Update | workspace, goal ID, key result ID, updated fields |

### Resource: List

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, folder (or folderless), list name, content, due date, priority, assignee, status |
| GetCustomFields | workspace, space, folder (or folderless), list ID |
| Delete | workspace, space, folder (or folderless), list ID |
| Get | workspace, space, folder (or folderless), list ID |
| GetAll | workspace, space, folder (or folderless), pagination |
| GetMembers | workspace, space, folder (or folderless), list ID |
| Update | workspace, space, folder (or folderless), list ID, updated fields |

### Resource: Space Tag

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, tag name, tag color (hex foreground/background) |
| Delete | workspace, space, tag name |
| GetAll | workspace, space |
| Update | workspace, space, tag name, new name, new color |

### Resource: Task

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, list ID, name, description, assignees, tags, priority, due date, status, start date, time estimate, parent task, links to, check required custom fields, custom fields JSON |
| Delete | workspace, space, list ID, task ID |
| Get | workspace, space, list ID, task ID; optional: include subtasks (boolean), include markdown description (boolean) |
| GetAll | workspace, space, list ID (or folder, or space-level), filters: statuses, assignees, tags, due date range, priority, archived, page/limit, order_by, include_closed, include_markdown_description, subtasks, custom_fields; supports paginated iteration |
| GetMembers | workspace, space, list ID |
| SetCustomField | workspace, space, list ID, task ID, custom field ID, field value |
| Update | workspace, space, list ID, task ID, updatable fields (same as create) |

### Resource: Task List

| Operation | Key parameters |
|-----------|----------------|
| Add | workspace, space, task ID, list ID |
| Remove | workspace, space, task ID, list ID |

### Resource: Task Tag

| Operation | Key parameters |
|-----------|----------------|
| Add | workspace, space, task ID, list ID, tag name |
| Remove | workspace, space, task ID, list ID, tag name |

### Resource: Task Dependency

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, task ID, depends on task ID, dependency type (waiting_on/blocking) |
| Delete | workspace, space, task ID, dependency ID |

### Resource: Time Entry

| Operation | Key parameters |
|-----------|----------------|
| Create | workspace, space, folder (or list), task ID, start time, duration, description, assignee, tags, billable (boolean) |
| Delete | workspace, space, folder (or list), task ID, time entry ID |
| Get | workspace, space, folder (or list), task ID, time entry ID |
| GetAll | workspace, space, folder (or list), task ID, time entry IDs, start/end date range, page/limit, include task tags, query filters |
| Start | workspace, space, folder (or list), task ID, description, tags, billable, assignee |
| Stop | workspace, space (no additional params — stops the running timer) |
| Update | workspace, space, folder (or list), task ID, time entry ID, updated fields |

### Resource: Time Entry Tag

| Operation | Key parameters |
|-----------|----------------|
| AddTag | workspace, space, folder (or list), task ID, time entry ID, tag name |
| GetAll | workspace, space, folder (or list), task ID, time entry ID |
| RemoveTag | workspace, space, folder (or list), task ID, time entry ID, tag name |

### Common parameters across resources

- **workspace** (team): The ClickUp Workspace (team) to operate on. Populated via a loadOptions method that calls GET /api/v2/team.
- **space**: The ClickUp Space within the selected workspace. Options are loaded dynamically based on the workspace selection.
- **folder** / **folderless**: Many operations accept either a folder ID or a "folderless" flag to target lists outside folders.
- **list**: The ClickUp List within the selected folder/space.
- **task**: The ClickUp Task ID.

### Additional options (task operations)

The **Get a task** operation supports two documented boolean options:
- **Include Subtasks**: When true, the response includes subtasks nested under the task.
- **Include Markdown Description**: When true, the response includes a `markdown_description` field preserving links and formatting.

## Runtime behavior

### Input

Each input item is processed independently. The node reads the configured resource, operation, and parameter values from the node definition. Parameters marked as expression-enabled accept `{{ ... }}` template strings that are evaluated against the input item.

### Output

The node produces one output item per processed input item (or per API result for list operations). The output `json` field contains the ClickUp API response body for that operation. For list/getAll operations, pagination is handled automatically — the node fetches all pages and emits one item per result row.

For non-list operations, the output item preserves the input item's `json` fields and adds the API response under the operation-specific key.

### Errors

- API errors (4xx/5xx from ClickUp) throw an error that halts execution unless `continueOnFail` is enabled.
- When `continueOnFail` is true, the node produces an output item with `{ json: { error: { message, code } } }` and continues processing the next item.
- Authentication failures (401) and resource-not-found (404) are the most common error types.
- Missing required hierarchical parameters (e.g., workspace without space) produce a validation error before any API call.

### Expressions

All text-based parameter values accept n8n expression strings. Hierarchical resource selectors (workspace, space, folder, list) are typically populated from loadOptions and may also accept expressions.

## Acceptance tests

### Test: Create a task

**Given** input items:

```json
[{ "json": { "name": "Test task from n8n" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "create",
  "workspace": { "__rl": true, "value": "workspaceId", "mode": "id" },
  "space": { "__rl": true, "value": "spaceId", "mode": "id" },
  "list": { "__rl": true, "value": "listId", "mode": "id" },
  "name": "Test task from n8n",
  "description": "Created by automated test"
}
```

**Expect** output[0] to contain a `json` object with a task ID field (`id`) and the task name matching the input.

### Test: Get a task with options

**Given** input items:

```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "get",
  "workspace": { "__rl": true, "value": "workspaceId", "mode": "id" },
  "space": { "__rl": true, "value": "spaceId", "mode": "id" },
  "list": { "__rl": true, "value": "listId", "mode": "id" },
  "task": "abc123",
  "includeSubtasks": true,
  "includeMarkdownDescription": true
}
```

**Expect** output[0] to have `json.task` with `subtasks` array present, and a `markdown_description` field in the task object.

### Test: Get all tasks with pagination

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "getAll",
  "workspace": { "__rl": true, "value": "workspaceId", "mode": "id" },
  "space": { "__rl": true, "value": "spaceId", "mode": "id" },
  "list": { "__rl": true, "value": "listId", "mode": "id" },
  "limit": 50
}
```

**Expect** output items count > 0, each with `json.id` identifying a task. If the list has more than 50 tasks, the node should auto-paginate and emit all tasks across multiple output items.

### Test: Create a comment on a task

**Given** input items:

```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "comment",
  "operation": "create",
  "workspace": { "__rl": true, "value": "workspaceId", "mode": "id" },
  "space": { "__rl": true, "value": "spaceId", "mode": "id" },
  "commentScope": "task",
  "task": "abc123",
  "commentText": "This is a test comment from n8n"
}
```

**Expect** output[0] to have `json.id` (comment ID) and `json.comment_text` matching the input.

### Test: Start and stop a time entry

**Given** input items:

```json
[{ "json": { "taskId": "abc123" } }]
```

**Parameters (start):**

```json
{
  "resource": "timeEntry",
  "operation": "start",
  "workspace": { "__rl": true, "value": "workspaceId", "mode": "id" },
  "space": { "__rl": true, "value": "spaceId", "mode": "id" },
  "task": "abc123",
  "description": "Time tracking test"
}
```

**Expect** output[0] to have `json.id` (time entry ID) and `json.task.id` matching the task ID.

**Parameters (stop, same context):**

```json
{
  "resource": "timeEntry",
  "operation": "stop",
  "workspace": { "__rl": true, "value": "workspaceId", "mode": "id" },
  "space": { "__rl": true, "value": "spaceId", "mode": "id" }
}
```

**Expect** output[0] to have `json.id` and `json.duration` reflecting the elapsed time.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Public docs | Fully enumerated in the operations section of the docs page |
| Get a task options | Public docs | Include Subtasks and Include Markdown Description are explicitly documented |
| Credential types | Public docs | API access token + OAuth2 both documented |
| Workspace hierarchy | Third-party API docs | ClickUp API v2 reference confirms team/space/folder/list/task hierarchy |
| Parameter details per operation | Inferred | Public docs list operations but not individual parameter names/defaults; the parameter table above is derived from the ClickUp API v2 endpoint shapes |
| Pagination behavior | Inferred | Tasks endpoint supports page/limit; the node likely auto-paginates (common pattern in n8n app nodes) |
| loadOptions | Public descriptor metadata | Confirmed via descriptor: getTeams, getSpaces, getFolders, getLists, getFolderlessLists, getAssignees, getTags, getTimeEntryTags, getStatuses, getCustomFields, getTasks |
| Guest resource | Corpus only (not public) | Excluded from spec — not present in public n8n docs |
| Version | Descriptor metadata | Confirmed version 1.0 |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/clickUp.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
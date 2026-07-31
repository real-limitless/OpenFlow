---
type: n8n-nodes-base.todoist
displayName: Todoist
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Todoist

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.todoist.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/todoist.md | Public docs only |
| https://developer.todoist.com/rest/v2/#overview | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.todoist`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `todoistApi` (API key) or `todoistOAuth2Api` (OAuth2)

The `todoistApi` credential requires an API token string obtained from the Todoist integration settings page at `https://todoist.com/prefs/integrations`. The `todoistOAuth2Api` credential implements the OAuth2 authorization-code flow with optional refresh; on n8n Cloud the OAuth redirect is handled automatically, while self-hosted instances require a registered application with Client ID and Client Secret from the Todoist App Management Console.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | task | yes | — | Always `task`; the node exposes a single resource |
| operation | fixed | create | yes | — | One of: `create`, `close`, `delete`, `get`, `getAll`, `reopen`, `update` |
| projectId | string | — | conditional | operation = create / getAll / update | Todoist project ID; required on create, optional on getAll (filter) and update (move) |
| content | string | — | conditional | operation = create / update | Task content/description; required on create |
| taskId | string | — | conditional | operation = close / delete / get / reopen / update | Todoist task ID |
| description | string | — | no | operation = create / update | Longer text description (markdown supported) |
| labels | string | — | no | operation = create / update | Comma-separated label names |
| priority | number | 1 | no | operation = create / update | Integer 1–4 (1 = normal, 4 = urgent) |
| dueDateTime | string | — | no | operation = create / update | ISO 8601 datetime string for due date with time |
| dueDate | string | — | no | operation = create / update | Date string (YYYY-MM-DD) for full-day due date |
| sectionId | string | — | no | operation = create / update | Move task to a specific section |
| parentId | string | — | no | operation = create / update | Parent task ID for sub-tasks |
| order | number | — | no | operation = create / update | Integer sort order within the project |
| assigneeId | string | — | no | operation = create / update | User ID to assign the task |
| duration | number | — | no | operation = create / update | Duration in minutes (Todoist Premium) |
| dueLang | string | — | no | operation = create / update | Language for natural-language due dates (e.g. `en`) |
| limit | number | 50 | no | operation = getAll | Maximum number of tasks to return |
| filter | string | — | no | operation = getAll | Filter string (e.g. `today`, `overdue`, `p1`) |

The node is annotated as an AI tool candidate — when connected to an AI agent, many parameters may be set automatically by the agent based on natural-language input.

## Runtime behavior

### Input

The node accepts items on `main[0]`. Standard per-item processing is used. When `operation = create` or `update`, each input item produces one API call (one output item). For `getAll`, a single API call is made per execution and the result array is spread into one output item per task.

### Output

Output items carry the Todoist API response body in `json`. For create/update/get operations the output is a single object matching the Todoist task resource shape:

```json
{
  "id": "2995104339",
  "creatorId": "2671355",
  "projectId": "2203306141",
  "content": "Buy milk",
  "description": "",
  "priority": 1,
  "parentId": null,
  "order": 1,
  "sectionId": null,
  "labels": ["Groceries"],
  "assigneeId": null,
  "due": {
    "date": "2026-07-31",
    "string": "Jul 31",
    "lang": "en",
    "isRecurring": false
  },
  "url": "https://todoist.com/showTask?id=2995104339",
  "commentCount": 0,
  "isCompleted": false,
  "createdAt": "2026-07-31T12:00:00Z"
}
```

For `getAll`, the output is one item per task in the returned array. For `close` and `reopen`, the output item echoes the input item (pass-through) since the API returns HTTP 204 No Content. For `delete`, the input item is passed through (API returns HTTP 204 No Content).

### Errors

- When the Todoist API returns a 4xx or 5xx status, the node throws an `ExecutionBaseError` with the API error message.
- When `continueOnFail` is enabled, failed items emit `{ json: { error: string } }` on the same output branch.
- Required parameters missing (e.g. `content` on create, `taskId` on get) should throw a validation error before the API call.
- The Todoist API returns 404 for non-existent task IDs and 400 for malformed requests.

### Expressions

All string, number, boolean, and datetime parameters accept expression strings (`={{ }}`). The `labels` parameter (comma-separated) also accepts expressions for dynamic label computation per item.

## Acceptance tests

### Test: create a task

**Given** input items:

```json
[{ "json": { "content": "Buy groceries" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "create",
  "content": "={{ $json.content }}",
  "priority": 2
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "content": "Buy groceries",
    "priority": 2,
    "isCompleted": false
  }
}]
```

**Assert:** `output[0][0].json.id` is a non-empty string. `output[0][0].json.content` equals `"Buy groceries"`.

### Test: close a task (pass-through)

**Given** input items:

```json
[{ "json": { "taskId": "2995104339", "source": "workflow" } }]
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
[{
  "json": {
    "taskId": "2995104339",
    "source": "workflow"
  }
}]
```

**Assert:** The output item equals the input item (pass-through). No API response body is merged since close returns 204.

### Test: get a task

**Given** input items:

```json
[{ "json": { "taskId": "2995104339" } }]
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
    "id": "2995104339",
    "content": "Buy groceries",
    "isCompleted": false
  }
}]
```

**Assert:** `output[0][0].json.id` equals the requested task ID.

### Test: get all tasks (filtered)

**Given** input items:

```json
[{ "json": { "projectId": "2203306141" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "getAll",
  "projectId": "={{ $json.projectId }}",
  "filter": "today"
}
```

**Expect** output[0]:

```json
[{
  "json": { "id": "2995104339", "content": "Buy milk" }
},
{
  "json": { "id": "2995104340", "content": "Walk dog" }
}]
```

**Assert:** Array length may vary. Each item has a non-empty `id` and `content`. The `projectId` filter is applied server-side by the Todoist API.

### Test: delete a task (pass-through)

**Given** input items:

```json
[{ "json": { "taskId": "2995104339" } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "delete",
  "taskId": "={{ $json.taskId }}"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "taskId": "2995104339"
  }
}]
```

**Assert:** The output item equals the input item (pass-through). No API response body is merged since delete returns 204.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource list | Documented | Public docs confirm a single `task` resource with 7 operations |
| Parameter details | Inferred | Parameter names and types inferred from Todoist REST API v2 shapes; the n8n docs only list operations at a high level |
| Default values | Inferred | `limit=50`, `priority=1` inferred from standard Todoist API defaults |
| Credential type strings | Public docs + descriptor | Descriptor confirms `n8n-nodes-base.todoist` type and Productivity category; credential type names from public todoist credential docs |
| AI tool annotations | Documented | Public docs confirm "This node can be used as an AI tool" |
| Version model | Inferred | Descriptor shows nodeVersion `1.0`; no version variants documented |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/todoist.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
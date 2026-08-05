---
type: n8n-nodes-base.microsoftToDoTool
displayName: Microsoft To Do Tool
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Microsoft To Do Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsofttodo/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/microsoft/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.microsoftToDoTool`
- **Base node:** `n8n-nodes-base.microsoftToDo`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `microsoftToDoOAuth2Api` — Microsoft OAuth2 with delegated To Do scopes (also supports Microsoft Entra Service Principal app-only auth)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | task | yes | none | list, task, linkedResource |
| operation | string | create | yes | depends on resource | CRUD per resource |
| taskListId | string | — | conditionally | resource=task OR resource=linkedResource | ID of the task list (Todoist-style folder) |
| taskId | string | — | conditionally | operation=update OR delete OR get AND resource=task | ID of the task |
| displayName | string | — | conditionally | operation=create OR update | Title for lists; task title |
| linkedResourceId | string | — | conditionally | operation=linkedResource update/delete/get | ID of a linked resource on a task |
| link | string | — | conditionally | operation=linkedResource create | Web URL to link |
| applicationName | string | — | no | operation=linkedResource create | Display name for the linked resource link |
| additionalFields | object | {} | no | various | Free-form bag of optional Microsoft To Do API fields (see Runtime behavior) |
| options | object | {} | no | various | Formatting / query options |
| returnAll | boolean | false | no | operation=getAll | Paginate all results |
| limit | number | 50 | no | operation=getAll | Page size when not returning all |

### Additional fields (resource-dependent)

**Task create / update:** `bodyContent` (markdown or text), `bodyType` (text/html), `dueDateTime` (ISO 8601), `timeZone`, `importance` (low/normal/high), `isReminderOn`, `reminderDateTime` (ISO 8601), `categories` (comma-separated list), `startDateTime`, `timeZone`

**List create / update:** (none — displayName only)

**Linked resource create / update:** (none beyond link + applicationName)

### Options

`fields` — comma-separated subset of response properties to return (Graph API `$select`)

## Runtime behavior

### Input

Each input item triggers one API call. The node reads all parameters from the item's paired parameter values (fixed, expression, or `$fromAI()`).

### Output

Produces one output item per API response. The output JSON body matches the Microsoft Graph To Do API response shape:

- **Task:** `{ id, title, body: { content, contentType }, createdDateTime, lastModifiedDateTime, dueDateTime: { dateTime, timeZone }, importance, status, isReminderOn, hasAttachments, categories, reminderDateTime }`
- **List:** `{ id, displayName, wellknownListName, isOwner, isShared }`
- **Linked resource:** `{ id, webUrl, applicationName, displayName, externalId }`
- **Task list (getAll):** array of list objects
- **Task getAll:** array of task objects

### Errors

On API error the node throws unless `continueOnFail` is set (empty output item with error info). Common failures: missing taskListId, invalid task list ID, Graph API throttling, insufficient permissions.

### Expressions

All string parameters accept n8n expressions. `additionalFields` and `options` accept inline object expressions. The node supports `$fromAI()` dynamic parameter population for AI agent usage.

## Acceptance tests

### Test: create a task with minimal fields

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "create",
  "taskListId": "AQMkADAwATM3ZmYAZS05MjE0LWQ5NS0wMAItMDcAIgAAUwADAAA",
  "displayName": "Buy groceries"
}
```

**Expect** output[0]:

```json
[{ "json": { "id": "ABC123", "title": "Buy groceries" } }]
```

The actual `id` is server-assigned; the executor must verify a truthy `id` and `title` matching the input.

### Test: create a task with due date

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "create",
  "taskListId": "AQMkADAwATM3ZmYAZS05MjE0LWQ5NS0wMAItMDcAIgAAUwADAAA",
  "displayName": "Submit report",
  "additionalFields": {
    "dueDateTime": { "dateTime": "2026-08-15T18:00:00Z", "timeZone": "UTC" }
  }
}
```

**Expect** output[0]:

```json
[{ "json": { "id": "DEF456", "title": "Submit report", "dueDateTime": { "dateTime": "2026-08-15T18:00:00Z", "timeZone": "UTC" } } }]
```

### Test: get all tasks from a list

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "getAll",
  "taskListId": "AQMkADAwATM3ZmYAZS05MjE0LWQ5NS0wMAItMDcAIgAAUwADAAA",
  "returnAll": true
}
```

**Expect** output[0]:

```json
[{ "json": [{ "id": "T1", "title": "Task one" }, { "id": "T2", "title": "Task two" }] }]
```

Output item `json` is the full array. The executor should support pagination via `@odata.nextLink`.

### Test: update a task

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "update",
  "taskListId": "AQMkADAwATM3ZmYAZS05MjE0LWQ5NS0wMAItMDcAIgAAUwADAAA",
  "taskId": "T-001",
  "displayName": "Updated title"
}
```

**Expect** output[0] to contain `{ "id": "T-001", "title": "Updated title" }`.

### Test: create a linked resource on a task

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "linkedResource",
  "operation": "create",
  "taskListId": "AQMkADAwATM3ZmYAZS05MjE0LWQ5NS0wMAItMDcAIgAAUwADAAA",
  "taskId": "T-001",
  "link": "https://example.com/doc",
  "applicationName": "My App"
}
```

**Expect** output[0] to contain `{ "webUrl": "https://example.com/doc", "applicationName": "My App" }`.

### Test: does not throw when `$fromAI()` is present

**Given** the node has parameter values like `"taskListId": "={{ $fromAI() }}"`:

**Parameters:**
```json
{ "resource": "task", "operation": "create", "displayName": "={{ $fromAI() }}" }
```

**Expect** the node does not throw during parameter resolution — `$fromAI()` placeholders are expected to be populated by the AI agent at runtime.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential scopes | Public docs | Microsoft credential page documents To Do scopes |
| Resource/operation list | Public docs | Confirmed via docs.n8n.io |
| Task body content type | Inferred from schema | `bodyType` — text vs html |
| Linked resource fields | Inferred from schema | `webUrl`, `applicationName`, `displayName`, `externalId` |
| `$fromAI()` support | Public docs (AI tool) | Standard pattern for all Tool nodes |
| Exact parameter nesting/grouping | Inferred | Spec uses flat `additionalFields` bag; original may use grouped sub-parameters |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/microsoftToDoTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

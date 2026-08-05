---
type: n8n-nodes-base.clockifyTool
displayName: Clockify Tool
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Clockify Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clockify/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/clockify/ | Public docs only |
| https://docs.developer.clockify.me/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.clockifyTool`
- **Aliases:** `n8n-nodes-base.clockify` (the base Clockify node is registered as `usableAsTool: true`; the Tool variant shares the same type definition and is exposed via alias)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `clockifyApi` (API key, required)

## Parameters

The node is an AI-agent-ready alias of the base Clockify node. It exposes the same seven resources and all their operations. All string, number, dateTime, and boolean parameters accept n8n expressions. When called from an AI agent, parameters marked `$fromAI()` are dynamically populated by the model.

### Resource: Client

| name | type | required | notes |
|------|------|----------|-------|
| resource | fixed: `client` | yes | |
| operation | enum | yes | `create`, `delete`, `get`, `getAll`, `update` |
| workspaceId | options (dynamic) | yes | Loaded via `listWorkspaces`; hidden for workspace resource |
| name | string | yes (create) | Client name |
| clientId | string | yes (delete, get, update) | |
| returnAll | boolean | no (getAll) | default false |
| limit | number | no (getAll) | default 100, max 500 |
| additionalFields (getAll) | collection | no | Filters: archived, name, sort-order |
| updateFields | collection | no (update) | Fields: address, archived |

### Resource: Project

| name | type | required | notes |
|------|------|----------|-------|
| resource | fixed: `project` | yes | |
| operation | enum | yes | `create`, `delete`, `get`, `getAll`, `update` |
| workspaceId | options (dynamic) | yes | |
| name | string | yes (create) | |
| projectId | string | yes (delete, get, update) | |
| returnAll | boolean | no (getAll) | default false |
| limit | number | no (getAll) | default 100, max 500 |
| additionalFields (create) | collection | no | billable, color, clientId, estimateUi, isPublic, note |
| additionalFields (getAll) | collection | no | Filters: archived, billable, clients, contains-client, client-status, contains-user, is-template, name, sort-column, sort-order, users, user-status |
| updateFields | collection | no (update) | billable, color, clientId, estimateUi, isPublic, name, note |

### Resource: Tag

| name | type | required | notes |
|------|------|----------|-------|
| resource | fixed: `tag` | yes | |
| operation | enum | yes | `create`, `delete`, `getAll`, `update` |
| workspaceId | options (dynamic) | yes | |
| name | string | yes (create) | |
| tagId | string | yes (delete, update) | |
| returnAll | boolean | no (getAll) | default false |
| limit | number | no (getAll) | default 100, max 500 |
| additionalFields (getAll) | collection | no | Filters: archived, name, sort-column, sort-order |
| updateFields | collection | no (update) | archived, name |

### Resource: Task

| name | type | required | notes |
|------|------|----------|-------|
| resource | fixed: `task` | yes | |
| operation | enum | yes | `create`, `delete`, `get`, `getAll`, `update` |
| workspaceId | options (dynamic) | yes | |
| projectId | options (dynamic) | yes | Loaded via `loadProjectsForWorkspace`; depends on workspaceId |
| name | string | yes (create) | |
| taskId | string | yes (delete, get, update) | |
| returnAll | boolean | no (getAll) | default false |
| limit | number | no (getAll) | default 100, max 500 |
| additionalFields (create) | collection | no | assigneeIds, estimate |
| filters (getAll) | collection | no | is-active, name, sort-column, sort-order |
| updateFields | collection | no (update) | assigneeIds, estimate, name, status |

### Resource: Time Entry

| name | type | required | notes |
|------|------|----------|-------|
| resource | fixed: `timeEntry` | yes | |
| operation | enum | yes | `create`, `delete`, `get`, `update` |
| workspaceId | options (dynamic) | yes | |
| start | dateTime | yes (create) | ISO 8601 |
| timeEntryId | string | yes (delete, get, update) | |
| additionalFields (create) | collection | no | billable, customFieldsUi, description, end, projectId, tagIds, taskId |
| additionalFields (get) | collection | no | consider-duration-format, hydrated |
| updateFields | collection | no (update) | billable, customFieldsUi, description, end, projectId, start, tagIds, taskId |

### Resource: User

| name | type | required | notes |
|------|------|----------|-------|
| resource | fixed: `user` | yes | |
| operation | fixed: `getAll` | yes | |
| workspaceId | options (dynamic) | yes | |
| returnAll | boolean | no | default false |
| limit | number | no | default 100, max 500 |
| additionalFields | collection | no | Filters: email, name, status, sort-column, sort-order |

### Resource: Workspace

| name | type | required | notes |
|------|------|----------|-------|
| resource | fixed: `workspace` | yes | |
| operation | fixed: `getAll` | yes | |
| returnAll | boolean | no | default false |
| limit | number | no | default 100, max 500 |

## Runtime behavior

### Input

Each incoming item is processed independently. Item JSON fields can be referenced in parameter expressions. For AI-agent invocations, the model supplies parameter values directly via `$fromAI()`.

### Output

One output item is produced per API call. The JSON body matches the Clockify REST API response shape:

- **Create/Update:** The created or updated entity object.
- **Get:** The single entity object.
- **GetAll (returnAll=false):** Up to `limit` entities in an array.
- **GetAll (returnAll=true):** All matching entities across paginated responses.
- **Delete:** The API response (typically the deleted entity or acknowledgment).

Binary data is not produced.

### Errors

- Network errors, authentication failures (invalid API key), and Clockify API errors (4xx/5xx) are thrown as node errors.
- `continueOnFail` produces error output items instead of halting.

### Expressions

All string, number, dateTime, and boolean parameters accept n8n expressions. Dynamic option fields (workspaceId, projectId, clientId, etc.) accept raw ID strings via expressions.

## Acceptance tests

### Test: create a project

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "project",
  "operation": "create",
  "workspaceId": "ws_abc123",
  "name": "My Test Project"
}
```

**Expect** output[0] to contain a JSON object with `id`, `name`, `workspaceId`, and `billable` fields.

### Test: get all time entries

**Parameters:**
```json
{
  "resource": "timeEntry",
  "operation": "getAll",
  "workspaceId": "ws_abc123",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] to contain a JSON array with at most 10 time entry objects, each having `id`, `start`, `workspaceId`, and `timeInterval` fields.

### Test: create a time entry with description

**Parameters:**
```json
{
  "resource": "timeEntry",
  "operation": "create",
  "workspaceId": "ws_abc123",
  "start": "2026-08-05T08:00:00Z",
  "additionalFields": {
    "description": "Morning standup"
  }
}
```

**Expect** output[0] to contain a JSON object with `id`, `description`, `workspaceId`, `start`, and `billable` fields.

### Test: delete a tag

**Parameters:**
```json
{
  "resource": "tag",
  "operation": "delete",
  "workspaceId": "ws_abc123",
  "tagId": "tag_001"
}
```

**Expect** output[0] to contain a JSON object with the deleted tag's `id` field.

### Test: list all workspaces

**Parameters:**
```json
{
  "resource": "workspace",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0] to contain a JSON array where each element has at minimum `id` and `name` fields.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources & operations | Documented | Public n8n docs list Project, Tag, Task, Time Entry. Corpus confirms three additional resources: Client, User, Workspace. |
| Tool-as-alias behavior | Inferred | The base node has `usableAsTool: true` in its type descriptor. The Tool variant registers the same definition under a separate type string and supports `$fromAI()`. |
| Parameter details | Inferred from corpus | Field names, defaults, and option enums from the published type descriptor (not implementation source). |
| Dynamic option loading | Inferred | workspaceId, projectId, clientId, tagIds, Users, customFields all use loadOptionsMethod patterns standard across n8n. |
| Credential shape | Documented | clockifyApi is API-key based, documented in public n8n credentials page. |
| Pagination behavior | Inferred | Clockify API uses page/pageSize with Last-Page header. returnAll drives automatic pagination. |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.clockifyTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.clockify
displayName: Clockify
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Clockify

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clockify.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/clockify.md | Public docs only |
| https://docs.developer.clockify.me/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.clockify`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `clockifyApi` (API key, required)
- **Usable as tool:** yes

## Parameters

The node exposes seven resource types (Client, Project, Tag, Task, Time Entry, User, Workspace), each with a subset of CRUD operations. All resources require a **Workspace ID** (loaded dynamically from the Clockify API).

### Common patterns across resources

- **Get Many** operations support a `returnAll` boolean (default false) and a `limit` number (default 100, max 500).
- **Create** operations require a `name` string.
- **Update** operations identify the target by a resource-specific ID field and accept an `updateFields` collection of mutable attributes.
- **Delete** and **Get** operations identify the target by a resource-specific ID field.

### Client

| name | type | required | notes |
|------|------|----------|-------|
| workspaceId | options (dynamic) | yes | Loaded from Clockify API |
| name | string | yes (create) | |
| clientId | string | yes (get, delete) | |
| updateFields.archived | boolean | no | |
| updateFields.name | string | no | |
| additionalFields (getAll) | collection | no | Filters: archived, name, sort-order |

### Project

| name | type | required | notes |
|------|------|----------|-------|
| workspaceId | options (dynamic) | yes | |
| name | string | yes (create) | |
| projectId | string | yes (get, delete, update) | |
| additionalFields (create) | collection | no | billable, color, clientId, estimateUi, isPublic, note |
| updateFields | collection | no | billable, color, clientId, estimateUi, isPublic, name, note |
| additionalFields (getAll) | collection | no | Filters: archived, billable, clients, contains-client, client-status, contains-user, is-template, name, sort-column, sort-order, users, user-status |

### Tag

| name | type | required | notes |
|------|------|----------|-------|
| workspaceId | options (dynamic) | yes | |
| name | string | yes (create) | |
| tagId | string | yes (delete, update) | |
| updateFields | collection | no | archived, name |
| additionalFields (getAll) | collection | no | Filters: archived, name, sort-column, sort-order |

### Task

| name | type | required | notes |
|------|------|----------|-------|
| workspaceId | options (dynamic) | yes | |
| projectId | options (dynamic) | yes | Depends on workspaceId |
| name | string | yes (create) | |
| taskId | string | yes (get, delete, update) | |
| additionalFields (create) | collection | no | assigneeIds, estimate |
| updateFields | collection | no | assigneeIds, estimate, name, status |
| filters (getAll) | collection | no | is-active, name, sort-column, sort-order |

### Time Entry

| name | type | required | notes |
|------|------|----------|-------|
| workspaceId | options (dynamic) | yes | |
| start | dateTime | yes (create) | ISO 8601 |
| timeEntryId | string | yes (get, delete, update) | |
| additionalFields (create) | collection | no | billable, customFieldsUi, description, end, projectId, tagIds, taskId |
| updateFields | collection | no | billable, customFieldsUi, description, end, projectId, start, tagIds, taskId |
| additionalFields (get) | collection | no | consider-duration-format, hydrated |

### User

| name | type | required | notes |
|------|------|----------|-------|
| workspaceId | options (dynamic) | yes | |
| additionalFields (getAll) | collection | no | Filters: email, name, status, sort-column, sort-order |

### Workspace

| name | type | required | notes |
|------|------|----------|-------|
| returnAll | boolean | no | default false |
| limit | number | no | default 100 |

## Runtime behavior

### Input

Each incoming item is processed independently. The node consumes the item's JSON only for expression references in parameter values (e.g. `{{ $json.someField }}`).

### Output

On success, one output item is produced per API call. The JSON body contains the Clockify API response object (or array for GetAll operations). Binary data is not produced.

- **Create/Update:** Returns the created or updated entity object from the API.
- **Get:** Returns the single entity object.
- **GetAll (returnAll=false):** Returns up to `limit` entities in an array.
- **GetAll (returnAll=true):** Iterates paginated API responses to return all matching entities.
- **Delete:** Returns the API response (typically the deleted entity or an acknowledgment).

### Errors

- Network errors, authentication failures (invalid API key), and Clockify API error responses (e.g. 404 for missing resource) are thrown as node errors.
- If `continueOnFail` is enabled on the node, errored items produce an error output item instead of halting the workflow.
- Rate limiting: Clockify permits 50 requests/second per addon per workspace. The node does not implement its own retry logic; upstream throttling is the caller's responsibility.

### Expressions

All string and number parameters accept n8n expressions (`{{ }}`). Dynamic options (workspaceId, projectId) support expressions to provide raw IDs instead of using the dropdown.

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

**Expect** output[0]:
```json
[{
  "json": {
    "id": "proj_xyz789",
    "name": "My Test Project",
    "workspaceId": "ws_abc123",
    "clientId": null,
    "billable": false,
    "archived": false
  }
}]
```

### Test: get all projects with pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "project",
  "operation": "getAll",
  "workspaceId": "ws_abc123",
  "returnAll": false,
  "limit": 50
}
```

**Expect** output[0] to contain a JSON array with at most 50 project objects, each having at minimum an `id` and `name` field.

### Test: create a time entry with start time

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "timeEntry",
  "operation": "create",
  "workspaceId": "ws_abc123",
  "start": "2026-08-03T09:00:00Z",
  "additionalFields": {
    "description": "Morning standup",
    "projectId": "proj_xyz789"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "te_001",
    "description": "Morning standup",
    "workspaceId": "ws_abc123",
    "projectId": "proj_xyz789",
    "start": "2026-08-03T09:00:00Z",
    "end": null,
    "billable": false
  }
}]
```

### Test: delete a tag

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "tag",
  "operation": "delete",
  "workspaceId": "ws_abc123",
  "tagId": "tag_001"
}
```

**Expect** output[0] to contain a JSON object with the deleted tag's `id` matching the input `tagId`.

### Test: list all workspaces

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "workspace",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0] to contain a JSON array of workspace objects, each having at minimum an `id` and `name` field.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented | Public n8n docs list the four resources from the original public page (Project, Tag, Task, Time Entry). The corpus reveals three additional undocumented resources: Client, User, Workspace. These are included in the spec as they exist in the published npm package and correspond to documented Clockify API endpoints. |
| Parameter details | Inferred from corpus | The exact field names, default values, and option lists were extracted from the corpus per clean-room rules. The Clockify API docs (public) confirm the underlying REST contract. |
| Dynamic options loading | Inferred | workspaceId and projectId use load options from the API; this is a standard n8n pattern observable in workflow exports. |
| Pagination behavior | Inferred from Clockify API docs | The Clockify API uses page/pageSize query params with a Last-Page header. |
| Credential schema | Documented | clockifyApi credential is API-key based, documented in public n8n credentials page. |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/clockify.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

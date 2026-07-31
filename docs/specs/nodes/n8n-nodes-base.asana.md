---
type: n8n-nodes-base.asana
displayName: Asana
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Asana

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.asana.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/asana.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.asana`
- **Version:** `1.0` (single version)
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `asanaApi` (PAT access token) or `asanaOAuth2Api` (OAuth2)

## Parameters

### Resource & Operation

The node exposes a resource selector and an operation selector. Each resource supports a subset of CRUD and utility operations.

| Resource | Operations |
|----------|------------|
| Project | Create, Delete, Get, GetAll, Update |
| Subtask | Create, GetAll |
| Task | Create, Delete, Get, GetAll, Move, Search, Update |
| Task Comment | Add, Remove |
| Task Tag | Add, Remove |
| Task Project | Add, Remove |
| User | Get, GetAll |

### Resource-specific parameters

Parameters map to the Asana REST API request body or query string. The node uses load-options methods to populate dropdowns for workspaces, projects, teams, tags, users, and sections from the authenticated account.

**Project**
- `Create` / `Update`: requires `workspace` (gid), `name` (string); optional `team`, `notes`, `dueOn`, `color`, `privacySetting`, `defaultView`, `archived`
- `Get`: requires `project` (gid)
- `GetAll`: requires `workspace`; optional `archived`, `team`
- `Delete`: requires `project`

**Task**
- `Create`: requires `workspace`; optional `project`, `name`, `notes`, `assignee`, `dueOn`, `dueAt`, `tags`, `followers`, `parent`, `completed`, `notes`
- `Update`: requires `task` (gid); same optional fields as Create
- `Get`: requires `task`
- `GetAll`: requires `project`; optional `completedSince`, `modifiedSince`, `assignee`, `optFields`
- `Search`: requires `workspace`; optional `text`, `project`, `assignee`, `completed`, `modifiedSince`, `sortBy`, `sortAscending`
- `Move`: requires `task` + `project` (target project gid)
- `Delete`: requires `task`

**Subtask**
- `Create`: requires `task` (parent gid) + `name`; optional fields per Task Create
- `GetAll`: requires `task` (parent gid)

**Task Comment**
- `Add`: requires `task` + `text` (comment body)
- `Remove`: requires `task` + `comment` (gid)

**Task Tag**
- `Add`: requires `task` + `tag` (gid)
- `Remove`: requires `task` + `tag`

**Task Project**
- `Add`: requires `task` + `project`
- `Remove`: requires `task` + `project`

**User**
- `Get`: requires `user` (gid)
- `GetAll`: requires `workspace`

### Additional options

Many operations support optional parameters under an `options` collection, including pagination (`limit`, `offset`), response field selection (`optFields`), and resource-specific modifiers. The node is AI-tool capable: when used as a tool for an AI agent, the agent can set parameters automatically.

## Runtime behavior

### Input

Each input item is processed independently. Parameters may be set as fixed values or per-item expressions.

### Output

Each operation returns output items containing the JSON response from the Asana REST API. The standard response shape is `{ data: { gid, resource_type, ...fields } }`. Paginated GetAll operations aggregate all pages into the output array.

### Errors

On API error (4xx/5xx), the node throws unless `continueOnFail` is enabled, in which case the error item is emitted as `{ json: { error: { message, httpCode } } }` on output[0].

### Expressions

All string and number parameters accept expressions.

## Acceptance tests

### Test: create a task

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Task",
  "operation": "Create",
  "workspace": "{{ $json.workspaceGid }}",
  "name": "Test task from n8n",
  "options": {
    "notes": "Created by automated test"
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "data": {
      "gid": "{{ $json.gid }}",
      "name": "Test task from n8n",
      "notes": "Created by automated test",
      "resource_type": "task"
    }
  }
}]
```

### Test: get all projects in a workspace

**Given** input items:

```json
[{ "json": { "workspaceGid": "12345" } }]
```

**Parameters:**

```json
{
  "resource": "Project",
  "operation": "GetAll",
  "workspace": "12345"
}
```

**Expect** output[0] to be an array of project objects, each with `gid`, `name`, and `resource_type` fields.

### Test: add a comment to a task

**Given** input items:

```json
[{ "json": { "taskGid": "12345", "commentText": "This is a test comment" } }]
```

**Parameters:**

```json
{
  "resource": "Task Comment",
  "operation": "Add",
  "task": "12345",
  "text": "This is a test comment"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "data": {
      "gid": "{{ $json.gid }}",
      "text": "This is a test comment",
      "resource_type": "story"
    }
  }
}]
```

### Test: get all users in a workspace

**Given** input items:

```json
[{ "json": { "workspaceGid": "12345" } }]
```

**Parameters:**

```json
{
  "resource": "User",
  "operation": "GetAll",
  "workspace": "12345"
}
```

**Expect** output[0] to contain an array of user objects with `gid`, `name`, and `email` fields.

### Test: move a task between projects

**Given** input items:

```json
[{ "json": { "taskGid": "12345", "targetProjectGid": "67890" } }]
```

**Parameters:**

```json
{
  "resource": "Task",
  "operation": "Move",
  "task": "12345",
  "project": "67890"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "data": {
      "gid": "12345",
      "resource_type": "task",
      "projects": ["{{ $json.projects }}"]
    }
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource & operation list | documented | Public docs enumerates all 7 resources and their operations |
| Credential types | documented | Two auth methods: access token (PAT) and OAuth2 |
| Parameter details | inferred | Exact parameter names, defaults, option collections, load-options methods not documented in public docs; spec describes at functional level |
| Output shape | inferred | Response shape follows Asana REST API standard `{ data: {...} }` envelope |
| Pagination | inferred | GetAll operations expected to auto-paginate; exact strategy not documented |
| AI tool capability | documented | Node can be used as an AI tool; parameters settable by AI |
| Subtask vs Task relation | documented | Subtask Create delegates to Task endpoint with parent gid |

## OpenFlow mapping

- **Definition group:** `core` (Productivity)
- **Executor file:** `src/lib/engine/executors/asana.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
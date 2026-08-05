---
type: n8n-nodes-base.grafanaTool
displayName: Grafana Tool
category: Development, Analytics
versions: [1]
priority: medium
status: specced
---

# Grafana Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.grafana/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/grafana/ | Public docs only |
| https://grafana.com/docs/grafana/latest/developers/http_api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.grafanaTool`
- **Aliases:** `n8n-nodes-base.grafana`, `Prometheus`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `grafanaApi` (API key + base URL)

## Parameters

### Resource selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `dashboard`, `team`, `teamMember`, `user` | `dashboard` | yes | always shown | Selects the Grafana entity type |

### Dashboard operations

Shown when `resource = dashboard`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options: `create`, `delete`, `get`, `getAll`, `update` | `create` | yes | always shown when resource=dashboard | |
| title | string | `""` | yes | operation=create | Title of the dashboard to create |
| additionalFields.folderId | options (dynamic from instance) | `""` | no | operation=create | Folder to place the dashboard in; blank defaults to General |
| dashboardUidOrUrl | string | `""` | yes | operation=delete/get/update | UID or URL identifying the dashboard |
| returnAll | boolean | false | no | operation=getAll | Paginate through all results |
| limit | number (1-100) | 50 | no | operation=getAll AND returnAll=false | Max results per page |
| filters.query | string | `""` | no | operation=getAll | Search term for dashboard name |
| updateFields.title | string | `""` | no | operation=update | New title |
| updateFields.folderId | options (dynamic) | `""` | no | operation=update | Target folder to move the dashboard into |

### Team operations

Shown when `resource = team`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options: `create`, `delete`, `get`, `getAll`, `update` | `create` | yes | always shown when resource=team | |
| name | string | `""` | yes | operation=create | Team name |
| additionalFields.email | string | `""` | no | operation=create | Team contact email |
| teamId | string | `""` | yes | operation=delete/get/update | Numeric team ID |
| returnAll | boolean | false | no | operation=getAll | Paginate through all results |
| limit | number (min 1) | 50 | no | operation=getAll AND returnAll=false | Max results per page |
| filters.name | string | `""` | no | operation=getAll | Filter teams by name |
| updateFields.name | string | `""` | no | operation=update | New team name |
| updateFields.email | string | `""` | no | operation=update | New team email |

### Team Member operations

Shown when `resource = teamMember`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options: `add`, `getAll`, `remove` | `add` | yes | always shown when resource=teamMember | |
| userId | options (dynamic from instance) | `""` | yes | operation=add | User to add |
| teamId | options (dynamic from instance) | `""` | yes | operation=add/remove/getAll | Target team |
| memberId | options (dynamic from instance) | `""` | yes | operation=remove | User to remove |
| returnAll | boolean | false | no | operation=getAll | Paginate through all results |
| limit | number (min 1) | 50 | no | operation=getAll AND returnAll=false | Max results per page |

### User operations

Shown when `resource = user`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options: `delete`, `getAll`, `update` | `getAll` | yes | always shown when resource=user | |
| userId | string | `""` | yes | operation=delete/update | Numeric user ID |
| updateFields.role | options: `Admin`, `Editor`, `Viewer` | `Admin` | no | operation=update | New role assignment |
| returnAll | boolean | false | no | operation=getAll | Paginate through all results |
| limit | number (min 1) | 50 | no | operation=getAll AND returnAll=false | Max results per page |

## Runtime behavior

### Input

Each input item is processed independently. The node passes one item through at a time, performing the requested operation for each.

### Output

Output shape depends on the resource and operation:

- **Dashboard create/update:** Returns the Grafana dashboard creation/update response (`{ id, uid, url, status, version, slug }`).
- **Dashboard delete:** Returns the deletion result (`{ title, message }`).
- **Dashboard get:** Returns the full dashboard model including `dashboard` (the dashboard JSON model), `meta` (metadata), and nested panels/templating.
- **Dashboard getMany:** Returns an array of dashboard search results (folders and dashboards) with `{ id, uid, title, uri, url, type, tags, isStarred, folderId, folderUid, folderTitle, folderUrl }` per entry.
- **Team create/update:** Returns the team object `{ teamId, message }`.
- **Team delete:** Returns `{ message }`.
- **Team get:** Returns the team object.
- **Team getMany:** Returns `{ teams: [{ id, name, email, memberCount, permission, avatarUrl, url }] }`.
- **Team Member add:** No meaningful response body (HTTP 200 with empty or status message).
- **Team Member getMany:** Returns array of team members.
- **Team Member remove:** No meaningful response body.
- **User delete:** Returns `{ message }`.
- **User getMany:** Returns array of users in the current organization.
- **User update:** Returns the updated user or status.

The node does not modify input item JSON; it appends the API response under a new property key (`json` in the output item). Each input item produces exactly one output item per operation call.

### Errors

- Authentication errors (401/403) throw and stop execution unless `continueOnFail` is enabled.
- Resource-not-found errors (404) throw.
- Validation errors (400) from the Grafana API throw.
- When `continueOnFail` is true, the node returns the input item unchanged with an `error` property instead of throwing.

### Expressions

All string, number, and options parameters accept expression strings. The `resource` and `operation` selectors have `noDataExpression: true` — they cannot use expressions to dynamically select resource/operation.

## Acceptance tests

### Test: Create a dashboard

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "dashboard",
  "operation": "create",
  "title": "My Test Dashboard"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 1,
    "uid": "cIBgcSjkk",
    "title": "My Test Dashboard",
    "url": "/d/cIBgcSjkk/my-test-dashboard",
    "status": "success",
    "version": 1,
    "slug": "my-test-dashboard"
  }
}]
```

### Test: Get a dashboard by UID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "dashboard",
  "operation": "get",
  "dashboardUidOrUrl": "cIBgcSjkk"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "dashboard": {
      "id": 1,
      "uid": "cIBgcSjkk",
      "title": "My Test Dashboard",
      "panels": [],
      "templating": { "list": [] }
    },
    "meta": {
      "isStarred": false,
      "slug": "my-test-dashboard",
      "folderId": 0,
      "folderUid": "",
      "folderTitle": "General",
      "version": 1
    }
  }
}]
```

### Test: List all teams with pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "team",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "teams": [
      { "id": 1, "name": "Engineering", "email": "eng@example.com", "memberCount": 5, "permission": 0 }
    ]
  }
}]
```

### Test: Add a user to a team

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "teamMember",
  "operation": "add",
  "userId": "3",
  "teamId": "1"
}
```

**Expect** output[0]:
```json
[{
  "json": {}
}]
```

### Test: Update user role

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "update",
  "userId": "5",
  "updateFields": {
    "role": "Editor"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 5,
    "email": "user@example.com",
    "role": "Editor"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Credential schema | documented | grafanaApi: API Key + Base URL. Confirmed via public docs. |
| Resource/operation list | documented | 4 resources, 16 total operations. Confirmed via public n8n docs. |
| Parameter structure | inferred from published type descriptor | The node JSON descriptor in the npm corpus shows exact parameter names, types, defaults, and displayOptions. These are abstracted in the spec — specific field-level nesting like `additionalFields` vs `updateFields` containers is preserved because it affects workflow JSON interoperability. |
| Response shapes | inferred from Grafana HTTP API | The Grafana API docs describe response shapes for dashboards, teams, and users. Test fixtures use realistic but not exhaustive shapes. |
| Dynamic option loading | inferred | `getFolders`, `getUsers`, `getTeams` load options from the Grafana instance at runtime. |
| Tool-specific behavior | inferred | `usableAsTool: true` enables this node in AI Agent tools panel. The `*Tool` type string exists as a framework-level alias for the tool variant of a `usableAsTool` node. No distinct `grafanaTool` source file exists — it shares all parameters with `n8n-nodes-base.grafana`. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/grafana.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

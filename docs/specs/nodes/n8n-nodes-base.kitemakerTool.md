---
type: n8n-nodes-base.kitemakerTool
displayName: Kitemaker Tool
category: Action
versions: [1]
priority: medium
status: specced
---

# Kitemaker Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.kitemaker.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/kitemaker.md | Public docs only |
| https://kitemakerhq.github.io/rest-docs/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.kitemakerTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `kitemakerApi` (personal access token via `X-API-KEY` header)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `organization`, `space`, `user`, `workItem` | `workItem` | Y | | Which Kitemaker entity to operate on |
| operation | depends on resource | | Y | | Operation to perform on the selected resource |
| spaceId | string | — | N | resource=workItem,operation=create/getAll | Space key or ID for scope |
| workItemId | string | — | N | resource=workItem,operation=get/update | The work item ID |
| title | string | — | N | resource=workItem,operation=create/update | Work item title |
| statusId | string | — | N | resource=workItem,operation=create/update | Status/column ID |
| description | string | — | N | resource=workItem,operation=create/update | Markdown description |
| labelIds | array[string] | — | N | resource=workItem,operation=create/update | Labels to assign |
| effort | options: `small`, `medium`, `large` | — | N | resource=workItem,operation=create/update | Effort estimate |
| impact | options: `small`, `medium`, `large` | — | N | resource=workItem,operation=create/update | Impact estimate |
| placement | options: `top`, `bottom` | `top` | N | resource=workItem,operation=create | Position in status column |
| returnAll | boolean | false | N | resource=workItem,operation=getAll | Return all items (paginate) |
| limit | number | 50 | N | resource=workItem,operation=getAll | Max items per page |

### Resource/operation matrix

| resource | operation | Kitemaker REST endpoint | Notes |
|----------|-----------|------------------------|-------|
| `organization` | `get` | `GET /organization` | Returns org id, name, timestamps |
| `space` | `getAll` | `GET /metadata/spaces` | Returns list of { id, label } |
| `user` | `getAll` | (GraphQL endpoint, list users) | Returns user list |
| `workItem` | `create` | `POST /workitem` | Creates a work item |
| `workItem` | `get` | `GET /workitem?spaceKey=...&workItemNumber=...` | Single item by space + number |
| `workItem` | `getAll` | `GET /metadata/workitems?spaceId=...` | Lists work items for a space |
| `workItem` | `update` | `PUT /workitem` | Updates an existing work item |

## Runtime behavior

### Input

Each incoming item may supply expression-based parameter values. For `workItem` `create` and `update`, input data fields can be mapped to work item fields.

### Output

Per input item, one output item is produced containing the API response as `json`.

- **Organization get:** `{ id, name, createdAt, updatedAt }`
- **Space getAll:** `[{ id, label }]`
- **User getAll:** `[{ id, name, email, ... }]` (depends on GraphQL response shape)
- **WorkItem create/get/update:** `{ id, number, title, description, status: { id, name }, space: { id, name }, labels: [{ id, name, color }], effort, impact, createdAt, updatedAt }`
- **WorkItem getAll:** `[{ id, label }]` (simplified metadata list)

### Errors

- 400: Invalid parameters — thrown with NodeApiError
- 401: Unauthorized/invalid token — thrown
- 404: Resource not found — thrown
- 429: Rate limit — thrown (retry recommended by consumer)
- `continueOnFail`: If true, empty output is emitted for failed items instead of aborting

### Expressions

All string, number, and array parameters accept expression strings. The `$fromAI()` function is supported on all parameters when used as an AI agent tool.

## Acceptance tests

### Test: get organization

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "organization", "operation": "get" }
```

**Expect** output[0]:

```json
[{ "json": { "id": "org-123", "name": "My Org", "createdAt": "2023-01-01T00:00:00.000Z", "updatedAt": "2023-06-01T00:00:00.000Z" } }]
```

### Test: create work item

**Given** input items:

```json
[{ "json": { "myTitle": "New bug fix", "myDescription": "Fixes the login issue" } }]
```

**Parameters:**

```json
{ "resource": "workItem", "operation": "create", "title": "={{$json.myTitle}}", "statusId": "abc123", "description": "={{$json.myDescription}}", "effort": "medium", "impact": "small" }
```

**Expect** output[0]:

```json
[{ "json": { "id": "wi-456", "number": 42, "title": "New bug fix", "description": "Fixes the login issue", "status": { "id": "abc123", "name": "In Progress" }, "space": { "id": "space-1", "name": "Engineering" }, "labels": [], "effort": "Medium", "impact": "Small", "createdAt": "2024-01-15T10:30:00.000Z", "updatedAt": "2024-01-15T10:30:00.000Z" } }]
```

### Test: list work items

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "workItem", "operation": "getAll", "spaceId": "space-1", "returnAll": false, "limit": 10 }
```

**Expect** output[0]:

```json
[{ "json": [{ "id": "wi-1", "label": "Fix login bug" }, { "id": "wi-2", "label": "Add dark mode" }] }]
```

### Test: update work item title

**Given** input items:

```json
[{ "json": { "newTitle": "Updated: Fix login bug" } }]
```

**Parameters:**

```json
{ "resource": "workItem", "operation": "update", "workItemId": "wi-456", "title": "={{$json.newTitle}}" }
```

**Expect** output[0]:

```json
[{ "json": { "id": "wi-456", "number": 42, "title": "Updated: Fix login bug", "status": { "id": "abc123", "name": "In Progress" }, "space": { "id": "space-1", "name": "Engineering" }, "labels": [], "effort": "Medium", "impact": "Small", "createdAt": "2024-01-15T10:30:00.000Z", "updatedAt": "2024-01-15T11:00:00.000Z" } }]
```

### Test: AI agent tool invocation via $fromAI

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "workItem", "operation": "getAll", "spaceId": "={{$fromAI('Which Kitemaker space?')}}", "limit": 5 }
```

**Expect** output[0]:

```json
[{ "json": [{ "id": "wi-10", "label": "Sample item" }] }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| User resource operation | Inferred from n8n doc listing | Exact User endpoint not detailed in REST docs; may use GraphQL internally |
| WorkItem getAll output shape | Documented as metadata endpoint | Returns simplified {id, label} items, not full work items |
| Dynamic resource loading (spaces, statuses) | Inferred | Likely loads spaces/statuses dynamically from metadata endpoints |
| Exact parameter display conditions | Inferred | Follows standard n8n resource/operation pattern |
| WorkItem get input format | Inferred | Uses spaceKey + workItemNumber query params per REST docs |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/kitemakerTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

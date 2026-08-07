---
type: n8n-nodes-base.taiga
displayName: Taiga
category: Development, Productivity
versions: [1]
priority: medium
status: specced
---

# Taiga

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.taiga/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/taiga/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.taigatrigger/ | Public docs only |
| https://docs.taiga.io/api.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.taiga`
- **Trigger type string:** `n8n-nodes-base.taigaTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (action node); `main` × 0 (trigger node)
- **Outputs:** `main` × 1 (both)
- **Credentials:** `taigaApi` (required) — Basic auth with Username/Password + Environment (Cloud/Self-Hosted); Self-Hosted requires a URL field

## Parameters

### Action node (`n8n-nodes-base.taiga`)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `epic`, `issue`, `task`, `userStory` | `issue` | yes | — | Which Taiga entity to operate on |
| operation | options: `create`, `delete`, `get`, `getAll`, `update` | `create` | yes | depends on resource | Action to perform |
| projectId | options (dynamic: getProjects) | — | yes* | create/getAll/update | Project scoping; *required for create, getAll, update |
| subject | string | — | yes | create | Title of the entity |
| epicId / issueId / taskId / userStoryId | string | — | yes | get/delete/update | Entity to target |
| returnAll | boolean | false | — | getAll | Whether to paginate without limit |
| limit | number | 50 | — | getAll (returnAll=false) | Max results |
| additionalFields | collection | {} | — | create | Optional fields per entity (see runtime behavior) |
| updateFields | collection | {} | — | update | Fields to modify |
| filters | collection | {} | — | getAll | Query filters |

#### Per-resource additionalFields / updateFields

All four resources share common optional sub-fields. Resource-specific fields are noted.

- `assigned_to` (options, dynamic: getUsers)
- `blocked_note` (string)
- `description` (string)
- `is_blocked` (boolean, default false)
- `milestone` (options, dynamic: getMilestones) — Sprint assignment
- `tags` (multiOptions, dynamic: getTags)
- `status` (options, dynamic: per-resource status loader)
- `type` (options, dynamic: getTypes) — Issue/UserStory only

**Epic-specific:** `color` (color picker, default `0000FF`)

**Issue-specific:** `priority` (options, dynamic: getPriorities), `severity` (options, dynamic: getSeverities), `type` (options, dynamic: getTypes)

**Task-specific:** `taskboard_order` (number), `user_story` (options, dynamic: getUserStories), `us_order` (number)

**User Story-specific:** `backlog_order` (number), `kanban_order` (number), `sprint_order` (number), `type` (options, dynamic: getTypes)

#### Per-resource filters (getAll)

- `assigned_to`, `owner`, `role`, `status`, `tags` — shared across all resources
- **Epic:** `statusIsClosed` (boolean)
- **Issue:** `orderBy` (options: assigned_to, created_date, modified_date, owner, priority, severity, status, subject, type), `priority`, `severity`, `type`
- **Task:** `statusIsClosed` (boolean), `milestone`, `userStory`
- **User Story:** `epic`, `statusIsClosed` (boolean), `statusIsArchived` (boolean), `milestone`, `role`

### Trigger node (`n8n-nodes-base.taigaTrigger`)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| projectId | options (dynamic: getUserProjects) | — | yes | Project to watch |
| resources | multiOptions: `all`, `issue`, `milestone`, `task`, `userstory`, `wikipage` | `['all']` | yes | Entity types to listen for |
| operations | multiOptions: `all`, `create`, `delete`, `change` | `['all']` | yes | Change types to react to |

## Runtime behavior

### Action node

**Authentication:** The node authenticates via Basic auth against the Taiga REST API v1 at `https://api.taiga.io/api/v1` (Cloud) or a user-provided URL (Self-Hosted). The credentials exchange username/password for a Bearer token via `POST /auth`, then persist the token for the session.

**Input processing:** Each input item is processed independently in a loop. For entity-by-ID operations (get/delete/update), the ID is read per-item. For create/update, fields are read per-item.

**Project selection:** The `projectId` parameter is list-loaded via `GET /users/me` (current user) then `GET /projects?member={userId}`. All subsequent dynamic loaders (users, statuses, tags, milestones, priorities, severities, types, epics, user stories, roles) depend on the selected project and load via `GET /{resource}?project={projectId}`.

**Output shape (per operation):**

| Operation | Output |
|-----------|--------|
| create | The created entity object from `POST /{resource}` |
| get | The entity object from `GET /{resource}/{id}` |
| getAll | Array of entity objects from `GET /{resource}` (paginated by Taiga server; x-pagination-* headers drive pagination) |
| update | The updated entity object from `PATCH /{resource}/{id}` |
| delete | `{ success: true }` from `DELETE /{resource}/{id}` |

**Error handling:** API errors (HTTP 4xx/5xx) propagate as thrown exceptions. The node respects the `continueOnFail` workflow setting — when enabled, failing items produce an error output instead of halting execution.

### Trigger node

**Webhook lifecycle:** At activation, the node:
1. Calls `GET /webhooks` to check for an existing webhook with matching URL (avoids duplicates)
2. If none found, calls `POST /webhooks` with a name, URL, and a generated key
3. The webhook ID and key are stored in static node data

At deactivation, `DELETE /webhooks/{id}` is called to clean up.

**Event filtering:** The node filters incoming webhook payloads by:
- `resources` — matches `body.action` against `change` (resource-agnostic field) for entity type equality
- `operations` — matches `body.action` string (create/delete/change) against selected operations
- If "all" is selected in either filter, all events pass

**Output:** Each received webhook body is emitted as a single output item unchanged.

## Acceptance tests

### Test: Create an issue

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "create",
  "projectId": "{{ $json.projectId }}",
  "subject": "Bug: login fails on empty password",
  "additionalFields": {
    "description": "Steps to reproduce...",
    "priority": "{{ $json.priority }}",
    "tags": ["bug", "auth"]
  }
}
```

**Expect** output[0] to contain a single item with a `json` body that includes `subject`, `project`, `status`, `created_date`, and a numeric `id`.

### Test: Get all epics with filters

**Given** input items:

```json
[{ "json": { "projectId": 123 } }]
```

**Parameters:**

```json
{
  "resource": "epic",
  "operation": "getAll",
  "projectId": "{{ $json.projectId }}",
  "returnAll": true,
  "filters": {
    "assigned_to": "{{ $json.assignedTo }}",
    "statusIsClosed": false
  }
}
```

**Expect** output[0] to be an array of epic objects (each with `id`, `subject`, `project`, `status`, `assigned_to`). The array may be empty.

### Test: Update a user story

**Given** input items:

```json
[{ "json": { "userStoryId": 42 } }]
```

**Parameters:**

```json
{
  "resource": "userStory",
  "operation": "update",
  "projectId": "{{ $json.projectId }}",
  "userStoryId": "{{ $json.userStoryId }}",
  "updateFields": {
    "subject": "Updated title",
    "milestone": "{{ $json.milestoneId }}"
  }
}
```

**Expect** output[0] to contain a single item whose `json` body has `subject: "Updated title"` and the specified `milestone`.

### Test: Delete a task

**Given** input items:

```json
[{ "json": { "taskId": 99 } }]
```

**Parameters:**

```json
{
  "resource": "task",
  "operation": "delete",
  "taskId": "{{ $json.taskId }}"
}
```

**Expect** output[0] to contain `{ "success": true }`.

### Test: Taiga Trigger receives a filtered event

**Given** the trigger is configured with `resources: ["issue"]` and `operations: ["create"]`, and Taiga sends a webhook payload with `{ "action": "create", "type": "issue", ... }`.

**Expect** the trigger emits one output item whose `json` matches the webhook payload body.

Taiga sends a webhook for an unrelated resource (e.g., `type: "wikipage"` with `action: "create"`). **Expect** the trigger to produce zero output items (filtered out).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Taiga API base URL | Documented | Cloud: `https://api.taiga.io/api/v1`; Self-Hosted: user-provided |
| Credential type | Documented | Basic auth to `POST /auth` returns Bearer token |
| Resource + operation list | Documented | 4 resources × 5 operations — confirmed in both public docs and published JS descriptors |
| Per-field parameter details | Corpus (parameter names only) | Field names, types, and dynamic loaders extracted from published package; no implementation algorithms copied |
| Trigger webhook event shape | Inferred | Body contains `action`, `type`, entity fields; exact payload shape depends on Taiga API version |
| Pagination behavior | Documented | Taiga API paginates via x-pagination-* headers; node supports returnAll/limit |
| Error handling | Inferred | Standard n8n pattern: exceptions on HTTP errors, `continueOnFail` support |
| Self-Hosted URL field | Documented | Credential UI includes optional URL for self-hosted instances |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.taiga.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

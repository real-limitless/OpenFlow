---
type: n8n-nodes-base.todoist
displayName: Todoist
category: Productivity
versions: [1, 2, 2.1, 2.2]
priority: medium
status: specced
---

# Todoist

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.todoist.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/todoist.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.todoist`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `todoistApi` (API Key) | `todoistOAuth2Api` (OAuth2)
- **Usable as tool:** yes (v2+)

## Parameters

### Common (all versions)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `apiKey` | yes | — | `apiKey` \| `oAuth2` — selects credential type |

### Version 1 — Task resource only

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `task` | yes | — | Only `task` available in v1 |
| operation | options | `create` | yes | `resource:task` | `create` \| `get` \| `getAll` \| `update` \| `delete` \| `close` \| `reopen` \| `move` \| `sync` (commented in source) |
| taskId | string | `''` | yes | `resource:task`, `operation:delete,close,get,reopen,update,move` | Task ID |
| project | resourceLocator | `{mode:'list',value:''}` | yes | `resource:task`, `operation:create,move,sync` | Project name or ID (list + ID modes) |
| section | options | `''` | no | `resource:task`, `operation:move` | Section name or ID (loadOptions: `getSections`, depends on `project`) |
| labels | multiOptions | `[]` | no | `resource:task`, `operation:create` | Label names or IDs (loadOptions: `getLabels`) |
| content | string | `''` | yes | `resource:task`, `operation:create` | Task content (textarea, 5 rows) |
| commands | string | `'[]'` | no | `resource:task`, `operation:sync` | Sync body JSON (see Todoist Sync API v8) |
| options | collection | `{}` | no | `resource:task`, `operation:create` | Additional fields (see below) |
| returnAll | boolean | `false` | no | `resource:task`, `operation:getAll` | Return all results |
| limit | number | `50` | no | `resource:task`, `operation:getAll`, `returnAll:false` | Max results (1–500) |
| filters | collection | `{}` | no | `resource:task`, `operation:getAll` | Filter options (see below) |
| updateFields | collection | `{}` | no | `resource:task`, `operation:update` | Fields to update (see below) |

#### `options` collection (task.create)

| name | type | default | description |
|------|------|---------|-------------|
| description | string | `''` | Task description |
| dueDateTime | dateTime | `''` | Specific date/time in RFC3339 UTC |
| dueLang | string | `''` | 2-letter locale for `dueString` |
| dueString | string | `''` | Natural language due date (local time) |
| parentId | options | `{}` | Parent task name/ID (loadOptions: `getItems`, depends on `project`, `options.section`) |
| priority | number | `1` | 1 (normal) to 4 (urgent), min 1 max 4 |
| section | options | `{}` | Section name/ID (loadOptions: `getSections`, depends on `project`) |

#### `filters` collection (task.getAll)

| name | type | default | description |
|------|------|---------|-------------|
| filter | string | `''` | Todoist filter query (see Todoist filter docs) |
| ids | string | `''` | Comma-separated task IDs |
| labelId | options | `{}` | Filter by label (loadOptions: `getLabels`) |
| lang | string | `''` | IETF language tag for filter |
| parentId | options | `''` | Filter by parent task (loadOptions: `getItems`, depends on `filters.projectId`, `filters.sectionId`) |
| projectId | options | `''` | Filter by project (loadOptions: `getProjects`) |
| sectionId | options | `''` | Filter by section (loadOptions: `getSections`, depends on `filters.projectId`) |

#### `updateFields` collection (task.update)

| name | type | default | description |
|------|------|---------|-------------|
| content | string | `''` | Task content |
| description | string | `''` | Task description |
| dueDateTime | dateTime | `''` | Specific date/time RFC3339 UTC |
| dueLang | string | `''` | 2-letter locale for `dueString` |
| dueString | string | `''` | Natural language due date (local time) |
| labels | multiOptions | `[]` | Label names/IDs (loadOptions: `getLabels`) |
| priority | number | `1` | 1–4, min 1 max 4 |

### Version 2 / 2.1 / 2.2 — Multi-resource

#### Common authentication parameter (same as v1)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `apiKey` | yes | — | `apiKey` \| `oAuth2` |

#### Resource selector

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `task` | yes | — | `task` \| `project` \| `section` \| `comment` \| `label` \| `reminder` |

---

#### Resource: Task (v2+)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | `resource:task` | `create` \| `get` \| `getAll` \| `update` \| `delete` \| `close` \| `reopen` \| `move` \| `quickAdd` |
| taskId | string | `''` | yes | `resource:task`, `operation:delete,close,get,reopen,update,move` | Task ID |
| project | resourceLocator | `{mode:'list',value:''}` | yes | `resource:task`, `operation:create,move` | Project name/ID (list + ID modes) |
| section | options | `''` | no | `resource:task`, `operation:move`, `@version:<2.1` | Section name/ID (loadOptions: `getSections`, depends on `project.value`) |
| options (move) | collection | `{}` | no | `resource:task`, `operation:move`, `@version:>=2.1` | Move options (see below) |
| labels | multiOptions | `[]` | no | `resource:task`, `operation:create` | Label names (loadOptions: `getLabels`) |
| content | string | `''` | yes | `resource:task`, `operation:create` | Task content (textarea, 5 rows) |
| text | string | `''` | yes | `resource:task`, `operation:quickAdd` | Natural language quick-add text (3 rows) |
| options (quickAdd) | collection | `{}` | no | `resource:task`, `operation:quickAdd` | Quick-add options (see below) |
| options (create) | collection | `{}` | no | `resource:task`, `operation:create` | Additional fields (see below) |
| returnAll | boolean | `false` | no | `resource:task`, `operation:getAll` | Return all results |
| limit | number | `50` | no | `resource:task`, `operation:getAll`, `returnAll:false` | Max results (1–500) |
| filters | collection | `{}` | no | `resource:task`, `operation:getAll` | Filter options (same as v1) |
| updateFields | collection | `{}` | no | `resource:task`, `operation:update` | Update fields (see below) |

##### `options` collection (task.move, v2.1+)

| name | type | default | description |
|------|------|---------|-------------|
| section | options | `''` | Destination section (loadOptions: `getSections`, depends on `project`, `options.parent`) |
| parent | options | `''` | Destination parent task (loadOptions: `getItems`, depends on `project`, `options.section`) |

##### `options` collection (task.quickAdd)

| name | type | default | description |
|------|------|---------|-------------|
| note | string | `''` | Note content |
| reminder | string | `''` | Reminder date (free text) |
| auto_reminder | boolean | `false` | Add default reminder if due date has time |

##### `options` collection (task.create, v2+)

| name | type | default | description |
|------|------|---------|-------------|
| description | string | `''` | Task description |
| dueDateTime | dateTime | `''` | RFC3339 UTC date/time |
| dueLang | string | `''` | 2-letter locale for `dueString` |
| dueString | string | `''` | Natural language due date (local time) |
| parentId | options | `{}` | Parent task (loadOptions: `getItems`, depends on `project.value`, `options.section`) |
| priority | number | `1` | 1–4, min 1 max 4 |
| section | options | `{}` | Section (loadOptions: `getSections`, depends on `project.value`) |
| order | number | `0` | Sort order under same parent |
| dueDate | string | `''` | Specific date YYYY-MM-DD |
| assigneeId | string | `''` | Responsible user ID (shared tasks) |
| duration | number | `0` | Duration integer (use with `durationUnit`) |
| durationUnit | options | `minute` | `minute` \| `day` |
| deadlineDate | string | `''` | Deadline date YYYY-MM-DD |

##### `updateFields` collection (task.update, v2+)

| name | type | default | description |
|------|------|---------|-------------|
| content | string | `''` | Task content |
| description | string | `''` | Task description |
| dueDateTime | dateTime | `''` | RFC3339 UTC |
| dueLang | string | `''` | 2-letter locale |
| dueString | string | `''` | Natural language due date |
| labels | multiOptions | `[]` | Labels (loadOptions: `getLabels`) |
| priority | number | `1` | 1–4 |
| order | number | `0` | Sort order |
| dueDate | string | `''` | YYYY-MM-DD |
| assigneeId | string | `''` | User ID |
| duration | number | `0` | Duration integer |
| durationUnit | options | `minute` | `minute` \| `day` |
| deadlineDate | string | `''` | YYYY-MM-DD |

---

#### Resource: Project (v2+)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | `resource:project` | `create` \| `get` \| `getAll` \| `update` \| `delete` \| `archive` \| `unarchive` \| `getCollaborators` |
| projectId | string | `''` | yes | `resource:project`, `operation:archive,delete,get,getCollaborators,unarchive,update` | Project ID |
| name | string | `''` | yes | `resource:project`, `operation:create` | Project name |
| projectOptions | collection | `{}` | no | `resource:project`, `operation:create` | Create options (see below) |
| projectUpdateFields | collection | `{}` | no | `resource:project`, `operation:update` | Update fields (see below) |

##### `projectOptions` collection (project.create)

| name | type | default | description |
|------|------|---------|-------------|
| color | options | `''` | Project color (Todoist palette: berry_red, red, orange, yellow, olive_green, lime_green, green, mint_green, teal, sky_blue, light_blue, blue, grape, violet, lavender, magenta, salmon, charcoal, grey, taupe) |
| is_favorite | boolean | `false` | Mark as favorite |
| parent_id | string | `''` | Parent project ID |
| view_style | options | `list` | `list` \| `board` |

##### `projectUpdateFields` collection (project.update)

| name | type | default | description |
|------|------|---------|-------------|
| name | string | `''` | Project name |
| color | options | `''` | Project color (same palette) |
| is_favorite | boolean | `false` | Favorite flag |
| view_style | options | `list` | `list` \| `board` |

---

#### Resource: Section (v2+)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | `resource:section` | `create` \| `get` \| `getAll` \| `update` \| `delete` |
| sectionId | string | `''` | yes | `resource:section`, `operation:delete,get,update` | Section ID |
| sectionProject | resourceLocator | `{mode:'list',value:''}` | yes | `resource:section`, `operation:create` | Project name/ID (list + ID modes) |
| sectionName | string | `''` | yes | `resource:section`, `operation:create` | Section name |
| sectionOptions | collection | `{}` | no | `resource:section`, `operation:create` | Create options |
| sectionUpdateFields | collection | `{}` | no | `resource:section`, `operation:update` | Update fields |
| sectionFilters | collection | `{}` | no | `resource:section`, `operation:getAll` | Filter options |

##### `sectionOptions` collection (section.create)

| name | type | default | description |
|------|------|---------|-------------|
| order | number | `0` | Section order |

##### `sectionUpdateFields` collection (section.update)

| name | type | default | description |
|------|------|---------|-------------|
| name | string | `''` | Section name |

##### `sectionFilters` collection (section.getAll)

| name | type | default | description |
|------|------|---------|-------------|
| project_id | options | `''` | Filter by project (loadOptions: `getProjects`) |

---

#### Resource: Comment (v2+)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | `resource:comment` | `create` \| `get` \| `getAll` \| `update` \| `delete` |
| commentId | string | `''` | yes | `resource:comment`, `operation:delete,get,update` | Comment ID |
| commentTaskId | string | `''` | yes | `resource:comment`, `operation:create` | Task ID to comment on |
| commentContent | string | `''` | yes | `resource:comment`, `operation:create` | Comment content (textarea, 3 rows) |
| commentUpdateFields | collection | `{}` | no | `resource:comment`, `operation:update` | Update fields |
| commentFilters | collection | `{}` | no | `resource:comment`, `operation:getAll` | Filter options |

##### `commentUpdateFields` collection (comment.update)

| name | type | default | description |
|------|------|---------|-------------|
| content | string | `''` | Comment content (textarea, 3 rows) |

##### `commentFilters` collection (comment.getAll)

| name | type | default | description |
|------|------|---------|-------------|
| task_id | string | `''` | Filter by task ID |
| project_id | string | `''` | Filter by project ID |

---

#### Resource: Label (v2+)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | `resource:label` | `create` \| `get` \| `getAll` \| `update` \| `delete` |
| labelId | string | `''` | yes | `resource:label`, `operation:delete,get,update` | Label ID |
| labelName | string | `''` | yes | `resource:label`, `operation:create` | Label name |
| labelOptions | collection | `{}` | no | `resource:label`, `operation:create` | Create options |
| labelUpdateFields | collection | `{}` | no | `resource:label`, `operation:update` | Update fields |

##### `labelOptions` / `labelUpdateFields` collections

| name | type | default | description |
|----------|------|---------|-------------|
| color | options | `''` | Label color (same Todoist palette as projects) |
| order | number | `0` | Label order |
| is_favorite | boolean | `false` | Favorite flag |

---

#### Resource: Reminder (v2+)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `create` | yes | `resource:reminder` | `create` \| `getAll` \| `update` \| `delete` |
| reminderId | string | `''` | yes | `resource:reminder`, `operation:delete,update` | Reminder ID |
| itemId | string | `''` | yes | `resource:reminder`, `operation:create` | Task ID to attach reminder |
| dueDateType | options | `natural_language` | yes | `resource:reminder`, `operation:create` | `natural_language` \| `full_day` \| `floating_time` \| `fixed_timezone` |
| reminder options | (various) | — | — | `resource:reminder`, `operation:create` | Depends on `dueDateType` (see Todoist API) |

> **Note:** Reminder create parameters vary by `dueDateType`. The node presents conditional fields for each type (natural language string, date, datetime with/without timezone). See Todoist REST API v2 reminders endpoint for full schema.

---

## Runtime behavior

### Input

- Consumes `main` input items (array of `{ json, binary? }`).
- Each input item is processed independently (per-item loop).
- Parameters referencing expressions (`{{ $json... }}`) are evaluated per item.

### Output

- Produces `main` output items (array of `{ json, binary? }`).
- For `getAll` with `returnAll=true`: returns all matching items across pages.
- For `getAll` with `returnAll=false`: returns up to `limit` items.
- For create/update/delete/close/reopen/move: returns the API response object (task, project, section, comment, label, reminder).
- For operations returning success only (e.g., delete): returns `{ success: true }`.
- On error with `continueOnFail=true`: outputs `{ error: string }` for failed items.

### Errors

- Throws on API errors (4xx, 5xx) unless `continueOnFail` is enabled.
- On `continueOnFail`: emits error item on output instead of throwing.
- Authentication errors (invalid/expired credentials) throw immediately.
- Network errors throw unless `continueOnFail`.

### Expressions

All string, number, boolean, and collection parameters accept expressions (`{{ ... }}`).
Resource locator parameters (`project`, `sectionProject`) accept expressions in ID mode.
Options/multiOptions parameters accept expressions for manual ID entry.

### Credentials

- **API Key** (`todoistApi`): Single `apiKey` field (string).
- **OAuth2** (`todoistOAuth2Api`): Standard OAuth2 flow with `clientId`, `clientSecret`, `scope`, `authUri`, `accessTokenUrl`.
- Credential selected by `authentication` parameter (`apiKey` | `oAuth2`).

### Pagination

- `getAll` operations use cursor-based pagination (Todoist API `cursor` parameter).
- `returnAll=true` follows cursors until exhausted.
- `limit` caps results when `returnAll=false`.

### Version differences

| Feature | v1 | v2 / 2.1 / 2.2 |
|---------|-----|----------------|
| Resources | Task only | Task, Project, Section, Comment, Label, Reminder |
| Task operations | create, get, getAll, update, delete, close, reopen, move, sync* | + quickAdd |
| `move` section param | top-level `section` (v1) | `options.section` + `options.parent` (v2.1+) |
| `create` additional fields | `options` collection | expanded `options` (order, dueDate, assigneeId, duration, durationUnit, deadlineDate) |
| `update` additional fields | basic | + order, dueDate, assigneeId, duration, durationUnit, deadlineDate |
| `quickAdd` | — | yes (natural language) |
| `usableAsTool` | no | yes |
| Color options | — | Todoist palette (19 colors) |

* `sync` operation present in v1 source but commented out; not documented publicly.

---

## Acceptance tests

### Test: task.create (v1)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "create",
  "project": { "mode": "id", "value": "2302163813" },
  "content": "Test task from n8n",
  "options": {
    "priority": 3,
    "dueString": "tomorrow 10am"
  }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "12345", "content": "Test task from n8n", "project_id": "2302163813", "priority": 3, "due": { "string": "tomorrow 10am" }, "is_completed": false } }]
```

---

### Test: task.getAll with filters (v1/v2)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "getAll",
  "filters": {
    "projectId": "2302163813",
    "filter": "today | overdue"
  },
  "returnAll": true
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "111", "content": "Task 1", "project_id": "2302163813" } }, { "json": { "id": "222", "content": "Task 2", "project_id": "2302163813" } }]
```

---

### Test: task.quickAdd (v2+)

**Given** input items:
```json
[{ "json": { "text": "Buy milk @Grocery #shopping tomorrow p1" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "quickAdd",
  "text": "={{ $json.text }}"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "999", "content": "Buy milk", "project_id": "444", "labels": ["shopping"], "priority": 4, "due": { "date": "2026-07-31", "string": "tomorrow" } } }]
```

---

### Test: project.create (v2+)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "project",
  "operation": "create",
  "name": "New Project",
  "projectOptions": {
    "color": "blue",
    "is_favorite": true,
    "view_style": "board"
  }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "555", "name": "New Project", "color": "blue", "is_favorite": true, "view_style": "board" } }]
```

---

### Test: continueOnFail error handling (v1/v2)

**Given** input items:
```json
[{ "json": { "taskId": "nonexistent" } }, { "json": { "taskId": "valid-123" } }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "get",
  "taskId": "={{ $json.taskId }}"
}
```

**With** `continueOnFail: true`

**Expect** output[0]:
```json
[
  { "json": { "error": "Task not found" } },
  { "json": { "id": "valid-123", "content": "Valid task" } }
]
```

---

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| v1 `sync` operation | inferred | Present in V1 source but commented out; not in public docs. Spec includes it as documented but unused. |
| Reminder create fields per `dueDateType` | inferred | Corpus shows `dueDateType` enum but conditional fields not fully enumerated in descriptor. Public docs don't detail. |
| `quickAdd` natural language syntax | documented | Public docs + Todoist API docs reference; spec includes examples. |
| Color palette values | inferred from corpus | `TODOIST_COLOR_OPTIONS` array in V2 source (19 colors). Public docs don't list values. |
| `assigneeId` behavior | inferred | Present in V2 create/update; public docs don't mention. Assumed for shared projects. |
| `duration` + `durationUnit` | inferred | V2 only; must be used together. Public docs don't mention. |
| `deadlineDate` | inferred | V2 only; separate from `dueDate`. Public docs don't mention. |
| Pagination cursor mechanics | documented | Todoist API uses cursor; node handles internally. `returnAll` follows cursors. |
| `move` operation v1 vs v2.1+ | inferred from corpus | v1: top-level `section` param; v2.1+: nested in `options` collection with `parent`. |
| `section` param `loadOptionsDependsOn` | inferred | v1: `['project']`; v2: `['project.value']`; v2.1+ move: `['project', 'options.section']`. |

---

## OpenFlow mapping

- **Definition group:** `app` (productivity / app integration node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.todoist.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `todoistApi` (API Key), `todoistOAuth2Api` (OAuth2)
- **Version handling:** Single executor handling v1 | v2 | v2.1 | v2.2 via `context.node.typeOptions.version`
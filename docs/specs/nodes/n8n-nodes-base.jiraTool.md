---
type: n8n-nodes-base.jiraTool
displayName: Jira Software Tool
category: Transform
versions: [1]
priority: medium
status: specced
---

# Jira Software Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.jira/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/jira/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.jiraTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (pass-through for the AI agent context)
- **Outputs:** `main` × 1 (one item per API resource returned)
- **Credentials:** `jiraSoftwareCloudApi` (Atlassian Cloud OAuth, email + API token) or `jiraSoftwareServerApi` (host + user + password) or `jiraSoftwareServerPatApi` (host + PAT)

## Parameters

### Resource selector

The node exposes four resources. Exactly one resource must be selected.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `issue` | yes | `issue`, `issueAttachment`, `issueComment`, `user` |

### Issue operations

#### changelog — Get issue changelog
| name | type | default | required | notes |
|------|------|---------|----------|-------|
| issueKey | string | — | yes | Jira issue key (e.g. `PROJ-123`) |

#### create — Create a new issue
| name | type | default | required | notes |
|------|------|---------|----------|-------|
| project | string | — | yes | Project key or ID |
| issueType | string | — | yes | Issue type name or ID |
| summary | string | — | yes | Issue summary |
| additionalFields | collection | `{}` | no | `description`, `priority`, `labels`, `assignee`, `components`, `fixVersions`, `dueDate`, `parentKey`, and other standard Jira create fields |

#### delete — Delete an issue
| name | type | default | required | notes |
|------|------|---------|----------|-------|
| issueKey | string | — | yes | Jira issue key |
| options | collection | `{}` | no | `deleteSubtasks` (boolean) |

#### get — Get an issue
| name | type | default | required | notes |
|------|------|---------|----------|-------|
| issueKey | string | — | yes | Jira issue key |
| options | collection | `{}` | no | `fields` (comma-separated), `expand` (e.g. `renderedFields`) |

#### getAll — Get all issues (search via JQL)
| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | `false` | no | Paginate until exhausted when true |
| limit | number | `50` | no | Max results (used when returnAll is false) |
| options | collection | `{}` | no | `jql` (JQL query string, e.g. `project = PROJ`), `fields` (comma-separated), `expand` |

#### notify — Send email notification for an issue
| name | type | default | required | notes |
|------|------|---------|----------|-------|
| issueKey | string | — | yes | Jira issue key |
| subject | string | — | yes | Email subject |
| textBody | string | — | yes | Plain-text body |
| recipients | collection | — | yes | `reporter`, `assignee`, `watchers`, `voters` (booleans); or `customUsers` (array of account IDs) |

#### transitions — Get available transitions for an issue
| name | type | default | required | notes |
|------|------|---------|----------|-------|
| issueKey | string | — | yes | Jira issue key |

#### update — Update an issue
| name | type | default | required | notes |
|------|------|---------|----------|-------|
| issueKey | string | — | yes | Jira issue key |
| updateFields | collection | — | yes | Same fields as create (`summary`, `description`, `priority`, `labels`, `assignee`, `components`, `fixVersions`, `dueDate`, `status` via transition ID, etc.) |
| options | collection | `{}` | no | `notifyUsers` (boolean), `sendEmail` (boolean), `transitionId` |

### Issue Attachment operations

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| issueKey | string | — | yes | Jira issue key (for add/getAll/delete) |
| attachmentId | string | — | depends | Required for `get` and `delete` |
| binaryProperty | string | `data` | no | Binary property name for file upload (add) |
| options | collection | `{}` | no | `archive` (boolean, for delete) |

Operations: `add`, `get`, `getAll`, `remove`.

### Issue Comment operations

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| issueKey | string | — | yes | Jira issue key |
| commentId | string | — | depends | Required for `get`, `update`, `remove` |
| comment | string | — | yes (for add, update) | Comment body (Atlassian Document Format or plain text) |
| options | collection | `{}` | no | `visibility` (role + value) |

Operations: `add`, `get`, `getAll`, `remove`, `update`.

### User operations

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| accountId | string | — | depends | Required for `get`, `delete` |
| email | string | — | yes (for create) | User email address |
| displayName | string | — | yes (for create) | User display name |
| additionalFields | collection | `{}` | no | For create: `notification`, `password`, `applicationKeys` |

Operations: `create`, `delete`, `get`.

## Runtime behavior

### Input

The node receives items from the previous node (typically an AI agent context). When used as a tool (`$fromAI()`), the AI model supplies parameter values dynamically. Otherwise, static parameter values are used.

### Output

Each operation produces one output item per API result. The JSON payload in each item contains the Jira API response data (mapped per operation type):
- **Issue get/getAll:** `id`, `key`, `self`, `fields` (project, summary, status, assignee, priority, etc.)
- **Issue create:** `id`, `key`, `self`
- **Issue delete:** `{ success: true }`
- **Issue changelog:** Array of changelog entries with `id`, `author`, `fieldId`, `fromString`, `toString`, `created`
- **Issue notify:** `{ success: true }`
- **Issue transitions:** Array of `id`, `name`, `to` (status)
- **Issue update:** `{ success: true }`
- **Attachment add/get/getAll:** Attachment objects with `id`, `filename`, `mimeType`, `content`, `thumbnail`, `created`
- **Comment add/get/getAll:** Comment objects with `id`, `author`, `body`, `created`, `updated`, `visibility`
- **User get:** User object with `accountId`, `emailAddress`, `displayName`, `active`, `locale`, `timeZone`
- **User create:** Created user object

### Errors

- Jira API errors (4xx/5xx) are surfaced with the HTTP status and response body
- Missing required parameters (e.g. `issueKey`, `issueId`) produce a validation error
- `continueOnFail`: when enabled, the error item is passed through with an `error` property instead of throwing

### Expressions

All string parameters accept n8n expression syntax. When the node is used as an AI agent tool, `$fromAI()` can dynamically populate any parameter.

## Acceptance tests

### Test: create and get an issue

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "issue",
  "operation": "create",
  "project": "TEST",
  "issueType": "Task",
  "summary": "Test issue from n8n",
  "additionalFields": {
    "description": "Created by Jira Tool acceptance test",
    "priority": "Medium"
  }
}
```

**Expect** output[0] to contain a JSON object with `id` (string), `key` (string matching `TEST-\d+`), and `self` (URL string).

### Test: getAll issues with JQL

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "issue",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5,
  "options": {
    "jql": "project = TEST ORDER BY created DESC",
    "fields": "summary,status,assignee"
  }
}
```

**Expect** output[0] to be an array of up to 5 items, each with `json.key` and `json.fields.summary`.

### Test: add a comment to an issue

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "issueComment",
  "operation": "add",
  "issueKey": "TEST-1",
  "comment": "This is a test comment added by the Jira Tool."
}
```

**Expect** output[0] to contain `json.id`, `json.body`, and `json.author` fields on the comment object.

### Test: email notification for an issue

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "issue",
  "operation": "notify",
  "issueKey": "TEST-1",
  "subject": "Test notification",
  "textBody": "This is a test email body",
  "recipients": {
    "reporter": true,
    "assignee": true
  }
}
```

**Expect** output[0] to contain `json.success` equals `true`.

### Test: transition an issue

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "issue",
  "operation": "transitions",
  "issueKey": "TEST-1"
}
```

**Expect** output[0] to contain `json` as an array where each entry has `id`, `name`, and `to` (status object with `id` and `name`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and structure | Documented from n8n public docs | Public Jira page lists operations at high level; detailed parameter schemas verified against node definition type signatures |
| Jira REST API contracts | Inferred from Atlassian public API | Jira Cloud REST API v2/v3 has standard shapes for issues, comments, attachments, users |
| Tool-mode behavior | Documented | n8n docs confirm `usableAsTool: true` and `$fromAI()` support for this node |
| Credential types | Documented | n8n public docs list three Jira credential types: Cloud (API token), Server (basic auth), Server PAT |
| Exact option enums for fields | Inferred | This spec uses high-level abstractions; exact dropdown options depend on the Jira instance |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.jiraTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

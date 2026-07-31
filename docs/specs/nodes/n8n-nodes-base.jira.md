---
type: n8n-nodes-base.jira
displayName: Jira Software
category: Development
versions: [1]
priority: medium
status: specced
---

# Jira Software

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.jira/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/jira.md | Public docs only |
| https://developer.atlassian.com/cloud/jira/platform/rest/v2/intro/ | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.jira`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `jiraSoftwareCloudApi` (OAuth2) | `jiraSoftwareCloudApi` (API token) | `jiraSoftwareServerApi` (basic auth) | `jiraSoftwareServerPatApi` (PAT)
- **Usable as tool:** yes (AI agent tool)

### Credential details

The node prompts for a **Jira Version** parameter (`cloud` / `server` / `serverPat`) before showing credentials. Each version maps to a different credential type:
- `cloud` → `jiraSoftwareCloudApi` (OAuth2 or API token + email + domain)
- `server` → `jiraSoftwareServerApi` (email + password + domain)
- `serverPat` → `jiraSoftwareServerPatApi` (PAT token + domain)

All credentials require a **Domain** URL (e.g. `https://example.atlassian.net`).

## Parameters

### Resource selector

The top-level parameter is a two-level resource + operation picker:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `jiraVersion` | options: `cloud`, `server`, `serverPat` | `cloud` | yes | Determines credential type and API endpoint |
| `resource` | options: `issue`, `issueAttachment`, `issueComment`, `user` | `issue` | yes | |
| `operation` | options (see below) | varies by resource | yes | |

### Resource: Issue

**Operations:** `create`, `update`, `get`, `getAll`, `delete`, `changelog`, `notify`, `transitions`

| operation | parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| create | `project` | resourceLocator (list/id) | yes | Jira project ID |
| create | `issueType` | resourceLocator (list/id) | yes | Issue type ID |
| create | `summary` | string | yes | Issue summary/title |
| create | `additionalFields` | collection | no | See below |
| update | `issueKey` | string | yes | Issue key (e.g. PROJECT-123) |
| update | `updateFields` | collection | no | Fields to update |
| get | `issueKey` | string | yes | |
| get | `simplifyOutput` | boolean | no | Return simplified response |
| get | `additionalFields` | collection | no | expand, fields, fieldsByKey, properties, updateHistory |
| getAll | `returnAll` | boolean | no | |
| getAll | `limit` | number | no | 1–100, default 50 |
| getAll | `options` | collection | no | expand, fields, fieldsByKey, jql |
| delete | `issueKey` | string | yes | |
| delete | `deleteSubtasks` | boolean | yes | default false |
| changelog | `issueKey` | string | yes | |
| changelog | `returnAll` | boolean | no | |
| changelog | `limit` | number | no | 1–100, default 50 |
| notify | `issueKey` | string | yes | |
| notify | `jsonParameters` | boolean | no | Toggle between UI and JSON mode for recipients |
| notify | `additionalFields` | collection | no | htmlBody, subject, textBody |
| notify | `notificationRecipientsUi` | fixedCollection | no | reporter, assignee, watchers, voters, users, groups |
| notify | `notificationRecipientsJson` | json | no | Raw JSON recipients (when jsonParameters=true) |
| notify | `notificationRecipientsRestrictionsUi` | fixedCollection | no | users, groups restrictions |
| transitions | `issueKey` | string | yes | |
| transitions | `additionalFields` | collection | no | expand, transitionId, skipRemoteOnlyCondition |

**Issue create additionalFields:** assignee (resourceLocator), description (string), componentIds (multiOptions), customFieldsUi (fixedCollection fieldId+fieldValue), labels (multiOptions, cloud only), serverLabels (string[], server only), parentIssueKey (string), priority (resourceLocator), reporter (resourceLocator), updateHistory (boolean)

**Issue update updateFields:** assignee, description, customFieldsUi, issueType, labels/serverLabels, parentIssueKey, priority, reporter, summary, statusId (resourceLocator)

### Resource: Issue Attachment

**Operations:** `add`, `get`, `getAll`, `remove`

| operation | parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| add | `issueKey` | string | yes | |
| add | `binaryPropertyName` | string | yes | Input binary field name, default `data` |
| get | `attachmentId` | string | yes | |
| get | `download` | boolean | yes | Whether to download the attachment |
| get | `binaryProperty` | string | no | Output binary field name, default `data` (when download=true) |
| getAll | `issueKey` | string | yes | |
| getAll | `returnAll` | boolean | no | |
| getAll | `limit` | number | no | 1–100, default 50 |
| getAll | `download` | boolean | yes | Whether to download attachments |
| getAll | `binaryProperty` | string | no | Output binary field name (when download=true) |
| remove | `attachmentId` | string | yes | |

### Resource: Issue Comment

**Operations:** `add`, `get`, `getAll`, `remove`, `update`

| operation | parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| add | `issueKey` | string | yes | |
| add | `jsonParameters` | boolean | no | Toggle plain text vs ADF JSON |
| add | `comment` | string | no | Plain text comment (when jsonParameters=false) |
| add | `commentJson` | json | no | Atlassian Document Format JSON (when jsonParameters=true) |
| add | `options` | collection | no | expand (renderedBody), wikiMarkup (cloud only) |
| get | `issueKey` | string | yes | |
| get | `commentId` | string | yes | |
| get | `options` | collection | no | expand (renderedBody) |
| getAll | `issueKey` | string | yes | |
| getAll | `returnAll` | boolean | no | |
| getAll | `limit` | number | no | 1–100, default 50 |
| getAll | `options` | collection | no | expand, orderBy (`+created`/`-created`) |
| remove | `issueKey` | string | yes | |
| remove | `commentId` | string | yes | |
| update | `issueKey` | string | yes | |
| update | `commentId` | string | yes | |
| update | `jsonParameters` | boolean | no | |
| update | `comment` | string | no | Plain text (when jsonParameters=false) |
| update | `commentJson` | json | no | ADF JSON (when jsonParameters=true) |
| update | `options` | collection | no | expand, wikiMarkup |

### Resource: User

**Operations:** `create`, `delete`, `get`

| operation | parameter | type | required | notes |
|-----------|-----------|------|----------|-------|
| create | `username` | string | yes | |
| create | `emailAddress` | string | yes | |
| create | `displayName` | string | yes | |
| create | `additionalFields` | collection | no | password, notification |
| delete | `accountId` | string | yes | |
| get | `accountId` | string | yes | |
| get | `additionalFields` | collection | no | expand (groups, applicationRoles) |

## Runtime behavior

### Input

The node processes each input item independently. For operations that require an issue key, the value can be provided as a static string or via an expression (e.g. `{{ $json.issueKey }}`). Binary attachment operations (`issueAttachment:add`) read the file content from the input item's binary data using the `binaryPropertyName` parameter.

### Output

Each operation returns the Jira REST API response as `json` on the output items. For list operations (`getAll`), pagination is handled automatically when `returnAll` is true, or limited to `limit` items. The output shape is determined by the Jira REST API response for the given endpoint.

For `issueAttachment:get` and `issueAttachment:getAll` with `download=true`, the attachment content is written to the output item's binary data under the key specified by `binaryProperty` (default `data`).

The `issue:get` operation supports a `simplifyOutput` boolean that, when true, flattens the nested Jira API response into a simplified key-value structure.

### Errors

- **Authentication errors** (401/403): propagate with the status code and API error message.
- **Not found** (404): return empty array for `getAll` operations; throw for `get`/`update`/`delete` operations.
- **Validation errors** (400): propagate the Jira API error body.
- **`continueOnFail`**: when enabled, failed items produce a single output item with `{ json: { error: error.message } }` on the main output.

### Expressions

All string parameters accept expression strings (`{{ }}`). The `jql` parameter on `issue:getAll` is a common expression target for dynamic query construction.

## Acceptance tests

### Test: Create issue and verify key

**Given** input items:
```json
[{ "json": { "project": "10000", "issueType": "10001", "summary": "Test issue" } }]
```

**Parameters:**
```json
{ "resource": "issue", "operation": "create", "jiraVersion": "cloud" }
```

**Expect** output[0] to contain a JSON object with an `id` (string) and `key` (string, matching `PROJECT-\d+`).

### Test: Get issue by key

**Given** input items:
```json
[{ "json": { "issueKey": "TEST-123" } }]
```

**Parameters:**
```json
{ "resource": "issue", "operation": "get", "jiraVersion": "cloud" }
```

**Expect** output[0] JSON object to contain `id`, `key`, and `fields` properties matching the Jira issue response schema.

### Test: Get all issues with JQL filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "issue", "operation": "getAll", "returnAll": false, "limit": 5, "options": { "jql": "project = TEST" } }
```

**Expect** output[0] JSON array of up to 5 issues, each with `id`, `key`, and `fields`. The `fields` property contains `summary`, `status`, `issuetype`, and `project` sub-objects.

### Test: Add comment with plain text

**Given** input items:
```json
[{ "json": { "issueKey": "TEST-123", "comment": "This is a test comment" } }]
```

**Parameters:**
```json
{ "resource": "issueComment", "operation": "add", "jiraVersion": "cloud", "jsonParameters": false }
```

**Expect** output[0] JSON object to contain `id`, `body`, `author`, and `created` properties.

### Test: Upload attachment from binary field

**Given** input items:
```json
[{ "json": { "issueKey": "TEST-123" }, "binary": { "data": { "mimeType": "text/plain", "fileName": "test.txt", "data": "SGVsbG8gV29ybGQ=" } } }]
```

**Parameters:**
```json
{ "resource": "issueAttachment", "operation": "add", "jiraVersion": "cloud", "binaryPropertyName": "data" }
```

**Expect** output[0] JSON object to contain `id`, `filename`, `mimeType`, `size`, and `author`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource & operation list | Documented | Public docs enumerates all 4 resources and 20 operations |
| Parameter schemas per operation | Inferred from corpus descriptor | Verified against npm package descriptor metadata |
| Jira REST API response shapes | Documented | Publicly documented at developer.atlassian.com |
| Credential types and fields | Documented | Public docs page covers all 3 credential variants |
| `simplifyOutput` flattening logic | Inferred | Exact flattening algorithm not documented; implementation-specific |
| `jiraVersion` credential gating | Inferred | Credential selection depends on jiraVersion parameter value |
| Pagination mechanics (returnAll) | Documented | Standard n8n pattern used across all getAll operations |
| Binary attachment upload/download | Inferred | Public docs describe the capability; exact binary field contract is inferred from descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/jira.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
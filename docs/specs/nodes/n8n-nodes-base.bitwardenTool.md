---
type: n8n-nodes-base.bitwardenTool
displayName: Bitwarden Tool
category: transform
versions: [1]
priority: medium
status: specced
---

# Bitwarden Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bitwarden/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/bitwarden/ | Public docs only |
| https://bitwarden.com/help/public-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.bitwardenTool`
- **Aliases:** `n8n-nodes-base.bitwarden` (base node with `usableAsTool: true`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `bitwardenApi` (required)

The `bitwardenTool` type is the AI-agent tool variant of the base Bitwarden node. The base node already declares `usableAsTool: true`, so the tool variant shares the same parameter schema but is exposed specifically as a tool that supports `$fromAI()` dynamic parameter population.

## Parameters

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options: `collection`, `event`, `group`, `member` | `collection` | yes | Selects the Bitwarden API resource to operate on |

### Collection operations

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options: `delete`, `get`, `getAll`, `update` | `get` | yes | resource=collection |
| collectionId | string | (empty) | yes | resource=collection, operation in (delete, get, update) | UUID of the collection |
| returnAll | boolean | false | no | resource=collection, operation=getAll | When false, limit applies |
| limit | number (min 1) | 10 | no | resource=collection, operation=getAll, returnAll=false | Max results |
| updateFields | collection | {} | yes | resource=collection, operation=update | Group Names or IDs, External ID |

### Event operations

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options: `getAll` | `getAll` | yes | resource=event | |
| returnAll | boolean | false | no | resource=event, operation=getAll | |
| limit | number (min 1) | 10 | no | resource=event, operation=getAll, returnAll=false | |
| filters | collection | {} | no | resource=event, operation=getAll | Optional: Actor ID, Item ID, Action (string), Start Date, End Date |

### Group operations

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options: `create`, `delete`, `get`, `getAll`, `getMembers`, `update`, `updateMembers` | `get` | yes | resource=group | |
| groupId | string | (empty) | yes | resource=group, operation in (delete, get, getMembers, update, updateMembers) | UUID of the group |
| returnAll | boolean | false | no | resource=group, operation=getAll | |
| limit | number (min 1) | 10 | no | resource=group, operation=getAll, returnAll=false | |
| name | string | (empty) | yes | resource=group, operation=create | Group display name |
| updateFields | collection | {} | no | resource=group, operation=update | Name, External ID |
| memberIds | string | (empty) | yes | resource=group, operation=updateMembers | Comma-separated member UUIDs to assign |

### Member operations

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options: `create`, `delete`, `get`, `getAll`, `getGroups`, `update`, `updateGroups` | `get` | yes | resource=member | |
| memberId | string | (empty) | yes | resource=member, operation in (delete, get, getGroups, update, updateGroups) | UUID of the member |
| returnAll | boolean | false | no | resource=member, operation=getAll | |
| limit | number (min 1) | 10 | no | resource=member, operation=getAll, returnAll=false | |
| email | string | (empty) | yes | resource=member, operation=create | Email address to invite |
| type | number | (empty) | no | resource=member, operation=create | Member type (0=Owner, 1=Admin, 2=User, 3=Manager) |
| updateFields | collection | {} | no | resource=member, operation=update | Type, External ID |
| groupIds | string | (empty) | yes | resource=member, operation=updateGroups | Comma-separated group UUIDs to assign |
| filters | collection | {} | no | resource=member, operation=getAll | Optional: Search text |

## Runtime behavior

### Input

Passes incoming items through; each item triggers one API call. For `getAll` operations the input item data is not consumed — the API query is driven entirely by node parameters.

### Output

Each input item produces one output item containing the API response body merged with the original input item data. For `getAll` operations that return multiple results, a single output item contains the full result array under the `data` key (rather than splitting into multiple items).

Operation-specific response shapes:

- **Collection → get/update:** Returns the full collection object (id, organizationId, name, externalId, groups, creationDate, revisionDate).
- **Event → getAll:** Returns an array of event objects (id, type, itemId, collectionId, groupId, policyId, memberId, actingUserId, date, organizationId).
- **Group → get/update:** Returns the full group object (id, name, accessAll, externalId, creationDate, revisionDate).
- **Group → getMembers:** Returns an array of member objects assigned to the group.
- **Member → get/update:** Returns the full member object (id, email, userId, type, status, externalId, creationDate, revisionDate).
- **Member → getGroups:** Returns an array of group objects assigned to the member.

### Errors

- 4xx responses from the Bitwarden Public API are surfaced as NodeOperationError with the API's error detail.
- Missing required parameters (e.g., collectionId for delete) throw before any API call.
- `continueOnFail`: when enabled, failed items are returned with an `error` property instead of halting execution.

### Expressions

All string and number parameters accept n8n expressions. The `$fromAI()` function is supported for AI-agent tool usage to populate parameters dynamically.

## Acceptance tests

### Test: get a collection by ID

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "collection",
  "operation": "get",
  "collectionId": "5e59c8c7-e05a-4d17-8e85-acc301343926"
}
```
**Expect** output[0]:
```json
[{
  "json": {
    "id": "5e59c8c7-e05a-4d17-8e85-acc301343926",
    "organizationId": "9074015e-e2b7-4373-8b7b-362e4c4d9cd0",
    "name": "Engineering Secrets",
    "externalId": null,
    "creationDate": "2023-01-15T10:00:00Z",
    "revisionDate": "2023-06-20T14:30:00Z"
  }
}]
```

### Test: list all members with search filter

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "member",
  "operation": "getAll",
  "returnAll": true,
  "filters": { "search": "john" }
}
```
**Expect** output[0] to contain a `data` array where each entry has `id`, `email`, `type`, `status` fields.

### Test: create a new group

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "group",
  "operation": "create",
  "name": "DevOps Team"
}
```
**Expect** output[0]:
```json
[{
  "json": {
    "id": "[a-f0-9-]{36}",
    "name": "DevOps Team",
    "accessAll": false,
    "creationDate": "2026-01-01T00:00:00Z",
    "revisionDate": "2026-01-01T00:00:00Z"
  }
}]
```

### Test: update a collection with group assignments

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "collection",
  "operation": "update",
  "collectionId": "5e59c8c7-e05a-4d17-8e85-acc301343926",
  "updateFields": {
    "groupIds": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```
**Expect** output[0] to contain the full updated collection object with the modified group assignments.

### Test: AI agent tool call via $fromAI()

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "={{ $fromAI('resource') }}",
  "operation": "={{ $fromAI('operation') }}"
}
```
**Expect** the executor to support dynamic parameter resolution from the AI agent's tool call, populating `resource` and `operation` from the agent's selected intent. No further parameters required when `$fromAI()` supplies them.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources and operations | Documented | Operations match https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bitwarden/ |
| Credential shape | Documented | Client ID + Client Secret + environment (cloud/self-hosted) per credentials docs |
| Detailed parameter names, defaults, displayOptions | Inferred from JSON descriptor | The nested parameter structure (updateFields, filters collections) follows patterns common to all n8n API nodes |
| Exact API response shapes | Inferred | Based on the Bitwarden Public API contract; response field names are standard Bitwarden API properties |
| `$fromAI()` support | Inferred | Standard for all `*Tool` aliases in n8n; the base node has `usableAsTool: true` |
| Bitwarden Public API rate limits | Undocumented | Not specified in n8n docs; depends on Bitwarden plan |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/bitwardenTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

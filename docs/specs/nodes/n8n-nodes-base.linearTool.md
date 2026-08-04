---
type: n8n-nodes-base.linearTool
displayName: Linear Tool
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Linear Tool

AI agent tool variant of the Linear app node. Wraps the Linear issue and comment operations so an AI agent can create, read, update, and delete Linear issues and add comments via the Linear GraphQL API. Parameters can be set dynamically by the AI model through `$fromAI()`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.linear.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/linear.md | Public docs only |
| https://developers.linear.app/docs/graphql/working-with-the-graphql-api | Third-party service API docs |
| https://developers.linear.app/docs/oauth/authentication | Third-party service API docs |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.linearTool`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `linearApi` (personal API key) or `linearOAuth2Api` (OAuth2) — same credential types as the base Linear node

## Parameters

### Resource & operation

| Parameter | type | default | required | notes |
|-----------|------|---------|----------|-------|
| resource | enum | `"issue"` | yes | `"issue"` or `"comment"` |
| operation | enum | resource-dependent | yes | Issue: `"addLink"`, `"create"`, `"delete"`, `"get"`, `"getAll"`, `"update"`. Comment: `"addComment"` |

### Issue identification

Required for operations that target a specific issue (get, delete, update, addLink, addComment):

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| issueIdentifier | string | conditional | The Linear issue ID or identifier; required when operation targets an existing issue |

### Issue fields (create, update)

| Parameter | type | notes |
|-----------|------|-------|
| issueFields | structured collection | Object containing the fields to set on create or update: title, description, teamId, statusId, priority, assigneeId, projectId, labels, and other Linear API-supported fields. Create requires mandatory fields per Linear's API; update sends only supplied fields |

### Query controls (getMany)

| Parameter | type | default | notes |
|-----------|------|---------|-------|
| returnAll | boolean | false | Fetch all matching issues or respect `limit` |
| limit | number | 50 | Max issues per page (1–250); hidden when returnAll is true |
| filters | structured | — | Optional filters supported by the Linear issues query (e.g. status, assignee, team, priority) |
| orderBy | enum | — | Sort field for the result set |

### Link (addLink)

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| linkUrl | string | yes | The URL to associate with the issue |
| linkTitle | string | no | Optional display title for the link |
| linkLabel | string | no | Optional label for the link |

### Comment (addComment)

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| commentBody | string | yes | Markdown/text content for the comment |
| parentCommentId | string | no | Optional parent comment ID when replying to an existing comment |

All operation-specific parameters accept `$fromAI()` expressions and can be populated dynamically by the AI model.

## Runtime behavior

### Input

Each incoming item represents one discrete Linear operation request. The node reads `resource`, `operation`, and any conditional parameters from the node configuration (or from AI-populated expressions) and constructs the corresponding Linear GraphQL mutation or query.

### Output

- **Create:** Returns the created issue object including its stable identifier.
- **Get:** Returns a single issue object matching the issue identifier.
- **Get Many:** Returns an array of issue objects; all matching if `returnAll`, otherwise up to `limit`.
- **Update:** Returns the updated issue object.
- **Delete:** Returns a success confirmation.
- **Add Link:** Returns the added link or the resulting issue.
- **Add Comment:** Returns the created comment including its stable identifier.

The output shape mirrors the Linear GraphQL API response for each operation. Useful fields returned by the API must be preserved.

### Errors

- Missing or invalid credentials → execution error.
- Missing required fields (e.g. no title on create) → validation error before API call.
- Nonexistent issue identifier → provider error propagated to output.
- GraphQL errors in response → execution error (not a successful empty result).
- `continueOnFail` → emits error-bearing item on the normal output and continues processing subsequent items.

### Expressions

All operation-specific parameters accept expression strings and `$fromAI()` dynamic population. Resource and operation selectors may also be dynamic.

## Acceptance tests

### Test: create an issue

**Given** input items:

```json
[{ "json": { "title": "Test from AI" } }]
```

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "create",
  "issueFields": {
    "title": "={{ $json.title }}",
    "teamId": "team-abc"
  }
}
```

**Expect** one Linear create-issue mutation is made with the resolved title and team. The output contains one JSON item with a non-empty issue identifier and the created issue title.

### Test: get an existing issue

**Given** input items:

```json
[{ "json": { "issueId": "ISS-123" } }]
```

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "get",
  "issueIdentifier": "={{ $json.issueId }}"
}
```

**Expect** the output contains the Linear issue matching `ISS-123`, including its stable identifier and title.

### Test: update an issue

**Given** input items:

```json
[{ "json": { "issueId": "ISS-123", "newPriority": 1 } }]
```

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "update",
  "issueIdentifier": "={{ $json.issueId }}",
  "issueFields": {
    "priority": "={{ $json.newPriority }}"
  }
}
```

**Expect** one update mutation is made for `ISS-123` with priority set to 1. The output identifies the updated issue.

### Test: add a comment via AI agent

**Given** input items:

```json
[{ "json": { "issueId": "ISS-123", "comment": "Reviewed" } }]
```

**Parameters:**

```json
{
  "resource": "comment",
  "operation": "addComment",
  "issueIdentifier": "={{ $json.issueId }}",
  "commentBody": "={{ $json.comment }}"
}
```

**Expect** one comment-create mutation is made for `ISS-123`. The output contains the created comment with its body and stable identifier.

### Test: continue on provider error

**Given** an item whose issue identifier does not exist and `continueOnFail` is enabled.

**Expect** the node emits an error-bearing item on the normal output. Subsequent input items remain eligible for processing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire type and tool purpose | documented | Public n8n docs confirm tool variant pattern; Linear node page documents operations |
| Resources and operations | documented | Public Linear node page: issue (6 ops) + comment (1 op) |
| Credentials | documented | Same Linear API key and OAuth2 credential types as base node |
| `$fromAI()` support | documented | Public docs confirm tool variant supports AI parameter population |
| Parameter shapes | inferred from base Linear spec | Tool variant inherits same parameter structure as the base Linear node |
| GraphQL transport and provider error model | documented | Linear GraphQL API documentation |
| Exact parameter nesting and UI layout | inferred | Intentionally abstracted; avoids reconstructing the original nested schema |
| Response field selection | inferred | Linear's GraphQL schema evolves; implementation should preserve returned provider data |

## OpenFlow mapping

- **Definition group:** `Linear`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.linearTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

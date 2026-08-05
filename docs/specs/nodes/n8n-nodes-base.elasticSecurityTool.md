---
type: n8n-nodes-base.elasticSecurityTool
displayName: Elastic Security
category: App
versions: [1]
priority: medium
status: specced
---

# Elastic Security

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.elasticsecurity/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/elasticsecurity/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.elasticSecurityTool`
- **Aliases:** `n8n-nodes-base.elasticSecurity`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `elasticSecurityApi`

### Credential schema

| name | type | required | notes |
|------|------|----------|-------|
| baseUrl | string | yes | Elasticsearch application endpoint (Base URL) |
| username | string | conditional | Required for basic auth |
| password | string | conditional | Required for basic auth |
| apiKey | string | conditional | Required for API key auth |

Two mutually exclusive authentication modes: Basic Auth (username + password) or API Key. The Base URL is the full Elasticsearch application endpoint.

## Parameters

The node exposes four logical resource groups, each with its own set of operations. A top-level **Resource** selector and **Operation** selector determine which parameters are shown.

### Case

Operations:

| operation | required params | optional / additional notes |
|-----------|----------------|----------------------------|
| Create | title, connector | Additional case fields: description, tags, settings (syncAlerts), owner |
| Delete | caseId | |
| Get | caseId | |
| GetAll | (none) | Supports pagination: page, perPage; optional filters: tags, status (open/in-progress/closed), severity (low/medium/high/critical), assignee, from/to date range, search term |
| Get Summary | caseId | Returns aggregated activity summary for a case (comments, alerts, user actions) |
| Update | caseId | Updatable fields: title, description, status, severity, tags, settings, connector, assignee |

### Case Comment

| operation | required params | optional / additional notes |
|-----------|----------------|----------------------------|
| Create | caseId, comment (message text) | |
| Get | caseId, commentId | |
| GetAll | caseId | Supports pagination: page, perPage |
| Remove | caseId, commentId | |
| Update | caseId, commentId, comment | Replaces the comment body |

### Case Tag

| operation | required params | optional / additional notes |
|-----------|----------------|----------------------------|
| Add | caseId, tag | Single tag string added to case |
| Remove | caseId, tag | Single tag string removed from case |

### Connector

| operation | required params | optional / additional notes |
|-----------|----------------|----------------------------|
| Create | connectorType (e.g. .jira, .resilient, .swimlane), fields (connectorType-specific) | Creates an external action connector; depends on the connector type being supported by the Elastic Security instance |

## Runtime behavior

### Input

The node expects any number of items on `main[0]`. Each item's JSON fields can populate parameters via expressions.

### Output

Each execution produces one or more items on `main[0]`. The output shape mirrors the relevant Elastic Security REST API response body. For create/update operations, the created/updated entity (case, comment, or connector) is returned. For GetAll operations, the response is wrapped as an array of result items. For delete operations, the deleted entity (or a success acknowledgment) is returned.

### Errors

- API errors (4xx/5xx) are surfaced as node errors. The `continueOnFail` option suppresses per-item failures and passes the error item on the output instead.
- 404 responses for Get/Delete/Update on nonexistent IDs cause a thrown error.
- Validation errors (missing required fields) are thrown before any API call.

### Expressions

All string, number, and boolean parameters accept expressions. Resource, Operation, and credential selection are static (no expressions).

## Acceptance tests

### Test: create a case

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "case",
  "operation": "create",
  "title": "Test case from n8n",
  "description": "Automated test case",
  "connector": { "id": "none", "name": "none", "type": ".none", "fields": null }
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "<valid-case-id>", "title": "Test case from n8n", "description": "Automated test case", "status": "open", "totalCommentCount": 0, "totalAlerts": 0 } }]
```

### Test: get all cases with pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "case",
  "operation": "getAll",
  "page": 1,
  "perPage": 10
}
```

**Expect** output[0]:
```json
[{ "json": { "page": 1, "perPage": 10, "total": "<number>", "cases": [ ... ] } }]
```

### Test: add and remove a case tag

**Given** input items:
```json
[{ "json": { "caseId": "<existing-case-id>" } }]
```

**Parameters:**
```json
{
  "resource": "caseTag",
  "operation": "add",
  "caseId": "={{ $json.caseId }}",
  "tag": "critical"
}
```

**Expect** output[0] includes the case with `"tags": ["critical"]`.

### Test: create a case comment

**Given** input items:
```json
[{ "json": { "caseId": "<existing-case-id>" } }]
```

**Parameters:**
```json
{
  "resource": "caseComment",
  "operation": "create",
  "caseId": "={{ $json.caseId }}",
  "comment": "Updated via n8n automation"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "<valid-comment-id>", "comment": "Updated via n8n automation", "caseId": "<existing-case-id>" } }]
```

### Test: get case summary

**Given** input items:
```json
[{ "json": { "caseId": "<existing-case-id>" } }]
```

**Parameters:**
```json
{
  "resource": "case",
  "operation": "getSummary",
  "caseId": "={{ $json.caseId }}"
}
```

**Expect** output[0] contains a summary object with fields such as totalComments, totalAlerts, and associated user actions.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact API endpoint paths | inferred | Elastic Security Cases API lives under `/api/cases` and `/api/actions/connector` on the Kibana/Elastic instance; exact URL construction depends on credential baseUrl |
| Case fields for Create | inferred from public API shape | title, description, tags, settings (syncAlerts), connector, owner |
| Connector types/fields | inferred | Connector payload format varies by connector type (.jira, .resilient, .swimlane, .none); exact schemas depend on configured Elastic Security instance |
| Pagination parameter names | inferred | page/perPage are standard for n8n; actual API uses page/ perPage or search_after style |
| GetSummary response shape | inferred | Aggregated activity counts and user action timeline; exact field names depend on ES Security API version |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/ElasticSecurityExecutor.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

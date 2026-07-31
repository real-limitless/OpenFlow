---
type: n8n-nodes-base.linear
displayName: Linear
category: Productivity
versions: [1, 1.1]
priority: high
status: specced
---

# Linear

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.linear.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/linear.md | Public docs only |
| https://developers.linear.app/docs/graphql/working-with-the-graphql-api | Third-party service API docs |
| https://developers.linear.app/docs/oauth/authentication | Third-party service API docs |

The n8n documentation and service documentation are the contract sources. No
third-party node implementation source was consulted.

## Wire format

- **Type string:** `n8n-nodes-base.linear`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one Linear credential using either a personal API key or OAuth2

The node is an action node, not a trigger. The separate Linear Trigger wire type
is outside this specification.

## Parameters

The node exposes a resource selector and an operation selector. Only parameters
relevant to the selected combination should be required or evaluated.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | option | API key | yes | always | Select API-key or OAuth2 authentication. |
| resource | option | issue | yes | always | Documented resources are `issue` and `comment`. |
| operation | option | resource-dependent | yes | resource-dependent | Issue operations: add link, create, delete, get, get many, update. Comment operation: add comment. |
| issue identifier | string or expression | -- | conditional | issue get/delete/update/add-link, comment add | Identifies the target issue in Linear. |
| issue fields | object or expressions | -- | conditional | issue create/update | Values for the issue being created or changed, such as title, description, team, status, priority, assignee, project, labels, and other fields supported by the Linear API. Create requires the service's mandatory issue inputs; update sends only supplied fields. |
| query / list controls | object or expressions | -- | no | issue get many | Optional filters, ordering, field selection, and pagination controls supported by the Linear API. |
| link | string or expression | -- | conditional | issue add link | URL and any supported link metadata to associate with the issue. |
| comment body | string or expression | -- | conditional | comment add | Markdown/text content for the comment. |
| parent comment identifier | string or expression | -- | no | comment add | Optional parent comment identifier when the service supports creating a reply. |

All scalar values and service-supported object values may be expressions. The
OpenFlow representation may use a resource locator for issue identifiers, but
the resolved value sent to Linear must identify the same issue.

## Runtime behavior

### Input

The node consumes items from `main[0]` and processes the selected operation for
each item. Expressions are resolved against the current item. An operation that
does not need item data still follows the normal per-item execution contract.

The implementation communicates with Linear's GraphQL API. It must translate
the selected resource and operation into the corresponding Linear query or
mutation without exposing the provider's internal request construction as part
of the workflow contract.

### Output

Successful operations emit JSON items containing the service result for that
operation:

- create, update, get, and add-comment return the created, changed, or fetched
  service object/result;
- get-many returns the retrieved collection according to the node's collection
  handling contract;
- add-link returns the resulting link/issue result when provided by the service;
- delete returns the operation result, or a successful empty result when Linear
  provides no body.

The node must not discard useful fields returned by Linear. It need not reshape
the result into a fixed copy of Linear's evolving GraphQL schema.

### Errors

Missing credentials, invalid parameter combinations, malformed GraphQL input,
authentication failures, permission failures, rate limits, and provider errors
are execution errors. Required operation inputs should be validated before the
request when possible. A provider response containing GraphQL errors is not a
successful empty result.

When `continueOnFail` is enabled, the failed item is represented on the normal
output with an error description and processing continues according to the
engine's standard item error contract. Without it, the first item failure stops
the node execution.

### Expressions

String, number, boolean, and object parameter values that are passed to the
service accept OpenFlow expressions. Dynamic values are resolved independently
for each input item.

## Acceptance tests

### Test: create an issue

**Given** input items:

```json
[{ "json": { "title": "Investigate timeout" } }]
```

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "create",
  "issueFields": {
    "title": "={{ $json.title }}",
    "team": "team-123"
  }
}
```

**Expect:** one Linear create-issue mutation is made with the resolved title
and team. The output contains one JSON item with a non-empty issue identifier
and the created issue title.

### Test: get an issue

**Given** input items:

```json
[{ "json": { "issueId": "issue-123" } }]
```

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "get",
  "issueIdentifier": "={{ $json.issueId }}"
}
```

**Expect:** the output contains the Linear issue identified by `issue-123`,
including a stable identifier. No unrelated input item is substituted for the
service result.

### Test: update an issue

**Given** input items:

```json
[{ "json": { "issueId": "issue-123", "newTitle": "Resolved timeout" } }]
```

**Parameters:**

```json
{
  "resource": "issue",
  "operation": "update",
  "issueIdentifier": "={{ $json.issueId }}",
  "issueFields": {
    "title": "={{ $json.newTitle }}"
  }
}
```

**Expect:** one update mutation is made for `issue-123` with the resolved title,
and the output identifies the updated issue with that title.

### Test: add a comment

**Given** input items:

```json
[{ "json": { "issueId": "issue-123", "message": "Reviewed by automation" } }]
```

**Parameters:**

```json
{
  "resource": "comment",
  "operation": "addComment",
  "issueIdentifier": "={{ $json.issueId }}",
  "commentBody": "={{ $json.message }}"
}
```

**Expect:** one comment-create mutation is made for the selected issue. The
output contains the created comment result or its stable identifier and the
submitted body.

### Test: continue on a provider error

**Given** an item whose issue identifier does not exist and `continueOnFail` is
enabled.

**Expect:** the node emits an error-bearing item on the normal output and does
not silently report a successful issue result. Subsequent input items remain
eligible for processing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Wire type and action-node purpose | documented | Public n8n node documentation. |
| Resources and operations | documented | Public n8n node documentation lists comment add-comment and the six issue operations. |
| API-key and OAuth2 authentication | documented | n8n credential documentation and Linear authentication documentation. |
| GraphQL transport and provider error model | documented | Linear GraphQL API documentation. |
| Exact UI parameter names, defaults, and conditional display rules | inferred / intentionally abstracted | The public node page lists operations but not the complete editor schema; this spec avoids reconstructing package metadata. |
| Exact response field selection and pagination details | inferred | Linear's GraphQL schema evolves; implementations should preserve returned provider data while honoring the selected operation. |
| Delete and no-content output behavior | inferred | The service contract determines whether a delete result has a body; the node must preserve the engine's normal empty-result semantics. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/linear.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

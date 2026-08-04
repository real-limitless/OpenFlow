---
type: n8n-nodes-base.lemlist
displayName: Lemlist
category: Communication, Marketing
versions: [1, 2]
defaultVersion: 2
priority: medium
status: specced
---

# Lemlist

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.lemlist/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/lemlist/ | Public docs only |
| https://developer.lemlist.com/ | Public docs only |
| n8n-nodes-base@2.15.1 package snapshot (type schema only) | CORPUS_DIR — type string + resource/operation names confirmed |

## Wire format

- **Type string:** `n8n-nodes-base.lemlist`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `lemlistApi` (API key)

## Parameters

The node exposes a resource/operation structure. A *resource* selects which domain of the lemlist API to act on, and an *operation* selects the specific action within that resource.

### Resource: Activity

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Get Many | `returnAll` (boolean), `limit` (number 1–1000), `filters.campaignId`, `filters.type` (activity type enum), `filters.leadId`, `filters.isFirst` (boolean) | Paginated retrieval of the campaign activity history. Supports filtering by campaign, activity type, lead, and first-occurrence flag. |

### Resource: Campaign

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Get Many | `returnAll`, `limit`, `filters.version` | Paginated list of campaigns. |
| Get Stats | `campaignId`, `startDate`, `endDate`, `timezone` | Performance statistics for a single campaign over a date range. |

### Resource: Enrichment (v2 only)

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Get (fetch result) | `enrichId` | Retrieve a previously completed enrichment result by its ID. |
| Enrich Lead | `leadId`, `findEmail`, `verifyEmail`, `linkedinEnrichment`, `findPhone` | Enrich an existing lead (by lead ID) with additional data. |
| Enrich Person | `findEmail`, `verifyEmail`, `linkedinEnrichment`, `findPhone`, `additionalFields` (email, firstName, lastName, linkedinUrl, companyName, companyDomain) | Enrich a person using an email or LinkedIn URL, with optional input fields describing the person. |

### Resource: Lead

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Create | `campaignId`, `email`, `additionalFields` (firstName, lastName, companyName, companyDomain, phone, linkedinUrl, picture, jobTitle, icebreaker, deduplicate, findEmail, verifyEmail, findPhone, linkedinEnrichment) | Create a new lead in a campaign. |
| Delete | `campaignId`, `email` | Remove a lead from a campaign. |
| Get | `email` | Retrieve a lead's details by email. |
| Unsubscribe | `campaignId`, `email` | Unsubscribe a lead from a campaign without deleting. |

### Resource: Team

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Get | (none) | Retrieve the authenticated team's profile. |
| Get Credits | (none) | Retrieve the team's remaining credits balance. |

### Resource: Unsubscribe

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Add | `email` | Add an email to the global unsubscribe list. |
| Delete | `email` | Remove an email from the global unsubscribe list. |
| Get Many | `returnAll`, `limit` | Paginated list of all unsubscribed emails. |

### Common parameter patterns

- `returnAll` (boolean, default `false`) — when false, the pagination parameter `limit` (1–1000, default 5) controls page size.
- Resource/operation selection is done via a two-level dropdown: first pick *resource*, then *operation*.
- Campaign IDs are resolved from a dynamic dropdown loaded via the lemlist API; the user may also enter an ID as a free-text expression.
- Activity types, when filtered, are chosen from a large enum (30+ values covering email, LinkedIn, Aircall, and manual event categories such as `emailsOpened`, `emailsClicked`, `emailsReplied`, `linkedinInviteAccepted`, `aircallDone`, etc.).

## Runtime behavior

### Input

Each incoming item is processed independently. Items flow through as-is; the node does not aggregate across items unless the operation is a list/getAll retrieval.

### Output

For **getAll** operations: each item in the output array is emitted as a separate output item. The response body from the lemlist API is placed under the `json` property of each output item.

For **single-object** operations (create, get, delete, unsubscribe, add, enrich): the response object from the lemlist API is placed under the `json` property of the output item. The node passes through any `binary` and pairedItem data from the input.

For **Team → Get Credits**: the output contains the credits balance object from the API under `json`.

### Errors

- The node throws an `NodeOperationError` when the upstream lemlist API responds with a non-2xx status.
- When `continueOnFail` is enabled on the node, execution proceeds to the next connected node rather than halting the workflow.
- Validation errors (missing required fields like `email` or `campaignId`) are surfaced as `NodeOperationError` with descriptive messages.

### Expressions

All parameter values accept expression strings. The resource and operation selectors are marked `noDataExpression: true` (they are wired via dropdown and not intended to receive dynamic expressions at runtime).

## Acceptance tests

### Test: Activity Get Many with paging

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "activity",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] to contain between 0 and 10 items, each with a `json` property mirroring the lemlist activity response shape.

### Test: Create a lead and then retrieve it

**Given** a known campaign ID and an email:
```json
[{ "json": { "email": "test@example.com", "campaignId": "abc-123" } }]
```

**Parameters (create):**
```json
{
  "resource": "lead",
  "operation": "create",
  "campaignId": "={{ $json.campaignId }}",
  "email": "={{ $json.email }}",
  "additionalFields": { "firstName": "Test", "lastName": "User" }
}
```

**Expect** output[0][0].json to contain the created lead object with an `_id` field.

### Test: Get team credits

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "team",
  "operation": "getCredits"
}
```

**Expect** output[0][0].json to contain a credits object with properties like `remaining`, `total`, and `used`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented (public n8n docs, lemlist API docs) | High confidence |
| Parameter shapes | Inferred (package type schema) | Parameter names and defaults verified against corpus type schema; v2 adds Enrichment resource not present in v1 |
| Activity type enum values | Inferred (package type schema) | 30+ enum values confirmed; these map directly to lemlist API activity types |
| Response shapes | Inferred | Not documented by n8n; follow the lemlist API response contracts at https://developer.lemlist.com/ |
| Pagination behavior | Inferred (ad-hoc from type schema) | Uses `returnAll`/`limit` convention common across n8n app nodes |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.lemlist.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

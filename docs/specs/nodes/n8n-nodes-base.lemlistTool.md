---
type: n8n-nodes-base.lemlistTool
displayName: Lemlist Tool
category: Communication, Marketing
versions: [1, 2]
defaultVersion: 2
priority: medium
status: specced
---

# Lemlist Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.lemlist/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/lemlist/ | Public docs only |
| https://developer.lemlist.com/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.lemlistTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `lemlistApi` (API key)

## Parameters

The lemlistTool is an AI agent tool variant of the base Lemlist app node. It wraps the same 6 resources and 16 operations against the lemlist REST API (`https://api.lemlist.com/api`). The key distinction is that any parameter can be populated dynamically by the AI model via `$fromAI()` expressions rather than requiring explicit user configuration.

### Resource: Activity

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Get Many | `returnAll` (boolean), `limit` (number 1–1000), `filters.campaignId`, `filters.type` (activity type enum), `filters.leadId`, `filters.isFirst` (boolean) | Paginated retrieval of the campaign activity history. |

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
| Enrich Person | `findEmail`, `verifyEmail`, `linkedinEnrichment`, `findPhone`, `additionalFields` (email, firstName, lastName, linkedinUrl, companyName, companyDomain) | Enrich a person using an email or LinkedIn URL. |

### Resource: Lead

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Create | `campaignId`, `email`, `additionalFields` (firstName, lastName, companyName, companyDomain, phone, linkedinUrl, picture, jobTitle, icebreaker, deduplicate, findEmail, verifyEmail, findPhone, linkedinEnrichment) | Create a new lead in a campaign. |
| Delete | `campaignId`, `email` | Remove a lead from a campaign. |
| Get | `email` | Retrieve a lead by email. |
| Unsubscribe | `campaignId`, `email` | Unsubscribe a lead from a campaign. |

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
| Get Many | `returnAll`, `limit` | Paginated list of unsubscribed emails. |

### AI tool behavior

This node appears in the AI Agent's tool panel. When connected to an AI Agent, the LLM can dynamically determine which resource and operation to invoke based on the user's natural language request. Parameters may be:

- Explicitly configured by the workflow author with static values.
- Populated by `$fromAI(key, description?, type?, defaultValue?)` expressions, which instruct the AI model to determine the value from context, other tools, or by asking the user.
- Left empty for the LLM to fill in — the tool field's "stars" button enables automatic AI population.

The `dynamicParameters` handling means the executor must accept that certain parameters may arrive as `$fromAI()` expression strings that resolve at execution time rather than at design time.

## Runtime behavior

### Input

Each incoming item is processed independently. Items from the execution context flow through as-is.

### Output

For **getAll** operations: each result item is emitted as a separate output item. The lemlist API response body is placed under the `json` property.

For **single-object** operations (create, get, delete, unsubscribe, add, enrich): the response object is placed under the `json` property of the output item. Binary and pairedItem data from the input are passed through.

For **Team → Get Credits**: the credits balance object from the API is placed under `json`.

### Errors

- A `NodeOperationError` is thrown when the lemlist API responds with a non-2xx status.
- When `continueOnFail` is enabled, execution proceeds to the next connected node.
- Validation errors (missing required fields like `email` or `campaignId`) are surfaced as `NodeOperationError`.

### Expressions

All parameter values accept expression strings. The resource and operation selectors are marked `noDataExpression: true` (dropdown-selected at design time). When used as an AI agent tool, the AI model may override or populate these via the `$fromAI()` mechanism.

## Acceptance tests

### Test: Create a lead via AI tool

**Given** an AI Agent workflow where the LLM decides to create a lead:

```json
[{ "json": { "email": "prospect@example.com" } }]
```

**Parameters** (as resolved by the AI at runtime):
```json
{
  "resource": "lead",
  "operation": "create",
  "campaignId": "={{ $fromAI('campaignId', 'The campaign to add the lead to', 'string') }}",
  "email": "={{ $fromAI('email') }}",
  "additionalFields": { "firstName": "={{ $fromAI('firstName') }}", "lastName": "={{ $fromAI('lastName') }}" }
}
```

**Expect** output[0][0].json to contain the created lead object with an `_id` field.

### Test: Look up campaign stats

**Given** input items:
```json
[{ "json": { "campaignId": "camp_xyz" } }]
```

**Parameters:**
```json
{
  "resource": "campaign",
  "operation": "getStats",
  "campaignId": "={{ $json.campaignId }}"
}
```

**Expect** output[0][0].json to contain campaign statistics including metrics like sent, opened, clicked, and replied counts.

### Test: Enrich a lead

**Given** a lead ID or person data:
```json
[{ "json": { "leadId": "lead_123" } }]
```

**Parameters:**
```json
{
  "resource": "enrichment",
  "operation": "enrichLead",
  "leadId": "={{ $json.leadId }}",
  "findEmail": true,
  "findPhone": true
}
```

**Expect** output[0][0].json to contain an enrichment result with phone and email data (if found).

### Test: Error on missing campaignId for lead create

**Given** no campaignId available:
```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "lead",
  "operation": "create",
  "campaignId": "",
  "email": "={{ $json.email }}"
}
```

**Expect** the node to throw `NodeOperationError` with a message indicating `campaignId` is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented (public n8n docs) | High confidence — shared with base Lemlist node |
| `$fromAI()` support | Documented (public n8n tool docs) | High confidence — standard for all Tool variant nodes |
| Parameter shapes | Inferred (base node schema) | Deferred to base Lemlist spec; parameters are identical |
| Credential type | Documented (public n8n docs) | High confidence — uses `lemlistApi` with API key |
| Response shapes | Inferred | Follow lemlist API contracts at https://developer.lemlist.com/ |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.lemlistTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

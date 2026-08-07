---
type: n8n-nodes-base.mauticTool
displayName: Mautic Tool
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Mautic Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mautic/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mautic/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work/ | Public docs only |
| https://devdocs.mautic.org/en/5.x/rest_api/contacts.html | Third-party service API docs |
| https://devdocs.mautic.org/en/5.x/rest_api/companies.html | Third-party service API docs |
| https://devdocs.mautic.org/en/5.x/rest_api/campaigns.html | Third-party service API docs |
| https://devdocs.mautic.org/en/5.x/rest_api/segments.html | Third-party service API docs |
| https://devdocs.mautic.org/en/5.x/rest_api/emails.html | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.mauticTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mauticApi` (Basic auth with URL + username + password) or `mauticOAuth2Api` (OAuth2 with URL + client ID + client secret). The Mautic instance must have the API enabled in Configuration > API Settings.

## Parameters

The MauticTool is an AI agent tool variant of the base Mautic app node. It wraps the same 6 resources with their operations against the Mautic REST API (`/api/`). The key distinction is that any parameter can be populated dynamically by the AI model via `$fromAI()` expressions rather than requiring explicit user configuration.

### Resource: Campaign Contact

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Add | `campaignId`, `contactId` | Add a contact to a Mautic campaign. |
| Remove | `campaignId`, `contactId` | Remove a contact from a Mautic campaign. |

### Resource: Company

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Create | `companyName`, `companyEmail`, `companyCity`, `companyAddress1`, `companyAddress2`, `companyPhone`, additional fields via `additionalFields` | Create a new company. |
| Delete | `companyId` | Delete a company by ID. |
| Get | `companyId` | Retrieve a single company by ID. |
| Get All | `search`, `orderBy`, `orderByDir`, `publishedOnly` (boolean) | Paginated list of companies. |
| Update | `companyId`, fields to update via `updateFields` | Update an existing company. |

### Resource: Company Contact

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Add | `companyId`, `contactId` | Associate a contact with a company. |
| Remove | `companyId`, `contactId` | Remove a contact from a company. |

### Resource: Contact

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Create | `firstname`, `lastname`, `email`, `ipAddress`, `owner`, `tags`, additional fields via `additionalFields` | Create a new contact. |
| Delete | `contactId` | Delete a contact by ID. |
| Edit Points | `contactId`, `points` (positive or negative integer delta) | Adjust a contact's point total. |
| Manage DNC | `contactId`, `channel` (email, sms, etc.), `action` (add or remove) | Add or remove a contact from the do-not-contact list. |
| Get | `contactId` | Retrieve a single contact by ID. |
| Get All | `search`, `orderBy`, `orderByDir`, `publishedOnly` (boolean) | Paginated list of contacts. |
| Send Email | `contactId`, `emailId`, additional options via `options` | Send a Mautic email to a contact. |
| Update | `contactId`, fields to update via `updateFields` | Update an existing contact. |

### Resource: Contact Segment

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Add | `segmentId`, `contactId` | Add a contact to a segment (list). |
| Remove | `segmentId`, `contactId` | Remove a contact from a segment. |

### Resource: Segment Email

| Operation | Parameters | Effect |
|-----------|-----------|--------|
| Send | `emailId` | Send a segment email to all contacts in the associated segment. |

### AI tool behavior

This node appears in the AI Agent's tool panel. When connected to an AI Agent, the LLM can dynamically determine which resource and operation to invoke based on the user's natural language request. Parameters may be:

- Explicitly configured by the workflow author with static values.
- Populated by `$fromAI(key, description?, type?, defaultValue?)` expressions, which instruct the AI model to determine the value from context, other tools, or by asking the user.
- Left empty for the LLM to fill in — the tool field's auto-populate button enables automatic AI population.

The `dynamicParameters` handling means the executor must accept that certain parameters may arrive as `$fromAI()` expression strings that resolve at execution time rather than at design time.

## Runtime behavior

### Input

Each incoming item is processed independently. The node executes the configured Mautic action using the item's resolved expressions and the configured credential. When used as an AI agent tool, the LLM may supply resource, operation, and parameter values dynamically.

### Output

Return one OpenFlow item for each successfully processed input item. The `json` value contains the service response at the outcome level:

- **Create / update / get (single entity):** the full contact, company, campaign, or segment object returned by the Mautic API.
- **Get All / list:** the collection object containing `total` and the array or dictionary of entities.
- **Delete:** the deleted entity object returned by the Mautic API.
- **Add / remove contact (campaign, company, segment):** the success confirmation object (e.g. `{ "success": true }`).
- **Edit Points:** the success confirmation object.
- **Manage DNC:** the updated contact object or success confirmation.
- **Send Email (contact):** the success confirmation object.
- **Segment Email Send:** the result object containing `success`, `sentCount`, and `failedCount`.

Preserve item order for per-item execution. For list operations the single output item carries the full collection response; the node does not split a collection into individual items.

### Errors

Authentication failures, invalid configuration, rejected requests, missing resources, rate limits, and service errors fail the item or node with an actionable error. Do not convert an HTTP/API error into an empty successful result. If `continueOnFail` is enabled per the OpenFlow SDK contract, return an item-level error representation; otherwise propagate the error and stop normal execution.

### Expressions

All parameter values accept expression strings. The resource and operation selectors are marked `noDataExpression: true` (dropdown-selected at design time). When used as an AI agent tool, the AI model may override or populate these via the `$fromAI()` mechanism.

## Acceptance tests

### Test: Create a contact via AI tool

**Given** an AI Agent workflow where the LLM decides to create a contact:

```json
[{ "json": { "email": "test@example.com", "firstName": "Jane", "lastName": "Doe" } }]
```

**Parameters** (as resolved by the AI at runtime):
```json
{
  "resource": "contact",
  "operation": "create",
  "email": "={{ $fromAI('email', 'Contact email address', 'string') }}",
  "additionalFields": {
    "firstname": "={{ $fromAI('firstName') }}",
    "lastname": "={{ $fromAI('lastName') }}"
  }
}
```

**Expect:** output[0][0].json to contain the created contact object with an `id` and contact fields.

### Test: Add contact to a campaign via AI tool

**Given** input items:
```json
[{ "json": { "contactId": "123", "campaignId": "456" } }]
```

**Parameters:**
```json
{
  "resource": "campaignContact",
  "operation": "add",
  "campaignId": "={{ $json.campaignId }}",
  "contactId": "={{ $json.contactId }}"
}
```

**Expect:** output[0][0].json to contain `{ "success": true }`.

### Test: List contacts with search filter

**Given** input items:
```json
[{ "json": { "search": "jane@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "getAll",
  "search": "={{ $json.search }}"
}
```

**Expect:** output[0][0].json to contain a `total` field and a `contacts` object with matching contacts.

### Test: Error on missing required parameter

**Given** no contactId available:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": ""
}
```

**Expect:** the node to throw `NodeOperationError` indicating `contactId` is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | Shared with base Mautic node from public n8n docs |
| `$fromAI()` support | documented | Standard for all Tool variant nodes (public n8n tool docs) |
| Parameter shapes | inferred (base node schema) | Deferred to base Mautic spec; parameters are identical to the app node |
| Credential types | documented | `mauticApi` (Basic auth) or `mauticOAuth2Api` (OAuth2) |
| Response shapes | documented | Mautic REST API developer docs define response schemas |
| Exact UI parameter nesting | not specified | Intentionally abstracted; resembles the base Mautic node parameter structure |

Confidence is high — this is a standard AI tool variant of the base Mautic node, sharing the same resources, operations, external API contract, and credentials. The only addition is `$fromAI()` support for dynamic parameter population by AI agents.

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mauticTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

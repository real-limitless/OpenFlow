---
type: n8n-nodes-base.zohoCrmTool
displayName: Zoho CRM Tool
category: Communication, Sales
versions: [1]
priority: medium
status: specced
---

# Zoho CRM Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zohocrm/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zoho/ | Public docs only |
| https://www.zoho.com/crm/developer/docs/api/v3/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.zohoCrmTool` (alias of `n8n-nodes-base.zohoCrm`)
- **Aliases:** `n8n-nodes-base.zohoCrm`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `zohoOAuth2Api` (OAuth2 with region-specific access token URL — AU, CN, EU, IN, US)

## Parameters

This is an **AI agent tool variant** of the Zoho CRM node. It exposes the same resource/operation matrix as the base Zoho CRM node, with the addition of `$fromAI()` support for dynamic parameter population by the AI agent.

### Resource & Operation

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | enum | `lead` | yes | — | One of: `account`, `contact`, `deal`, `invoice`, `lead`, `product`, `purchaseOrder`, `quote`, `salesOrder`, `vendor` |
| operation | enum | — | yes | depends on resource | Per resource: `create`, `get`, `getAll`, `update`, `delete`, `upsert`. `lead` additionally supports `getFields`. |

### Common CRUD parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| {resource}Id | string | — | yes | create/update/get/delete | Zoho CRM record ID. Dynamically named per resource (e.g. `contactId`, `dealId`). |
| returnAll | boolean | false | — | getAll | Return all matching records vs. paginated result |
| limit | number | — | — | getAll, returnAll=false | Max items per page |
| additionalFields | collection | `{}` | — | create/update/upsert | Object of field-name/value pairs determined by the resource's Zoho CRM layout |
| filters | collection | `{}` | — | getAll | Filter options: `fields` (select list), `sortBy` (field name), `sortOrder` (asc/desc) |

All parameters support `$fromAI()` expression syntax, allowing the AI agent to supply values dynamically at runtime.

## Runtime behavior

### Input

Inbound items are passed through unchanged. The AI agent provides parameters dynamically via `$fromAI()` expressions.

### Output

Each operation produces output items derived from the Zoho CRM REST API v3 response:

- **create/upsert:** Returns the created record object with `id`, `Created_By`, `Created_Time`, `Modified_By`, `Modified_Time`.
- **get:** Returns a single record object with all module fields and system metadata.
- **getAll:** Returns one output item per record. Supports pagination via `returnAll`/`limit`.
- **update:** Returns the updated record object (same shape as get).
- **delete:** Returns a success confirmation object.
- **getFields (lead):** Returns an array of field descriptor objects with `field_label`, `api_name`, `custom_field`, and `pick_list_values`.

### Errors

Zoho CRM API errors (4xx/5xx) are surfaced as node errors. OAuth2 token expiry triggers automatic credential refresh. `continueOnFail` is supported.

### Expressions

All parameters accept expressions. The `$fromAI()` function is available to let the AI agent populate parameters based on natural-language reasoning.

## Acceptance tests

### Test: AI agent creates a lead

**Given** input items:

```json
[{ "json": { "company": "Acme Inc", "lastName": "Smith" } }]
```

**Parameters:**

```json
{
  "resource": "lead",
  "operation": "create",
  "additionalFields": "={{ $fromAI() }}"
}
```

**Expect** output[0] to contain a JSON object with `id` (string), `Created_Time` (ISO date), and the fields that the AI agent supplied.

### Test: AI agent retrieves a contact by ID

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "={{ $fromAI() }}"
}
```

**Expect** output[0] to contain a single contact object with `id` and module fields.

### Test: AI agent lists deals with pagination

**Parameters:**

```json
{
  "resource": "deal",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output array to contain at most 5 deal objects, each with `id`, `Deal_Name`, `Amount`, `Stage`.

### Test: AI agent updates an account

**Parameters:**

```json
{
  "resource": "account",
  "operation": "update",
  "accountId": "={{ $fromAI() }}",
  "additionalFields": "={{ $fromAI() }}"
}
```

**Expect** output[0] to contain an updated account object with `id` and modified fields.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Base node behavior | Documented | Public n8n docs cover the Zoho CRM node fully |
| Tool variant existence | Inferred | No dedicated docs page exists; tool variant pattern is standard across n8n |
| $fromAI() support | Inferred | Standard for all n8n Tool variants; confirmed by sibling tool specs |
| Credential shape | Documented | Zoho OAuth2 with region selection from public n8n credentials docs |
| Zoho CRM API contract | Documented | Zoho CRM v3 API docs define request/response shapes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.zohoCrmTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

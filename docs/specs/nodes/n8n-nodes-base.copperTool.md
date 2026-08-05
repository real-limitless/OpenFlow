---
type: n8n-nodes-base.copperTool
displayName: Copper (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Copper (AI Tool)

A tool variant of the Copper CRM node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function. Supports Company, Customer Source, Lead, Opportunity, Person, Project, Task, and User resources against the Copper CRM REST API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.copper/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/copper/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://developer.copper.com/ | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.copperTool`
- **Aliases:** `Copper`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `copperApi` (API key + email address)

## Parameters

### Resource selection

The user selects one of eight resources (Company, Customer Source, Lead, Opportunity, Person, Project, Task, User) which determines the available operations. Parameter shapes mirror the full Copper node, with additional AI-support metadata via `$fromAI()`.

### Company resource

| Operation | Key parameters |
|-----------|----------------|
| Create | Name (required), Additional fields: address (street/city/state/postal_code/country), details, email_domain, phone_numbers (multiple: number + category) |
| Delete | Company ID |
| Get | Company ID |
| Get All | Return all, Limit, Filters: country, name |
| Update | Company ID, Update fields: address, details, name, phone_numbers |

### Customer Source resource

| Operation | Key parameters |
|-----------|----------------|
| Get All | Return all, Limit |

### Lead resource

| Operation | Key parameters |
|-----------|----------------|
| Create | Name (required), Additional fields: address, email (email + category), phone_numbers |
| Delete | Lead ID |
| Get | Lead ID |
| Get All | Return all, Limit, Filters: country, name |
| Update | Lead ID, Update fields: address, details, email, name, phone_numbers |

### Opportunity resource

| Operation | Key parameters |
|-----------|----------------|
| Create | Name (required), Customer Source ID, Primary Contact ID |
| Delete | Opportunity ID |
| Get | Opportunity ID |
| Get All | Return all, Limit, Filters: company_ids, customer_source_ids |
| Update | Opportunity ID, Update fields: customer_source_id, name, primary_contact_id |

### Person resource

| Operation | Key parameters |
|-----------|----------------|
| Create | Name (required), Additional fields: address, details, email_domain, emails (multiple), phone_numbers |
| Delete | Person ID |
| Get | Person ID |
| Get All | Return all, Limit, Filters: name |
| Update | Person ID, Update fields: address, details, email_domain, emails, name, phone_numbers |

### Project resource

| Operation | Key parameters |
|-----------|----------------|
| Create | Name (required), Additional fields: assignee_id, details, status (Open/Completed) |
| Delete | Project ID |
| Get | Project ID |
| Get All | Return all, Limit, Filters: name |
| Update | Project ID, Update fields: assignee_id, details, name, status |

### Task resource

| Operation | Key parameters |
|-----------|----------------|
| Create | Name (required), Additional fields: assignee_id, details, priority (High/None), status (Open/Completed) |
| Delete | Task ID |
| Get | Task ID |
| Get All | Return all, Limit, Filters: assignee_ids, project_ids |
| Update | Task ID, Update fields: assignee_id, details, name, priority, status |

### User resource

| Operation | Key parameters |
|-----------|----------------|
| Get All | Return all, Limit |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name and description metadata are configurable in the AI Agent node
- `filterFields` and `additionalFields`/`updateFields` collection structures are flattened for AI consumption

## Runtime behavior

### Input

Consumes items from `main` input. Parameters may reference item data through expressions.

### Output

**Output[0]** — operation result, one item per input item:

- **Create:** the created entity object including its `id` and all assigned fields
- **Get:** the full entity object matching the requested ID
- **Get All:** an array of entity objects, paginated by `returnAll`/`limit`
- **Update:** the updated entity object
- **Delete:** confirmation of deletion (HTTP 204)
- **Customer Source / User:** list results only (read-only resources)

### Errors

- Copper API errors (auth, permissions, not-found, rate limits) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Missing required parameters (e.g. entity ID for get/delete, name for create) throw before API calls
- The Copper API returns structured errors that should be surfaced to the workflow

### Expressions

All string/number/boolean/enum parameters accept n8n expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions. Resource/operation selectors are typically static.

## Acceptance tests

### Test: Create a lead

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "lead",
  "operation": "create",
  "name": "Test Lead"
}
```

**Expect** output[0].json to contain an `id` field and `name` equal to `"Test Lead"`.

### Test: Get a company by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "company",
  "operation": "get",
  "companyId": "12345"
}
```

**Expect** output[0].json to contain `id` equal to `"12345"`.

### Test: List all tasks with filtering

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "task",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "filterFields": {
    "assignee_ids": "user_1"
  }
}
```

**Expect** output[0].json to contain an array of up to 10 task objects, each with `id` and `name`.

### Test: Update a person

**Given** input items:
```json
[{ "json": { "personId": "p_1" } }]
```

**Parameters:**
```json
{
  "resource": "person",
  "operation": "update",
  "personId": "={{ $json.personId }}",
  "updateFields": {
    "details": "Updated description"
  }
}
```

**Expect** output[0].json to contain `id` matching the input person ID and `details` set to `"Updated description"`.

### Test: Delete an opportunity

**Given** input items:
```json
[{ "json": { "opportunityId": "opp_1" } }]
```

**Parameters:**
```json
{
  "resource": "opportunity",
  "operation": "delete",
  "opportunityId": "={{ $json.opportunityId }}"
}
```

**Expect** output[0] to be empty or contain a confirmation response (HTTP 204 semantics).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Copper resources and operations | documented | Public docs list all 8 resources and their operations |
| Credential type | documented | `copperApi` with API Key + Email from public docs |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |
| Detailed field shapes (address, email, phone) | confirmed from corpus | Nested `fixedCollection` structures for contact data |
| Filter field options per resource | confirmed from corpus | Each resource has specific filter fields for getAll |
| Exact Copper API output shape | inferred | Copper REST API responses vary; only functional outcomes are spec'd |
| Tool-specific parameter layout | inferred | The tool variant wraps the standard Copper operations identically in agent context |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.copperTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

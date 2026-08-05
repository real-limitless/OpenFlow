---
type: n8n-nodes-base.copper
displayName: Copper
category: Sales
versions: [1]
priority: medium
status: specced
---

# Copper

CRM action node for Copper (prospersworks.com). Wraps the Copper Developer REST API (`https://api.copper.com/developer_api/`) to provide CRUD operations on 8 CRM entity types plus a Customer Source lookup.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.copper/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/copper.md | Public docs only |
| https://developer.copper.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.copper`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `copperApi` (API key + email)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | enum | Company | true | — | Target Copper entity: Company, Customer Source, Lead, Opportunity, Person, Project, Task, User |
| operation | enum | Create | true | — | Varies by resource: Create, Delete, Get, Get All, Update (Customer Source / User: Get All only) |
| companyId | string | — | conditional | resource=Company, operation∈{Delete,Get,Update} | Unique identifier of the company record |
| customerSourceId | string | — | conditional | resource=CustomerSource, operation=Get All | (none — no parameters needed for list) |
| leadId | string | — | conditional | resource=Lead, operation∈{Delete,Get,Update} | Unique identifier of the lead record |
| opportunityId | string | — | conditional | resource=Opportunity, operation∈{Delete,Get,Update} | Unique identifier of the opportunity record |
| personId | string | — | conditional | resource=Person, operation∈{Delete,Get,Update} | Unique identifier of the person record |
| projectId | string | — | conditional | resource=Project, operation∈{Delete,Get,Update} | Unique identifier of the project record |
| taskId | string | — | conditional | resource=Task, operation∈{Delete,Get,Update} | Unique identifier of the task record |
| additionalFields | object | {} | false | operation∈{Create,Update} | Entity-specific fields (name, email, phone_numbers, assignee_id, etc.) |
| returnAll | boolean | false | false | operation=Get All | If true, return all matching records (paginate internally) |
| limit | number | 50 | false | operation=Get All | Max records per page when returnAll is false |
| options | object | {} | false | operation=Get All | Search/filter options per entity (sort, filters, etc.) |

### Additional fields by resource (Create/Update)

The `additionalFields` parameter accepts a structured object whose available keys depend on the selected `resource`. Every entity supports custom fields through an array of `{ custom_field_definition_id, value }` objects.

#### Company
- `name` (string) — Company name, required on Create
- `address` (object) — `{ street, city, state, postal_code, country }`
- `assignee_id` (number) — Owner user ID
- `description` (string)
- `details` (string)
- `email` (object) — `{ email, category }`
- `phone_numbers` (array of `{ number, category }`)
- `tags` (string[])
- `websites` (array of `{ url, category }`)
- `custom_fields` (array of `{ custom_field_definition_id, value }`)

#### Lead
- `name` (string) — First and last name, required on Create
- `address` (object)
- `assignee_id` (number)
- `company_name` (string)
- `customer_source_id` (number)
- `details` (string)
- `email` (object)
- `monetary_value` (number)
- `phone_numbers` (array)
- `socials` (array of `{ url, category }`)
- `status` (enum: New, Unqualified, Contacted, Qualified)
- `tags` (string[])
- `title` (string)
- `websites` (array)
- `custom_fields` (array)

#### Opportunity
- `name` (string) — Required on Create
- `assignee_id` (number)
- `company_id` (number) — Link to existing company
- `company_name` (string)
- `customer_source_id` (number)
- `details` (string)
- `loss_reason_id` (number)
- `monetary_value` (number)
- `monetary_value_confidence_score` (number)
- `pipeline_id` (number) — Required on Create
- `pipeline_stage_id` (number) — Required on Create
- `primary_contact_id` (number)
- `priority` (string: None, Low, High)
- `status` (string: Open, Won, Lost, Abandoned)
- `tags` (string[])
- `custom_fields` (array)

#### Person
- `name` (string) — Required on Create
- `address` (object)
- `assignee_id` (number)
- `company_id` (number)
- `company_name` (string)
- `details` (string)
- `email` (object)
- `phone_numbers` (array)
- `socials` (array)
- `tags` (string[])
- `title` (string)
- `websites` (array)
- `custom_fields` (array)

#### Project
- `name` (string) — Required on Create
- `assignee_id` (number)
- `details` (string)
- `status` (string: Open, Completed)
- `tags` (string[])
- `custom_fields` (array)

#### Task
- `name` (string) — Required on Create
- `assignee_id` (number)
- `details` (string)
- `due_date` (number) — Unix timestamp
- `priority` (enum: None, Low, Medium, High)
- `status` (enum: Open, Completed)
- `tags` (string[])
- `custom_fields` (array)

### Options (Get All / Search)
- `sort_by` (string) — Field name to sort by
- `sort_direction` (enum: asc, desc)
- `page_number` (number) — Manual page offset
- `page_size` (number) — Records per search page (max 200)
- `filter` — Search criteria as per Copper Search API (see Copper Developer API Search docs)

## Runtime behavior

### Input

Passes input items through unchanged. Each input item may supply expression-bound values for parameters (entity ID, additional field values, etc.). When no item-level data is needed (e.g., Get All with static filter), a single empty item suffices.

### Output

Each output item contains a `json` property with the Copper API response body:

- **Create / Update / Get:** The full entity object returned by Copper (single object).
- **Get All:** An array of entity objects under `json` (one output item per result, or all results in a single item depending on batching).
- **Delete:** The deleted entity object as returned by Copper.
- **Customer Source / User (Get All):** An array of customer source or user objects.

The output shape follows the Copper API's JSON schema for each entity type (see Copper Developer API docs for field definitions).

### Errors

- HTTP 4xx/5xx from the Copper API cause the node to throw, halting execution unless `continueOnFail` is enabled.
- If `continueOnFail` is true, the node produces an output item with `json: { error: { message, statusCode } }` and `pairedItem` referencing the input.

### Expressions

All parameter values accept expressions (`=...`). The `additionalFields` object's sub-values also accept expressions.

## Acceptance tests

### Test: Create a lead

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Lead",
  "operation": "Create",
  "additionalFields": {
    "name": "Jane Doe",
    "email": { "email": "jane@example.com", "category": "work" },
    "customer_source_id": 1,
    "status": "Contacted",
    "tags": ["webinar", "trial"]
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 12345,
    "name": "Jane Doe",
    "email": { "email": "jane@example.com", "category": "work" },
    "customer_source_id": 1,
    "status": "Contacted",
    "tags": ["webinar", "trial"],
    "date_created": 1680000000,
    "date_modified": 1680000000
  }
}]
```
Fields `id`, `date_created`, `date_modified` are server-assigned and may differ; the assertion checks structure and echoed input fields.

### Test: Get a company by ID

**Given** input items:
```json
[{ "json": { "companyId": 42 } }]
```

**Parameters:**
```json
{
  "resource": "Company",
  "operation": "Get",
  "companyId": "={{ $json.companyId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 42,
    "name": "Acme Corp",
    "assignee_id": 1,
    "date_created": 1679000000,
    "date_modified": 1679000000
  }
}]
```
The ID must match the requested `companyId`. Other fields reflect the Copper company object shape.

### Test: List all customer sources

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Customer Source",
  "operation": "Get All"
}
```

**Expect** output[0]:
```json
[{
  "json": [
    { "id": 1, "name": "Phone Inquiry" },
    { "id": 2, "name": "Website" },
    { "id": 3, "name": "Email" }
  ]
}]
```
The result is an array of `{ id, name }` objects from the Copper API.

### Test: Update an opportunity status

**Given** input items:
```json
[{ "json": { "oppId": 77 } }]
```

**Parameters:**
```json
{
  "resource": "Opportunity",
  "operation": "Update",
  "opportunityId": "={{ $json.oppId }}",
  "additionalFields": {
    "status": "Won",
    "monetary_value": 50000
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 77,
    "status": "Won",
    "monetary_value": 50000,
    "date_modified": 1680100000
  }
}]
```
The response entity's `id` must match the input. `status` and `monetary_value` must reflect the update.

### Test: Delete a task

**Given** input items:
```json
[{ "json": { "taskId": 99 } }]
```

**Parameters:**
```json
{
  "resource": "Task",
  "operation": "Delete",
  "taskId": "={{ $json.taskId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 99,
    "name": "Old Task"
  }
}]
```
The deleted entity is returned. Status code 200 (not 204) is expected.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented (n8n public docs) | 8 resources, all CRUD mapped |
| Copper API base URL | Documented (Copper Dev API) | `https://api.copper.com/developer_api/v1/` |
| Credential type | Documented (n8n public docs) | API key + email; requires Professional or Business plan |
| Additional field shapes | Inferred (Copper Dev API entity schemas + corpus node.json) | Each entity type has documented properties; Create requires entity-specific mandatory fields (name for most, pipeline+stage for opportunity) |
| Search/filter semantics | Documented (Copper Dev API Search) | Uses Copper's POST-based search endpoint with page/filter/sort |
| Customer Source lookup | Documented (Copper Dev API) | Read-only list of lead/opportunity source categories |
| Pagination details | Inferred | `page_size` aligns with Copper API max 200 |
| `continueOnFail` behavior | Standard n8n pattern | Inferred from general n8n conventions |

## OpenFlow mapping

- **Definition group:** `core` (app node)
- **Executor file:** `src/lib/engine/executors/copper.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

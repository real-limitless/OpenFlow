---
type: n8n-nodes-base.salesmateTool
displayName: Salesmate Tool
category: Action
versions: [1]
priority: medium
status: specced
---

# Salesmate Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.salesmate.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/salesmate.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.salesmateTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `salesmateApi` (session token + URL)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `activity`, `company`, `deal` | `deal` | Y | | Which Salesmate entity to operate on |
| operation | depends on resource | `create` | Y | | Operation to perform on the selected resource |
| title / name | string | — | Y | create operations | Activity title (activity/deal) or company name |
| owner | options (loaded) | — | N | create, update | Owner by dynamic user list |
| type | string | — | Y | activity:create | Activity type (call, meeting, etc.) |
| rawData | boolean | false | N | get, create, update | Include fields details in response |
| activityId / companyId / dealId | string | — | Y | get, delete, update | Entity ID to operate on |
| returnAll | boolean | false | N | getAll | Return all results or up to a limit |
| limit | number | 10 | N | getAll, returnAll=false | Max results (1-25) |
| jsonParameters | boolean | false | N | getAll | Use raw JSON for filters |
| filters | collection/json | — | N | getAll | Query filters |
| options | collection | — | N | getAll | Fields, sortBy, sortOrder |
| additionalFields | collection | — | N | create | Extra optional entity fields |
| updateFields | collection | — | N | update | Fields to update |

### Resource/operation matrix

| resource | operation | Salesmate API endpoint | Notes |
|----------|-----------|------------------------|-------|
| `activity` | `create` | POST /v1/activity/add | Title + type required |
| `activity` | `delete` | DELETE /v1/activity/{id} | |
| `activity` | `get` | GET /v1/activity/{id} | |
| `activity` | `getAll` | GET /v1/activity/search | Paginated search |
| `activity` | `update` | PUT /v1/activity/{id} | |
| `company` | `create` | POST /v1/company/add | Name required |
| `company` | `delete` | DELETE /v1/company/{id} | |
| `company` | `get` | GET /v1/company/{id} | |
| `company` | `getAll` | GET /v1/company/search | Paginated search |
| `company` | `update` | PUT /v1/company/{id} | |
| `deal` | `create` | POST /v1/deal/add | Title required |
| `deal` | `delete` | DELETE /v1/deal/{id} | |
| `deal` | `get` | GET /v1/deal/{id} | |
| `deal` | `getAll` | GET /v1/deal/search | Paginated search |
| `deal` | `update` | PUT /v1/deal/{id} | |

### Create additional fields

| Field group | Fields |
|-------------|--------|
| activity | description, tags, dueDate, duration, isCalendarInvite, isCompleted |
| company | website, owner, phone, mobile, email, industry, companyType, facebook, linkedin, skype, twitter, billingAddress (collection), shippingAddress (collection), description, tags, currency, currencySymbol, rating |
| deal | owner, primaryContact (loaded), pipeline (loaded), stage (loaded), dealValue, currency, currencySymbol, expectedCloseDate, priority, tags, description, contactIds, companyIds, products, activities, customFields |

### Update fields

Share the same field collections as create, minus required-only constraints.

### getAll options

- **fields:** Comma-separated list of fields to return
- **sortBy:** Field name to sort by
- **sortOrder:** Ascending or descending

## Runtime behavior

### Input

Each incoming item may supply expression-based parameter values. AI Agent mode populates parameters via `$fromAI()`.

### Output

Per input item, one output item is produced containing the Salesmate API response as `json`. The response shape varies by resource but typically returns the created/updated/retrieved entity object with an id and resource-specific fields. For `getAll`, an array of entity objects is returned.

### Errors

- 400: Invalid parameters — thrown with NodeApiError
- 401: Unauthorized — invalid or expired session token
- 404: Resource not found — thrown
- 429: Rate limit — thrown
- `continueOnFail`: If true, empty output is emitted for failed items instead of aborting

### Expressions

All string, number, and array parameters accept expression strings. The `$fromAI()` function is supported on all parameters when used as an AI agent tool.

## Acceptance tests

### Test: create a deal

**Given** input items:
```json
[{ "json": { "title": "New Enterprise Deal" } }]
```

**Parameters:**
```json
{ "resource": "deal", "operation": "create", "title": "={{$json.title}}", "owner": "usr_123" }
```

**Expect** output[0]:
```json
[{ "json": { "id": "deal_456", "title": "New Enterprise Deal", "owner": "usr_123", "dealValue": null, "expectedCloseDate": null, "createdAt": "2024-01-15T10:30:00.000Z" } }]
```

### Test: get a company by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "company", "operation": "get", "companyId": "comp_789", "rawData": false }
```

**Expect** output[0]:
```json
[{ "json": { "id": "comp_789", "name": "Acme Corp", "website": "acme.com", "email": "info@acme.com", "phone": "+1-555-1234", "owner": "usr_123", "createdAt": "2023-06-01T00:00:00.000Z" } }]
```

### Test: list activities with pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "activity", "operation": "getAll", "returnAll": false, "limit": 5, "options": { "sortBy": "createdAt", "sortOrder": "desc" } }
```

**Expect** output[0]:
```json
[{ "json": [{ "id": "act_1", "title": "Call with client", "type": "call", "createdAt": "2024-02-10T14:00:00.000Z" }, { "id": "act_2", "title": "Follow-up meeting", "type": "meeting", "createdAt": "2024-02-09T10:00:00.000Z" }] }]
```

### Test: update an activity

**Given** input items:
```json
[{ "json": { "newTitle": "Updated: Call with client" } }]
```

**Parameters:**
```json
{ "resource": "activity", "operation": "update", "activityId": "act_1", "updateFields": { "title": "={{$json.newTitle}}", "isCompleted": true } }
```

**Expect** output[0]:
```json
[{ "json": { "id": "act_1", "title": "Updated: Call with client", "type": "call", "isCompleted": true, "updatedAt": "2024-02-11T09:00:00.000Z" } }]
```

### Test: AI agent tool invocation via $fromAI

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "resource": "deal", "operation": "create", "title": "={{$fromAI('What is the deal title?')}}", "dealValue": "={{$fromAI('What is the deal value?')}}" }
```

**Expect** output[0]:
```json
[{ "json": { "id": "deal_999", "title": "Sample Deal", "dealValue": 50000, "createdAt": "2024-03-01T12:00:00.000Z" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation matrix | Documented | Public docs list Activity/Company/Deal resources with create/delete/get/getAll/update |
| Credential type | Documented | salesmateApi with session token + URL |
| Tool variant existence | Inferred | No dedicated docs page; follows pattern of other Tool nodes sharing the base node behavior |
| Exact API endpoints | Inferred | Constructed from common Salesmate API patterns; exact paths may differ |
| Dynamic loading | Inferred | Owner, contacts, pipelines, stages, products loaded via loadOptions methods |
| Field-level details | Inferred from corpus | Specific entity field names for create/update per resource |
| $fromAI support | Documented | Standard Tool pattern per n8n AI docs |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/salesmateTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

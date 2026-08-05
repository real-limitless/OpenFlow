---
type: n8n-nodes-base.agileCrm
displayName: Agile CRM
category: Marketing & Sales
versions: [1]
priority: medium
status: missing
---

# Agile CRM

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.agilecrm/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/agilecrm/ | Public docs only |
| https://www.agilecrm.com/api | Public docs (external API) |

## Wire format

- **Type string:** `n8n-nodes-base.agileCrm`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `agileCrmApi` — API key authentication with Email Address, REST API Key, and Subdomain

## Parameters

### Resource & Operation selector

Every execution begins by choosing a **Resource** and an **Operation**:

| Resource | Operations |
|----------|-----------|
| Company | Create, Delete, Get, Get All, Update |
| Contact | Create, Delete, Get, Get All, Update |
| Deal | Create, Delete, Get, Get All, Update |

### Company

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| Resource | fixed: Company | always | |
| Operation | enum: Create / Delete / Get / Get All / Update | always | |
| Company ID | string | for Delete/Get/Update | identifier of the company to target |
| Return All | boolean | for Get All | when true, paginate through all results |
| Limit | number | for Get All | max items per page when Return All is false |
| JSON Parameters | multi-field | for Create/Update | key-value pairs defining company properties (e.g. name, url, email, address, custom fields) |

### Contact

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| Resource | fixed: Contact | always | |
| Operation | enum: Create / Delete / Get / Get All / Update | always | |
| Contact ID | string | for Delete/Get/Update | identifier of the contact to target |
| Return All | boolean | for Get All | when true, paginate through all results |
| Limit | number | for Get All | max items per page when Return All is false |
| JSON Parameters | multi-field | for Create/Update | key-value pairs defining contact properties (e.g. first_name, last_name, email, phone, company, tags, lead_score, star_value, custom properties). Each property has a `type` (SYSTEM/JOURNAL/CUSTOM/FIELD/ADDRESS/TAG), `name`, and `value` (plus optional `subtype`) |

### Deal

| Parameter | type | required | notes |
|-----------|------|----------|-------|
| Resource | fixed: Deal | always | |
| Operation | enum: Create / Delete / Get / Get All / Update | always | |
| Deal ID | string | for Delete/Get/Update | identifier of the deal to target |
| Return All | boolean | for Get All | when true, paginate through all results |
| Limit | number | for Get All | max items per page when Return All is false |
| Expected Value | number | for Create/Update | monetary value of the deal |
| Probability | number | for Create/Update | win probability percentage |
| Name | string | for Create/Update | deal name |
| Close Date | date string (UNIX ms) | for Create/Update | expected close date |
| Milestone | string | for Create/Update | deal stage / pipeline milestone |
| Contact IDs | string[] | for Create/Update | linked contact identifiers |
| Custom Properties | array of {name, value} | optional | deal-specific custom fields |

## Runtime behavior

### Input

Each input item is processed independently. Parameters may be set as static values or expressions referencing the input item's JSON.

### Output

- **Create / Update / Get:** emits one item per processed entity, with the full entity object returned by the Agile CRM API under `json`.
- **Get All:** emits one item per entity returned (or a single wrapping item depending on the Return All setting).
- **Delete:** emits the input item unchanged on success (no response body expected from API).
- On **Get All** with `Return All = false`, output respects the `Limit` parameter; with `Return All = true`, the executor pages through all available results.

### Errors

- Non-2xx responses from the Agile CRM API should throw a `NodeApiError` with the status code and error message from the API response body.
- When `continueOnFail` is enabled, the node emits the original input item annotated with an error property instead of halting execution.
- Invalid or missing required parameters (e.g. missing Contact ID on Get) should throw a validation error before any API call.

### Expressions

- All free-form string, number, and boolean parameters accept expression strings (e.g. `{{ $json.someField }}`).
- The Resouce and Operation selectors are static (cannot be expressions).

## Acceptance tests

### Test: contact create

**Given** input items:

```json
[{ "json": { "firstName": "Alice", "lastName": "Smith", "email": "alice@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "contactJsonParameters": [
    { "fieldName": "first_name", "fieldValue": "{{ $json.firstName }}" },
    { "fieldName": "last_name", "fieldValue": "{{ $json.lastName }}" },
    { "fieldName": "email", "fieldValue": "{{ $json.email }}" }
  ]
}
```

**Expect** output[0]:
- `json` contains a contact object with an `id` field and properties matching the input
- Status indicates success (2xx from Agile CRM API)

### Test: deal create with custom properties

**Given** input items:

```json
[{ "json": { "dealName": "Big Deal", "value": 50000 } }]
```

**Parameters:**

```json
{
  "resource": "deal",
  "operation": "create",
  "name": "{{ $json.dealName }}",
  "expectedValue": "{{ $json.value }}",
  "probability": 80,
  "milestone": "Proposal"
}
```

**Expect** output[0]:
- `json` contains a deal object with `id`, `name` = "Big Deal", `expected_value` = 50000

### Test: get all companies (paged)

**Parameters:**

```json
{
  "resource": "company",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0]:
- `json` is the first page of companies from the Agile CRM API
- No more than 10 items are returned

### Test: delete contact

**Given** input items:

```json
[{ "json": { "contactId": 12345 } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "delete",
  "contactId": "{{ $json.contactId }}"
}
```

**Expect** output[0]:
- The input item passes through unchanged
- The API call succeeded (no error thrown)

### Test: not found returns error

**Parameters:**

```json
{
  "resource": "company",
  "operation": "get",
  "companyId": "99999999"
}
```

**Expect** execution throws a `NodeApiError` indicating HTTP 404 from the Agile CRM API.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource & operation set | documented | Confirmed in n8n public docs |
| Credential schema | documented | Email + API Key + Subdomain from public docs |
| Company/Contact/Deal property shapes | inferred from type descriptors + public docs | Property system (type/name/value/subtype) visible in interface files; exact UI for JSON Parameters is inferred |
| Deal milestone enum values | inferred | Milestone is a free-form string, values depend on the Agile CRM instance's pipeline configuration |
| Search/filter on Get All | inferred | Agile CRM API supports search; node may expose filter-by-query parameters not documented publicly |
| API base URL pattern | inferred | Subdomain from credentials + `https://<subdomain>.agilecrm.com/dev/api/` |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.agileCrm.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

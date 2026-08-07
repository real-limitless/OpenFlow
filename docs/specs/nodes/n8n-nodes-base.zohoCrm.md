---
type: n8n-nodes-base.zohoCrm
displayName: Zoho CRM
category: Communication, Sales
versions: [1]
priority: medium
status: specced
---

# Zoho CRM

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zohocrm/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/zoho/ | Public docs only |
| https://www.zoho.com/crm/developer/docs/api/v3/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.zohoCrm`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `zohoOAuth2Api` (OAuth2 with region-specific access token URL — AU, CN, EU, IN, US)

## Parameters

### Resource & Operation

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | enum | `lead` | yes | — | One of: `account`, `contact`, `deal`, `invoice`, `lead`, `product`, `purchaseOrder`, `quote`, `salesOrder`, `vendor` |
| operation | enum | — | yes | depends on resource | Per resource: `create`, `get`, `getAll`, `update`, `delete`, `upsert`. `lead` additionally supports `getFields`. |

All resources share the same set of operations except that `lead` adds `getFields`.

### Common CRUD parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| {resource}Id | string | — | yes | create/update/get/delete | The Zoho CRM record ID. Dynamically named per resource (e.g. `contactId`, `dealId`, `leadId`). |
| returnAll | boolean | false | — | getAll | Return all matching records vs. paginated result |
| limit | number | — | — | getAll, returnAll=false | Max items per page |
| additionalFields | collection | `{}` | — | create/update/upsert | Object of field-name/value pairs determined by the resource's Zoho CRM layout (loaded dynamically) |
| filters | collection | `{}` | — | getAll | Filter options: `fields` (select list), `sortBy` (field name), `sortOrder` (asc/desc) |

### Resource-specific additional fields

For create/update/upsert operations, each resource accepts:
- **Standard fields** matching the Zoho CRM module's layout (dynamically loaded at design time via `get{X}Fields`)
- **Custom fields** (loaded via `getCustom{X}Fields`) — represented as a configurable list of `fieldId` + `value` pairs
- **Address fields** for resources that support them (`Account`, `Contact`, `Deal`, etc.): sub-objects like `Billing_Address`, `Shipping_Address`, `Mailing_Address` containing street/city/state/zip/country
- **Product_Details** for transactional modules (Invoice, Purchase Order, Quote, Sales Order): array of `{ id: string, quantity: number }` entries
- **Related entity lookups** via `Account`, `Contact`, `Deal` subfields with `id` + `name`

### Picklist parameters

Picklist fields (e.g. `Account Type`, `Deal Stage`, `Purchase Order Status`, `Sales Order Status`, `Quote Stage`) are dynamically populated at design time from the Zoho CRM instance via loadOptions methods.

### Get Fields operation (Lead only)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| operation | fixed | `getFields` | yes | Only for lead resource |

Returns the Zoho CRM field metadata for the Lead module (field labels, API names, types, picklist values).

## Runtime behavior

### Input

Inbound items are passed through. Item-level data can be used in expressions for any parameter. Binary data is passed through unchanged.

### Output

Each operation produces output items containing the JSON response from the Zoho CRM REST API v3:

- **create/upsert:** Returns the created record object with `id`, `Created_By`, `Created_Time`, `Modified_By`, `Modified_Time` metadata fields.
- **get:** Returns a single record object with all module fields and system metadata.
- **getAll:** Returns one output item per record. Each item contains the full record object. Supports pagination via `returnAll`/`limit`.
- **update:** Returns the updated record object (same shape as get).
- **delete:** Returns a success confirmation object.
- **getFields (lead):** Returns an array of field descriptor objects with `field_label`, `api_name`, `custom_field`, and `pick_list_values`.

### Errors

Zoho CRM API errors (4xx/5xx) are surfaced as node errors. The `throwOnErrorStatus` utility inspects the Zoho response's `data[].status` field for non-success statuses. Authentication failures (invalid/expired OAuth2 token) trigger the OAuth2 credential refresh flow automatically. `continueOnFail` is supported for graceful error handling.

### Expressions

All string/number/boolean parameters accept expressions.

## Acceptance tests

### Test: create a lead

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "lead",
  "operation": "create",
  "additionalFields": {
    "Last_Name": "Doe",
    "Company": "Acme Corp"
  }
}
```

**Expect** output[0] to contain a JSON object with `id` (string), `Created_Time` (ISO date string), and the provided fields.

### Test: get a lead by ID

**Parameters:**

```json
{
  "resource": "lead",
  "operation": "get",
  "leadId": "{{ $json.id }}"
}
```

**Expect** output[0] to contain a single lead object with `id`, `Last_Name`, `Company`, and system metadata fields (`Created_Time`, `Modified_Time`, `Owner`).

### Test: upsert a contact

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "upsert",
  "additionalFields": {
    "Last_Name": "Smith",
    "Email": "smith@example.com"
  }
}
```

**Expect** output[0] to contain a contact object with `id`, confirming either a new record was created or an existing one was updated.

### Test: list all deals with pagination

**Parameters:**

```json
{
  "resource": "deal",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output array to contain at most 5 deal objects, each with `id`, `Deal_Name`, `Amount`, `Stage`, and `Closing_Date`.

### Test: delete an invoice

**Parameters:**

```json
{
  "resource": "invoice",
  "operation": "delete",
  "invoiceId": "{{ $json.id }}"
}
```

**Expect** output[0] to contain a confirmation object.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources & operations | Documented | Public n8n docs list 10 resources with CRUD + upsert + lead getFields |
| Additional field structures | Inferred | From published package type descriptors; Zoho CRM layouts vary by instance |
| Credential shape | Documented | Zoho OAuth2 with region selection from public n8n credentials docs |
| Zoho CRM API contract | Documented | Zoho CRM v3 API docs define endpoints, request shapes, and response shapes |
| Pagination | Inferred | Standard n8n pattern confirmed via schema descriptors |
| Dynamic field loading | Inferred | Via getFields/getCustomFields loadOptions; Zoho CRM API provides layout metadata |
| Address/product detail payloads | Inferred | From type declarations showing address sub-objects and Product_Details arrays |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.zohoCrm.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
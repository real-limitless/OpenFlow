---
type: n8n-nodes-base.xero
displayName: Xero
category: Finance & Accounting
versions: [1]
priority: high
status: specced
---

# Xero

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.xero/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/xero/ | Public docs only |
| https://developer.xero.com/documentation/api/accounting/overview | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.xero`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `xeroOAuth2Api` (OAuth2 — clientId, clientSecret)

## Parameters

The node is configured via a resource/operation selector plus context-sensitive fields that vary by the selected combination.

### Top-level

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | picklist | `contact` | yes | One of: `contact`, `invoice` |
| operation | picklist | `create` | yes | Varies by resource (see below) |

### Per-resource operations

| Resource | Available operations |
|----------|---------------------|
| contact | Create, Get, GetAll, Update |
| invoice | Create, Get, GetAll, Update |

### Shared fields by operation group

**Create / Update** operations accept:
- `contactId` / `invoiceId` (string, required for Update only) — the Xero resource GUID.
- `additionalFields` / `updateFields` (object) — a flat or nested map of Xero entity attributes (e.g. `Name`, `EmailAddress`, `ContactID`, `FirstName`, `LastName` for contacts; `Type`, `Contact`, `LineItems`, `Date`, `DueDate`, `Reference`, `Status` for invoices). The executor resolves expression strings inside values before building the JSON body.

**Get** operations accept:
- `contactId` / `invoiceId` (string, required) — the Xero resource GUID.

**GetAll** operations accept:
- `queryParams` (object, optional) — Xero API query filters such as `where` (a Xero filter expression like `Status=="ACTIVE"`), `order` (field name with optional ` ASC`/` DESC` suffix), `page` (integer, 1-based), `includeArchived` (boolean).
- `returnAll` (boolean, default false) — if true, paginate through all pages; otherwise use a single page.
- `limit` (number, default 100) — page size when `returnAll` is false.

## Runtime behavior

### Xero API routing

The executor constructs URLs against the Xero Accounting API v2.0:

- **Base URL:** `https://api.xero.com/api.xro/2.0/`

### HTTP method and path selection

| Operation | HTTP method | Path pattern |
|-----------|-------------|-------------|
| Create | POST | `/{ResourcePlural}` (e.g., `/Contacts`) |
| Get | GET | `/{ResourcePlural}/{id}` |
| GetAll | GET | `/{ResourcePlural}` with query params |
| Update | POST | `/{ResourcePlural}/{id}` |

Resource path segments use the Xero plural form (`Contacts`, `Invoices`).

### Input processing

- Each input item is processed independently.
- For Create/Update, the body is built by merging top-level JSON fields from `additionalFields`/`updateFields`. The executor constructs a valid Xero API request body with the resource name as the wrapping key (e.g. `{ "Contacts": [{ ...fields... }] }`).
- Expression strings (e.g. `{{ $json.someField }}`) inside the fields object are resolved at runtime before the body is serialized.
- For GetAll, the optional `where`, `order`, `page`, `includeArchived` parameters are appended as URL query parameters.

### Output shape

- **Create / Get / Update:** Outputs a single item containing the full Xero API response JSON under `json`. The wrapper key is the plural resource name (e.g. `{ "Contacts": [{ ... }] }`).
- **GetAll:** Outputs one item per entity returned. The executor unwraps the `{ResourcePlural}` array so that `output[0].length` equals the number of entities returned.
- Xero API responses typically include an `Id` field at the top level plus the resource array; the executor preserves the full response structure.

### Error handling

- HTTP 4xx/5xx responses from the Xero API should cause the node to throw (or, if `continueOnFail` is set, emit an empty output).
- Missing required `id` for Get/Update should throw a descriptive error.
- If GetAll returns zero results, the output is an empty array (no items).

### Expressions

All string-typed fields in `additionalFields`/`updateFields` accept expression strings. The `where` field on GetAll also accepts expressions.

## Acceptance tests

### Test: create contact

**Given** input items:
```json
[{ "json": { "email": "j.doe@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "create",
  "additionalFields": {
    "Name": "John Doe",
    "EmailAddress": "{{ $json.email }}"
  }
}
```

**Expect** the executor to POST to `https://api.xero.com/api.xro/2.0/Contacts` with body `{ "Contacts": [{ "Name": "John Doe", "EmailAddress": "j.doe@example.com" }] }`, and emit output[0] with `{ "Contacts": [{ ... }] }`.

### Test: get contact by ID

**Given** input items:
```json
[{ "json": { "contactId": "abc-123" } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "{{ $json.contactId }}"
}
```

**Expect** the executor to GET `https://api.xero.com/api.xro/2.0/Contacts/abc-123` and emit output[0] with the contact record.

### Test: get all invoices with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "getAll",
  "returnAll": false,
  "limit": 50,
  "queryParams": {
    "where": "Status==\"AUTHORISED\"",
    "order": "Date DESC"
  }
}
```

**Expect** the executor to GET `https://api.xero.com/api.xro/2.0/Invoices?where=Status%3D%3D%22AUTHORISED%22&order=Date%20DESC&page=1`, and emit output[0] with at most 50 invoice items.

### Test: update invoice status

**Given** input items:
```json
[{ "json": { "invoiceId": "inv-456" } }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "update",
  "invoiceId": "{{ $json.invoiceId }}",
  "updateFields": {
    "Status": "DELETED"
  }
}
```

**Expect** the executor to POST to `https://api.xero.com/api.xro/2.0/Invoices/inv-456` with body `{ "Invoices": [{ "Status": "DELETED" }] }`, and emit output[0] with the updated invoice.

### Test: empty getAll result

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "getAll",
  "queryParams": {
    "where": "Name==\"NonexistentName\""
  }
}
```

**Expect** the executor to return an empty output array `[]` (no items) when Xero returns zero matching contacts.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Public docs (n8n) | Exact list from n8n docs page — 2 resources × 4 operations |
| Credential type | Public docs (n8n) | Xero OAuth2 with clientId, clientSecret |
| Xero API base URL | Public docs (Xero developer) | `https://api.xero.com/api.xro/2.0/` |
| Path and method patterns | Public docs (Xero developer) | Standard REST patterns — GET for reads, POST for create/update |
| Body wrapping convention ({ResourcePlural}) | Inferred from Xero API conventions | Xero API wraps single resources in plural arrays |
| Where filter syntax | Public docs (Xero developer) | Xero filter expressions with `==`, `!=`, `Contains`, `StartsWith` |
| Pagination via `page` param | Public docs (Xero developer) | 1-based, 100 items default page size |
| Parameter names (additionalFields, queryParams, returnAll, limit) | Inferred from common n8n CRUD node patterns | High-level abstraction — exact internal naming may differ |
| Expression resolution on nested fields | Inferred | Required for dynamic field values in body construction |
| Error response shapes | Inferred | Maps Xero API error payloads to OpenFlow error contracts |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.xero.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
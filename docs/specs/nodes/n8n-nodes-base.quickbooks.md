---
type: n8n-nodes-base.quickbooks
displayName: QuickBooks Online
category: Finance & Accounting
versions: [1]
priority: high
status: specced
---

# QuickBooks Online

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbooks/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/quickbooks/ | Public docs only |
| https://developer.intuit.com/app/developer/qbo/docs/develop | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.quickbooks`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `quickBooksOAuth2Api` (OAuth2 — clientId, clientSecret, environment: Production | Sandbox)

## Parameters

The node is configured via a resource/operation selector plus a set of context-sensitive fields that vary by the selected combination.

### Top-level

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | picklist | `invoice` | yes | One of: `bill`, `customer`, `employee`, `estimate`, `invoice`, `item`, `payment`, `purchase`, `transaction`, `vendor` |
| operation | picklist | `create` | yes | Varies by resource (see below) |

### Per-resource operations

| Resource | Available operations |
|----------|---------------------|
| bill | Create, Delete, Get, GetAll, Update |
| customer | Create, Get, GetAll, Update |
| employee | Create, Get, GetAll, Update |
| estimate | Create, Delete, Get, GetAll, Send, Update |
| invoice | Create, Delete, Get, GetAll, Send, Update, Void |
| item | Get, GetAll |
| payment | Create, Delete, Get, GetAll, Send, Update, Void |
| purchase | Get, GetAll |
| transaction | GetReport |
| vendor | Create, Get, GetAll, Update |

### Shared fields by operation group

**Create / Update** operations accept:
- `id` (string, required for Update only) — the QBO entity `Id`.
- `additionalFields` / `updateFields` (object) — a flat or nested map of entity properties to set on the request body. The executor resolves expression strings inside values before building the JSON body. Fields map directly to Intuit entity attributes (e.g. `Line`, `BillAddr`, `CustomerRef`, `DueDate`).

**Get** operations accept:
- `id` (string, required) — the QBO entity `Id`.

**GetAll** operations accept:
- `filter` (string, optional) — a raw WHERE clause fragment appended to the QBO `SELECT * FROM {Entity}` query. Example: `WHERE MetaData.CreateTime > '2024-01-01T00:00:00'`.
- `returnAll` (boolean, default false) — if true, paginate through all results; otherwise use a fixed limit.
- `limit` (number, default 50) — max results per page when `returnAll` is false.

**Delete** operations accept:
- `id` (string, required) — the QBO entity `Id`.

**Send** operations accept:
- `id` (string, required) — the QBO invoice/estimate/payment `Id`.

**Void** operations accept:
- `id` (string, required) — the QBO invoice/payment `Id`.

**GetReport** (transaction resource) accepts:
- `reportName` (string, required) — name of the QBO report (e.g. `ProfitAndLoss`, `BalanceSheet`, `TrialBalance`).
- `dateRange` (object, optional) — with `startDate` and `endDate` strings in YYYY-MM-DD format.

## Runtime behavior

### QBO API routing

The executor constructs URLs against the Intuit QBO v3 API:

- **Production:** `https://quickbooks.api.intuit.com/v3/company/{companyId}`
- **Sandbox:** `https://sandbox-quickbooks.api.intuit.com/v3/company/{companyId}`

The `companyId` is extracted from the credential's OAuth token realm or from the token response.

### HTTP method and path selection

| Operation | HTTP method | Path pattern |
|-----------|-------------|-------------|
| Create | POST | `/{entitySingular}` |
| Get | GET | `/{entitySingular}/{id}` |
| GetAll | GET | `/query?query=select * from {EntitySingular} {filter}` |
| Update | POST | `/{entitySingular}?operation=update` |
| Delete | POST | `/{entitySingular}?operation=delete` |
| Send | POST | `/{entitySingular}/{id}/send` |
| Void | POST | `/{entitySingular}/{id}/void` |
| GetReport | GET | `/reports/{reportName}?start_date={date}&end_date={date}` |

Entity path segments use the Intuit singular lower-case form (e.g. `invoice`, `customer`, `bill`, `estimate`, `vendor`, `employee`, `payment`, `item`, `purchase`). The `FROM` clause in GetAll queries uses the PascalCase singular form (e.g. `Invoice`, `Customer`, `Bill`, `Estimate`, `Vendor`, `Employee`, `Payment`, `Item`, `Purchase`).

### Input processing

- Each input item is processed independently.
- For Create/Update, the body is built by merging top-level JSON fields from `additionalFields`/`updateFields` with any structural fields required by the Intuit API (e.g. `Line` arrays, `CustomerRef` objects).
- Expression strings (e.g. `{{ $json.someField }}`) inside the fields object are resolved at runtime before the body is serialized.
- For GetAll, the optional `filter` is appended to the SELECT query string.

### Output shape

- **Create / Get / Update:** Outputs a single item containing the full QBO entity JSON under the `json` key. The wrapper key is the PascalCase entity name (e.g. `{ "Invoice": { ... } }`).
- **GetAll:** Outputs one item per entity returned by the QBO query. Each item contains the entity JSON under `json`. The executor unwraps the `QueryResponse.{EntityName}` array so that `output[0].length` equals the number of entities.
- **Delete / Send / Void:** Outputs a single item containing the QBO response JSON (typically the entity with updated status fields).
- **GetReport:** Outputs one item per row in the report `Rows.Row` array. Each row is flattened into a flat key-value map under `json`.

### Error handling

- HTTP 4xx/5xx responses from the Intuit API should cause the node to throw (or, if `continueOnFail` is set, return an empty output).
- Missing `id` for Get/Update/Delete/Send/Void should throw a descriptive error.
- If the QBO query returns zero results for GetAll, the output is an empty array (no items).

### Expressions

All string-typed fields in `additionalFields`/`updateFields` accept expression strings. The `filter` field on GetAll also accepts expressions.

## Acceptance tests

### Test: create invoice with additional fields

**Given** input items:
```json
[{ "json": { "customerId": "1" } }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "create",
  "additionalFields": {
    "Line": [{ "DetailType": "SalesItemLineDetail", "Amount": 100.0, "SalesItemLineDetail": { "ItemRef": { "value": "1" } } }],
    "CustomerRef": { "value": "{{ $json.customerId }}" }
  }
}
```

**Expect** the executor to POST to `https://quickbooks.api.intuit.com/v3/company/{companyId}/invoice` with a JSON body containing `Line` and `CustomerRef`, and emit output[0] with `{ "Invoice": { ... } }`.

### Test: get all customers with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "customer",
  "operation": "getAll",
  "returnAll": true,
  "filter": "WHERE MetaData.CreateTime > '2024-01-01T00:00:00'"
}
```

**Expect** the executor to GET `https://quickbooks.api.intuit.com/v3/company/{companyId}/query?query=select * from Customer WHERE MetaData.CreateTime > '2024-01-01T00:00:00'`, and emit output[0] with length equal to the number of customers returned.

### Test: send invoice

**Given** input items:
```json
[{ "json": { "invoiceId": "123" } }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "send",
  "id": "{{ $json.invoiceId }}"
}
```

**Expect** the executor to POST to `https://quickbooks.api.intuit.com/v3/company/{companyId}/invoice/123/send` and emit output[0] with the QBO response.

### Test: void payment

**Given** input items:
```json
[{ "json": { "paymentId": "456" } }]
```

**Parameters:**
```json
{
  "resource": "payment",
  "operation": "void",
  "id": "{{ $json.paymentId }}"
}
```

**Expect** the executor to POST to `https://quickbooks.api.intuit.com/v3/company/{companyId}/payment/456/void` and emit output[0] with the QBO response.

### Test: get report

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "transaction",
  "operation": "getReport",
  "reportName": "ProfitAndLoss",
  "dateRange": { "startDate": "2024-01-01", "endDate": "2024-12-31" }
}
```

**Expect** the executor to GET `https://quickbooks.api.intuit.com/v3/company/{companyId}/reports/ProfitAndLoss?start_date=2024-01-01&end_date=2024-12-31` and emit one output item per row in the report.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Public docs | Exact list from n8n docs page operations section |
| Credential type | Public docs | QuickBooks OAuth2 — OAuth2 with clientId, clientSecret, environment |
| QBO API base URL pattern | Public docs (Intuit developer docs) | Standard v3 API pattern |
| Query path and syntax | Public docs | `select * from {Entity}` via `/query` endpoint |
| Report endpoint | Public docs | `/reports/{reportName}` with date params |
| Send/Void path patterns | Inferred from QBO API conventions | Action endpoints `/{entity}/{id}/send` and `/{entity}/{id}/void` |
| Parameter names (additionalFields, updateFields, filter, returnAll, limit) | Inferred from common n8n patterns | High-level abstraction consistent with other CRUD nodes |
| Expression resolution on nested fields | Inferred | Required for dynamic field values in body construction |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.quickbooks.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
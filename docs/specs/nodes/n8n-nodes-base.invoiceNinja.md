---
type: n8n-nodes-base.invoiceNinja
displayName: Invoice Ninja
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# Invoice Ninja

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.invoiceninja/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/invoiceninja/ | Public docs only |
| https://invoice-ninja.readthedocs.io/en/latest/api.html | External API (v4) |
| https://api-docs.invoicing.co/ | External API (v5) |

## Wire format

- **Type string:** `n8n-nodes-base.invoiceNinja`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `invoiceNinjaApi` (API-key auth: URL + API Token + optional Secret for v5)

## Parameters

The node exposes six resource groups, each with a set of operations and their required/optional fields.

### Resource: Client

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | — | name, address1, address2, city, state, postal_code, country_id, shipping_address1, shipping_address2, shipping_city, shipping_state, shipping_postal_code, shipping_country_id, work_phone, private_notes, website, vat_number, id_number; contacts[] (first_name, last_name, email, phone) | |
| delete | client_id | — | |
| get | client_id | — | |
| getAll | — | is_deleted (boolean), filters (object of query filters from the external API) | Paginated list |

### Resource: Expense

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | — | amount, client_id, expense_category_id, expense_date, payment_date, payment_type_id, private_notes, public_notes, should_be_invoiced, tax_name1, tax_name2, tax_rate1, tax_rate2, transaction_reference, vendor_id, custom_value1, custom_value2 | |
| delete | expense_id | — | |
| get | expense_id | — | |
| getAll | — | is_deleted (boolean), filters | Paginated list |

### Resource: Invoice

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | — | client_id, invoice_date, due_date, number, po_number, discount, is_amount_discount, partial, partial_due_date, auto_bill, custom_value1, custom_value2, tax_name1, tax_name2, tax_rate1, tax_rate2, private_notes, public_notes, email, email_invoice, invoice_status_id, paid; line_items[] (cost, notes, product_key, qty/quantity, tax_rate1, tax_rate2, tax_name1, tax_name2) | |
| delete | invoice_id | — | |
| email | invoice_id | — | Triggers email send via the external API |
| get | invoice_id | — | |
| getAll | — | is_deleted (boolean), filters | Paginated list |

### Resource: Payment

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | — | invoice_id, amount, payment_type_id, type_id, transaction_reference, private_notes, client_id; invoices[] (invoice_id, amount) | Supports multi-invoice payment allocation |
| delete | payment_id | — | |
| get | payment_id | — | |
| getAll | — | is_deleted (boolean), filters | Paginated list |

### Resource: Quote

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | — | client_id, number, invoice_date, due_date, discount, is_amount_discount, po_number, auto_bill, custom_value1, custom_value2, tax_name1, tax_name2, tax_rate1, tax_rate2, private_notes, public_notes, email, email_invoice, invoice_status_id, paid, partial, partial_due_date; line_items[] (cost, notes, product_key, qty/quantity, tax_rate1, tax_rate2, tax_name1, tax_name2) | Shares shape with Invoice but semantics are quote-specific |
| delete | quote_id | — | |
| email | quote_id | — | Triggers email send |
| get | quote_id | — | |
| getAll | — | is_deleted (boolean), filters | Paginated list |

### Resource: Task

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | — | client_id, description, project_id, time_log, custom_value1, custom_value2 | time_log is a JSON-encoded string |
| delete | task_id | — | |
| get | task_id | — | |
| getAll | — | is_deleted (boolean), filters | Paginated list |

### Resource: Bank Transaction (v2 API / v5)

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | — | amount, bank_integration_id, base_type, currency_id, date, description | Available in API v2 (Invoice Ninja v5) |
| delete | id | — | |
| get | id | — | |
| getAll | — | filters, bank_integration_id | |

**Notes on field types:**
- All `_id` parameters accept numeric or string identifiers.
- `time_log` is a JSON-serialized array (e.g. `[[start_epoch, end_epoch], ...]`).
- `is_deleted` filters are sent as query parameters to the external API.
- `line_items` is an array of item objects — external API contract: `product_key`, `notes`, `cost`, `qty`/`quantity`, `tax_rate1/2`, `tax_name1/2`.

## Runtime behavior

### Input

Each item flowing into the node is processed independently. For list-type operations (getAll, delete), the parameter values are read from the incoming item's JSON or from the expression-bound parameter, evaluated per item.

### Output

- **Single-record operations** (create, get, update-equivalent): one output item per input item containing the API response object directly (the full entity as returned by the external API).
- **List operations** (getAll): one output item per entity in the result set (paginated — all pages are fetched).
- **Delete operations**: one output item per input item; the output JSON contains the deleted entity's data (the `data` field from the API response).
- **Email operations**: one output item per input item; the output JSON contains the API response confirming the email was sent (or an error).

### Errors

- If the external API returns a non-2xx status, throw an `NodeApiError` with the response body.
- If a required resource identifier is missing (e.g. `client_id` for delete), throw a `NodeOperationError`.
- If `continueOnFail` is enabled, failing items are passed to the error output branch.

### Expressions

All string and number parameters accept expression strings. The `line_items` array parameter accepts expressions that evaluate to an array of item objects.

## Acceptance tests

### Test: create client

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "client",
  "operation": "create",
  "name": "Acme Corp",
  "contacts": [{ "first_name": "John", "last_name": "Doe", "email": "john@acme.com" }]
}
```

**Expect** output[0] to contain a JSON object with a `data` key holding the created client, including the fields `id`, `name`, `contacts`.

### Test: get all invoices with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "getAll"
}
```

**Expect** output[0] to be an array of invoice objects, each with at least `id`, `number`, `client_id`.

### Test: delete expense

**Given** input items:
```json
[{ "json": { "expense_id": "123" } }]
```

**Parameters:**
```json
{
  "resource": "expense",
  "operation": "delete",
  "expense_id": "={{ $json.expense_id }}"
}
```

**Expect** one output item with a JSON object containing the deleted expense's data.

### Test: email invoice

**Given** input items:
```json
[{ "json": { "invoice_id": "456" } }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "email",
  "invoice_id": "={{ $json.invoice_id }}"
}
```

**Expect** one output item with a JSON object confirming the email action was accepted by the API.

### Test: create invoice with line items

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "create",
  "client_id": "1",
  "line_items": [
    { "product_key": "Consulting", "cost": 150, "qty": 10 }
  ]
}
```

**Expect** output[0] to contain an invoice object with `line_items` matching the input.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource & operation list | documented | Matches n8n public docs exactly — 6 resources (Client, Expense, Invoice, Payment, Quote, Task) + BankTransaction from corpus |
| Parameter names and shapes | inferred from corpus | Interfaces from the corpus provide field names; abstraction level maintained. BankTransaction identified as a v2/v5-only resource. |
| Pagination behavior | documented | getAll retrieves all pages via `invoiceNinjaApiRequestAllItems` |
| Error handling | inferred | Standard n8n conventions (`NodeApiError`, `NodeOperationError`, `continueOnFail`) |
| Credential schema | documented | URL + API Token + optional Secret (v5); confirmed from public docs |
| Email invoice operation | documented | Present in public docs for Invoice and Quote resources |
| API version support | inferred | Node appears to support both v4 and v5 API conventions; credential switches behavior via the optional secret field |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/invoiceNinja.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

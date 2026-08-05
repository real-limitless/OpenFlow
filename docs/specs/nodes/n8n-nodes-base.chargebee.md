---
type: n8n-nodes-base.chargebee
displayName: Chargebee
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# Chargebee

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.chargebee.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/chargebee.md | Public docs only |
| https://apidocs.chargebee.com/docs/api/ | External API docs only |

## Wire format

- **Type string:** `n8n-nodes-base.chargebee`
- **Aliases:** (none), but `usableAsTool: true` so usable in AI agent tools
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `chargebeeApi` (required) — API key authentication with account name (Chargebee site subdomain) + API key

## Parameters

The node exposes three resources (Customer, Invoice, Subscription), each with specific operations and configuration:

### Resource: Customer

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `customer` | `invoice` | yes | — | Selects the Customer resource |
| operation | options: `create` | `create` | yes | resource = `customer` | Create a new customer in Chargebee |
| properties | collection | `{}` | no | operation = `create`, resource = `customer` | Optional field set sent as query parameters to the Chargebee API. Supported keys: `id` (string, auto-generated if omitted), `first_name`, `last_name`, `email`, `phone`, `company`. Custom properties supported via `customProperties` as a fixedCollection of `{ name, value }` pairs — each pair becomes a top-level query param. |

### Resource: Invoice

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `invoice` | `invoice` | yes | — | Selects the Invoice resource |
| operation | options: `list`, `pdfUrl` | `list` | yes | resource = `invoice` | List invoices or get an invoice PDF download URL |
| maxResults | number (1–100) | 10 | no | operation = `list` | Maximum number of invoice records to return |
| filters | fixedCollection | `{}` | no | operation = `list` | Filter by invoice date (operations: `is`, `is_not`, `after`, `before`; value: dateTime) or invoice amount (operations: `gte`, `gt`, `is`, `is_not`, `lte`, `lt`; value: number with 2-decimal precision). Date values are converted to Unix epoch seconds for the API call. |
| invoiceId | string | `""` | yes | operation = `pdfUrl` | The ID of the invoice whose PDF download URL to retrieve |

### Resource: Subscription

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `subscription` | `invoice` | yes | — | Selects the Subscription resource |
| operation | options: `cancel`, `delete` | `delete` | yes | resource = `subscription` | Cancel or delete a subscription |
| subscriptionId | string | `""` | yes | operation = `cancel` or `delete` | The ID of the target subscription |
| endOfTerm | boolean | `false` | no | operation = `cancel` | When true, schedules cancellation at end of current term rather than immediate cancellation |

## Runtime behavior

### External API contract

The node calls the Chargebee REST API v2 at `https://{accountName}.chargebee.com/api/v2`. Authentication is HTTP Basic Auth with the API key as username and an empty password.

### Input processing

Each input item is processed independently. For every item, the executor reads `resource` and `operation`, builds the appropriate endpoint URL and request parameters, and dispatches the request.

### Per-resource behavior

**Customer — Create:** POSTs to `/api/v2/customers` with customer properties as query parameters. Passes through the full Chargebee API response envelope, containing the nested `customer` resource object.

**Invoice — List:** GETs `/api/v2/invoices` with `sort_by[desc]=date`, `limit` (from maxResults), and optional date/amount filters. Date filters are converted from ISO strings to Unix epoch seconds before sending. The response wraps each invoice in a `{ invoice: { ... } }` envelope — the node extracts the inner `invoice` object for each list entry and emits one output item per invoice.

**Invoice — PDF URL:** POSTs to `/api/v2/invoices/{invoiceId}/pdf`. Merges the returned `download.download_url` into a new output item that also preserves the input item's JSON fields under a `pdfUrl` key.

**Subscription — Cancel:** POSTs to `/api/v2/subscriptions/{subscriptionId}/cancel` with an optional `end_of_term` body parameter. Passes through the full API response.

**Subscription — Delete:** POSTs to `/api/v2/subscriptions/{subscriptionId}/delete`. Passes through the full API response.

### Output shape

For list operations (invoice:list), items are flattened per the Chargebee API list envelope. For all other operations, the full API response JSON is passed through as output. The raw Chargebee envelope structure wraps single resources as `{ "customer": { ... } }`, `{ "subscription": { ... } }`, or `{ "download": { "download_url": "..." } }`.

### Error handling

API errors are thrown via `NodeApiError` wrapping the Chargebee HTTP error response. The `continueOnFail` flag is supported — when enabled, failed items produce `{ error, json, itemIndex }` output entries instead of halting execution.

### Expressions

All string parameters accept n8n expression syntax. The resource and operation selectors have `noDataExpression: true` (they are not expression-evaluated). Collection fields and fixedCollections also support expressions.

## Acceptance tests

### Test: customer — create

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "customer",
  "operation": "create",
  "properties": {
    "first_name": "Jane",
    "email": "jane@example.com"
  }
}
```

**Expect** output[0]:
- HTTP POST to `https://{accountName}.chargebee.com/api/v2/customers`
- Query includes `first_name=Jane` and `email=jane@example.com`
- Response contains `{ "customer": { ... } }` envelope from Chargebee
- Output item contains that full response JSON

### Test: invoice — list with date filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "list",
  "maxResults": 5,
  "filters": {
    "date": [{ "operation": "after", "value": "2024-01-01T00:00:00Z" }]
  }
}
```

**Expect** output[0]:
- HTTP GET to `https://{accountName}.chargebee.com/api/v2/invoices`
- Query includes `sort_by[desc]=date`, `limit=5`, `date[after]=<unix-epoch-seconds>`
- Each entry in the API `list` array is unwrapped: the inner `invoice` object becomes one output item

### Test: invoice — PDF URL

**Given** input items:
```json
[{ "json": { "existingField": "abc" } }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "pdfUrl",
  "invoiceId": "inv_123"
}
```

**Expect** output[0]:
- HTTP POST to `https://{accountName}.chargebee.com/api/v2/invoices/inv_123/pdf`
- Output item contains `{ "existingField": "abc", "pdfUrl": "<download_url_from_response>" }`

### Test: subscription — cancel (end of term)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "subscription",
  "operation": "cancel",
  "subscriptionId": "sub_abc",
  "endOfTerm": true
}
```

**Expect** output[0]:
- HTTP POST to `https://{accountName}.chargebee.com/api/v2/subscriptions/sub_abc/cancel`
- Body includes `end_of_term=true`
- Response contains `{ "subscription": { ... } }` envelope

### Test: subscription — delete

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "subscription",
  "operation": "delete",
  "subscriptionId": "sub_abc"
}
```

**Expect** output[0]:
- HTTP POST to `https://{accountName}.chargebee.com/api/v2/subscriptions/sub_abc/delete`
- Response contains `{ "subscription": { ... } }` envelope

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources and operations | documented | Public n8n docs list Customer (Create), Invoice (List, PDF URL), Subscription (Cancel, Delete) |
| Parameter details and defaults | inferred from package corpus | IDs, names, filters, and boolean flags cross-referenced against Chargebee API docs |
| API endpoints and auth | documented | Chargebee public API docs confirm REST v2, HTTP Basic Auth, base URL pattern |
| List response unwrapping | inferred | Invoice list unwraps `list[].invoice` envelope; other operations pass full response |
| Usable as AI tool | inferred | `usableAsTool: true` set in the node descriptor |
| Invoice filter operations | inferred | Corpus shows `is`, `is_not`, `after`, `before` for date; plus `gte`, `gt`, `lte`, `lt` for amount |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/Chargebee.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

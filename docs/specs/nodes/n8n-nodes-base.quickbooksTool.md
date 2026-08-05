---
type: n8n-nodes-base.quickbooksTool
displayName: QuickBooks Online Tool
category: Finance & Accounting
versions: [1]
priority: high
status: specced
---

# QuickBooks Online Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbooks/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/quickbooks/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.quickbooksTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `quickBooksOAuth2Api` (OAuth2 — clientId, clientSecret, environment: Production | Sandbox)

## Parameters

This is the **AI agent tool variant** of the QuickBooks Online node. It exposes the same resource/operation catalog as the base `n8n-nodes-base.quickbooks` node, but is designed to be connected to an AI Agent root node rather than used standalone in a linear workflow.

### Top-level

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | picklist | `invoice` | yes | One of: `bill`, `customer`, `employee`, `estimate`, `invoice`, `item`, `payment`, `purchase`, `transaction`, `vendor` |
| operation | picklist | `create` | yes | Varies by resource (see per-resource table below) |

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

### AI-agent–specific behavior

- Any parameter value string may contain the `$fromAI()` function, which delegates resolution of that value to the connected AI agent's model at runtime.
- The standard `$fromAI(key)` signature is supported; optional `description`, `type`, and `defaultValue` arguments can guide the model toward appropriate values.
- When `$fromAI()` is used for entity IDs (e.g., `customerId`, `invoiceId`), the AI model infers the correct ID from conversation context, tool-chain output, or user-provided information.
- For object-typed parameters (`additionalFields`, `updateFields`, `filters`), individual sub-field values can use `$fromAI()` expressions.
- Parameters that would normally be static in a manual workflow (e.g., `Line`, `CustomerRef` in invoice creation) can be left to the AI model to populate.

### Shared fields by operation group

**Create / Update** operations accept:
- `id` (string, required for Update only) — the QBO entity `Id`.
- `additionalFields` / `updateFields` (object) — entity properties to set on the request body. The executor resolves expression strings (including `$fromAI()`) inside values before building the JSON body.

**Get** operations accept:
- `id` (string, required) — the QBO entity `Id`.

**GetAll** operations accept:
- `returnAll` (boolean, default false) — if true, paginate through all results.
- `limit` (number, default 50) — max results per page when `returnAll` is false.
- `filters.query` (string, optional) — raw WHERE clause fragment for QBO `SELECT * FROM {Entity}` queries.

**Delete** / **Send** / **Void** operations accept:
- `id` (string, required) — the QBO entity `Id`.

**GetReport** (transaction resource) accepts:
- `filters.dateRangeCustom` (object, optional) — `start_date` and `end_date` in YYYY-MM-DD format.
- `filters.date_macro` (string, optional) — predefined date range (e.g. `This Month`, `Last Fiscal Year`).
- Additional filter fields: `columns`, `group_by`, `sort_by`, `sort_order`, `source_account_type`, `transaction_type`, `vendor`, `customer`, `department`, `memo`, `docnum`, `payment_Method`, `printed`, `qzurl`, `bothamount`, `cleared`, `arpaid`, `appaid`, `term`.

## Runtime behavior

### API routing

Same as the base QuickBooks node: URLs constructed against Intuit QBO v3 API (`production` or `sandbox-quickbooks` subdomain), with `companyId` extracted from the OAuth credential.

### Input processing

- Each input item is processed independently.
- Expression strings (`{{ }}` and `$fromAI()`) inside parameter values are resolved before the HTTP request is made.
- `$fromAI()` calls are resolved by the AI Agent's connected model at runtime based on the conversation context.

### Output shape

Same as the base QuickBooks node:
- **Create / Get / Update:** Single item with full QBO entity JSON under `json`.
- **GetAll:** One item per entity, unwrapped from `QueryResponse.{EntityName}`.
- **Delete / Send / Void:** Single item with QBO response JSON.
- **GetReport:** One item per row in `Rows.Row`, flattened into key-value map.

### Error handling

- HTTP 4xx/5xx from Intuit API causes the tool to throw. With `continueOnFail` set on the parent AI Agent, the error is returned to the model instead.
- Missing required `id` fields throw a descriptive error.
- Empty GetAll results produce an empty output array.
- `$fromAI()` resolution failures (e.g. the model cannot infer the required value) should propagate as expression errors to the agent.

### Expressions

All string-typed fields accept `{{ }}` expressions and `$fromAI()` functions.

## Acceptance tests

### Test: AI agent creates invoice via QuickBooks Tool

**Given** an AI Agent node connected to a QuickBooks Tool node, and a user prompt "Create invoice for customer 1 for $100".

**Parameters on QuickBooks Tool:**
```json
{
  "resource": "invoice",
  "operation": "create",
  "additionalFields": {
    "Line": { "value": "{{ $fromAI('lineItems', 'Line items for the invoice', 'json') }}" },
    "CustomerRef": { "value": "{{ $fromAI('customerRef', 'Customer reference', 'json') }}" }
  }
}
```

**Expect** the tool to POST to the QBO invoice endpoint with a body containing `Line` and `CustomerRef`, and emit a single output item with the created `Invoice` object.

### Test: get all customers with date filter

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
  "filters": { "query": "WHERE MetaData.CreateTime > '2024-01-01T00:00:00'" }
}
```

**Expect** the executor to GET the QBO query endpoint with `select * from Customer WHERE MetaData.CreateTime > '2024-01-01T00:00:00'` and emit output items for each returned customer.

### Test: $fromAI dynamically resolves vendor ID

**Parameters:**
```json
{
  "resource": "vendor",
  "operation": "get",
  "id": "{{ $fromAI('vendorId', 'The QuickBooks vendor ID to retrieve') }}"
}
```

**Expect** that at runtime the AI agent model supplies the vendor ID value, and the tool executes GET on `/vendor/{resolvedId}`.

### Test: get transaction report with predefined date range

**Parameters:**
```json
{
  "resource": "transaction",
  "operation": "getReport",
  "filters": {
    "date_macro": "Last Fiscal Year",
    "columns": ["tx_date", "txn_type", "name", "amount"]
  }
}
```

**Expect** the executor to GET the QBO report endpoint with query parameters for Last Fiscal Year and the selected columns, emitting one output item per report row.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Public docs | Identical to base quickbooks node |
| $fromAI() function | Public docs | Documented on the AI-for-parameters page |
| Tool-vs-base-node behavior | Public docs | Tool variant documented as "can be used as an AI tool" on the quickbooks page; this spec follows patterns established by other Tool variants (dropboxTool, redditTool, etc.) |
| Credential type | Public docs | `quickBooksOAuth2Api` — OAuth2 with clientId, clientSecret, environment |
| QBO API routing | Public docs (Intuit) | Standard v3 API base URL pattern |
| Expression resolution on $fromAI() values | Inferred | Consistent with documented $fromAI() semantics |
| Per-resource entity-typed ID parameters (customerId, invoiceId, etc.) | Corpus (type descriptor) | Varied by resource; abstracted here as a generic `id` parameter consistent with the base spec |
| Report filter options | Public docs + corpus type descriptor | Extensive filter enum set documented in the corpus type descriptor; paraphrased at the parameter level |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.quickbooksTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

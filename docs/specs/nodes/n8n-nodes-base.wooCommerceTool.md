---
type: n8n-nodes-base.wooCommerceTool
displayName: WooCommerce
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# WooCommerce (AI Tool)

A tool variant of the WooCommerce node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Customer, Order, and Product resources against the WooCommerce REST API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.woocommerce.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/woocommerce.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://woocommerce.github.io/woocommerce-rest-api-docs/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wooCommerceTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** WooCommerce API credential (Consumer Key, Consumer Secret, WooCommerce URL; optional Include Credentials in Query flag)

## Parameters

### Resource selection

The user selects a resource (Customer, Order, Product) which determines available operations.

### Customer operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Customer payload fields (email, first_name, last_name, username, billing/shipping addresses, etc.) |
| Delete | Customer ID |
| Get | Customer ID |
| Get Many | Return All, Limit, optional filters (role, email, orderby, etc.) |
| Update | Customer ID, partial customer payload |

### Order operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Order payload fields (customer_id, line_items, shipping_lines, payment_method, billing/shipping addresses, status, etc.) |
| Delete | Order ID, optional Force (boolean) |
| Get | Order ID |
| Get All | Return All, Limit, optional filters (status, customer, product, date range, etc.) |
| Update | Order ID, partial order payload |

### Product operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Product payload fields (name, type, regular_price, description, categories, images, etc.) |
| Delete | Product ID, optional Force (boolean) |
| Get | Product ID |
| Get All | Return All, Limit, optional filters (category, tag, sku, type, status, date range, etc.) |
| Update | Product ID, partial product payload |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "let model fill" toggle is available on appropriate parameter fields
- The tool exposes a description of each resource + operation combination to the AI agent for tool selection

## Runtime behavior

### Input

Consumes items from `main` input. Each input item supplies expressions and/or operation data. The operation is applied independently to each input item.

### Output

Emits one main output item per successful operation result. The item JSON contains the resource object returned by the WooCommerce REST API, preserving identifiers and all documented fields.

- **Create/Get/Update:** the full service resource object
- **Get All:** the collection as individual items
- **Delete:** the service confirmation object (or a success indicator if no body is returned)

Binary data is not produced.

### Errors

- Missing credentials, invalid operation, missing required identifiers or payload data, or an unsuccessful HTTP response from WooCommerce fail the item
- HTTP 400, 401, 404, and 500 are expected error classes from the service
- `continueOnFail` follows the standard tool node convention: convert the item to an error result and continue

### Expressions

All string and numeric editable fields accept standard n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: Create a product via AI agent

**Given** input items:
```json
[{ "json": { "name": "AI-generated notebook", "type": "simple", "regular_price": "14.99" } }]
```

**Parameters:**
```json
{
  "resource": "product",
  "operation": "create",
  "productFields": {
    "name": "={{ $json.name }}",
    "type": "={{ $json.type }}",
    "regular_price": "={{ $json.regular_price }}"
  }
}
```

**Expect** one output item whose JSON contains the created product identifier (integer) and the submitted name. The executor sends a POST to the products collection endpoint.

### Test: Get an order by ID

**Given** input items:
```json
[{ "json": { "orderId": 101 } }]
```

**Parameters:**
```json
{
  "resource": "order",
  "operation": "get",
  "orderId": "={{ $json.orderId }}"
}
```

**Expect** one output item containing the order resource with identifier `101`, including documented fields such as `id`, `status`, `total`, `currency`, `billing`, `line_items`.

### Test: Delete a customer

**Given** input items:
```json
[{ "json": { "customerId": 42 } }]
```

**Parameters:**
```json
{
  "resource": "customer",
  "operation": "delete",
  "customerId": "={{ $json.customerId }}"
}
```

**Expect** the executor sends a DELETE to the customer endpoint for ID `42` and emits a success confirmation item (the service response body or a success indicator).

### Test: Get All products with limit

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "product",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5
}
```

**Expect** the executor sends a GET to the products collection with pagination parameters to retrieve at most 5 products, and emits each product as a separate output item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Three resources with CRUD operations | documented | Confirmed by public n8n WooCommerce node page; consistent with the app node |
| Credential structure | documented | Confirmed by public credentials page; shared with the regular WooCommerce node |
| `$fromAI()` dynamic parameter support | documented | Public docs describe the feature generically; applies to all tool nodes |
| Tool eligibility | documented | Public WooCommerce page states "This node can be used as an AI tool" |
| Exact convenience field names per operation | intentionally unspecified | These are UI schema details that vary by version; not required for the external contract |
| WooCommerce REST API response shapes | documented | Public WooCommerce REST API docs describe all resource shapes |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.wooCommerceTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
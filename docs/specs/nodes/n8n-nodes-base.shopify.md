---
type: n8n-nodes-base.shopify
displayName: Shopify
category: Sales
versions: [1]
priority: medium
status: specced
---

# Shopify

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.shopify/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/shopify/ | Public docs only |
| https://shopify.dev/docs/api/usage/access-scopes | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.shopify`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `shopifyApi` (access token), `shopifyOAuth2Api` (OAuth2), or `shopifyApi` (API key — deprecated)

### Credential fields

| field | type | required | notes |
|-------|------|----------|-------|
| shopSubdomain | string | yes | The subdomain from `https://<subdomain>.myshopify.com` |
| accessToken | string | yes (access-token mode) | Admin API access token from custom app |
| appSecretKey | string | yes (access-token mode) | API secret key from custom app |
| clientId | string | yes (OAuth2 mode) | OAuth2 client ID |
| clientSecret | string | yes (OAuth2 mode) | OAuth2 client secret |
| apiKey | string | yes (API-key mode) | Deprecated — legacy API key |
| password | string | yes (API-key mode) | Deprecated — legacy password |
| sharedSecret | string | no | Deprecated — legacy shared secret |

## Parameters

The node offers two resource groups, each with the following operations:

### Product

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | product | yes | — | Must be `product` |
| operation | string | — | yes | resource=product | One of: `create`, `delete`, `get`, `getAll`, `update` |
| productId | number | — | yes (get/delete/update) | operation in (get,delete,update) | Shopify product ID |
| returnAll | boolean | false | yes (getAll) | operation=getAll | When true, ignores limit |
| limit | number | 50 | conditional | operation=getAll & returnAll=false | Max items to return |
| additionalFields | object | — | no | — | Named fields: title, bodyHtml, vendor, productType, tags, status (active/archived/draft), publishedScope, handle, images (array of src URLs), options (array of {name, values}), variants (array of {price, sku, ...}) |
| updateFields | object | — | no | operation=update | Same shape as additionalFields but applied as partial update |

### Order

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | order | yes | — | Must be `order` |
| operation | string | — | yes | resource=order | One of: `create`, `delete`, `get`, `getAll`, `update` |
| orderId | number | — | yes (get/delete/update) | operation in (get,delete,update) | Shopify order ID |
| returnAll | boolean | false | yes (getAll) | operation=getAll | When true, ignores limit |
| limit | number | 50 | conditional | operation=getAll & returnAll=false | Max items to return |
| additionalFields | object | — | no | — | Named fields: (order-level fields such as lineItems, note, email, etc.) |
| updateFields | object | — | no | operation=update | Partial order update fields |

## Runtime behavior

### Input

Each incoming item is processed independently. For `getAll` operations, the node may batch the result across items into a single API call and output multiple items.

### Output

For single-record operations (create, get, update), the output item's `json` contains the full Shopify resource object returned by the Admin REST API.

For `getAll`, the output is one item per result record.

For `delete`, the output item passes the input `json` through unmodified, or returns `{ "success": true }`.

Output shape examples (documented at the outcome level — actual response mirrors the Shopify Admin REST API for the given endpoint):

**Product (get/create/update):**
```json
{
  "id": 12345,
  "title": "Example T-Shirt",
  "vendor": "Example Co",
  "product_type": "Apparel",
  "handle": "example-t-shirt",
  "status": "active",
  "tags": "t-shirt, example",
  "variants": [{ "id": 54321, "price": "29.99", "sku": "TS-001", "inventory_quantity": 100 }],
  "images": [{ "id": 111, "src": "https://cdn.shopify.com/..." }]
}
```

**Order (get/getAll):**
```json
{
  "id": 67890,
  "created_at": "2024-01-15T10:00:00Z",
  "line_items": [{ "id": 999, "title": "Example T-Shirt", "quantity": 2, "price": "29.99" }]
}
```

### Errors

- 4xx responses from the Shopify API (invalid credentials, forbidden scopes, resource not found) are surfaced as NodeOperationError.
- 5xx responses are surfaced as NodeOperationError with the HTTP status code.
- `continueOnFail`: when true, failed items are returned with an `error` property instead of halting execution.

### Expressions

All parameters accept string expressions.

## Acceptance tests

### Test: create a product

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "product",
  "operation": "create",
  "additionalFields": {
    "title": "Test Product from n8n",
    "vendor": "n8n Test",
    "productType": "Testing"
  }
}
```

**Expect** output[0] contains a `json` object with an `id` (integer), `title` equal to "Test Product from n8n", and `vendor` equal to "n8n Test".

### Test: get all products (paginated)

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

**Expect** output[0] contains exactly 5 `json` items, each with an `id` and `title` field.

### Test: get a single order by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "order",
  "operation": "get",
  "orderId": 12345
}
```

**Expect** output[0] `json` object has `id` equal to 12345, and contains `created_at` and `line_items` fields.

### Test: delete a product

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "product",
  "operation": "delete",
  "productId": 67890
}
```

**Expect** output[0] `json` contains `{ "success": true }` (or the input item passed through unchanged).

### Test: invalid credentials error

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "product",
  "operation": "getAll",
  "returnAll": true
}
```

**With** invalid credentials, **expect** a NodeOperationError with message containing "Forbidden" or "401".

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented | Public docs enumerate order + product with 5 operations each |
| Auth field names | Documented | Public docs describe all 3 credential modes and their fields |
| Per-operation parameters | Inferred from descriptor metadata | The exact field groupings (additionalFields vs updateFields) and nested structures are from the npm descriptor schema, not public docs |
| Output response shapes | Inferred | Exact Shopify Admin REST API response shapes verified from schema files in corpus |
| Order create/delete/update fields | Inferred | Public docs only list "Create/Delete/Get/Get All/Update an order" with no per-field detail |
| Error behaviour | Inferred | Standard n8n app-node error convention |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/Shopify.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
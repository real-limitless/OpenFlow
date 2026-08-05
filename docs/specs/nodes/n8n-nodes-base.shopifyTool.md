---
type: n8n-nodes-base.shopifyTool
displayName: Shopify Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Shopify Tool

A tool variant of the Shopify node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Product and Order resources against the Shopify Admin REST API.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.shopify/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/shopify/ | Public docs only |
| https://shopify.dev/docs/api/usage/access-scopes | Third-party service API docs |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.shopifyTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Shopify API (three auth methods: Access Token, OAuth2, API Key)

### Credential fields

| field | type | required | notes |
|-------|------|----------|-------|
| shopSubdomain | string | yes | The subdomain from `https://<subdomain>.myshopify.com` |
| accessToken | string | yes (access-token mode) | Admin API access token from custom app |
| appSecretKey | string | yes (access-token mode) | API secret key from custom app |
| clientId | string | yes (OAuth2 mode) | OAuth2 client ID |
| clientSecret | string | yes (OAuth2 mode) | OAuth2 client secret |
| apiKey | string | yes (API-key mode) | Deprecated |
| password | string | yes (API-key mode) | Deprecated |
| sharedSecret | string | no | Deprecated |

## Parameters

The node offers two resources, each with CRUD operations.

### Product

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | product | yes | — | Must be `product` |
| operation | string | — | yes | resource=product | One of: `create`, `delete`, `get`, `getAll`, `update` |
| productId | number | — | yes (get/delete/update) | operation in (get,delete,update) | Shopify product ID |
| returnAll | boolean | false | yes (getAll) | operation=getAll | When true, ignores limit |
| limit | number | 50 | conditional | operation=getAll & returnAll=false | Max items to return |
| additionalFields | object | — | no | — | Named product fields (title, bodyHtml, vendor, productType, tags, status, publishedScope, handle, images, options, variants) |
| updateFields | object | — | no | operation=update | Same shape as additionalFields for partial update |

### Order

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | order | yes | — | Must be `order` |
| operation | string | — | yes | resource=order | One of: `create`, `delete`, `get`, `getAll`, `update` |
| orderId | number | — | yes (get/delete/update) | operation in (get,delete,update) | Shopify order ID |
| returnAll | boolean | false | yes (getAll) | operation=getAll | When true, ignores limit |
| limit | number | 50 | conditional | operation=getAll & returnAll=false | Max items to return |
| additionalFields | object | — | no | — | Named order fields (lineItems, note, email, etc.) |
| updateFields | object | — | no | operation=update | Partial order update fields |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "let model fill" toggle is available on appropriate parameter fields
- The tool exposes a description of each resource + operation combination to the AI agent for tool selection

## Runtime behavior

### Input

Each incoming item is processed independently. For `getAll` operations, the node may batch the result across items into a single API call and output multiple items.

### Output

Emits one main output item per successful operation result. The item JSON contains the resource object returned by the Shopify Admin REST API, preserving identifiers and all documented fields.

- **Create/Get/Update:** the full Shopify resource object
- **Get All:** the collection as individual items
- **Delete:** the input item passed through, or `{ "success": true }`

Binary data is not produced.

### Errors

- 4xx responses from the Shopify API (invalid credentials, forbidden scopes, resource not found) are surfaced as NodeOperationError.
- 5xx responses are surfaced as NodeOperationError with the HTTP status code.
- `continueOnFail`: when true, failed items are returned with an error property instead of halting execution.

### Expressions

All string and numeric editable fields accept standard n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: create a product via AI agent

**Given** input items:
```json
[{ "json": { "productName": "AI-generated Widget", "price": "19.99" } }]
```

**Parameters:**
```json
{
  "resource": "product",
  "operation": "create",
  "additionalFields": {
    "title": "={{ $json.productName }}",
    "variants": [{ "price": "={{ $json.price }}" }]
  }
}
```

**Expect** one output item whose JSON contains the created product identifier (integer) and `title` equal to "AI-generated Widget".

### Test: get an order by ID

**Given** input items:
```json
[{ "json": { "orderId": 67890 } }]
```

**Parameters:**
```json
{
  "resource": "order",
  "operation": "get",
  "orderId": "={{ $json.orderId }}"
}
```

**Expect** one output item containing the order resource with identifier `67890`, including fields such as `id`, `created_at`, and `line_items`.

### Test: get all products with limit

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

**Expect** the executor sends a GET to the products collection with pagination parameters to retrieve at most 5 products, and emits each product as a separate output item with `id` and `title` fields.

### Test: delete a product

**Given** input items:
```json
[{ "json": { "productId": 12345 } }]
```

**Parameters:**
```json
{
  "resource": "product",
  "operation": "delete",
  "productId": "={{ $json.productId }}"
}
```

**Expect** the executor sends a DELETE to the product endpoint for ID `12345` and emits a success confirmation item.

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
| Two resources with CRUD operations | documented | Confirmed by public n8n Shopify node page; consistent with the app node |
| Three auth methods | documented | Confirmed by public Shopify credentials page |
| `$fromAI()` dynamic parameter support | documented | Public docs describe the feature generically; applies to all tool nodes |
| Tool eligibility | inferred | Follows the pattern of other tool variants (WooCommerceTool, GmailTool, etc.); the app node's same resources/operations are exposed with AI-populatable parameters |
| Exact per-operation convenience fields | intentionally unspecified | These are UI schema details; not required for the external contract |
| Shopify Admin REST API response shapes | documented | Shopify API docs describe all resource shapes |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.shopifyTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

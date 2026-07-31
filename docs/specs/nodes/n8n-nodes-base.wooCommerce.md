---
type: n8n-nodes-base.wooCommerce
displayName: WooCommerce
category: Output
versions: [1]
priority: medium
status: specced
---

# WooCommerce

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.woocommerce.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/woocommerce.md | Public docs only |
| https://woocommerce.github.io/woocommerce-rest-api-docs/ | Public docs only |
| https://woocommerce.com/document/woocommerce-rest-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wooCommerce`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** one required WooCommerce API credential containing the store URL, consumer key, and consumer secret. It may select query-string authentication for installations that cannot parse the Authorization header.
- **AI tool:** The node is eligible to be exposed as an AI tool; this does not change its normal main input/output contract.

## Parameters

The editor must expose a resource selector and an operation selector. The operation selector is constrained by the selected resource.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | enum | product | yes | always | One of Customer, Order, or Product. |
| operation | enum | resource-dependent | yes | selected resource | Create, delete, retrieve one, retrieve many, or update. Orders support the same set except that the public node documentation does not list a customer-style create spelling distinction; it still exposes order creation. |
| resource identifier | string or integer | none | for single-resource read/update/delete | single-resource operations | Identifies the customer, order, or product at the service API. Expressions are allowed. |
| create data | object | none | create operations | create | A JSON-compatible resource payload accepted by the corresponding WooCommerce REST endpoint. The node may provide convenient fields, but must not discard supported resource data. |
| update data | object | none | update operations | update | Partial or complete fields accepted by the corresponding WooCommerce REST endpoint. The identifier is supplied separately. |
| collection options | object | empty | no | retrieve-many operations | Query/filter, ordering, page, page size, and offset controls supported by the selected WooCommerce collection endpoint. |
| return-all | boolean | implementation-defined UI default | no | retrieve-many operations | When enabled, retrieve successive pages until the collection is exhausted; otherwise return the requested/default page. |

The exact convenience fields for customer, order, and product payloads are service fields, not an OpenFlow wire requirement. Implementations must preserve values supplied through expressions and must not invent a payload field when the user did not provide it.

## Runtime behavior

### Input

The node consumes main items. Each item supplies expressions and/or operation data. The operation is applied independently to each input item unless the configured collection operation is explicitly returning all pages for that item. A workflow that needs one request may provide one input item.

The executor calls the WooCommerce REST API under the configured store URL and the `wc/v3` namespace. Create and update use JSON request bodies; retrieve and delete use the corresponding resource endpoint and identifier. Collection reads must honor supported query parameters and pagination.

### Output

- Emit one main output item for each successful operation result.
- For create, retrieve, and update, the item JSON contains the service's returned resource object, preserving its identifiers and resource fields.
- For retrieve-many, emit the returned collection as individual main items when the node is operating in item-oriented mode. If the selected OpenFlow compatibility mode represents a collection as one result, it must preserve the collection without silently dropping entries; this mode choice must be documented by the executor.
- For delete, emit the service confirmation/result object when one is returned. If the service returns no body, emit a JSON result that records successful completion and the affected identifier.
- Binary data is not expected or produced by this node.

WooCommerce responses are JSON. Service identifiers are integers in the documented API, dates use ISO 8601, monetary decimal values may be strings, and collection metadata may be carried in response headers. The executor should preserve the response values rather than normalize them into an OpenFlow-specific schema.

### Errors

Fail the item when credentials are missing, the selected operation is invalid, required identifiers or payload data are absent, authentication fails, or the service returns an unsuccessful HTTP response. Surface the service status and useful error message without exposing the consumer secret.

The service documents 400 (bad request), 401 (authentication/permission), 404 (missing route or resource), and 500 (server) failures. `continueOnFail` follows the OpenFlow node convention: when enabled, convert an item failure to an error result for that item and continue processing later items; otherwise stop with the node error.

### Expressions

Resource, operation, identifiers, payload fields, collection controls, and return-all may be expression-backed where they are exposed as editable values. Expressions are evaluated in the current item context before constructing the request. Resource and operation selectors themselves must resolve to supported values.

## Acceptance tests

The fixtures below use a mocked WooCommerce API; assertions concern functional outcomes rather than an exact vendor response schema.

### Test: create a product

**Given** input items:

```json
[{ "json": { "name": "Notebook", "type": "simple", "regular_price": "12.00" } }]
```

**Parameters:**

```json
{ "resource": "product", "operation": "create", "data": "={{$json}}" }
```

**Expect** one successful output item whose JSON contains the created product identifier and the submitted product name. The mock receives a JSON create request under the products collection endpoint.

### Test: retrieve one order

**Given** input items:

```json
[{ "json": { "orderId": 42 } }]
```

**Parameters:**

```json
{ "resource": "order", "operation": "get", "id": "={{$json.orderId}}" }
```

**Expect** one output item containing the mock order resource with identifier `42`, and a request targeted at that order rather than the collection.

### Test: retrieve all customers across pages

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{ "resource": "customer", "operation": "getAll", "returnAll": true, "options": { "perPage": 2 } }
```

**Expect** the executor follows the service's page metadata until all mock customers are retrieved and emits every customer exactly once.

### Test: update then delete a product

**Given** input items:

```json
[{ "json": { "productId": 7, "price": "15.00" } }]
```

**Parameters:**

```json
{ "resource": "product", "operation": "update", "id": "={{$json.productId}}", "data": { "regular_price": "={{$json.price}}" } }
```

**Expect** one output containing the updated resource and the mock observes an update request for product `7`. A subsequent delete configuration for identifier `7` must call the single-resource delete endpoint and report successful completion.

### Test: propagate an API failure

**Given** a mock response with HTTP status `401` and a WooCommerce authentication error.

**Parameters:**

```json
{ "resource": "customer", "operation": "get", "id": 3 }
```

**Expect** a node error that identifies authentication/permission failure and does not emit a successful customer item. With `continueOnFail`, the item becomes an error result and execution proceeds.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type, three resources, and listed CRUD operations | documented | Confirmed by the public n8n WooCommerce node page. |
| API-key credential components and query-string fallback | documented | Confirmed by n8n credential documentation and WooCommerce API documentation. |
| `wc/v3`, JSON, identifiers, pagination, and HTTP error classes | documented | Confirmed by the public WooCommerce REST API reference. |
| Per-input-item execution and exact OpenFlow collection-item representation | inferred | Required to map a service node into the repository's item model; the public integration page does not specify engine internals. |
| Convenience parameter names, defaults, and nested UI fields | intentionally unspecified | They are not required to describe the external contract and are avoided to prevent reconstructing private schema details. |
| Exact delete response body | inferred | The service may return a resource or an empty body; the output rule preserves either outcome. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/woo-commerce.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

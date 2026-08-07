---
type: n8n-nodes-base.magento2
displayName: Magento 2
category: Commerce
versions: [1]
priority: medium
status: specced
---

# Magento 2

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.magento2/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/magento2/ | Public docs only |
| https://developer.adobe.com/commerce/docs/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.magento2`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `magento2Api` (API access token — host URL + bearer token)

## Parameters

### Resource selector (hidden, fixed)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `customer` | yes | One of: `customer`, `invoice`, `order`, `product` |

### Operation selector (shown per resource)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | `create` | yes | resource matches | One of the values listed below per resource |

#### Customer operations

- `create` — requires email, firstName, lastName; optional additionalFields (websiteId, storeId, groupId, prefix, middlename, suffix, dob, taxVat, gender, addresses[], customAttributes[], confirmation, sendEmail)
- `delete` — requires customerId
- `get` — requires customerId
- `getAll` — optional returnAll (boolean, default false), limit (number, shown when returnAll false); supports simple filters
- `update` — requires customerId; updateFields with email, firstName, lastName, website_id, and optional additionalFields

#### Invoice operations

- `create` — requires orderId (order identifier as string/number); optional items[] (sku, qty), notify, appendComment, comment, capture (online/offline)

#### Order operations

- `cancel` — requires orderId
- `get` — requires orderId
- `getAll` — optional returnAll, limit
- `ship` — requires orderId; optional items[] (sku, qty), notify, appendComment, comment, tracks[] (trackNumber, title, carrierCode)

#### Product operations

- `create` — requires sku, name, attributeSetId, price; optional additionalFields (status, visibility, typeId, weight, taxClassId, description, shortDescription, metaTitle, metaKeyword, metaDescription, customAttributes[], extensionAttributes{}, websiteIds[], stockData{}, etc.)
- `delete` — requires sku
- `get` — requires sku
- `getAll` — optional returnAll, limit
- `update` — requires sku; updateFields with name, attributeSetId, price, and optional additionalFields

### Common parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | false | Used by getAll operations | When false, limit field appears |
| limit | number | 50 | Conditional | Max items to return when returnAll is false |
| simple | boolean | false | Used by getAll operations | When true, returns flattened item array instead of paginated response |

## Runtime behavior

### Input

The node receives items on `main[0]`. Input items are processed individually — each item's `.json` properties are available via expressions for dynamic parameter values (e.g. `{{ $json.email }}`). Binary data is not consumed by this node.

### Output

The node produces items on `main[0]`. Each input item generates at most one output item:

- **Create / Update operations** — the created or updated entity is returned as the output item's `.json` (e.g. the full customer, product, invoice, or order object from the Adobe Commerce REST API).
- **Get operations** — the single entity from `GET /V1/{resource}/{id}` is returned.
- **GetAll operations** — one output item per entity from `GET /V1/{resource}/search`. If the API returns a search result with `items[]`, each item becomes one output item.
- **Delete operations** — the input item is passed through unchanged (the API typically returns `true`).

### Errors

- The node throws a `NodeOperationError` when the Magento REST API returns a non-2xx status code.
- If `continueOnFail` is enabled on the node, the failed item is passed to the error output branch instead of halting the workflow.
- Common failure modes: invalid credentials (401), insufficient API permissions (403), resource not found (404), validation errors (400), and server errors (500).

### Expressions

All parameter fields that accept strings support n8n expression syntax (`{{ }}`). Numeric and boolean fields also support expressions.

## Acceptance tests

### Test: create and get a customer

**Given** input items:

```json
[{
  "json": {
    "email": "jane@example.com",
    "firstname": "Jane",
    "lastname": "Doe"
  }
}]
```

**Parameters:** resource=`customer`, operation=`create`, email=`{{ $json.email }}`, firstName=`{{ $json.firstname }}`, lastName=`{{ $json.lastname }}`

**Expect** output[0].json contains:
- A `customer` object with `id` (number), `email` ("jane@example.com"), `firstname` ("Jane"), `lastname` ("Doe")
- A `customerGroupId` field (number, typically 1 for default)
- A `websiteId` field (number)

### Test: getAll customers with limit

**Given** input items:

```json
[{}]
```

**Parameters:** resource=`customer`, operation=`getAll`, returnAll=`false`, limit=`5`

**Expect** output[0] contains at most 5 items, each with a `customer`-shaped JSON payload containing at minimum `id`, `email`, `firstname`, `lastname`.

### Test: cancel an order

**Given** input items:

```json
[{
  "json": { "orderId": "000000001" }
}]
```

**Parameters:** resource=`order`, operation=`cancel`, orderId=`{{ $json.orderId }}`

**Expect** output[0].json passes through the input item unchanged. No error is thrown. (The call to `POST /V1/orders/{id}/cancel` returns `true`.)

### Test: create product with required fields

**Given** input items:

```json
[{
  "json": {
    "sku": "test-sku-001",
    "name": "Test Product",
    "attributeSetId": 4,
    "price": 19.99
  }
}]
```

**Parameters:** resource=`product`, operation=`create`, sku=`{{ $json.sku }}`, name=`{{ $json.name }}`, attributeSetId=`{{ $json.attributeSetId }}`, price=`{{ $json.price }}`

**Expect** output[0].json contains:
- `sku` ("test-sku-001")
- `name` ("Test Product")
- `attribute_set_id` (number, the attribute set id used)
- `price` (number, 19.99)
- `type_id` (string, default "simple")

### Test: ship an order

**Given** input items:

```json
[{
  "json": {
    "orderId": "000000001",
    "trackNumber": "1Z999AA10123456784",
    "carrierCode": "ups"
  }
}]
```

**Parameters:** resource=`order`, operation=`ship`, orderId=`{{ $json.orderId }}`, items=[], tracks[0].trackNumber=`{{ $json.trackNumber }}`, tracks[0].carrierCode=`{{ $json.carrierCode }}`, tracks[0].title="UPS Ground", notify=`false`

**Expect** output[0].json contains a shipment object with `entity_id`, `order_id`, `tracks[]` (at least one track with the specified number and carrier code).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | Documented | Confirmed in public n8n docs page |
| Credential shape | Documented | Host + bearer token from Adobe Commerce admin integration |
| Parameter names at high level | Inferred from corpus | Parameter names (sku, customerId, orderId, email, firstname, lastname, attributeSetId, price, returnAll, limit) match Magento REST API field names; exact additionalFields sub-structure is API-driven |
| Additional field sub-structures | Inferred | Nested fields (additionalFields, updateFields, tracks, items) follow Magento REST API shapes — the exact union of all sub-options is API-reflectable |
| API version | Documented | Adobe Commerce REST API v1 (Magento 2) at `{host}/rest/V1/` |
| Error response shapes | Inferred | Standard REST error envelope with `message` and optional `trace` |
| Pagination | Inferred | Uses Adobe Commerce search API with searchCriteria[pageSize] and searchCriteria[currentPage] |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/magento2.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

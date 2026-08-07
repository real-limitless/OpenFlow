---
type: n8n-nodes-base.unleashedSoftware
displayName: Unleashed Software
category: Sales
versions: [1]
priority: low
status: specced
---

# Unleashed Software

Read-only data retrieval node for the Unleashed Software inventory management platform. Provides access to sales orders and stock-on-hand data via the Unleashed REST API.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.unleashedsoftware/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/unleashedsoftware/ | Public docs only |
| https://apidocs.unleashedsoftware.com/ | Public docs only |
| https://apidocs.unleashedsoftware.com/SalesOrders | Public docs only |
| https://apidocs.unleashedsoftware.com/StockOnHand | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.unleashedSoftware`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `unleashedSoftwareApi` (API ID + API Key, HMAC-SHA1 signed requests to `https://api.unleashedsoftware.com/`)

## Parameters

The node uses a resource + operation pattern with two read-only resources and no write operations.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `salesOrder` | yes | — | `salesOrder` or `stockOnHand` |
| operation | options | `getAll` | yes | depends on resource | See below |
| returnAll | boolean | `false` | no | operation=`getAll` | Pagination toggle |
| limit | number | 100 | no | operation=`getAll` + returnAll=`false` | Max 1000 |
| productId | string | `""` | no | resource=`stockOnHand`, operation=`get` | Product GUID for single lookup |
| filters | collection | `{}` | no | operation=`getAll` | Per-resource filter set |

### Sales Order filters (operation = `getAll`)

| name | type | notes |
|------|------|-------|
| customerId | string | GUID or comma-separated GUIDs |
| customerCode | string | Prefix match on customer code |
| endDate | dateTime | Orders before this date (UTC) |
| modifiedSince | dateTime | Orders modified after this UTC date |
| orderNumber | string | Single order lookup; overrides all other filters |
| orderStatus | multiOptions | Backordered, Completed, Deleted, Parked, Placed. Default excludes Deleted. |
| startDate | dateTime | Orders after this date (UTC) |

### Stock On Hand filters (operation = `getAll`)

| name | type | notes |
|------|------|-------|
| asAtDate | dateTime | Snapshot for a specific date |
| IsAssembled | boolean | Include quantity that can be assembled from auto-assembly BOMs |
| modifiedSince | dateTime | Values modified after this date |
| orderBy | string | Column name to sort by (default: productCode) |
| productId | string | GUID or comma-separated GUIDs |
| warehouseCode | string | Filter by warehouse code |
| warehouseName | string | Filter by warehouse name |

## Runtime behavior

### Input

Each input item is processed independently. The node sends an HTTP request to the Unleashed API for each item.

### Output

- **Sales Order — getAll:** Returns a `Pagination` wrapper containing an `Items` array of sales order objects. Each order includes nested `Customer`, `Warehouse`, `Currency`, `Tax`, `SalesOrderLines` (with nested `Product`), and optional `DeliveryContact`. Also includes financial fields (SubTotal, TaxTotal, Total, BCSubTotal, etc.).
- **Sales Order — get:** Not exposed (only getAll is available in this node). Single order retrieval is done via the `orderNumber` filter which overrides pagination.
- **Stock On Hand — get:** Returns a single stock-on-hand object for the given `productId` GUID, containing QtyOnHand, AvailableQty, AllocatedQty, OnPurchase, AvgCost, TotalCost, and product metadata.
- **Stock On Hand — getAll:** Returns a `Pagination` wrapper with an `Items` array of stock-on-hand records.

### Errors

- API errors (HTTP 4xx/5xx) should throw with the API response body or status text.
- Invalid GUIDs or missing credentials should throw with a descriptive message.
- `continueOnFail` is supported — when enabled, errored items produce empty results.
- The Unleashed API does not support partial updates; this node is read-only so this constraint does not apply.

### Expressions

All string, dateTime, and number parameters accept expression strings.

## Acceptance tests

### Test: Get all sales orders (paginated)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "salesOrder",
  "operation": "getAll",
  "returnAll": false,
  "limit": 50,
  "filters": {}
}
```

**Expect** output[0] to contain an array `json.Items` of sales order objects, each with `OrderNumber`, `OrderStatus`, `Customer`, `SalesOrderLines`, and financial fields.

### Test: Get all sales orders with status filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "salesOrder",
  "operation": "getAll",
  "returnAll": true,
  "filters": {
    "orderStatus": ["Placed", "Backordered"]
  }
}
```

**Expect** output[0] to contain only orders with `OrderStatus` values matching Placed or Backordered.

### Test: Get single stock on hand by product ID

**Given** input items:
```json
[{ "json": { "productId": "7fc624f7-738a-4e95-aed1-758662372899" } }]
```

**Parameters:**
```json
{
  "resource": "stockOnHand",
  "operation": "get",
  "productId": "={{ $json.productId }}"
}
```

**Expect** output[0] to contain a single object with `ProductCode`, `QtyOnHand`, `AvailableQty`, and `AvgCost`.

### Test: Get all stock on hand with warehouse filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "stockOnHand",
  "operation": "getAll",
  "returnAll": true,
  "filters": {
    "warehouseCode": "MAIN"
  }
}
```

**Expect** output[0] to contain stock-on-hand records all scoped to warehouse code "MAIN".

### Test: Invalid credentials returns error (continueOnFail)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "salesOrder",
  "operation": "getAll",
  "returnAll": false,
  "limit": 1,
  "continueOnFail": true
}
```

**Expect** an error is caught and output[0] contains an empty or error-annotated item instead of propagating the exception.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation structure | Public docs + corpus | Confirmed: salesOrder (getAll), stockOnHand (get/getAll) |
| Sales order filters | Public API docs | Fully documented by Unleashed API docs |
| Stock on hand filters | Public API docs | Fully documented by Unleashed API docs |
| Credential shape | Public n8n docs | API ID + API Key via HMAC-SHA1 auth |
| Pagination model | Public API docs | Page-based (pageSize, pageNumber), default 200 items/page |
| Response shape (sales order) | Public API docs | Pagination wrapper + Items array |
| Response shape (stock on hand) | Public API docs | Pagination wrapper + Items array |
| Binary output support | Inferred | Not present: no binary data operations |
| Usable as AI tool | Inferred | Not indicated: no tool alias, no $fromAI() support |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/unleashedSoftware.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

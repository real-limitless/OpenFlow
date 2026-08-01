---
type: n8n-nodes-base.quickbooks
displayName: QuickBooks Online
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# QuickBooks Online

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbooks.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/quickbooks.md | Public docs only |
| https://developer.intuit.com/app/developer/qbo/docs/develop | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.quickbooks`
- **Aliases:** none
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** QuickBooks OAuth2 (Client ID, Client Secret, Environment: Production or Sandbox)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `invoice` | yes | always | The QuickBooks Online entity to operate on: `bill`, `customer`, `employee`, `estimate`, `invoice`, `item`, `payment`, `purchase`, `transaction`, `vendor` |
| operation | fixed | `create` | yes | always | Action to perform. Varies per resource (see Runtime behavior). |
| id | string | — | conditional | `operation=get\|update\|delete\|send\|void` | The QuickBooks `Id` of the target entity. |
| queryFilter | string | — | no | `operation=getAll` | Optional QBO query string (e.g. `"WHERE Active = true"`). Applied as a filter parameter to list endpoints. |
| additionalFields | collection | — | no | `operation=create\|update` | Resource-specific fields to include in the request body (e.g. for Invoice: `DocNumber`, `DueDate`, `Line` array entries, `CustomerRef`). The executor maps these to the Intuit QBO API JSON payload. |
| updateFields | collection | — | no | `operation=update` | Fields to modify on an existing resource. Requires `SyncToken` from the current resource state to prevent concurrent-modification conflicts. |

**Parameter design rationale:**

- QBO resources have large, deeply nested schemas defined by Intuit. The node exposes them through a single `additionalFields` / `updateFields` collection rather than flattening every field, keeping the parameter surface manageable while supporting all QBO properties.
- Load-option methods (populated at design time via QBO queries) provide dropdowns for `CustomerRef`, `ItemRef`, `VendorRef`, `TaxCodeRef`, `TermRef`, `DepartmentRef`, and other reference fields.

## Runtime behavior

### Input

The node consumes one item from `main[0]`. For create and update operations, input item JSON may supply field values used in the QBO request body via expressions. For get/delete/send/void operations, the entity `Id` must be supplied (either as a literal parameter or resolved from input item expressions).

### Output

A successful operation emits one output item on `main[0]` containing the QBO API response for the affected entity:

- **Create:** returns the newly created entity with its assigned `Id` and `SyncToken`.
- **Get:** returns the full entity representation.
- **Get All:** returns an array of matching entities under a top-level key (Intuit convention: `QueryResponse.{Resource}`). The node flattens this so each entity becomes one output item.
- **Update:** returns the updated entity with a new `SyncToken`.
- **Delete:** returns empty body or a confirmation object (`{ "status": "Deleted" }`).
- **Send:** returns the sent entity (Intuit marks `EmailStatus`).
- **Void:** returns the voided entity.

No binary output is produced.

### Errors

- Missing required parameter (e.g. `id` for get/delete) fails validation before the API call.
- QBO API errors (HTTP 4xx/5xx) surface the Intuit `Fault` object as the error payload, including `Error` array with `Message`, `Detail`, and `code`.
- With `continueOnFail=true`, a failed input produces an error item on the output branch instead of aborting the execution.

### Expressions

The `id`, `queryFilter`, `additionalFields`, and `updateFields` parameters accept expression strings. Load-option dropdowns (`getCustomers`, `getItems`, `getVendors`, etc.) are resolved at design time.

## Acceptance tests

### Test: Create an invoice

**Given** input items:
```json
[{
  "json": {
    "customerName": "Acme Corp"
  }
}]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "create",
  "additionalFields": {
    "CustomerRef": "={{ $json.customerName }}",
    "Line": [
      { "DetailType": "SalesItemLineDetail", "Amount": 100.00, "Description": "Consulting" }
    ]
  }
}
```

**Expect** output[0] contains an invoice object with `Id` and `SyncToken` assigned, and `CustomerRef.name` matching "Acme Corp".

### Test: Get all customers with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "customer",
  "operation": "getAll",
  "queryFilter": "WHERE Active = true MAXRESULTS 10"
}
```

**Expect** output[0] contains one customer item per active customer (up to 10), each with `Id`, `DisplayName`, and other standard customer fields.

### Test: Update a bill

**Given** input items:
```json
[{ "json": { "billId": "123", "syncToken": "2" } }]
```

**Parameters:**
```json
{
  "resource": "bill",
  "operation": "update",
  "id": "={{ $json.billId }}",
  "updateFields": {
    "SyncToken": "={{ $json.syncToken }}",
    "TotalAmt": 250.00
  }
}
```

**Expect** output[0] contains the updated bill with `TotalAmt` of 250.00 and an incremented `SyncToken`.

### Test: Delete an estimate

**Given** input items:
```json
[{ "json": { "estimateId": "456" } }]
```

**Parameters:**
```json
{
  "resource": "estimate",
  "operation": "delete",
  "id": "={{ $json.estimateId }}"
}
```

**Expect** output[0] contains a deletion confirmation for estimate `456`.

### Test: Missing ID on get operation

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "invoice",
  "operation": "get",
  "id": ""
}
```

**Expect** node fails validation with an error indicating that `id` is required for the `get` operation.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Full list confirmed from public n8n docs and Intuit API reference. |
| Credential model | documented | OAuth2 with Client ID, Client Secret, Environment (Production/Sandbox). |
| Parameter naming and exact field schemas | inferred | QBO entity schemas are defined by Intuit; the node uses `additionalFields` / `updateFields` collections. Exact option enums for sub-field dropdowns are implementation details. |
| Load-option endpoint semantics | inferred | `getCustomers`, `getItems`, `getVendors`, etc. exist as load options; exact QBO query behind each is not publicly documented. |
| Error response mapping | documented | Intuit `Fault` structure is part of the public QBO API contract. |
| Pagination strategy for getAll | partially documented | `maxResults` and `startPosition` are standard QBO query parameters; the spec describes flattening at the item level. |
| Version differences | inferred | Node descriptor shows a single version 1.0. |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.quickbooks.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
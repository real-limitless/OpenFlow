---
type: n8n-nodes-base.activeCampaign
displayName: ActiveCampaign
category: Marketing
versions: [1]
priority: medium
status: specced
---

# ActiveCampaign

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.activecampaign/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/activecampaign/ | Public docs only |
| https://developers.activecampaign.com/reference/overview | External API reference |
| https://www.activecampaign.com/api/overview.php | External API reference (v1 legacy) |

## Wire format

- **Type string:** `n8n-nodes-base.activeCampaign`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `activeCampaignApi` (required) — API URL + API Key authentication

## Parameters

The node is organized around 10 resources, each with one or more operations.

### Resource selection

| Resource | Label | Operations |
|----------|-------|------------|
| `account` | Account | create, delete, get, getAll, update |
| `accountContact` | Account Contact | create, delete, update |
| `contact` | Contact | create, delete, get, getAll, update |
| `contactList` | Contact List | add, remove |
| `contactTag` | Contact Tag | add, remove |
| `connection` | Connection | create, delete, get, getAll, update |
| `deal` | Deal | create, delete, get, getAll, update, createNote, updateNote |
| `ecommerceOrder` | E-commerce Order | create, delete, get, getAll, update |
| `ecommerceCustomer` | E-Commerce Customer | create, delete, get, getAll, update |
| `ecommerceOrderProducts` | E-commerce Order Products | getAll, get, getByOrderId |
| `list` | List | getAll |
| `tag` | Tag | create, delete, get, getAll, update |

### Resource-specific parameters

Each resource/operation combination accepts parameters that map to the corresponding ActiveCampaign API v3 endpoint's request body and query string fields. The following describes the required and typical optional parameters at an abstract level.

#### Account

| operation | required params | typical optional params |
|-----------|----------------|------------------------|
| create | `name` | `accountUrl`, fields for the custom account fields |
| delete | `accountId` | — |
| get | `accountId` | — |
| getAll | — | `limit`, `offset`, `filters` (search, name, etc.) |
| update | `accountId` | `name`, `accountUrl`, custom fields |

#### Account Contact

| operation | required params |
|-----------|----------------|
| create | `contactId`, `accountId`, `jobTitle` |
| delete | `accountContactId` |
| update | `accountContactId`, `jobTitle` |

#### Contact

| operation | required params | typical optional params |
|-----------|----------------|------------------------|
| create | `email` | `firstName`, `lastName`, `phone`, `fieldValues` (array of { field, value }), custom fields |
| delete | `contactId` | — |
| get | `contactId` | — |
| getAll | — | `limit`, `offset`, `filters` (search, email, etc.) |
| update | `contactId` | `email`, `firstName`, `lastName`, `phone`, `fieldValues` |

#### Contact List

| operation | required params |
|-----------|----------------|
| add | `contactId`, `listId` |
| remove | `contactId`, `listId` |

#### Contact Tag

| operation | required params |
|-----------|----------------|
| add | `contactId`, `tagId` |
| remove | `contactId`, `tagId` |

#### Connection

| operation | required params | typical optional params |
|-----------|----------------|------------------------|
| create | `service`, `externalid`, `externalAccountId`, `logoUrl`, `linkUrl` | — |
| delete | `connectionId` | — |
| get | `connectionId` | — |
| getAll | — | `limit`, `offset` |
| update | `connectionId` | `service`, `externalid`, `externalAccountId`, `logoUrl`, `linkUrl` |

#### Deal

| operation | required params | typical optional params |
|-----------|----------------|------------------------|
| create | `title`, `contactId`, `value`, `currency`, `pipelineId`, `stageId`, `owner` | `description`, custom deal fields |
| delete | `dealId` | — |
| get | `dealId` | — |
| getAll | — | `limit`, `offset`, `filters` (search, stage, pipeline, owner, status) |
| update | `dealId` | `title`, `value`, `currency`, `stageId`, `owner`, `description`, custom fields |
| createNote | `dealId`, `note` | — |
| updateNote | `dealNoteId`, `note` | — |

#### E-commerce Order

| operation | required params | typical optional params |
|-----------|----------------|------------------------|
| create | `source`, `email`, `total`, `currency`, `orderDate`, `orderProducts` (array of product objects) | `shippingAmount`, `taxAmount`, `discountAmount`, `notes`, connection fields |
| delete | `orderId` | — |
| get | `orderId` | — |
| getAll | — | `limit`, `offset`, `filters` |
| update | `orderId` | `total`, `currency`, `orderProducts`, `shippingAmount`, `taxAmount`, `discountAmount`, `notes` |

#### E-Commerce Customer

| operation | required params | typical optional params |
|-----------|----------------|------------------------|
| create | `email`, `connectionId` | `firstName`, `lastName`, custom fields |
| delete | `customerId` | — |
| get | `customerId` | — |
| getAll | — | `limit`, `offset` |
| update | `customerId` | `email`, `firstName`, `lastName`, custom fields |

#### E-commerce Order Products

| operation | required params |
|-----------|----------------|
| getAll | — |
| get | `productId` |
| getByOrderId | `orderId` |

#### List

| operation | params |
|-----------|--------|
| getAll | `limit`, `offset` |

#### Tag

| operation | required params | typical optional params |
|-----------|----------------|------------------------|
| create | `name`, `tagType` (contact/template) | `description` |
| delete | `tagId` | — |
| get | `tagId` | — |
| getAll | — | `limit`, `offset`, `filters` (search, name) |
| update | `tagId` | `name`, `tagType`, `description` |

### Common options

- **`limit`**: Maximum number of results per page for list/getAll operations. Default varies by endpoint (typically 20–100). Only available when not using `returnAll`.
- **`returnAll`**: Boolean flag on list/getAll operations. When true, the executor fetches all pages and merges results into a single array. When false, the `limit` parameter controls page size.

## Runtime behavior

### Input

The node accepts items on the `main` input. Each input item can provide values for parameters via expressions. The node processes items sequentially, making one API call per item.

### Output

Each operation produces output on `main` output 0. The output shape mirrors the API response body from the ActiveCampaign v3 REST API:

- **Create/Update operations**: Returns the created or updated resource object nested under the resource key (e.g., `{ contact: { id, email, ... } }`).
- **Get operation**: Returns the single resource object nested under the resource key.
- **GetAll/List operations**: Returns an array of resource objects nested under the plural resource key (e.g., `{ contacts: [...] }`) plus pagination metadata (`meta: { total, count, offset, limit }`). When `returnAll = true`, pagination metadata reflects the full merged result set.
- **Delete operations**: Returns a confirmation object with no meaningful payload.
- **Contact List add/remove**: Returns the association result or confirmation.
- **Contact Tag add/remove**: Returns the association result or confirmation.
- **Deal createNote/updateNote**: Returns the note object.

The node passes the input item's `json` data through and merges the API response into it (or replaces it, depending on the `options.sendData` preference — default is to merge).

### Errors

- **Authentication errors** (invalid API URL or API key): Thrown as `NodeApiError`; not caught by `continueOnFail`.
- **Resource not found (HTTP 404)**: Thrown as `NodeApiError`.
- **Validation errors (HTTP 422)**: Thrown with the API's error message; surfaced as `NodeApiError`.
- **Rate limiting (HTTP 429)**: Thrown; implementers should consider retry logic with backoff.
- **`continueOnFail` behavior**: When enabled and an error occurs, the failed item emits an output item with `{ error: <message>, ...originalJsonFields }` instead of throwing. Subsequent items continue processing normally.

### Expressions

All string, numeric, and boolean parameters accept expressions. Arrays (e.g., `fieldValues`, `orderProducts`) accept expressions resolving to arrays. Resource and operation selection fields accept expressions.

## Acceptance tests

### Test: Contact — create a contact

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "contact",
  "operation": "create",
  "email": "test@example.com",
  "firstName": "Jane",
  "lastName": "Doe"
}
```
**Expect** output[0] contains a `contact` object with `id` (positive integer), `email` = "test@example.com", `firstName` = "Jane", `lastName` = "Doe".

### Test: Contact — update a contact

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "contact",
  "operation": "update",
  "contactId": 1,
  "lastName": "Smith"
}
```
**Expect** output[0] contains a `contact` object with `id` = 1 and `lastName` = "Smith".

### Test: Contact — get all contacts (paginated)

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters:**
```json
{
  "resource": "contact",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```
**Expect** output[0] contains a `contacts` array (length ≤ 10) and a `meta` object with `total`, `count` (≤ 10), `offset`, `limit` fields.

### Test: Deal — create a deal with a note

**Given** input items:
```json
[{ "json": {} }]
```
**Parameters (first execution):**
```json
{
  "resource": "deal",
  "operation": "create",
  "title": "Test Deal",
  "contactId": 1,
  "value": 1000,
  "currency": "usd"
}
```
**Parameters (second execution on same item):**
```json
{
  "resource": "deal",
  "operation": "createNote",
  "dealId": "={{ $json.deal.id }}",
  "note": "Follow up on Q1 proposal"
}
```
**Expect** first execution yields a `deal` object with `id`. Second execution yields a note object with `note` = "Follow up on Q1 proposal" linked to the created deal.

### Test: Continue on fail

**Given** input items:
```json
[{ "json": { "id": 99999 } }, { "json": {} }]
```
**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "={{ $json.id }}"
}
```
**Node config:** `continueOnFail = true`
**Expect** output[0] contains two items: first has `{ error: <message> }`, second contains a `contact` object (for the valid contact ID).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list (10 resources, 40+ operations) | documented | Public n8n docs list all resources and operations |
| API v3 vs v1 | external | n8n node targets ActiveCampaign API v3 (REST); v1 legacy API also exists but is not wrapped by this node |
| Credential format (API URL + API Key) | documented | Public n8n credentials doc; ActiveCampaign developer settings |
| Per-operation required/optional params | inferred | Abstracted from CORPUS_DIR; specific parameter names vary and should map to API v3 endpoint fields |
| Pagination via `returnAll` + `limit` | inferred | Standard n8n pagination pattern; ActiveCampaign API v3 uses offset/limit pagination with `meta` block |
| Exact output field names and nesting | inferred | Output maps to API v3 response shapes; specific field names will differ by endpoint |
| Tool mode (`usableAsTool`) | documented | Node JSON declares `usableAsTool: true`; standard OpenFlow tool semantics apply |
| Trigger node (separate type) | documented | `n8n-nodes-base.activeCampaignTrigger` is a separate trigger node with a single "New ActiveCampaign event" event; not covered in this spec |

## OpenFlow mapping

- **Definition group:** `core` (app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.activeCampaign.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

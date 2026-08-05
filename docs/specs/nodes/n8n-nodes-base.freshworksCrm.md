---
type: n8n-nodes-base.freshworksCrm
displayName: Freshworks CRM
category: Marketing & Sales
versions: [1]
priority: medium
status: specced
---

# Freshworks CRM

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.freshworkscrm.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/freshworkscrm.md | Public docs only |
| https://developers.freshworks.com/crm/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.freshworksCrm`
- **Aliases:** `Freshdesk`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `freshworksCrmApi` (API key + domain subdomain)

## Parameters

The node exposes a resource + operation selector followed by resource-specific fields. At the highest level:

### Resource selection

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `account` | yes | — | One of: `account`, `appointment`, `contact`, `deal`, `note`, `salesActivity`, `task`, `search` |

### Operation selection (per resource)

| resource | allowed operations |
|----------|-------------------|
| account, appointment, contact, deal | `create`, `delete`, `get`, `getAll`, `update` |
| note | `create`, `delete`, `update` (no get/getAll) |
| salesActivity | `get`, `getAll` (read-only) |
| task | `create`, `delete`, `get`, `getAll`, `update` |
| search | `search` |

### Common per-resource parameters

- **`{resource}Id`** (string, required for `get`, `delete`, `update`): the persistent ID of the entity.
- **`view`** (resource-specific dynamic dropdown, used for `getAll`): a pre-saved CRM view that determines filter/sort. Populated from the `GET /api/{resource}/filters` endpoint.
- **`limit`** (number, default 25, used in `getAll`): maximum items per page.
- **`{resource}Fields`** (collection of key-value pairs, used for `create` and `update`): the entity attributes to set. Keys and expected value types are determined by the CRM field schema for that entity. Common fields for each resource correspond to the Freshworks CRM REST API attribute schema (e.g. `first_name`, `last_name`, `email`, `mobile_number` for contacts; `name`, `website`, `phone` for accounts; `deal_name`, `amount`, `deal_stage_id` for deals; `title`, `due_date`, `owner_id` for tasks; `title`, `from_date`, `end_date` for appointments; `description` for notes; `sales_activity_type_id`, `start_date` for sales activities).
- **`search` parameters** (for the `search` resource):
  - **`searchTerm`** (string, required): free-text query.
  - **`entities`** (multi-select): entity types to scope the search to (e.g. `contact`, `deal`, `account`).

## Runtime behavior

### Input

This node consumes items from the `main` input but does not require any specific JSON properties on incoming items — all operation parameters are configured statically or via expressions.

### Output

Each operation emits one output item per API response record.

- **`create` / `update`**: emits the full created/updated entity object (under the resource key, e.g. `{ contact: { ... } }` or `{ deal: { ... } }`).
- **`get`**: emits the single entity object.
- **`getAll`**: emits an array of entity objects in the output JSON. The pagination meta (`{ total: number }`) is discarded.
- **`delete`**: emits an empty object `{}` on success.
- **`search`**: emits a flat list of result objects across the matched entity types, each with an `_type` discriminator field indicating the source entity type.

### Errors

- The Freshworks CRM REST API returns HTTP 400 (client/validation error), 401 (authentication failure), 403 (access denied), 404 (not found), 429 (rate-limited), or 500 (server error).
- The node throws an `NodeOperationError` with the error message from the API response body for any non-2xx response.
- If `continueOnFail` is set, the node emits the error as output instead of throwing.
- Rate-limit errors (429) should surface the Retry-After header timing if available.

### Expressions

All parameter values accept expression strings. The `{resource}Fields` collection values are particularly well-suited for dynamic input from upstream nodes.

### Dynamic option loading (resource dropdowns)

The node loads the following option lists at runtime via API calls to the Freshworks CRM instance:
- CRM views (filters) per entity type for the `getAll` operation
- Selector resources for lookup in field values: users (owners), territories, deal stages, currencies, lead sources, industry types, business types, contact statuses, sales activity types, sales activity outcomes

## Acceptance tests

### Test: create a contact

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "contactFields": {
    "first_name": "Alice",
    "last_name": "Smith",
    "email": "alice@example.com",
    "mobile_number": "+1-555-0100"
  }
}
```

**Expect** output[0] to contain a `contact` object with `id` (number), `first_name`, `last_name`, `email`, `mobile_number` matching the input, and a non-null `display_name`.

### Test: get all accounts

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "account",
  "operation": "getAll",
  "view": 3,
  "limit": 10
}
```

**Expect** output[0] to be an array of account objects, each containing at least `id` and `name`.

### Test: search across entities

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "search",
  "operation": "search",
  "searchTerm": "Acme Corp",
  "entities": ["contact", "deal", "account"]
}
```

**Expect** output[0] to be an array of result objects, each containing at least `id`, `_type` (one of the scoped entity types), and entity-specific fields.

### Test: delete a deal

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "deal",
  "operation": "delete",
  "dealId": 42
}
```

**Expect** output[0] to be `{}` and the node to have issued a DELETE request to `/api/deals/42`.

### Test: update a note

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "note",
  "operation": "update",
  "noteId": 7,
  "noteFields": {
    "description": "Updated follow-up summary"
  }
}
```

**Expect** output[0] to contain a `note` object with `id` of 7 and the updated `description`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource + operation list | documented | Confirmed in public n8n docs page |
| Credential shape | documented | API key + domain via public credentials page |
| REST API endpoints | documented | Public Freshworks CRM API docs cover all entity CRUD and search |
| Parameter details per resource | inferred | Exact field names and nesting inferred from API schema; the node wraps REST resources generically |
| Dynamic option loading | inferred | Type declarations confirm dynamic lists loaded from selector/configuration endpoints |
| Pagination for getAll | inferred | Page-based pagination (page param, 25 default) documented in Freshworks API |
| Search response shape | inferred | Flat results with entity-type discriminator from Freshworks API search docs |

## OpenFlow mapping

- **Definition group:** `sales` (or `marketing`)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.freshworksCrm.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

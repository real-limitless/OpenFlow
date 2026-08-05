---
type: n8n-nodes-base.drift
displayName: Drift
category: Sales
versions: [1]
priority: medium
status: specced
---

# Drift

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.drift.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/drift.md | Public docs only |
| https://devdocs.drift.com/docs/using-drift-apis | Public docs only |
| https://devdocs.drift.com/docs/contact-model | Public docs only |
| https://devdocs.drift.com/docs/creating-a-contact | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.drift`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `driftApi` (personal access token) or `driftOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | contact | required | — | Fixed to `contact` (single resource) |
| operation | string | create | required | — | One of: create, delete, get, getAll, update |
| contactId | string | — | conditional | required for delete, get, update | Numeric Drift contact ID |
| email | string | — | conditional | required for create | Contact email; Drift rejects duplicate emails unless externalId differs |
| additionalFields | object | {} | optional | shown for create, update | Map of additional contact attributes (name, phone, custom attributes, externalId, etc.) sent under Drift's `attributes` envelope |
| simplify | boolean | false | optional | shown for getAll | When true, return only core contact fields instead of the raw API envelope |

### `additionalFields` sub-parameters (create / update)

| name | type | notes |
|------|------|-------|
| name | string | Contact display name |
| phone | string | Contact phone number |
| externalId | string | External system identifier; prevents duplicate contact records with same email |
| customAttributes | object | Free-form key/value map of custom Drift attributes — any key with a non-null value |

## Runtime behavior

### External API contract

The node wraps the Drift REST API at `https://driftapi.com/contacts/*`:

- **Create:** `POST /contacts` — sends `{ "attributes": { email, ... } }`. Requires `email`. Returns `{ "data": { id, createdAt, attributes } }`.
- **Get:** `GET /contacts/{contactId}` — returns the full contact record.
- **Update:** `PATCH /contacts/{contactId}` — sends partial `{ "attributes": ... }`.
- **Delete:** `DELETE /contacts/{contactId}` — returns 204 on success.
- **Get All:** `GET /contacts` — returns a paginated list of contacts. The Drift API returns `{ "data": [...], "meta": { "total_count": N } }`.

### Input processing

Each input item is processed independently. If no item matches the required parameter conditions, the node throws a clear validation error.

### Output shape

- **Create / Get / Update:** The raw `data` payload from the Drift API response, i.e. `{ id, createdAt, attributes: { email, name, phone, externalId, events, socialProfiles, ...custom } }`.
- **Delete:** The deleted `contactId` echoed back under `{ id }`.
- **Get All (simplify=false):** The raw `{ data: [...], meta: { total_count } }` envelope from the API.
- **Get All (simplify=true):** Flat array of contact records from `data`.

### Errors

- HTTP 4xx/5xx responses from the Drift API are surfaced as node errors with the status code and response body.
- `continueOnFail` mode: when enabled, failed items produce the error object wrapped in `{ json: { error: { message, code } } }` on the output instead of halting execution.

### Expressions

All parameters support n8n expression syntax.

## Acceptance tests

### Test: create contact

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "create",
  "email": "alice@example.com",
  "additionalFields": {
    "name": "Alice",
    "externalId": "ext-001"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 15811408544,
    "createdAt": 1664572604326,
    "attributes": {
      "email": "alice@example.com",
      "name": "Alice",
      "externalId": "ext-001"
    }
  }
}]
```

### Test: get contact

**Given** input items:
```json
[{ "json": { "myId": 15811408544 } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "get",
  "contactId": "={{ $json.myId }}"
}
```

**Expect** output[0] includes the contact ID:
```json
[{
  "json": {
    "id": 15811408544,
    "attributes": {}
  }
}]
```

### Test: delete contact

**Given** input items:
```json
[{ "json": { "contactId": 15811408544 } }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "delete",
  "contactId": "={{ $json.contactId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": { "id": 15811408544 }
}]
```

### Test: list contacts (simplified)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "getAll",
  "simplify": true
}
```

**Expect** output[0] is a flat array of contacts:
```json
[{
  "json": {
    "data": [{ "id": 1, "attributes": {} }],
    "meta": { "total_count": 1 }
  }
}]
```

### Test: missing required parameter throws

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "contact",
  "operation": "create"
}
```

**Expect** node throws a validation error: email is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list | documented | Confirmed via public n8n docs (create, delete, get, getAll, update contact + custom attributes) |
| Credential types | documented | Drift API (PAT) + Drift OAuth2 — confirmed in public docs |
| API base URL | documented | `https://driftapi.com/contacts` — from Drift developer docs |
| Response shapes | documented | Drift devdocs show `{ data: { id, createdAt, attributes } }` for single contact operations |
| Pagination details | inferred | Drift API supports pagination; exact query parameters (cursor/limit) not confirmed |
| Custom attribute operations | documented | n8n docs list "Get custom attributes" as a separate operation; likely a distinct sub-operation of the Contact resource |
| exact field naming | inferred | Parameters are abstracted at the functional level; original node may use different internal keys for `additionalFields` |

## OpenFlow mapping

- **Definition group:** `Sales`
- **Executor file:** `src/lib/engine/executors/drift.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.strapi
displayName: Strapi
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Strapi

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.strapi.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/strapi.md | Public docs only |
| https://docs.strapi.io/dev-docs/api/rest | External service docs |

## Wire format

- **Type string:** `n8n-nodes-base.strapi`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Strapi — supports two authentication modes:
  - **API Token** (admin-level): requires an API Token and the Strapi server URL. Sends `Authorization: Bearer <token>`.
  - **API User Account** (role-based): requires Email + Password (end-user credentials, not admin) and the Strapi server URL. Authenticates by POSTing to `/api/auth/local` and using the returned JWT bearer token for subsequent requests.
  - Both modes include an **API Version** selector (v3 or v4) which affects the base path (`/<api-version>/` vs `/api/`).

## Parameters

### Resource: Entry

The only resource is **Entry**, which corresponds to collection-type documents in a Strapi project. The node operates against the Strapi REST API's auto-generated content endpoints.

#### Operation: Create

Creates a new document in the selected collection type.

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | dropdown (resource locator) | yes | Select or enter the plural API ID (e.g. `articles`) of the target collection type. Loaded dynamically from the Strapi instance. |
| Data to Send | fixedCollection (mapped fields) | yes | Field-value pairs defining the document body. Sent as the `data` object per the Strapi REST API contract (`POST /api/:pluralApiId` with `{ "data": { ... } }`). |
| Options | object | no | Additional Strapi query parameters |

#### Operation: Delete

Deletes a document by its documentId.

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | dropdown (resource locator) | yes | Plural API ID of the target collection type. |
| Document ID | string | yes | The `documentId` (v5) or `id` (v4) of the entry to delete. |
| Options | object | no | Additional query parameters. |

#### Operation: Get

Retrieves a single document by its documentId.

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | dropdown (resource locator) | yes | Plural API ID of the target collection type. |
| Document ID | string | yes | The `documentId` (v5) or `id` (v4) of the entry to fetch. |
| Options | object | no | Supports `populate` (relations/components to include), `fields` (specific attribute selection). |

#### Operation: Get Many

Retrieves a paginated list of documents from a collection type.

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | dropdown (resource locator) | yes | Plural API ID of the target collection type. |
| Return All | boolean | no | If true, paginate through all results; otherwise respect page size. |
| Limit | number | no | Max items per page (Strapi default: 25, max: 100). |
| Options | object | no | Supports `sort` (field:asc/desc), `filters` (Strapi filter operators), `populate`, `fields`, `publicationFilter` (draft/published relationship), `locale`. |

#### Operation: Update

Updates an existing document by its documentId.

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | dropdown (resource locator) | yes | Plural API ID of the target collection type. |
| Document ID | string | yes | The `documentId` (v5) or `id` (v4) of the entry to update. |
| Data to Send | fixedCollection (mapped fields) | yes | Field-value pairs to update. Sent as `PUT /api/:pluralApiId/:documentId` with `{ "data": { ... } }`. Send `null` to clear a field. |
| Options | object | no | Additional query parameters. |

## Runtime behavior

### Input

Each input item is processed independently. The item's JSON payload is used as the source for expression-bound parameter values (e.g., Content Type, Document ID, field values).

### Output

Each operation emits one output item per API response:

- **Create** returns the created document object under `json.data` (Strapi v5 format: `{ data: { id, documentId, ...fields, createdAt, updatedAt, publishedAt }, meta: {} }`).
- **Delete** returns the deleted document object (same shape as Get).
- **Get** returns the single document object under `json.data`.
- **Get Many** returns an array of documents under `json.data`, with pagination metadata in `json.meta`.
- **Update** returns the updated document object under `json.data`.

When **Return All** is enabled for Get Many, the node internally paginates through all pages and emits a single item containing the complete array.

### Errors

- 4xx/5xx responses from the Strapi API are propagated as thrown errors.
- `continueOnFail` allows the item to be passed through with an `error` property instead of halting execution.
- Authentication failures (invalid token, bad credentials) are surfaced as HTTP 401/403 from the Strapi API.

### Expressions

All string/number parameters accept expression syntax (`={{ }}`). The Content Type selector, Document ID, field values, and options can all be expression-bound.

## Acceptance tests

### Test: create an entry

**Given** a configured Strapi credential targeting a Strapi instance with an `articles` collection type containing `title` (text) and `body` (richtext) fields.

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "create",
  "contentType": "articles",
  "dataToSend": {
    "fields": [
      { "fieldName": "title", "fieldValue": "Hello World" },
      { "fieldName": "body", "fieldValue": "First article body" }
    ]
  }
}
```

**Expect** output[0]:
```json
[
  {
    "json": {
      "data": {
        "id": 1,
        "documentId": "abc123def456",
        "title": "Hello World",
        "body": "First article body",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "publishedAt": "2024-01-01T00:00:00.000Z"
      },
      "meta": {}
    }
  }
]
```

### Test: get many with filtering

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "getMany",
  "contentType": "articles",
  "returnAll": false,
  "limit": 10,
  "options": {
    "sort": "createdAt:desc",
    "filters": {
      "title": {
        "$contains": "Hello"
      }
    }
  }
}
```

**Expect** output[0] contains a `json.data` array with matching entries, and `json.meta.pagination` present.

### Test: update an entry

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "update",
  "contentType": "articles",
  "documentId": "abc123def456",
  "dataToSend": {
    "fields": [
      { "fieldName": "title", "fieldValue": "Updated Title" }
    ]
  }
}
```

**Expect** output[0].json.data.documentId equals `"abc123def456"` and `.json.data.title` equals `"Updated Title"`.

### Test: delete an entry

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "delete",
  "contentType": "articles",
  "documentId": "abc123def456"
}
```

**Expect** output[0].json.data.documentId equals `"abc123def456"` (the deleted document is returned).

### Test: get single entry with populate

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "get",
  "contentType": "articles",
  "documentId": "abc123def456",
  "options": {
    "populate": "author,category"
  }
}
```

**Expect** output[0].json.data includes populated relation objects for `author` and `category`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Entry operations (CRUD) | Public docs (n8n) — explicit | Strapi page lists Create/Delete/Get/Get Many/Update under Entry resource |
| Credential modes | Public docs (n8n) — explicit | API Token and API User Account modes detailed on the credentials page |
| Strapi REST API contract | External (strapi.io) — official | v5 response format (`data` object with `documentId`, no nested `attributes`) vs v4 format (`data.attributes`) |
| Content type resource locator | Inferred from similar nodes | n8n pattern: dynamic dropdown loaded from the Strapi instance listing content types |
| Field mapping (dataToSend) | Inferred from similar nodes | Fixed-collection field mapping is the standard n8n pattern for request bodies |
| Return All / pagination behavior | Inferred from similar nodes | Consistent pattern across n8n CRUD nodes: `strapiApiRequestAllItems` for pagination |
| Options parameters (populate, filters, sort) | External (strapi.io) — documented | Based on Strapi REST API parameters documentation |
| API version (v3 vs v4) | Public docs (n8n) — explicit | Credential-level selector in the n8n Strapi credential |
| Option enums / exact defaults | Not accessed (clean-room) | Not critical for behavioral spec; can be determined during implementation |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/Strapi.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

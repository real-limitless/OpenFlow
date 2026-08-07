---
type: n8n-nodes-base.strapiTool
displayName: Strapi Tool
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Strapi Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.strapi.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/strapi.md | Public docs only |
| https://docs.strapi.io/dev-docs/api/rest | External service docs |

## Wire format

- **Type string:** `n8n-nodes-base.strapiTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** Strapi — two authentication modes sharing the same credential type as the base Strapi node:
  - **API Token** (admin-level): API Token + Strapi server URL. Sends `Authorization: Bearer <token>`.
  - **API User Account** (role-based): Email + Password (end-user credentials, not admin) + Strapi server URL. Authenticates via POST to `/api/auth/local` then uses returned JWT for subsequent requests.
  - Both modes include an **API Version** selector (v3 or v4) which determines the base path.

## Parameters

This is the AI agent **Tool** variant of the base Strapi node. It wraps the same single **Entry** resource with 5 CRUD operations (Create, Delete, Get, Get Many, Update) against the Strapi REST API's auto-generated content-type endpoints. It supports `$fromAI()` dynamic parameter population for AI agents — the AI agent can supply values for Content Type, Entry ID, field columns, and options at runtime.

All operations share a common structure:

| name | type | required | notes |
|------|------|----------|-------|
| Authentication | options | no | `password` (Username & Password) or `token` (API Token). Default: `password`. |
| Resource | options | no | Always `entry`. |
| Operation | options | yes | `create`, `delete`, `get`, `getAll`, `update`. Default: `get`. |

### Operation: Create

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | string | yes | Name/plural API ID of the target Strapi content type (e.g. `articles`). |
| Columns | string | no | Comma-separated list of property names used as columns for the new entry (field names to populate). |

Sends `POST /api/:pluralApiId` with field values derived from the column specification and input item data. The response emits the created document object.

### Operation: Delete

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | string | yes | Plural API ID of the target content type. |
| Entry ID | string | yes | The ID of the entry to delete. |

Sends `DELETE /api/:pluralApiId/:entryId`. Emits the deleted document.

### Operation: Get

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | string | yes | Plural API ID of the target content type. |
| Entry ID | string | yes | The ID of the entry to retrieve. |

Sends `GET /api/:pluralApiId/:entryId`. Emits the single document.

### Operation: Get Many

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | string | yes | Plural API ID of the target content type. |
| Return All | boolean | no | If true, paginate through all results. Default: false. |
| Limit | number | no | Max results to return when Return All is off. Default: 50. |
| Options | collection | no | Additional query parameters for sorting, filtering, and publication state. |

Sends `GET /api/:pluralApiId` with applicable query parameters. Options include:
- **sort** — field name with optional direction suffix (e.g. `name:asc`).
- **where** — JSON filter object following Strapi filter syntax.
- **publicationState** — filter by publication state.

Emits an array of documents with pagination metadata.

### Operation: Update

| name | type | required | notes |
|------|------|----------|-------|
| Content Type | string | yes | Plural API ID of the target content type. |
| Update Key | string | yes | Property name identifying which entry to update. Default: `id`. |
| Columns | string | no | Comma-separated list of property names to update. |

Sends `PUT /api/:pluralApiId/:entryId` with updated field values. Emits the updated document.

## Runtime behavior

### Input

Each input item is processed independently. The item's JSON payload provides source data for expression-bound parameters. When used as an AI Tool, the AI agent populates parameters via `$fromAI()`.

### Output

Each operation emits one output item per API response, consistent with the base Strapi node:
- **Create** returns the created document (flattened data object per Strapi v5 format: `{ data: { id, documentId, ...fields, createdAt, updatedAt, publishedAt }, meta: {} }`).
- **Delete** returns the deleted document.
- **Get** returns the single document under `json.data`.
- **Get Many** returns an array of documents under `json.data`, with pagination in `json.meta`.
- **Update** returns the updated document under `json.data`.

When **Return All** is enabled for Get Many, the executor internally paginates through all pages and emits a single item with the complete array.

### Errors

- 4xx/5xx responses from the Strapi API are propagated as thrown errors.
- `continueOnFail` allows the item to pass through with an `error` property instead of halting.
- Authentication failures (invalid token, bad credentials) surface as HTTP 401/403.

### Expressions

All string/number parameters accept expression syntax (`={{ }}`). As a Tool node, `$fromAI()` is the primary mechanism for parameter population from AI agent context.

## Acceptance tests

### Test: create an entry (via Tool)

**Given** a configured Strapi credential targeting a Strapi instance with an `articles` collection type.

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "create",
  "contentType": "articles",
  "columns": "title,body"
}
```

**Expect** output[0] contains `json.data` with `documentId`, the provided fields, and timestamps.

### Test: get many with sort and where filter

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "getAll",
  "contentType": "articles",
  "returnAll": false,
  "limit": 10,
  "options": {
    "sort": "createdAt:desc",
    "where": "{\"title\":{\"$contains\":\"Hello\"}}"
  }
}
```

**Expect** output[0].json.data is an array and json.meta.pagination is present.

### Test: update an entry

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "update",
  "contentType": "articles",
  "updateKey": "id",
  "columns": "title"
}
```

**Expect** a PUT request is made to `/api/articles/:entryId` and the response contains the updated document.

### Test: get single entry

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "get",
  "contentType": "articles",
  "entryId": "abc123"
}
```

**Expect** output[0].json.data.documentId equals `"abc123"`.

### Test: delete an entry

**Parameters:**
```json
{
  "resource": "entry",
  "operation": "delete",
  "contentType": "articles",
  "entryId": "abc123"
}
```

**Expect** output[0].json.data.documentId equals `"abc123"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool variant of Strapi node | Public docs (n8n) — explicit | Base Strapi node is documented; Tool variant reuses same credentials, resources, and operations |
| CRUD operations | Public docs (n8n) — explicit | 5 operations under Entry resource |
| Credential modes | Public docs (n8n) — explicit | API Token and API User Account modes |
| Strapi REST API contract | External (strapi.io) — official | v5 flattened response format; v4 nested `data.attributes` |
| Content Type as free-text string | Corpus (parameter name/default) | Confirmed: free-text string, not dynamic dropdown (unlike the base node which uses a resource locator) |
| Columns as comma-separated string | Corpus (parameter name/default) | Confirmed: simple string field |
| Update Key parameter | Corpus (parameter name/default) | Default: `id` |
| Options (sort/where/publicationState) | Corpus (option names) | Collection sub-parameters for Get Many |
| Entry ID as free-text string | Corpus (parameter name) | Confirmed for get/delete operations |
| $fromAI() support | Inferred from Tool convention | Standard for all n8n Tool variants |
| Return All / Limit behavior | Inferred from similar nodes | Consistent with n8n pagination convention |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/StrapiTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

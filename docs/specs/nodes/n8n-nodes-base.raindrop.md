---
type: n8n-nodes-base.raindrop
displayName: Raindrop
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Raindrop

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.raindrop/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/raindrop/ | Public docs only |
| https://developer.raindrop.io/ | Public docs only |
| https://developer.raindrop.io/v1/collections | Public docs only |
| https://developer.raindrop.io/v1/raindrops | Public docs only |
| https://developer.raindrop.io/v1/tags | Public docs only |
| https://developer.raindrop.io/v1/user | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.raindrop`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `raindropOAuth2Api` (OAuth2 — requires Client ID + Client Secret)

## Parameters

The node exposes four resource categories, each with a set of operations. Parameter details listed below are at a functional-outcome level; exact UI nesting in the original node may differ.

### Bookmark resource

| Operation | Required params | Optional / additional params | Notes |
|-----------|----------------|------------------------------|-------|
| Create | `url` | `collectionId`, `tags`, `title`, `pleaseParse` (boolean), `created` (ISO timestamp) | Creates a new bookmark. `pleaseParse` controls server-side metadata extraction. Accepts additional per-item fields as a group. |
| Delete | `bookmarkId` | — | Removes a bookmark by its Raindrop ID. |
| Get | `bookmarkId` | — | Retrieves a single bookmark. |
| Get All | — | `collectionId` (scope to collection), `search` (full-text query), `sort` (sort order), `page` (pagination) | Lists bookmarks, optionally filtered by collection and free-text search. |
| Update | `bookmarkId` | `url`, `collectionId`, `tags`, `title`, `pleaseParse`, `cover` (image URL) | Updates an existing bookmark's fields. |

### Collection resource

| Operation | Required params | Optional / additional params | Notes |
|-----------|----------------|------------------------------|-------|
| Create | `title` | `public` (boolean), `sort`, `description`, `cover` (image URL) | Creates a new collection (folder). |
| Delete | `collectionId` | — | Deletes a collection by ID. |
| Get | `collectionId` | — | Retrieves a single collection. |
| Get All | — | `page` (pagination) | Lists all collections accessible to the authenticated user. |
| Update | `collectionId` | `title`, `public`, `sort`, `description`, `cover` | Updates a collection's fields. |

### Tag resource

| Operation | Required params | Optional / additional params | Notes |
|-----------|----------------|------------------------------|-------|
| Delete | `tag` | — | Deletes a tag (by name) from the account. |
| Get All | — | — | Lists all tags for the authenticated user. |

### User resource

| Operation | Required params | Optional / additional params | Notes |
|-----------|----------------|------------------------------|-------|
| Get | — | — | Retrieves the authenticated user's profile. |

## Runtime behavior

### Input

Each input item is processed independently. Parameters that accept expressions are evaluated per item. Paginated "Get All" operations may produce zero, one, or many output items depending on result count and the pagination limit.

### Output

Each output item contains the JSON response from the Raindrop REST API wrapped in the standard `{ json: ... }` shape. The response structure mirrors the Raindrop API's own payload — for example, a Bookmark Get returns a `result` array with a `_id`, `link`, `title`, `collection`, `tags`, `created`, and other fields as documented at https://developer.raindrop.io/v1/raindrops. Collection responses include `_id`, `title`, `public`, `count`, `cover`, `created`, and `sort`.

### Errors

- HTTP 4xx/5xx responses from the Raindrop API cause the node to throw, halting execution for that item.
- If `continueOnFail` is enabled on the node, errored items are passed to output via the error output branch instead of halting.
- The API rate limit (120 requests/minute per user) is enforced server-side; exceeding it returns HTTP 429. The node does not implement client-side retry.

### Expressions

All parameter values support n8n expression strings, allowing per-item dynamic resolution. This includes required identifiers (bookmarkId, collectionId), query text, and all optional fields.

## Acceptance tests

### Test: Bookmark Get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bookmark",
  "operation": "get",
  "bookmarkId": "12345"
}
```

**Expect** output[0] to contain a `json` object with the expected Raindrop bookmark shape: at minimum `_id`, `link`, `title`, `collection`, `tags`, and `created` fields.

### Test: Collection Create

**Given** input items:

```json
[{ "json": { "name": "Test Collection" } }]
```

**Parameters:**

```json
{
  "resource": "collection",
  "operation": "create",
  "title": "={{ $json.name }}"
}
```

**Expect** output[0].json to contain `_id`, `title` equal to "Test Collection", and a `created` timestamp.

### Test: Tags Get All

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "tag",
  "operation": "getAll"
}
```

**Expect** output[0].json to contain a `result` array of tag objects, each with at minimum `_id` and `tags` (array of tag names).

### Test: User Get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "get"
}
```

**Expect** output[0].json to contain the authenticated user profile with `_id`, `email`, `fullName`, and `avatar` fields.

### Test: Bookmark Create with invalid URL (error path)

**Given** input items:

```json
[{ "json": { "url": "not-a-valid-url" } }]
```

**Parameters:**

```json
{
  "resource": "bookmark",
  "operation": "create",
  "url": "={{ $json.url }}"
}
```

**Expect** the node to throw due to an API 4xx error. With `continueOnFail` enabled, the errored item passes to the error output branch.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/Operation list | Documented (n8n public docs) | Bookmark, Collection, Tag, User resources with exact operation set confirmed from docs page. |
| Credential type | Documented (n8n public docs) | OAuth2 only; Client ID + Client Secret from Raindrop app settings. |
| API contract | Documented (Raindrop developer docs) | REST API v1 at https://api.raindrop.io/rest/v1. |
| Parameter details (exact field names, defaults, option enums) | Inferred from Raindrop API docs | The node maps parameter values to Raindrop API request bodies. Exact parameter nesting choices (e.g., `additionalFields` grouping) are an implementation detail. |
| Pagination strategy | Inferred | Get All operations paginate; exact limit/offset parameters and whether page size is configurable are implementation-specific. |
| `pleaseParse` default | Inferred | Raindrop API defaults to parsing; the node may expose it or leave it implicit. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.raindrop.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

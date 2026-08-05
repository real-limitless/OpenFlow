---
type: n8n-nodes-base.googleBooks
displayName: Google Books
category: Miscellaneous
versions: [1, 2]
priority: medium
status: specced
---

# Google Books

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebooks/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://developers.google.com/books/docs/v1/reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.googleBooks`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleBooksOAuth2Api` (OAuth2, preferred in v2) or `googleApi` (Service Account)
- **Categories:** `Miscellaneous`

## Parameters

The node uses a discriminator pattern: select a **resource** then an **operation** on that resource.

### Version differences

- **v1** (default): `authentication` options are `Service Account` (default) or `OAuth2`
- **v2** (default): `authentication` options are `OAuth2 (recommended)` (default) or `Service Account`

### Bookshelf resource

| operation | parameter | type | default | notes |
|-----------|-----------|------|---------|-------|
| `get` | `myLibrary` | boolean | `false` | When true, query the authenticated user's own shelves (no `userId` needed) |
| `get` | `userId` | string | `""` | Required when `myLibrary` is false; Google user ID whose bookshelf to retrieve |
| `get` | `shelfId` | string | `""` | Required; ID of the bookshelf to retrieve |
| `getAll` | `myLibrary` | boolean | `false` | When true, list the authenticated user's own public shelves |
| `getAll` | `userId` | string | `""` | Required when `myLibrary` is false |
| `getAll` | `returnAll` | boolean | `false` | When false, use `limit` |
| `getAll` | `limit` | number | `40` | Max results (1–40); used when `returnAll` is false |

### Bookshelf Volume resource

| operation | parameter | type | default | notes |
|-----------|-----------|------|---------|-------|
| `add` | `shelfId` | string | `""` | Required; target bookshelf ID |
| `add` | `volumeId` | string | `""` | Required; volume to add |
| `clear` | `shelfId` | string | `""` | Required; bookshelf to clear |
| `getAll` | `myLibrary` | boolean | `false` | When true, use authenticated user's shelves |
| `getAll` | `userId` | string | `""` | Required when `myLibrary` is false |
| `getAll` | `shelfId` | string | `""` | Required; bookshelf whose volumes to list |
| `getAll` | `returnAll` | boolean | `false` | When false, use `limit` |
| `getAll` | `limit` | number | `40` | Max results (1–40) |
| `move` | `shelfId` | string | `""` | Required; bookshelf containing the volume |
| `move` | `volumeId` | string | `""` | Required; volume to reposition |
| `move` | `volumePosition` | string | `""` | Required; zero-indexed position. 0 = before current first item, 1 = between first and second, etc. |
| `remove` | `shelfId` | string | `""` | Required; bookshelf to remove volume from |
| `remove` | `volumeId` | string | `""` | Required; volume to remove |

### Volume resource

| operation | parameter | type | default | notes |
|-----------|-----------|------|---------|-------|
| `get` | `volumeId` | string | `""` | Required; Google Books volume ID |
| `getAll` | `searchQuery` | string | `""` | Required; full-text search query string |
| `getAll` | `returnAll` | boolean | `false` | When false, use `limit` |
| `getAll` | `limit` | number | `40` | Max results (1–40) |

## Runtime behavior

### Input

The node processes each input item independently. Parameter values may reference item data via expressions.

### Output

Each operation produces one output item per input item, with the Google Books API response body placed in `json`:

- **Bookshelf get/getAll**: Returns the bookshelf resource(s) (`{ id, title, description, volumeCount, ... }`) from the Google Books API `GET /mylibrary/bookshelves/{shelfId}` or `GET /users/{userId}/bookshelves`.
- **Bookshelf Volume getAll**: Returns the volumes within a bookshelf via `GET /mylibrary/bookshelves/{shelfId}/volumes` or `GET /users/{userId}/bookshelves/{shelfId}/volumes`.
- **Bookshelf Volume add/move/remove/clear**: Returns the API response (typically an empty body on success).
- **Volume get**: Returns a single volume resource (`{ id, volumeInfo, saleInfo, accessInfo, ... }`).
- **Volume getAll**: Returns a `{ items, totalItems }` response containing volume resources matching the search query, with `items` being the array of results.

### Errors

- API errors (auth failure, resource not found, rate limits, permission denied) throw an error handled by the workflow engine according to `continueOnFail`.
- Missing required parameters (e.g. `shelfId`, `volumeId`, `searchQuery`) throw before the API call.
- The Google Books API returns a 404 for nonexistent bookshelf or volume IDs, or unauthorized access.

### Expressions

All string, number, and boolean parameters accept n8n expression strings.

## Acceptance tests

### Test: volume search

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "volume",
  "operation": "getAll",
  "searchQuery": "The Great Gatsby",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0].json to contain a `totalItems` (number) and an `items` array with at most 5 entries, each having an `id` and `volumeInfo` object.

### Test: bookshelf get by user

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bookshelf",
  "operation": "get",
  "userId": "117726895198069853348",
  "shelfId": "1001"
}
```

**Expect** output[0].json to contain `id` equal to `"1001"`, a `title` string, and a `volumeCount` number.

### Test: bookshelf volume add

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bookshelfVolume",
  "operation": "add",
  "shelfId": "1001",
  "volumeId": "abc123"
}
```

**Expect** output[0].json to contain the API response (may be an empty success response). Must not throw an error.

### Test: volume get by ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "volume",
  "operation": "get",
  "volumeId": "zyTCAlFPjgYC"
}
```

**Expect** output[0].json to contain `id` equal to `"zyTCAlFPjgYC"` and a `volumeInfo` object with `title`, `authors`, `description`, etc.

### Test: bookshelf volume getAll with myLibrary

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bookshelfVolume",
  "operation": "getAll",
  "myLibrary": true,
  "shelfId": "1001",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0].json to contain an `items` array with at most 10 volume entries.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations list | documented | Public docs list all 3 resources and 9 operations |
| Parameter names and defaults | inferred | Extracted from corpus schema; all params are at a high abstraction level |
| Credential setup | documented | OAuth2 (recommended in v2) or Service Account; see Google generic credentials docs |
| API response shapes | inferred | Described at outcome level per Google Books API v1 contract |
| `myLibrary` feature | inferred | Boolean toggle that routes to the authenticated user's own shelves vs. a specified userId |
| v1 vs v2 auth defaults | documented | Version-dependent authentication default order confirmed via corpus |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/googleBooks.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

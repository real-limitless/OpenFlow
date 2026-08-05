---
type: n8n-nodes-base.ghost
displayName: Ghost
category: App
versions: [1]
priority: medium
status: specced
---

# Ghost

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.ghost/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/ghost/ | Public docs only |
| https://ghost.org/docs/admin-api/ | Public docs only |
| https://ghost.org/docs/content-api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.ghost`
- **Category:** Marketing
- **Node version:** 1.0
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `ghostAdminApi` (required when source = `adminApi`)
  - `ghostContentApi` (required when source = `contentApi`)

### Credential authentication

**Content API key** — sent as `?key=` query parameter on every request to the Content API endpoint. The credential stores a Ghost URL + static Content API Key string.

**Admin API key** — the credential stores a Ghost URL + Admin API Key (format `{id}:{hex_secret}`). At request time the executor must:
1. Split the key on `:` into an `id` and hex-encoded `secret`.
2. Decode the hex secret into raw bytes.
3. Sign an HS256 JWT with header `{ alg: "HS256", kid: <id>, typ: "JWT" }` and payload `{ iat: <now>, exp: <now + 5 min>, aud: "/admin/" }`.
4. Send `Authorization: Ghost <jwt>` as the HTTP header.
5. Always include `Accept-Version: v{major}.{minor}` header corresponding to the configured Ghost API version.

The Admin API key must never be sent as a query parameter or in cleartext — only the derived JWT in the Authorization header.

## Parameters

The node is configured by first selecting an **API source** (Admin API or Content API), then a **resource** (currently only Post), then an **operation** whose available set depends on the source.

### Top-level

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| source | options: `contentApi`, `adminApi` | `contentApi` | yes | Determines which credential is required and which operations are available |
| resource | options: `post` | `post` | yes | Only Post resource is currently supported |
| operation | options (see below) | `get` | yes | Varies by source |

### Operation map

| Source | Operations available |
|--------|---------------------|
| Content API | `get`, `getAll` |
| Admin API | `create`, `delete`, `get`, `getAll`, `update` |

### Content API — Post parameters

**Operation: get**
- **Post ID** (expression, required) — The ID of the post to retrieve.
- **Options:**
  - Custom query string parameters for filtering/embedding (e.g. `include` for authors, tags)

**Operation: getAll**
- **Limit** (number, optional) — Maximum number of posts to return per page (default 15, max 100).
- **Options:**
  - Custom query string parameters for filtering, embedding, and pagination.

### Admin API — Post parameters

**Operation: create**
- **Title** (string, expression, required)
- **Content fields** (the post body, provided via one of several mutually exclusive formats):
  - **Mobiledoc** (JSON) — Raw Ghost-internal document storage format.
  - **Lexical** (JSON) — The newer editor format used by Ghost's default editor.
  - **HTML** (string) — Plain HTML content.
  - **Source** (string) — Markdown or source text.
- **Additional fields** (optional object) — Published/updated timestamps, slug, status (`draft`, `published`, `scheduled`), custom excerpt, feature image URL, tags (array of tag objects), authors, and other Ghost Admin API post properties.

**Operation: update**
- **Post ID** (expression, required) — The post to update.
- Same content fields and additional fields as Create. Only supplied fields are changed; omitted fields remain untouched.

**Operation: delete**
- **Post ID** (expression, required) — The post to delete.

**Operation: get**
- **Post ID** (expression, required) — The post to retrieve.
- **Options:** Custom query string parameters for embedding.

**Operation: getAll**
- **Limit** (number, optional) — Maximum per page.
- **Options:** Filters, sorting, pagination, embedding parameters.

### Expression support

All string parameters listed above accept expressions. Boolean, number, and JSON parameters may also use expressions where the result type matches.

## Runtime behavior

### Input processing

Each input item is processed independently. The node makes one Ghost API call per item for create/update/delete/get operations. For getAll operations, all items in a batch cause a single API call using the last item's parameter values (standard n8n batching behavior for list operations).

### Output shape

Each output item contains the JSON response from the Ghost API under a key corresponding to the resource name. For Post operations, the response shape is:

```
{ "posts": [{ ...post fields... }] }
```

For getAll, the response additionally includes pagination metadata (e.g., `meta.pagination` with `page`, `limit`, `pages`, `total`, `next`, `prev`).

Individual output items are produced by iterating over the response array. A getAll returning 25 posts yields 25 output items, each containing one post object.

### Errors

- Authentication failures (invalid/missing API key, wrong source/credential pair) produce a `NodeOperationError`.
- API-level errors (404 on get/update/delete of nonexistent post, 400 on validation failure) throw `NodeApiError`.
- When `continueOnFail` is set on the node, the error is output instead of the expected item, and execution continues with the next input item.

## Acceptance tests

### Test: Content API — get a single post

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "source": "contentApi",
  "resource": "post",
  "operation": "get",
  "postId": "{{ $json.postId }}"
}
```

**Credentials:** ghostContentApi (valid URL + Content API Key)

**Expect** output[0]:
- The node makes a GET `/{version}/content/posts/{postId}/` to the configured Ghost URL.
- Output item `json.posts` is an array with exactly one post object that includes at minimum `id`, `title`, `slug`, and `updated_at` fields.
- At most one item is produced per input.

### Test: Admin API — create a post

**Given** input items:
```json
[{ "json": { "title": "Test from n8n", "html": "<p>Hello world</p>" } }]
```

**Parameters:**
```json
{
  "source": "adminApi",
  "resource": "post",
  "operation": "create",
  "title": "={{ $json.title }}",
  "html": "={{ $json.html }}",
  "status": "draft"
}
```

**Credentials:** ghostAdminApi (valid URL + Admin API Key)

**Expect** output[0]:
- The node makes a POST `/{version}/admin/posts/` with body `{ posts: [{ title: "Test from n8n", html: "<p>Hello world</p>", status: "draft" }] }`.
- Output item `json.posts[0].id` is a non-empty string.
- Output item `json.posts[0].status` is `"draft"`.
- The response includes `updated_at` (ISO 8601).

### Test: Admin API — update a post

**Given** input items:
```json
[{ "json": { "postId": "abc123", "title": "Updated title" } }]
```

**Parameters:**
```json
{
  "source": "adminApi",
  "resource": "post",
  "operation": "update",
  "postId": "={{ $json.postId }}",
  "title": "={{ $json.title }}"
}
```

**Credentials:** ghostAdminApi

**Expect** output[0]:
- The node makes a PUT `/{version}/admin/posts/{postId}/` with body containing only the `title` update.
- Response contains `posts[0].id` matching `postId` and `posts[0].title` equal to `"Updated title"`.

### Test: Admin API — delete a post

**Given** input items:
```json
[{ "json": { "postId": "abc123" } }]
```

**Parameters:**
```json
{
  "source": "adminApi",
  "resource": "post",
  "operation": "delete",
  "postId": "={{ $json.postId }}"
}
```

**Credentials:** ghostAdminApi

**Expect** output[0]:
- The node makes a DELETE `/{version}/admin/posts/{postId}/`.
- Ghost returns HTTP 204 with no body; output item `json` is an empty object.

### Test: Content API — getAll with pagination

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "source": "contentApi",
  "resource": "post",
  "operation": "getAll",
  "limit": 5
}
```

**Credentials:** ghostContentApi

**Expect** output[0..4]:
- The node makes a GET `/{version}/content/posts/` with `limit=5`.
- Five output items are produced.
- Each output item `json` contains a single post object at the top level (the response array is flattened).
- Post objects include at minimum `id`, `title`, `slug`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Content API operations | documented | Confirmed via public docs (get + getAll for Post) |
| Admin API operations | documented | Confirmed via public docs (create, delete, get, getAll, update for Post) |
| Source selector | inferred from corpus type schema | Not visible in docs sidebar; required for credential routing. The `source` parameter is a top-level config option. |
| Resource enumeration | documented | Only `post` resource exists |
| Content fields (Mobiledoc, Lexical, HTML, Source) | inferred from corpus + Ghost public API docs | Ghost's public API docs confirm these as ways to supply post body content. The node offers a choice depending on which editor/format the user works in. |
| Additional fields list | inferred | Follows Ghost Admin API post schema; not enumerated exhaustively here |
| Response flattening for getAll | standard n8n behavior | Standard for all n8n list operations |
| Usable as AI tool | documented | Confirmed in public docs with note about `$fromAI()` dynamic parameter population |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/ghost.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

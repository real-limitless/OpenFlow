---
type: n8n-nodes-base.wordpress
displayName: WordPress
category: Marketing
versions: [1]
priority: medium
status: specced
---

# WordPress

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.wordpress/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/wordpress/ | Public docs only |
| https://developer.wordpress.org/rest-api/reference/posts/ | Third-party service API docs |
| https://developer.wordpress.org/rest-api/reference/pages/ | Third-party service API docs |
| https://developer.wordpress.org/rest-api/reference/users/ | Third-party service API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.wordpress`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `wordpressApi` (basic auth) or `wordpressOAuth2Api` (OAuth2)

### Credentials

**Basic auth (`wordpressApi`):**
- `username` (string) — WordPress login username
- `password` (string) — application password (requires two-factor auth enabled on WordPress.com)
- `url` (string) — base URL of the WordPress site (e.g. `https://example.com`)
- `ignoreSSLIssues` (boolean, optional) — skip TLS verification

**OAuth2 (`wordpressOAuth2Api`):**
- WordPress.com-hosted sites only
- `clientId`, `clientSecret` — from WordPress.com developer application
- `site` — the WordPress.com subdomain or custom domain

## Parameters

### Resource / Operation selector

The node selects one resource (Post, Page, or User) and one operation per resource.

| resource | operation | notes |
|----------|-----------|-------|
| post | create / get / getAll / update | create/get also support update with `postId` |
| page | create / get / getAll / update | create/get also support update with `pageId` |
| user | create / get / getAll / update | create/get also support update with `userId` |

### Post / Page shared fields

These fields apply to both Post and Page resources for create and update operations:

- `title` (string) — post/page title
- `content` (string) — body content (HTML)
- `slug` (string) — URL-friendly identifier
- `password` (string) — password-protect the post/page
- `status` (enum: `publish`, `draft`, `future`, `pending`, `private`, `trash`) — publication status
- `author` (number) — user ID of the author
- `featuredMedia` (number) — ID of the featured media attachment
- `commentStatus` (enum: `open`, `closed`) — whether comments are allowed
- `pingStatus` (enum: `open`, `closed`) — whether pings are allowed
- `excerpt` (string) — post/page excerpt
- `template` (string) — theme template filename
- `date` (datetime string) — publication date in site timezone
- `dateGmt` (datetime string) — publication date as GMT
- `format` (enum: `standard`, `aside`, `chat`, `gallery`, `link`, `image`, `quote`, `status`, `video`, `audio`) — post format (Post only)
- `sticky` (boolean) — whether the post is sticky (Post only)
- `categories` (array of numbers) — category IDs (Post only); populated via `getCategories` loadOptions
- `tags` (array of numbers) — tag IDs (Post only); populated via `getTags` loadOptions
- `parent` (number) — parent page ID (Page only)
- `menuOrder` (number) — sort order (Page only)

### Post / Page get by ID

- `postId` / `pageId` (number) — required, the ID to retrieve
- `password` (string, optional) — if the resource is password-protected

### Post / Page getAll filters

Filters available for listing:

- `search` (string)
- `after` / `before` (ISO8601 datetime)
- `modifiedAfter` / `modifiedBefore` (ISO8601 datetime)
- `author` / `authorExclude` (author IDs)
- `exclude` / `include` (post/page IDs)
- `offset` / `page` / `perPage` (pagination)
- `order` (enum: `asc`, `desc`)
- `orderBy` (enum for Post: `author`, `date`, `id`, `include`, `modified`, `parent`, `relevance`, `slug`, `title`)
- `orderBy` (enum for Page: same as Post plus `menuOrder`)
- `slug` (string)
- `status` (string, default `publish`)
- `categories` / `categoriesExclude` / `tags` / `tagsExclude` (category/tag IDs, Post only)
- `sticky` (boolean, Post only)
- `parent` / `parentExclude` (page IDs, Page only)

### User fields

Create / update:

- `username` (string, required on create)
- `password` (string, required on create)
- `email` (string, required on create)
- `name` (string) — display name
- `firstName` / `lastName` (string)
- `nickname` (string)
- `url` (string)
- `description` (string)
- `slug` (string)
- `roles` (array of strings)
- `locale` (enum: `en_US`)

User get by ID:

- `userId` (number)

User getAll filters:

- `search`, `exclude`, `include`, `offset`, `page`, `perPage`, `slug`
- `order` (asc/desc), `orderBy` (enum: `id`, `include`, `name`, `registered_date`, `slug`, `email`, `url`)
- `roles` (comma-separated or single role)
- `who` (`authors`)

### Load options (dynamic parameter population)

The node uses resource `loadOptions` methods to populate dropdown parameters:

- `getCategories` — populates a `categories` multi-select with available WordPress categories
- `getTags` — populates a `tags` multi-select with available WordPress tags
- `getAuthors` — populates an `author` dropdown with available WordPress users

## Runtime behavior

### Input

Each input item is processed independently. The resource and operation are fixed per node instance (not per item). For create/update operations, field values support expressions and may vary per input item.

### Output

Each input item produces one output item. The response from the WordPress REST API is placed in the `json` property of the output item.

- **Create** operations return the newly created resource object (full WordPress REST API response).
- **Get** operations return the single resource object.
- **GetAll** operations return an array of resource objects. If no items match, an empty array is returned.
- **Update** operations return the updated resource object.

For `getAll`, the output is a single item whose `json` property contains the array of results, similar to how the HTTP Request node surfaces collection responses.

### API routing

Requests are sent to the WordPress REST API under the configured site URL:

- Post: `{url}/wp-json/wp/v2/posts` (create/getAll), `{url}/wp-json/wp/v2/posts/{id}` (get/update)
- Page: `{url}/wp-json/wp/v2/pages` (create/getAll), `{url}/wp-json/wp/v2/pages/{id}` (get/update)
- User: `{url}/wp-json/wp/v2/users` (create/getAll), `{url}/wp-json/wp/v2/users/{id}` (get/update)

Authentication is passed as HTTP Basic Auth header (basic auth credential) or Bearer token (OAuth2).

### Errors

The node relies on the WordPress REST API HTTP response. A non-2xx status propagates as a node error (unless `continueOnFail` is enabled, in which case the error is returned as `{ json: { error } }` on the default output branch). Common errors include 401 (bad credentials), 403 (insufficient permissions), and 404 (resource not found).

### Expressions

All string, number, and boolean field parameters accept expressions. The `resource`, `operation`, and `postId`/`pageId`/`userId` selectors are fixed at design time.

## Acceptance tests

### Test: create a post

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "post",
  "operation": "create",
  "title": "My test post",
  "content": "<p>Hello world</p>",
  "status": "draft"
}
```

**Expect** that the node makes a `POST /wp-json/wp/v2/posts` request with body containing `title`, `content`, `status`. The output item contains the WordPress post object with an `id`, `title`, `content`, `status: "draft"`.

### Test: get a post by ID

**Parameters:**
```json
{
  "resource": "post",
  "operation": "get",
  "postId": 1
}
```

**Expect** a `GET /wp-json/wp/v2/posts/1` request. Output item contains a single post object with `id: 1`.

### Test: list posts with filters

**Parameters:**
```json
{
  "resource": "post",
  "operation": "getAll",
  "search": "hello",
  "perPage": 5,
  "order": "desc",
  "orderBy": "date"
}
```

**Expect** a `GET /wp-json/wp/v2/posts?search=hello&per_page=5&order=desc&orderby=date` request. Output is a single item whose `json` is an array of post objects.

### Test: update a post

**Parameters:**
```json
{
  "resource": "post",
  "operation": "update",
  "postId": 1,
  "title": "Updated title"
}
```

**Expect** a `POST /wp-json/wp/v2/posts/1` request with body `{ "title": "Updated title" }`. Output item contains the updated post object.

### Test: create a user

**Parameters:**
```json
{
  "resource": "user",
  "operation": "create",
  "username": "newuser",
  "password": "secure123",
  "email": "new@example.com",
  "name": "New User"
}
```

**Expect** a `POST /wp-json/wp/v2/users` request. Output item contains the created user object with `username`, `email`, `name`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented | Exact list from n8n public docs |
| Parameter fields per resource/operation | Inferred from WordPress REST API schema | The n8n docs list only high-level operations; exact parameter names, defaults, and UI groupings are inferred from the WordPress REST API field schema and the n8n public docs pattern |
| Load option method names | Inferred from package descriptor metadata | `getCategories`, `getTags`, `getAuthors` confirmed in corpus; mapping to UI controls is inferred |
| Credential shapes | Documented | From n8n public credential docs |
| Pagination handling for getAll | Inferred | `page`, `perPage` query params mapped from REST API; output shape assumed to be an array |
| `ignoreSSLIssues` credential param | Documented | Confirmed in public credential docs |
| Category "Marketing" | Confirmed from package descriptor | Not visible in public n8n docs page |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/wordpress.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
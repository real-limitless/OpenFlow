---
type: n8n-nodes-base.wordpress
displayName: WordPress
category: App
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
| https://developer.wordpress.com/docs/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wordpress`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `wordpressApi` (Basic auth: username + application password + WordPress URL + optional ignoreSSL) or `wordpressOAuth2Api` (OAuth2: client ID + client secret + WordPress.com site; WordPress.com-hosted sites only)

## Parameters

### Resource selection

The user selects a resource (post, page, user) which determines the available operations and associated parameter groups.

### Post operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Title, Content, Additional Fields (Slug, Password, Status [draft/publish/pending/private/future], Author, Comment Status [open/closed], Ping Status [open/closed], Format [standard/aside/audio/chat/gallery/image/link/quote/status/video], Sticky, Categories, Tags, Featured Media ID, Template) |
| Get | Post ID, Options (Password, Context [view/embed/edit]) |
| Get All | Return All, Limit, Options (After, Before, Author, Categories, Tags, Exclude Categories, Exclude Tags, Status, Sticky, Search, Order, Order By, Context) |
| Update | Post ID, Update Fields (same writable fields as Create) |

### Page operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Title, Additional Fields (Author, Parent ID, Content, Slug, Password, Status, Comment Status, Ping Status, Template, Menu Order, Featured Media ID) |
| Get | Page ID, Options (Password, Context) |
| Get All | Return All, Limit, Options (After, Before, Author, Status, Search, Order, Order By, Context, Parent Page ID, Menu Order, Page) |
| Update | Page ID, Update Fields (same writable fields as Create) |

### User operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Username, Name, First Name, Last Name, Email, Password, Additional Fields (URL, Description, Nickname, Slug) |
| Get | User ID, Options (Context) |
| Get All | Return All, Limit, Options (Context, Order By, Order, Search, Who [authors]) |
| Update | User ID, Update Fields (Username, Name, First Name, Last Name, Email, Password, URL, Description, Nickname, Slug) |

### AI tool usage

The n8n public docs state "This node can be used as an AI tool." When connected to an AI agent, parameters can be populated dynamically via `$fromAI()` expressions.

## Runtime behavior

### Input

Consumes items from `main` input. Each input item supplies expressions and/or operation data. The operation is applied independently to each input item.

### Output

Emits one main output item per successful operation result. The item JSON contains the resource object returned by the WordPress REST API, preserving identifiers and all documented fields.

- **Create/Get/Update:** the full WordPress REST API resource object (with `id`, `slug`, `status`, `title` rendered, `content` rendered, etc.)
- **Get All:** each resource from the collection emitted as a separate output item

### Errors

- Missing credentials, invalid resource/operation selection, missing required identifiers or payload data, or an unsuccessful HTTP response from the WordPress API fail the item
- `continueOnFail` follows the standard app node convention: convert the item to an error result and continue processing remaining items

### Expressions

All string and numeric editable fields accept standard n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: Create a post

**Given** input items:
```json
[{ "json": { "title": "Hello World", "content": "Post body" } }]
```

**Parameters:**
```json
{
  "resource": "post",
  "operation": "create",
  "title": "={{ $json.title }}",
  "additionalFields": {
    "content": "={{ $json.content }}",
    "status": "draft"
  }
}
```

**Expect** one output item whose JSON contains the created post's `id` (integer), the submitted `title.raw`, and a `status` of `"draft"`. The executor sends a POST to `/wp/v2/posts`.

### Test: Get a page by ID

**Given** input items:
```json
[{ "json": { "pageId": 42 } }]
```

**Parameters:**
```json
{
  "resource": "page",
  "operation": "get",
  "pageId": "={{ $json.pageId }}"
}
```

**Expect** one output item containing the page resource with id `42`, including documented fields such as `id`, `slug`, `title`, `content`, `status`, `date`.

### Test: Get All posts with limit and status filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "post",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "options": {
    "status": "publish"
  }
}
```

**Expect** the executor sends a GET to `/wp/v2/posts` with `per_page=10` and `status=publish`, and emits each post as a separate output item with fields including `id`, `title`, `content`, `status`, `date`.

### Test: Update a user

**Given** input items:
```json
[{ "json": { "userId": 5, "newNickname": "updated-nick" } }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "update",
  "userId": "={{ $json.userId }}",
  "updateFields": {
    "nickname": "={{ $json.newNickname }}"
  }
}
```

**Expect** one output item containing the updated user object with `nickname` set to `"updated-nick"`. The executor sends a POST to `/wp/v2/users/5`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Three resources with CRUD operations | documented | Confirmed by public n8n WordPress node page |
| WordPress.com OAuth2 only | documented | Public credentials page confirms OAuth2 is WordPress.com-only; self-hosted requires Basic auth |
| Credential structure | documented | Confirmed by public credentials page |
| AI tool support | documented | Public node page states "This node can be used as an AI tool" |
| Exact convenience field names per operation | intentionally unspecified | UI schema details that vary by version; not required for external contract |
| WordPress REST API response shapes | documented | Public developer.wordpress.com API docs describe all resource shapes |
| No Delete operation for posts/pages/users (base node) | documented | n8n public docs list Create/Get/Get All/Update only for all three resources; no mention of Delete |
| Alias / usableAsTool | inferred | The wordpressTool variant exists separately; base node may or may not share the alias |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.wordpress.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

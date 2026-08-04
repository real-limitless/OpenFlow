---
type: n8n-nodes-base.wordpressTool
displayName: WordPress
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# WordPress (AI Tool)

A tool variant of the WordPress node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Post, Page, and User resources against the WordPress REST API (WP REST API v2 / WordPress.com REST API).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.wordpress.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/wordpress.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developer.wordpress.com/docs/api/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wordpressTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `wordpressApi` (Basic auth: username + application password + WordPress URL + optional ignoreSSL) or `wordpressOAuth2Api` (OAuth2: client ID + client secret + WordPress.com site; WordPress.com-hosted only)

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
| Delete | Post ID, Options (Force [boolean — bypass trash]) |

### Page operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Title, Additional Fields (Author, Parent ID, Content, Slug, Password, Status, Comment Status, Ping Status, Template, Menu Order, Featured Media ID) |
| Get | Page ID, Options (Password, Context) |
| Get All | Return All, Limit, Options (After, Before, Author, Status, Search, Order, Order By, Context, Parent Page ID, Menu Order, Page) |
| Update | Page ID, Update Fields (same writable fields as Create) |
| Delete | Page ID, Options (Force) |

### User operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Username, Name, First Name, Last Name, Email, Password, Additional Fields (URL, Description, Nickname, Slug) |
| Get | User ID, Options (Context) |
| Get All | Return All, Limit, Options (Context, Order By, Order, Search, Who [authors]) |
| Update | User ID, Update Fields (Username, Name, First Name, Last Name, Email, Password, URL, Description, Nickname, Slug) |
| Delete | Reassign (user ID to reassign posts/links to), Options |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "let model fill" toggle is available on appropriate parameter fields
- The tool exposes a description of each resource + operation combination to the AI agent for tool selection

## Runtime behavior

### Input

Consumes items from `main` input. Each input item supplies expressions and/or operation data. The operation is applied independently to each input item.

### Output

Emits one main output item per successful operation result. The item JSON contains the resource object returned by the WordPress REST API, preserving identifiers and all documented fields.

- **Create/Get/Update:** the full WordPress REST API resource object (with `id`, `slug`, `status`, `title` rendered, `content` rendered, etc.)
- **Get All:** each resource from the collection emitted as a separate output item
- **Delete:** the service response object (the deleted object or a success indicator)

Binary data is not produced.

### Errors

- Missing credentials, invalid resource/operation selection, missing required identifiers or payload data, or an unsuccessful HTTP response from the WordPress API fail the item
- `continueOnFail` follows the standard tool node convention: convert the item to an error result and continue processing remaining items

### Expressions

All string and numeric editable fields accept standard n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: Create a post via AI agent

**Given** input items:
```json
[{ "json": { "title": "AI-generated post", "content": "Body text written by the model" } }]
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

### Test: Get All users with limit

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getAll",
  "returnAll": false,
  "limit": 3
}
```

**Expect** the executor sends a GET to `/wp/v2/users` with pagination parameters to retrieve at most 3 users, and emits each user as a separate output item with fields including `id`, `name`, `slug`, `email`.

### Test: Delete a post with force

**Given** input items:
```json
[{ "json": { "postId": 99 } }]
```

**Parameters:**
```json
{
  "resource": "post",
  "operation": "delete",
  "postId": "={{ $json.postId }}",
  "options": {
    "force": true
  }
}
```

**Expect** the executor sends a DELETE to `/wp/v2/posts/99?force=true` and emits a success confirmation item containing the deleted post object.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Three resources with CRUD operations | documented | Confirmed by public n8n WordPress node page |
| Credential structure | documented | Confirmed by public credentials page; supports Basic auth and OAuth2 |
| `$fromAI()` dynamic parameter support | documented | Public docs describe the feature generically; applies to all tool nodes |
| Tool eligibility | documented | Public WordPress page states "This node can be used as an AI tool" |
| Exact convenience field names per operation | intentionally unspecified | These are UI schema details that vary by version; not required for external contract |
| WordPress REST API response shapes | documented | Public developer.wordpress.com API docs describe all resource shapes |
| Exact options enum values (status, format, etc.) | documented | Confirmed from public WordPress REST API documentation and WP REST API Handbook |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.wordpressTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

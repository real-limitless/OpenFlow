---
type: n8n-nodes-base.redditTool
displayName: Reddit Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Reddit Tool

An AI agent tool variant of the Reddit node, wrapping the Reddit OAuth2 data API for use by AI agents. When connected to an AI Agent root node, the model can dynamically populate parameters via `$fromAI()` or the "let model fill" toggle. Supports Post, Post Comment, Profile, Subreddit, and User resources.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.reddit/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/reddit/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://www.reddit.com/dev/api/ | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.redditTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `redditOAuth2Api` — OAuth2 with Client ID and Client Secret. Required for authenticated resources (Post, Post Comment, Profile). Reddit requires manual API-access approval (see credentials page).

## Parameters

### Resource and operation selection

The user selects a resource and an operation for that resource:

- **Post:** submit a post (text/link/image), delete a post, get a post, get all posts from a subreddit, search posts (in one subreddit or all of Reddit).
- **Post Comment:** create a top-level comment, get all comments in a post, remove a comment, reply to a comment.
- **Profile:** get (the authenticated user's profile — includes identity, karma, trophies, friends, blocked users, preferences, saved posts).
- **Subreddit:** get background information (about/rules) about one subreddit, get all subreddits (keyword filter, trending).
- **User:** get a user (about, comments, gilded, overview, submitted).

### Operation parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| subreddit | string | — | conditional | post create/getAll/get/search; postComment getAll; subreddit get | Subreddit name (with or without `r/` prefix). |
| postId | string | — | conditional | post delete/get; postComment create/getAll | Post identifier from the URL path segment after `/comments/`. |
| commentId | string | — | conditional | postComment delete/reply | Comment identifier from the URL path segment. |
| kind | fixed (self / link / image) | self | conditional | post create | Type of post to submit. |
| title | string | — | conditional | post create | Post title, up to 300 characters. |
| text | string | — | conditional | post create (kind=self) | Markdown body of a self post. |
| url | string | — | conditional | post create (kind=link/image) | URL to share for a link/image post. |
| resubmit | boolean | false | optional | post create (kind=link/image) | Allow posting a URL already submitted to the same subreddit. |
| keyword | string | — | conditional | post search | Search term. |
| location | fixed (subreddit / allReddit) | subreddit | conditional | post search | Where to search — one subreddit or all of Reddit. |
| sort | fixed (relevance / hot / top / new / comments) | relevance | optional | post search | Sort order for search results. |
| commentText | string | — | conditional | postComment create | Markdown body of a top-level comment. |
| replyText | string | — | conditional | postComment reply | Markdown body of a reply. |
| returnAll | boolean | false | optional | list operations | Fetch all results across multiple pages. |
| limit | number | 100 | optional | list operations, returnAll=false | Max items per page (Reddit caps at 100). |
| details | fixed | identity | conditional | profile get | Which profile detail to fetch: identity, karma, trophies, friends, blockedUsers, prefs, saved. |
| content | fixed (about / rules) | about | conditional | subreddit get | Which subreddit content to retrieve. |
| username | string | — | conditional | user get | Reddit username. |
| userDetails | fixed (about / overview / submitted / comments / gilded) | about | conditional | user get | Which user details to retrieve. |
| filters | collection | {} | optional | subreddit getAll; post getAll | Keyword filter, trending flag for subreddits; category (top/hot/new/rising) for posts. |
| additionalFields | collection | {} | optional | post search | Sort, pagination, and other service-level extras. |

All string parameters accept expressions. When used as an AI agent tool, parameters may be populated dynamically by the calling agent via `$fromAI()`.

## Runtime behavior

### Input

Each input item is processed independently; values are rendered per item. Empty input produces empty output.

### Output

One output item per input item on the single `main` output. `json` carries the operation outcome:

- **Create post / create comment / reply:** the created object outcome with the new post/comment identifier.
- **Delete / remove:** confirmation of removal.
- **Get / get all / search / subreddit info / profile get / user get:** the requested resource(s) — one item per returned post, comment, subreddit, or user for list-style operations; the single object for get/about operations.
- **Profile get (identity):** the authenticated user's identity object. For other details (karma, trophies, etc.), the corresponding API response.
- **List operations with returnAll=false:** up to `limit` items per execution. Pagination cursors for multi-page iteration.

### Errors

- HTTP failures (4xx/5xx) from the Reddit API surface as node errors, including rate-limit responses and 401 token expiry.
- Reddit reports write-operation failures (e.g. `ALREADY_SUB`, `RATELIMIT`, flair required) inside a 200 response body; the node must inspect the body's error array and fail when present.
- Deleting or removing an object the authenticated user does not own fails (service constraint).
- `continueOnFail` yields an item carrying the error instead of halting the run.
- Empty input items produce empty output on output[0].

### Expressions

All string parameters (`subreddit`, `postId`, `commentId`, `title`, `text`, `url`, `keyword`, `commentText`, `replyText`, `username`) and the `filters`/`additionalFields` collections accept expressions.

### AI tool mode

When connected to an AI Agent root node, parameters can be:
- Populated dynamically via `$fromAI()` expressions.
- Set by the model at tool-calling time.
- Configured with the "let model fill" toggle in the node editor.

## Acceptance tests

### Test: submit a self post via AI agent

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Post",
  "operation": "create",
  "subreddit": "test",
  "title": "=$fromAI('title')",
  "text": "=$fromAI('text')",
  "kind": "self"
}
```

**Expect** a POST to the Reddit API `submit` endpoint with `kind=self`; output[0] `json` contains the new post identifier. If the response body contains an error array, the operation fails.

### Test: get all posts from a subreddit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Post",
  "operation": "getAll",
  "subreddit": "r/opencode",
  "filters": { "category": "new" },
  "limit": 50,
  "returnAll": false
}
```

**Expect** one output item per returned post (the subreddit's new listing), each carrying the post id, title, and author; total count ≤ 50.

### Test: search posts across all Reddit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Post",
  "operation": "search",
  "keyword": "openflow",
  "location": "allReddit",
  "limit": 25
}
```

**Expect** a search across all of Reddit; output contains one item per matching post.

### Test: create a top-level comment

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Post Comment",
  "operation": "create",
  "postId": "l0me7x",
  "commentText": "Great post!"
}
```

**Expect** a POST to `api/comment` targeting `thing_id=t3_l0me7x`; output[0] `json` contains the new comment identifier.

### Test: reply to a comment

**Given** input items:

```json
[{ "json": { "commentId": "gla7fmt" } }]
```

**Parameters:**

```json
{
  "resource": "Post Comment",
  "operation": "reply",
  "commentId": "{{ $json.commentId }}",
  "replyText": "Agreed"
}
```

**Expect** a POST to `api/comment` targeting the comment fullname `t1_gla7fmt`; output[0] `json` contains the new comment identifier.

### Test: continueOnFail produces error item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "continueOnFail": true,
  "resource": "Post",
  "operation": "delete",
  "postId": "does-not-exist"
}
```

**Expect** output[0] contains a single item whose `json` carries the API error rather than halting the workflow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Public docs for the base `reddit` node enumerate Post, Post Comment, Profile, Subreddit, User and their operations. |
| Credential type | documented | Public credentials page documents OAuth2 with Client ID + Client Secret; access requires pre-approval. |
| Wire type string | inferred | Type `n8n-nodes-base.redditTool` follows the naming pattern of other tool variants (e.g. `twitterTool`, `gmailTool`). The base node has `usableAsTool: true`. |
| Underlying Reddit API endpoints | documented | Service API reference documents endpoints. |
| AI tool parameter mode | documented | `$fromAI()` pattern documented for all AI tool nodes. |
| Parameter naming / nesting | inferred | Exact parameter names and nesting are inferred from the corpus JSON descriptor; spec describes them at outcome level. |
| Write-error-in-200 behaviour | documented | Public service notes confirm Reddit embeds errors in 200 response bodies. |
| Profile details options | confirmed | Corpus JSON confirms 7 details: identity, karma, trophies, friends, blockedUsers, prefs, saved. |
| Subreddit content options | confirmed | Corpus JSON confirms about and rules. |
| User details options | confirmed | Corpus JSON confirms about, overview, submitted, comments, gilded. |
| Post kind options | confirmed | Corpus JSON confirms self, link, image. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/redditTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

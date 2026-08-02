---
type: n8n-nodes-base.reddit
displayName: Reddit
category: Communication
versions: [1]
priority: medium
status: specced
---

# Reddit

Automates Reddit via its public OAuth2 data API: reading and searching posts,
comments, subreddits, users, and profiles, and writing posts and comments.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.reddit.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/reddit.md | Public docs only |
| https://www.reddit.com/dev/api/ | Public docs only (service API reference) |
| https://developers.reddit.com/docs/api/redditapi/ | Public docs only (service SDK reference) |

All content is from public documentation. The temporary corpus under `/tmp` was
used only to confirm the correct docs URL; no nested schemas, defaults, display
conditions, or implementation code were derived from it.

## Wire format

- **Type string:** `n8n-nodes-base.reddit`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `redditOAuth2Api` — OAuth2 with **Client ID** and **Client
  Secret** (Reddit third-party app). Reddit requires manual API-access approval
  since November 2025 and does not offer self-serve access.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed (Post / Post Comment / Profile / Subreddit / User) | — | yes | | The Reddit entity to act on. |
| operation | fixed (per resource) | — | yes | | See per-resource list below. |
| subreddit | string | — | conditional | shown for post write/list/search and subreddit operations | Subreddit name, with or without the `r/` prefix. |
| postId | string | — | conditional | shown when an operation targets one post | Post identifier (fullname `t3_…` or bare id). |
| commentId | string | — | conditional | shown when an operation targets one comment | Comment identifier (fullname `t1_…` or bare id). |
| title | string | — | conditional | shown when operation=Submit post | Post title (required by the API). |
| postText | string | — | conditional | shown when submitting a self post | Markdown body of a self post. |
| postUrl | string | — | conditional | shown when submitting a link post | URL to share for a link post. |
| flairId | string | — | optional | shown when submitting a post | Optional link-flair template id for subreddits that require flair. |
| nsfw | boolean | false | optional | shown when submitting a post | Mark the post as NSFW. |
| spoiler | boolean | false | optional | shown when submitting a post | Mark the post as spoiler. |
| query | string | — | conditional | shown for search operations | Search term(s) used by Reddit's search endpoints. |
| sort | fixed | — | conditional | shown for list/search operations | Listing sort (hot/new/top/rising/controversial, or relevance for search). |
| limit | number | — | optional | shown for list/search operations | Max items to retrieve per request (Reddit caps around 100). |
| userIdentifier | string | — | conditional | shown for User get / Profile operations | Username (without `u/` prefix) to look up. |
| options | collection | {} | no | | Service-level extras: pagination cursors, additional listing controls, resubmit flag for link posts. |

Per-resource operations (from public docs):

- **Post:** submit a post to a subreddit, delete a post, get a post, get all
  posts from a subreddit, search posts (within one subreddit or all of Reddit).
- **Post Comment:** create a top-level comment in a post, get all comments in a
  post, remove a comment, write a reply to a comment.
- **Profile:** get (the authenticated user's profile).
- **Subreddit:** get background information about one subreddit; get subreddit
  listings from all of Reddit.
- **User:** get a user's profile.

All string parameters accept expressions. Because the node can be used as an AI
agent tool, most parameters may also be populated dynamically by a calling agent.

## Runtime behavior

### Input

Each input item is processed independently; parameter values are rendered per
item. Empty input produces empty output.

### Output

One output item per input item on the single `main` output. `json` carries the
operation outcome at a functional level:

- **Submit post / create comment / reply:** the created object outcome — the
  new post or comment identifier and any URL Reddit returns.
- **Delete / remove:** confirmation that the object was removed.
- **Get / get all / search / listings / about:** the requested resource(s) —
  one item per returned post, comment, subreddit, or user for list-style
  operations; the single object for `get`/`about` operations.
- **Profile / User get:** the user profile object.

Post and comment identifiers surface in a form the executor can use to target
subsequent operations (fullname and/or bare id). When a listing is requested for
a single post (e.g. retrieving all comments in a post), the request must be
addressed to the post's article id; if the parameter was given as a fullname
(`t3_…`), the prefix is stripped before targeting the listing. Listings expose
enough pagination state for a caller to page through large result sets.

### Errors

- HTTP failures (4xx/5xx) from the Reddit API surface as node errors, including
  rate-limit responses and 401 token expiry.
- Reddit reports write-operation failures (e.g. `ALREADY_SUB`, `RATELIMIT`,
  flair required) inside a 200 response body; the node must inspect the body's
  error array and fail the operation when present.
- Deleting/removing an object the authenticated user does not own fails
  (service constraint).
- `continueOnFail` yields an item carrying the error instead of halting the run.
- Empty input produces empty output on the single output (`[[]]`), never a
  crash or sentinel item.

### Expressions

All string parameters (`subreddit`, `postId`, `commentId`, `title`, `postText`,
`postUrl`, `flairId`, `query`, `userIdentifier`) and the `options` collection
accept expressions.

## Acceptance tests

### Test: submit a self post

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Post",
  "operation": "submit",
  "subreddit": "test",
  "title": "Hello from OpenFlow",
  "postText": "First post",
  "nsfw": false
}
```

**Expect** a `POST /api/submit` call with `kind=self`, `sr=test`,
`title=Hello from OpenFlow`, `text=First post`; output[0] `json` carries the new
post identifier. If the response body contains an error array, the operation
fails.

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
  "sort": "new",
  "limit": 50
}
```

**Expect** one output item per returned post (the `r/opencode/new` listing),
each carrying the post id, title, and author; total count ≤ 50.

### Test: search posts in one subreddit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Post",
  "operation": "search",
  "subreddit": "programming",
  "query": "openflow",
  "sort": "relevance"
}
```

**Expect** the search is scoped to that subreddit (restrict_sr behaviour) and
output contains one item per matching post.

### Test: create a reply to a comment

**Given** input items:

```json
[{ "json": { "commentId": "t1_abc123" } }]
```

**Parameters:**

```json
{
  "resource": "Post Comment",
  "operation": "reply",
  "commentId": "{{ $json.commentId }}",
  "postText": "Agreed"
}
```

**Expect** a `POST /api/comment` call targeting the comment fullname with the
reply text; output[0] `json` contains the new comment identifier.

### Test: get all comments in a post

**Given** input items:

```json
[{ "json": { "postId": "t3_xyz789" } }]
```

**Parameters:**

```json
{
  "resource": "Post Comment",
  "operation": "getAll",
  "postId": "{{ $json.postId }}"
}
```

**Expect** the comments listing is requested for the post's article id
(`t3_` prefix stripped → `GET /comments/xyz789`, not `/r/t3_xyz789/comments`),
with raw response data requested; output contains one item per comment in the
post's comment tree.

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

**Expect** output[0] contains a single item whose `json` carries the API error
rather than halting the workflow.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Public n8n docs enumerate Post, Post Comment, Profile, Subreddit, User and their operations. |
| Credential type | documented | Public credentials page documents OAuth2 with Client ID + Client Secret; access requires pre-approval. |
| Wire type string | inferred | `n8n-nodes-base.reddit` follows the documented package naming convention; exact type confirmed only at naming level. |
| Underlying Reddit API endpoints | documented | Service API reference documents `/api/submit`, `/api/del`, `/api/comment`, listings, `/search`, `/about`, `/api/v1/me`, and the OAuth2 base URL `https://oauth.reddit.com`. |
| Comment-listing request target | documented | Service API documents `/comments/{article}` addressed by article id; fullname prefix stripping follows from that contract. |
| Write-error-in-200 behaviour | documented | Public service notes confirm Reddit embeds errors (e.g. `ALREADY_SUB`, `RATELIMIT`) in 200 response bodies. |
| Parameter naming/nesting | inferred | Exact parameter names and nesting are inferred; spec describes them at outcome level and only requires documented identifiers (subreddit name, post/comment ids, username). |
| Exact response body shape | inferred | Spec requires outcome-level data (ids, result lists, profile objects) plus pagination state, not a fixed schema. |
| Subreddit "get all" scope | partially documented | Public docs say "subreddits from all of Reddit"; exact listing/endpoint choice left to implementation. |
| Operation defaults | inferred | Pre-selected resource/operation and sort defaults are not required for correctness. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/reddit.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

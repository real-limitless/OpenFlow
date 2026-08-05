---
type: n8n-nodes-base.hackerNewsTool
displayName: Hacker News
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Hacker News (AI Tool)

A tool variant of the Hacker News app node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function. Fetches public Hacker News content — articles, user profiles, and search results — via the Algolia-powered Hacker News API. No authentication is required since all data is public.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hackernews/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://hn.algolia.com/api | Public external API |

## Wire format

- **Type string:** `n8n-nodes-base.hackerNewsTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none — all data is public)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | `all` | true | Selects the entity to operate on: `all` (search front-page / all items), `article` (single article), `user` (user profile) |
| operation | string | `getAll` | true | Operation to perform on the selected resource |

### Resource: `all` — Operation: `getAll`

Returns a paginated list of Hacker News items (stories, comments, polls, jobs). Queries the Algolia HN Search API.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | false | false | If true, fetches all matching results across pages; otherwise respects the `limit` value |
| limit | number | 20 | false | Maximum number of items to return per execution (relevant when `returnAll` is false) |

### Resource: `article` — Operation: `get`

Returns a single Hacker News article by its Algolia objectID.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| articleId | string | — | true | The Algolia objectID (e.g. returned from a search query or visible in HN URLs as the story ID) |

### Resource: `user` — Operation: `get`

Returns a single Hacker News user profile by username.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| userId | string | — | true | Hacker News username |
| limit | number | 20 | false | Maximum number of recent submissions to include (uses the `hitsPerPage` parameter on the Algolia user endpoint) |

### Tool-only behavior

When used as an AI agent tool, all parameters support `$fromAI()` expressions for dynamic population by the LLM. No additional tool-optimization response options are exposed — the full API response data is returned to the agent.

## Runtime behavior

### Input

Consumes one item from the `main` input. All parameters may reference expression values from the input item's `json` data.

### Output

The output structure mirrors the public Hacker News API responses from the Algolia-powered endpoints.

**`all` → `getAll`:** Returns an object with `results` (array of items) and `nbPages` (total result pages). Each item contains fields such as `objectID`, `title`, `url`, `author`, `points`, `num_comments`, `created_at`, `created_at_i`, `story_id`, `_tags`, and `_highlightResult`.

**`article` → `get`:** Returns a single item object with fields including `id`, `author`, `title`, `url`, `points`, `num_comments`, `created_at`, `created_at_i`, `children` (array of comment IDs).

**`user` → `get`:** Returns a user object with fields including `username`, `about`, `karma`, `created_at`, and `submissions` (array of recent items). The `limit` parameter controls how many submissions are returned.

Each input item produces exactly one output item.

### Errors

If the requested resource does not exist (e.g. invalid articleId, unknown userId), the node throws an error (workflow stops or `continueOnFail` path is taken). Network errors and API timeouts are also thrown. Invalid resource or operation combinations are rejected at validation time.

### Expressions

All parameters accept n8n expression strings. This includes `resource`, `operation`, `articleId`, `userId`, `limit`, and `returnAll`.

## Acceptance tests

### Test: search all recent items

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "all",
  "operation": "getAll",
  "limit": 5
}
```

**Expect** output[0] to contain:
```json
[{
  "json": {
    "results": [
      {
        "objectID": "<string>",
        "title": "<string>",
        "author": "<string>",
        "points": "<number>",
        "num_comments": "<number>",
        "created_at": "<string>",
        "url": "<string>"
      }
    ],
    "nbPages": "<number>"
  }
}]
```

The exact values depend on live HN data; the test verifies that `results` is a non-empty array and each entry has `objectID`, `title`, and `author` as strings.

### Test: fetch a single article by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "article",
  "operation": "get",
  "articleId": "12345678"
}
```

**Expect** output[0] to contain:
```json
[{
  "json": {
    "id": 12345678,
    "author": "<string>",
    "title": "<string>",
    "url": "<string>",
    "points": "<number>",
    "num_comments": "<number>",
    "created_at": "<string>"
  }
}]
```

### Test: fetch a user profile

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "get",
  "userId": "pg",
  "limit": 5
}
```

**Expect** output[0] to contain:
```json
[{
  "json": {
    "username": "pg",
    "about": "<string>",
    "karma": "<number>",
    "created_at": "<string>",
    "submissions": []
  }
}]
```

### Test: invalid article throws

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "article",
  "operation": "get",
  "articleId": "0"
}
```

**Expect** the node to throw an error (no output items produced).

### Test: articleId from input expression

**Given** input items:
```json
[{ "json": { "storyId": "9876543" } }]
```

**Parameters:**
```json
{
  "resource": "article",
  "operation": "get",
  "articleId": "={{ $json.storyId }}"
}
```

**Expect** output[0] to contain the article data for ID 9876543.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Three resources (all, article, user) | documented | Public docs list All (getAll), Article (get), User (get) |
| No credentials needed | documented | Confirmed in public docs — no auth required |
| Output shape (Algolia response fields) | inferred | Based on public Algolia HN Search API and corpus schema descriptors; exact field normalization is internal to the node |
| Tool-specific $fromAI() support | documented | Common pattern across all n8n tool nodes, confirmed in public tool docs |
| Article get by `articleId` | inferred | Parameter name not confirmed in public docs; behaves similar to other get-by-ID patterns in n8n |
| `returnAll` and `limit` for search | inferred | Standard pagination pattern across n8n nodes; exact defaults are based on common n8n conventions |
| Error behavior | inferred | Standard node error handling consistent with n8n conventions |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/hackerNewsTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

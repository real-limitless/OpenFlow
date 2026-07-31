---
type: n8n-nodes-base.hackerNews
displayName: Hacker News
category: Communication, Marketing
versions: [1]
priority: low
status: specced
---

# Hacker News

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hackernews/ | Public docs only |
| https://github.com/HackerNews/API | Third-party service API docs |
| https://hn.algolia.com/api | Third-party service API docs |

## Wire format

- **Type string:** `n8n-nodes-base.hackerNews`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** none (no authentication required)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `all` | yes | — | One of `all`, `article`, `user` |
| operation | fixed | — | yes | — | Depends on resource: `all` → `getAll`, `article` → `get`, `user` → `get` |
| articleId | string | — | yes | resource=article, operation=get | Numeric Hacker News story/item ID |
| userId | string | — | yes | resource=user, operation=get | Hacker News username |

## Runtime behavior

### Input

Pass-through items. This node does not read input item data; every input item produces an independent API call.

### Output

Each input item produces one output item. The output JSON body varies by resource:

- **All > GetAll:** Array of Hacker News items from the Algolia search API. Each item includes `author`, `title`, `url`, `points`, `num_comments`, `objectID`, `created_at`, `created_at_i`, `story_id`, `_tags`, `children`, and `_highlightResult`. Returns items sorted by date by default (newest first).
- **Article > Get:** Single article object from the Firebase API. Fields include `id`, `title`, `author`, `url`, `score`, `descendants`, `time`, `type`, `kids` (comment IDs).
- **User > Get:** Single user object from the Firebase API. Fields include `id`, `created`, `karma`, `about`, `submitted` (array of story/comment IDs).

### Errors

- Missing or invalid `articleId` / `userId` → node throws a descriptive error.
- Network or API failure → node throws with the HTTP error message.
- `continueOnFail`: when enabled, errored items produce `{ json: { error: string } }` in output[0] instead of halting.

### Expressions

All parameter fields accept expression strings.

### AI tool compatibility

This node is flagged as usable as an AI agent tool. When used in that mode, the node presents a simplified parameter surface and the AI populates parameters automatically.

## Acceptance tests

### Test: all — get all items

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "all",
  "operation": "getAll"
}
```

**Expect** output[0] to contain an array of HN items with fields `author`, `title`, `objectID`, `url`, `points`, `num_comments`, `created_at`. At least one item must be present (the live Algolia API always returns results). Verify `objectID` is a string and `author` is a non-empty string.

### Test: article — get by ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "article",
  "operation": "get",
  "articleId": "8863"
}
```

**Expect** output[0].json to contain an object with numeric `id: 8863`, non-empty `title`, and non-empty `author` strings.

### Test: user — get by username

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "get",
  "userId": "pg"
}
```

**Expect** output[0].json to contain `id: "pg"`, numeric `karma`, and numeric `created`.

### Test: continueOnFail with invalid articleId

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "article",
  "operation": "get",
  "articleId": "invalid",
  "continueOnFail": true
}
```

**Expect** output[0] to have a single item with `{ json: { error: ... } }`.

### Test: multi-item pass-through

**Given** input items:

```json
[
  { "json": {} },
  { "json": {} }
]
```

**Parameters:**

```json
{
  "resource": "all",
  "operation": "getAll"
}
```

**Expect** output[0] to contain 2 items (one per input), each with an array of HN items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact parameter names (articleId, userId) | inferred from public docs + external API shape | Public docs list 3 operations without specifying parameter names. Names follow n8n convention. |
| Output shape for each resource | inferred from external HN API docs | The two underlying APIs (Firebase for article/user, Algolia for all/getAll) are well-documented publicly. |
| Version model | documented | Single v1.0 per node.json. |
| Category assignment | documented | Communication + Marketing per node.json. |
| Default sort for getAll | inferred | Algolia search-by-date default is newest-first. |
| AI tool flag | documented | Public docs explicitly note this is usable as an AI tool. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/hacker-news.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
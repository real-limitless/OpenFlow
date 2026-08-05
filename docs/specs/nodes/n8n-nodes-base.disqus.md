# Disqus

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.disqus.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/disqus.md | Public docs only |
| https://disqus.com/api/docs/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.disqus`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `disqusApi` (API access token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `forum` | yes | | Fixed to `Forum` |
| operation | string | `get` | yes | | One of: `Get` (forum details), `Get Categories`, `Get Threads`, `Get Posts` |
| forum | string | — | yes | | Disqus forum shortname (e.g. `myforum`) |
| threadId | string | — | no | operation = Get Posts | Identifier of the thread to list posts for (maps to Disqus API `thread` param) |
| limit | number | — | no | | Maximum results per page (Disqus default/max per API) |
| cursor | string | — | no | | Pagination cursor from a prior response for fetching the next page |

All parameters accept expression strings.

## Runtime behavior

### Input

Each input item is processed independently. The node acts as a read-only data fetcher — parameters from each item drive a single Disqus API call.

### Output

For each input item, the node outputs one item containing the parsed JSON response body from the Disqus API. The shape mirrors the Disqus v3.0 API response envelope:

```
{
  "code": number,
  "response": { ... }   // resource-specific payload
  "cursor": {           // present when more pages exist
    "prev": string | null,
    "next": string | null,
    ...
  }
}
```

The `response` field contains the resource-specific data:

- **Forum → Get (details):** Forum details object (id, name, shortname, description, etc.)
- **Forum → Get Categories:** Array of category objects (id, title, order, forum)
- **Forum → Get Threads:** Array of thread objects (id, title, link, posts, likes, etc.)
- **Forum → Get Posts:** Array of post objects (id, message, author, createdAt, etc.)

### Errors

- API errors (invalid forum, auth failure, rate limiting) produce an error item. With `continueOnFail`, the item is passed through with error info appended.
- Rate limit: basic API accounts are restricted to 1,000 requests per hour.

### Expressions

The `forum`, `threadId`, `limit`, and `cursor` parameters accept expressions.

## Acceptance tests

### Test: forum details — single item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "forum",
  "operation": "get",
  "forum": "myforum"
}
```

**Expect** output[0]:

```json
[{ "json": {
    "code": 0,
    "response": {
      "id": "12345",
      "name": "My Forum",
      "shortname": "myforum",
      "description": "A test forum"
    }
  }
}]
```

**Mock:** Disqus API `GET /api/3.0/forums/details?forum=myforum` returns a valid forum object in `response`.

### Test: list categories — paginated

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "forum",
  "operation": "getCategories",
  "forum": "myforum"
}
```

**Expect** output[0]:

```json
[{ "json": {
    "code": 0,
    "response": [
      { "id": "1", "title": "General", "order": 0, "forum": "myforum" },
      { "id": "2", "title": "Support", "order": 1, "forum": "myforum" }
    ],
    "cursor": { "prev": null, "next": "cursor:...", "hasNext": true }
  }
}]
```

**Mock:** Disqus API `GET /api/3.0/forums/listCategories?forum=myforum` returns a category list with pagination cursor.

### Test: list threads in a forum

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "forum",
  "operation": "getThreads",
  "forum": "myforum"
}
```

**Expect** output[0]:

```json
[{ "json": {
    "code": 0,
    "response": [
      { "id": "thread1", "title": "Welcome thread", "link": "https://example.com/thread1", "posts": 5 }
    ]
  }
}]
```

**Mock:** Disqus API `GET /api/3.0/forums/listThreads?forum=myforum` returns a thread list.

### Test: list posts in a thread

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "forum",
  "operation": "getPosts",
  "forum": "myforum",
  "threadId": "thread1"
}
```

**Expect** output[0]:

```json
[{ "json": {
    "code": 0,
    "response": [
      { "id": "post1", "message": "<p>Hello world</p>", "author": { "username": "alice" }, "createdAt": "2024-01-01T00:00:00" }
    ]
  }
}]
```

**Mock:** Disqus API `GET /api/3.0/forums/listPosts?forum=myforum&thread=thread1` returns a post list.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation names and resource structure | documented | Public n8n docs list 4 Forum operations |
| Credential type | documented | `disqusApi` — API access token |
| Parameter names for Disqus API mapping | inferred | n8n docs do not expose internal parameter names; Disqus API v3.0 docs confirm `forum`, `thread`, `cursor`, `limit` query params |
| Response shape | inferred | Standard Disqus API v3.0 envelope (`code`, `response`, `cursor`) is well-documented in Disqus API Reference |
| Pagination support | inferred | Disqus API uses cursor-based pagination; accepted that pagination ties to input parameter `cursor` |
| Error response format | inferred | Follows Disqus error code conventions documented at https://disqus.com/api/docs/errors/ |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.disqus.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

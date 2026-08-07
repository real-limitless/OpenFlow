---
type: n8n-nodes-base.raindropTool
displayName: Raindrop Tool
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Raindrop Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.raindrop/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/raindrop/ | Public docs only |
| https://developer.raindrop.io/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.raindropTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `raindropOAuth2Api` (OAuth2 — requires Client ID + Client Secret)

## Parameters

The tool exposes the same four resource categories as the base Raindrop node. Parameters that accept expressions support `$fromAI()` for dynamic AI-agent population.

### Bookmark resource

| Operation | Required params | Optional / additional params | Notes |
|-----------|----------------|------------------------------|-------|
| Create | `url` | `collectionId`, `tags` (comma-separated), `title`, `pleaseParse` (boolean) | Creates a new bookmark. `pleaseParse` enables server-side metadata extraction. |
| Delete | `bookmarkId` | — | Removes a bookmark by its Raindrop ID. |
| Get | `bookmarkId` | — | Retrieves a single bookmark. |
| Get All | — | `collectionId`, `search` (full-text), `sort`, `page` | Lists bookmarks, scoped to collection or free-text query. |
| Update | `bookmarkId` | `url`, `collectionId`, `tags`, `title`, `pleaseParse` | Updates fields on an existing bookmark. |

### Collection resource

| Operation | Required params | Optional / additional params | Notes |
|-----------|----------------|------------------------------|-------|
| Create | `title` | `public` (boolean), `sort`, `description` | Creates a new collection (folder). |
| Delete | `collectionId` | — | Deletes a collection by ID. |
| Get | `collectionId` | — | Retrieves a single collection. |
| Get All | — | `page` | Lists all collections for the authenticated user. |
| Update | `collectionId` | `title`, `public`, `sort`, `description` | Updates a collection's fields. |

### Tag resource

| Operation | Required params | Optional / additional params | Notes |
|-----------|----------------|------------------------------|-------|
| Delete | `tag` (tag name) | — | Deletes a tag by name. |
| Get All | — | — | Lists all tags for the authenticated user. |

### User resource

| Operation | Required params | Optional / additional params | Notes |
|-----------|----------------|------------------------------|-------|
| Get | — | — | Retrieves the authenticated user's profile. |

## Runtime behavior

### Input

Input items are processed independently. Parameter values can be provided statically, as n8n expressions, or populated by the AI agent via `$fromAI()`. The tool is designed to be invoked from an AI Agent node, which supplies parameters based on the running agent's conversation state.

### Output

Each output item contains the Raindrop REST API response wrapped in `{ json: ... }`. Response shapes follow the Raindrop API v1 contract: bookmark objects include `_id`, `link`, `title`, `collection`, `tags`, `created`; collection objects include `_id`, `title`, `public`, `count`, `created`; user objects include `_id`, `email`, `fullName`, `avatar`.

### Errors

- HTTP 4xx/5xx responses from the Raindrop API cause the tool to throw, halting execution for that item.
- With `continueOnFail` enabled, errored items pass to the error output branch.
- The API enforces 120 requests/minute per user; HTTP 429 is returned on overage. No client-side retry.

### Expressions

All parameter values accept n8n expression strings and `$fromAI()` for dynamic AI-agent population. This is the key distinction from the base Raindrop node — the tool variant is optimized for AI agent use where parameter values are determined conversationally.

## Acceptance tests

### Test: Bookmark Get via AI Agent

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bookmark",
  "operation": "get",
  "bookmarkId": "={{ $fromAI() }}"
}
```

**Expect** output[0] to contain a `json` object with Raindrop bookmark shape (`_id`, `link`, `title`, `collection`, `tags`, `created`).

### Test: Collection Create with static params

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "collection",
  "operation": "create",
  "title": "AI Agent Collection"
}
```

**Expect** output[0].json to contain `_id`, `title` equal to "AI Agent Collection", and a `created` timestamp.

### Test: Tags Get All

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "tag",
  "operation": "getAll"
}
```

**Expect** output[0].json to contain a `result` array of tag objects, each with `_id` and `tags` (array of tag names).

### Test: User Get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "get"
}
```

**Expect** output[0].json to contain the authenticated user profile with `_id`, `email`, `fullName`, and `avatar` fields.

### Test: Bookmark Search with $fromAI expression

**Given** input items:

```json
[{ "json": { "query": "machine learning" } }]
```

**Parameters:**

```json
{
  "resource": "bookmark",
  "operation": "getAll",
  "search": "={{ $fromAI() || $json.query }}"
}
```

**Expect** output[0] to contain bookmark results matching the search term, with the search value resolved from the AI agent's conversational context or falling back to the input item's `query` field.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/Operation list | Documented (n8n public docs) | Identical to base Raindrop node: Bookmark (5 ops), Collection (5 ops), Tag (2 ops), User (1 op). |
| Credential type | Documented (n8n public docs) | Same as base Raindrop node: `raindropOAuth2Api`. |
| Type string | Confirmed (corpus manifest) | `n8n-nodes-base.raindropTool`. |
| $fromAI() support | Documented (n8n public docs) | Standard AI tool pattern; inferred from other tool-nodes in the codebase. |
| Separate docs page | Inferred | No dedicated public docs page exists for the Tool variant — it shares the base page. |
| Parameter defaults/enums | Inferred from base node | Tool variant replicates base node parameters; exact UI grouping may differ. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.raindropTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

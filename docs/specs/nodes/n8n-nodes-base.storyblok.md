---
type: n8n-nodes-base.storyblok
displayName: Storyblok
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Storyblok

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.storyblok/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/storyblok/ | Public docs only |
| https://www.storyblok.com/docs/api/management | Public docs only |
| https://www.storyblok.com/docs/api/content-delivery/v1 | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.storyblok`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `storyblokApi` — two authentication modes:
  - **Content API key** — read-only access to the Storyblok Content Delivery API (v1). Uses a Workspace Access Token (Public or Preview access level).
  - **Management API key** — full CRUD via a Personal Access Token against the Storyblok Management API v1 (`mapi.storyblok.com`).

## Parameters

The node groups operations under two **API domains**, selected by the user at the top level. Within each domain, a single **Story** resource is available with several operations.

### domain | API selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `source` | string | `content` | yes | `"content"` for Content Delivery API (read-only); `"management"` for Management API (full CRUD) |

### Content API operations (`source = "content"`)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `operation` | string | `get` | yes | `"get"` (single story) or `"getAll"` (list) |
| `spaceId` | string | — | yes | Storyblok Space ID (numeric). Expression-enabled. |
| `storyId` | string (content `get`) | — | conditional | Story ID or UUID for retrieving a single story |
| `filters` | object | `{}` | no | Free-form query parameters passed to the CDN API (`starts_with`, `with_tag`, `by_slugs`, `content_type`, `language`, `search_term`, `sort_by`, `per_page`, `page`, `version`, `filter_query`). Each key-value pair appended as a query string parameter. See Storyblok CDN v1 API docs. |

### Management API operations (`source = "management"`)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `operation` | string | `get` | yes | `"get"` (single), `"getAll"` (list), `"delete"`, `"publish"`, `"unpublish"` |
| `spaceId` | string | — | yes | Storyblok Space ID (numeric). Expression-enabled. |
| `storyId` | string | — | conditional | Required for `get`, `delete`, `publish`, `unpublish` |
| `filters` | object | `{}` | no | Free-form query parameters for `getAll`: `text_search`, `sort_by`, `by_ids`, `by_uuids`, `with_tag`, `starts_with`, `with_summary`, `is_published`, `folder_only`, `per_page`, `page`. See Storyblok Management API Stories docs. |

## Runtime behavior

### Input

The node accepts input items but does not require them. Parameters `spaceId`, `storyId`, and filter values can reference incoming JSON fields via expressions.

For `delete`, `publish`, and `unpublish` operations, each input item is processed individually — unless `executeOnce` mode is enabled (TBD in implementation), in which case only the first item is used.

### Output

**Content API:**
- `get` — returns the Storyblok story object under a `story` key in the output JSON. The story object contains `id`, `uuid`, `name`, `slug`, `full_slug`, `content` (the structured body per content type), `tag_list`, `published`, `updated_at`, `created_at`, and other metadata as defined by the Storyblok CDN API.
- `getAll` — returns a `stories` array. Each output item contains one story object (the node splits the array, one per item).

**Management API:**
- `get` — returns the story object (same shape as CDN but without resolved content by default).
- `getAll` — returns a `stories` array, split per item.
- `delete` — returns a success indicator. On failure throws an error.
- `publish` / `unpublish` — returns the response from the Management API (typically the story object with updated `published` state). On failure throws an error.

### Errors

- Invalid credentials or missing scoped access returns a 401/403 error that propagates as a node error.
- Missing required parameters (`spaceId`, `storyId`) throws a validation error before any API call.
- `continueOnFail` — if enabled, the node outputs the error as the item JSON and continues execution.
- API rate-limit (429) responses should be surfaced as retryable errors.

### Expressions

All string parameters (`spaceId`, `storyId`) and filter values accept expressions. The `source` and `operation` enum selections are static.

## Acceptance tests

### Test: content get single story

**Given** one input item:
```json
[{ "json": { "id": "12345" } }]
```

**Parameters:**
```json
{
  "source": "content",
  "operation": "get",
  "spaceId": "288868",
  "storyId": "={{ $json.id }}",
  "filters": {}
}
```

**Expect** output[0] contains a `story` object with at minimum `id` (number), `name` (string), `slug` (string), `full_slug` (string), `content` (object), `published` (boolean).

### Test: content getAll with filters

**Given** one input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "source": "content",
  "operation": "getAll",
  "spaceId": "288868",
  "filters": {
    "starts_with": "blog/",
    "per_page": "10",
    "version": "published"
  }
}
```

**Expect** output[0] contains a `stories` array. Each element is a story object. The number of output items matches the number of returned stories (array split).

### Test: management publish story

**Given** one input item:
```json
[{ "json": { "story_id": "2141" } }]
```

**Parameters:**
```json
{
  "source": "management",
  "operation": "publish",
  "spaceId": "288868",
  "storyId": "={{ $json.story_id }}"
}
```

**Expect** output[0] contains a story object with `published` set to `true`.

### Test: management delete story

**Given** one input item:
```json
[{ "json": { "story_id": "2141" } }]
```

**Parameters:**
```json
{
  "source": "management",
  "operation": "delete",
  "spaceId": "288868",
  "storyId": "={{ $json.story_id }}"
}
```

**Expect** output[0] contains a success response. The API call is `DELETE /v1/spaces/{space}/stories/{storyId}`.

### Test: missing required parameter

**Parameters:**
```json
{
  "source": "content",
  "operation": "get",
  "spaceId": "",
  "storyId": ""
}
```

**Expect** validation error thrown before any API request.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Content API URL | documented | `https://cdn.storyblok.com/v1/cdn/stories` (per Storyblok CDN v1 docs) |
| Management API URL | documented | `https://mapi.storyblok.com/v1/spaces/{space_id}/stories/...` |
| CDN v1 vs v2 | documented | n8n docs state "Content API v1 only" |
| Filter parameter mapping | inferred | The spec abstracts filters as a free-form key-value object; the exact set of supported filter keys is documented by Storyblok, not hard-coded |
| Credential type | documented | `storyblokApi` — content API key or personal access token |
| Error shapes | inferred | Standard HTTP response codes; exact error JSON shapes not documented in n8n docs |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.storyblok.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

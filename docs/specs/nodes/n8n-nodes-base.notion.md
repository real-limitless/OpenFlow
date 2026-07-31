---
type: n8n-nodes-base.notion
displayName: Notion
category: Productivity
versions: [1, 2, 2.1, 2.2]
priority: high
status: implemented
---

# Notion

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/notion.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.notion`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `notionApi` (internal integration token, required), `notionOAuth2Api` (OAuth2, available but commented out in v2+ code)

## Parameters

### Resource and operation selection

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `page` | yes | — | `block`, `database`, `databasePage`, `page`, `user` |
| operation | options | varies by resource | yes | show: resource | see per-resource tables below |

### Block resource (`resource: block`)

**Operations:** `append` (Append After), `getAll` (Get Child Blocks)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| blockId | resourceLocator | `{mode:'url', value:''}` | yes | show: block + append/getAll | Link or ID modes; regex-validated |
| returnAll | boolean | false | no | show: block + getAll | — |
| limit | number | 50 | no | show: block + getAll + returnAll=false | min 1, max 100 |
| fetchNestedBlocks | boolean | false | no | show: block + getAll | — |
| simplifyOutput | boolean | true | no | show: block + getAll, hide: @version 1,2 | v2.1+ only |
| children | fixedCollection | `{}` | no | show: block + append | Block contents via `Blocks.blocks()` — see Block Types |

### Database resource (`resource: database`)

**Operations:** `get`, `getAll` (Get Many), `search` (v2+ only)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| databaseId | resourceLocator | `{mode:'list', value:''}` | yes | show: database + get/search | List/Link/ID modes |
| returnAll | boolean | false | no | show: database + getAll/search | — |
| limit | number | 50 | no | show: database + getAll/search + returnAll=false | min 1, max 100 |
| text | string | '' | no | show: database + search | Search text |
| simple | boolean | true | no | show: database + getAll/get/search, hide: @version 1 | Simplify output |
| options.sort | fixedCollection | `{}` | no | show: database + search | direction: ascending/descending; timestamp: last_edited_time |

### Database Page resource (`resource: databasePage`)

**Operations:** `create`, `get` (v2+ only), `getAll` (Get Many), `update`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| databaseId | resourceLocator | `{mode:'list', value:''}` | yes | show: databasePage + create/getAll | List/Link/ID modes |
| pageId | resourceLocator | `{mode:'url', value:''}` | yes | show: databasePage + get/update | Link or ID modes |
| title | string | '' | no | show: databasePage + create, hide: @version 1 | Page title; v2+ only |
| simple | boolean | true | no | show: databasePage + create/get/update/getAll | — |
| propertiesUi | fixedCollection | `{}` | no | show: databasePage + create/update | Fixed collection `propertyValues[]` with key/type/typed value fields |
| returnAll | boolean | false | no | show: databasePage + getAll | — |
| limit | number | 50 | no | show: databasePage + getAll + returnAll=false | min 1, max 100 |
| options.iconType | options | `emoji` | no | show: databasePage + create/update | emoji or file |
| options.icon | string | '' | no | show: databasePage + create/update | Emoji or file URL |
| options.downloadFiles | boolean | false | no | show: databasePage + getAll, hide: @version 1 | — |
| options.filter | fixedCollection | `{}` | no | show: databasePage + getAll | Single or multiple conditions |
| options.sort | fixedCollection | `[]` | no | show: databasePage + getAll | Multiple sort values; timestamp/property + direction |
| searchFilters | fixedCollection | `{}` | no | show: databasePage + getAll | From `getSearchFilters()` — composite filter conditions |

### Page resource (`resource: page`)

**Operations:** `create`, `archive` (v2+ only), `search`, `get` (v1 only)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| pageId | resourceLocator | `{mode:'url', value:''}` | yes | show: page + create/archive | V1: string type for `get` |
| title | string | '' | yes | show: page + create | Required for page create |
| simple | boolean | true | no | show: page + create/archive/get/search | — |
| text | string | '' | no | show: page + search | Search text |
| returnAll | boolean | false | no | show: page + search | — |
| limit | number | 50 | no | show: page + search + returnAll=false | min 1, max 100 |
| options.iconType | options | `emoji` | no | show: page + create | emoji or file |
| options.icon | string | '' | no | show: page + create | Emoji or file URL |
| options.filter | fixedCollection | `{}` | no | show: page + search | object type filter (database/page) |
| options.sort | fixedCollection | `{}` | no | show: page + search | direction + timestamp |

### User resource (`resource: user`)

**Operations:** `get`, `getAll` (Get Many)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| userId | string | '' | yes | show: user + get | User UUID |
| returnAll | boolean | false | no | show: user + getAll | — |
| limit | number | 50 | no | show: user + getAll + returnAll=false | min 1, max 100 |

### Block types (via `Blocks.blocks()`)

The `children` parameter (used in Block `append` and Page/DatabasePage `create`) accepts a fixed collection named `children` with an `entryValues` sub-collection supporting:

| blockType value | displayName | key sub-field |
|----------------|-------------|---------------|
| paragraph | Paragraph | richText (boolean) + textContent/structured text |
| heading_1 | Heading 1 | richText + textContent/structured text |
| heading_2 | Heading 2 | richText + textContent/structured text |
| heading_3 | Heading 3 | richText + textContent/structured text |
| toggle | Toggle | richText + textContent/structured text |
| to_do | To-Do | richText + textContent/structured text + checked (boolean) |
| bulleted_list_item | Bulleted List Item | richText + textContent/structured text |
| numbered_list_item | Numbered List Item | richText + textContent/structured text |
| quote | Quote | richText + textContent/structured text |
| divider | Divider | (no text content) |
| table_of_contents | Table of Contents | (no text content) |
| code | Code | richText + textContent/structured text + language (options) |
| callout | Callout | richText + structured text + iconType (emoji/file) + icon |
| image | Image | externalUrl (string) + captionText |
| video | Video | externalUrl (string) + captionText |
| file | File | externalUrl (string) + captionText |
| embed | Embed | externalUrl (string) + captionText |
| bookmark | Bookmark | externalUrl (string) + captionText |
| equation | Equation | expression (string — LaTeX) |
| breadcrumb | Breadcrumb | (no text content) |
| link_preview | Link Preview | externalUrl (string) |
| synced_block | Synced Block | syncedFromBlockId (string) |
| template | Template | richText + textContent/structured text |
| link_to_page | Link to Page | pageId (resourceLocator) |

Each block supports `nestedChildren` (fixedCollection) for nesting blocks recursively.

## Runtime behavior

### Input

Each input item is processed independently. For create/update operations, one output item is produced per input item. For getAll/search operations, items from the API response are flattened into individual output items.

### Output

The node directly passes Notion API response data. When `simple` (`simplify` / `simplifyOutput`) is `true`, the node returns a simplified object with selected fields (id, name, url, object, type, etc.). When `false`, the raw Notion API response is returned as `json`.

**Simplified output example (databasePage:create):**
```
{ id: string, name: string, url: string }
```

**Simplified output example (user:getAll):**
```
{ id: string, name: string, object: string, person?: { email: string }, type: string }
```

### Errors

- **Missing credentials:** Node will fail with a credential error if `notionApi` is not configured.
- **API errors:** Notion API errors (4xx/5xx) propagate as node errors (e.g., "Validation error" for invalid property values, "Notion API validation error" for invalid page IDs).
- **Resource locator validation:** Invalid URLs or IDs that fail regex validation produce a user-facing validation error before execution.
- **`continueOnFail`:** When enabled, errored items produce `{ json: { error: string } }` output; remaining items continue processing.

### Expressions

All string, number, boolean, and options parameters accept expressions (`{{ ... }}`). Resource locator values also accept expressions. The `options` collection fields support expressions.

## Acceptance tests

### Test: databasePage — create with title and properties

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "databasePage",
  "operation": "create",
  "databaseId": { "mode": "id", "value": "ab1545b247fb49fa92d6f4b49f4d8116" },
  "title": "New Task",
  "simple": true,
  "propertiesUi": {
    "propertyValues": [
      { "key": "Status|select", "type": "select", "selectValue": "In Progress" },
      { "key": "Due Date|date", "type": "date", "date": "2026-08-15" }
    ]
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "id": "abc123…",
    "name": "New Task",
    "url": "https://www.notion.so/New-Task-abc123"
  }
}]
```

### Test: page — create with blocks

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "page",
  "operation": "create",
  "pageId": { "mode": "id", "value": "b4eeb113e118403aa450af65ac25f0b9" },
  "title": "My New Page",
  "simple": true,
  "options": {
    "iconType": "emoji",
    "icon": "🚀"
  },
  "children": {
    "entryValues": [
      {
        "type": "heading_1",
        "heading_1": { "richText": false, "textContent": "Welcome" }
      },
      {
        "type": "paragraph",
        "paragraph": { "richText": false, "textContent": "This is a paragraph." }
      }
    ]
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "id": "page-id-…",
    "name": "My New Page",
    "url": "https://www.notion.so/My-New-Page-page-id"
  }
}]
```

### Test: block — get child blocks with pagination

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "block",
  "operation": "getAll",
  "blockId": { "mode": "id", "value": "c44444444444bbbbb4d32fdfdd84e" },
  "returnAll": false,
  "limit": 50,
  "fetchNestedBlocks": false,
  "simplifyOutput": true
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "id": "block-id-1",
    "type": "paragraph",
    "text": "First block text"
  }
}]
```

### Test: user — get all users

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "user",
  "operation": "getAll",
  "returnAll": true
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "id": "user-uuid-1",
    "name": "Alice",
    "object": "user",
    "person": { "email": "alice@example.com" },
    "type": "person"
  }
}]
```

### Test: database — search with sort

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "database",
  "operation": "search",
  "text": "Project",
  "returnAll": false,
  "limit": 20,
  "simple": true,
  "options": {
    "sort": {
      "sortValue": { "direction": "descending", "timestamp": "last_edited_time" }
    }
  }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "id": "db-id-…",
    "name": "Project Database",
    "url": "https://www.notion.so/db-id"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation matrix | documented | Complete from docs page; v1 vs v2+ diffs from descriptor |
| Parameter names/types/defaults | descriptor | All params confirmed from npm package descriptor (v2.15.1) |
| Block type options | descriptor | Complete list from Blocks.js descriptor |
| Output shapes | inferred | Schema JSON files show simplified output; raw response shape depends on Notion API |
| Version diffs | descriptor | v1 missing `database:search`, `page:archive`, `databasePage:get`; `@version` gating confirmed |
| Authentication options | documented | `notionApi` (API key) active; `notionOAuth2Api` (OAuth2) present in credential type list but commented out in node properties |
| Credential details | documented | Internal Integration Secret (token) or OAuth2 Client ID + Secret |
| `usableAsTool` | descriptor | v2.2+ enables AI agent tool usage |
| Notion API pagination | inferred | `returnAll`/`limit` pattern; Notion API uses cursor-based pagination |
| Simplified output coverage | inferred | Not all schema JSON files present; simplified shape requires reverse-engineering |

## OpenFlow mapping

- **Definition group:** `app`
- **Executor file:** `src/lib/engine/executors/notion.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

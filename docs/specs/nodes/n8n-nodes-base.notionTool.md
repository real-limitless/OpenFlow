---
type: n8n-nodes-base.notionTool
displayName: Notion Tool
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Notion Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/notion/ | Public docs only |
| https://developers.notion.com/reference/intro | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.notionTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `notionApi` (Internal Integration Token) or `notionOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `databasePage` | yes | — | High-level resource to operate on: `block`, `dataSource`, `database`, `databasePage`, `page`, `user` |
| operation | options | — | yes | depends on `resource` | Operation to perform on the selected resource |
| databaseId | string | — | conditional | resource=databasePage & operation in [create,get,getMany,update] | Notion Database ID (from URL or API) |
| pageId | string | — | conditional | resource=block,page & various operations | Notion Page/Block ID |
| blockId | string | — | conditional | resource=block & operation=appendAfter | Target block ID to append after |
| title | string | — | conditional | operation=create (databasePage, page) | Title property value for new page |
| properties | fixedCollection | — | no | operation=create,update | Page/database properties as key-value pairs |
| filter | json | — | no | operation=getMany,search | Notion API filter object |
| sorts | fixedCollection | — | no | operation=getMany,search | Sort specification (property, direction) |
| limit | number | 100 | no | operation=getMany,search | Maximum items to return |
| query | string | — | conditional | resource=dataSource & operation=search | Search query string |
| cursor | string | — | no | operation=getMany | Pagination cursor for next page |

## Runtime behavior

### Input

Consumes zero or more items on `main` input. Each item may provide expressions for parameters (e.g., `databaseId`, `pageId`, `properties`). When used as an AI tool, parameters can be populated via `$fromAI()`.

### Output

Produces items on `main` output with `json` containing the Notion API response:

- **Create operations:** Single item with created object (page, database page, etc.)
- **Get operations:** Single item with retrieved object
- **Get Many / Search operations:** One item per returned Notion object (page, block, user, etc.)
- **Update operations:** Single item with updated object
- **Archive operations:** Single item with archived object (archived: true)

Binary data is not produced; all responses are JSON.

### Errors

- **Authentication errors** (401): Thrown as node error — invalid/missing credentials or integration not shared with target pages
- **Not found errors** (404): Thrown as node error — invalid ID or insufficient permissions
- **Validation errors** (400): Thrown as node error — malformed properties, missing required fields
- **Rate limit errors** (429): Thrown as node error; implementer should respect `Retry-After` header
- **Network errors:** Thrown as node error
- **continueOnFail:** When enabled, failed items emit error output instead of throwing; successful items still produce output

### Expressions

All string parameters (`databaseId`, `pageId`, `blockId`, `title`, `query`, `filter`, `properties` values) accept expression syntax (`{{ $json.field }}`, `{{ $fromAI() }}`, etc.). The `filter` and `sorts` parameters accept JSON/expression input for dynamic query construction.

## Acceptance tests

### Test: create database page

**Given** input items:
```json
[{ "json": { "databaseId": "abc123", "title": "New Task", "status": "To Do" } }]
```

**Parameters:**
```json
{
  "resource": "databasePage",
  "operation": "create",
  "databaseId": "={{ $json.databaseId }}",
  "title": "={{ $json.title }}",
  "properties": {
    "values": [{ "name": "Status", "value": "={{ $json.status }}" }]
  }
}
```

**Expect** output[0] contains one item with `json` having:
- `object: "page"`
- `id` (string)
- `properties` containing Title and Status

---

### Test: get database pages with filter

**Given** input items:
```json
[{ "json": { "databaseId": "abc123", "status": "Done" } }]
```

**Parameters:**
```json
{
  "resource": "databasePage",
  "operation": "getMany",
  "databaseId": "={{ $json.databaseId }}",
  "filter": {
    "property": "Status",
    "select": { "equals": "={{ $json.status }}" }
  },
  "limit": 10
}
```

**Expect** output[0] contains 0-10 items, each with `json.object === "page"` and matching filter.

---

### Test: search pages

**Given** input items:
```json
[{ "json": { "query": "meeting notes" } }]
```

**Parameters:**
```json
{
  "resource": "page",
  "operation": "search",
  "query": "={{ $json.query }}",
  "limit": 5
}
```

**Expect** output[0] contains 0-5 items, each with `json.object === "page"`.

---

### Test: append block content

**Given** input items:
```json
[{ "json": { "blockId": "block123", "content": "Appended text" } }]
```

**Parameters:**
```json
{
  "resource": "block",
  "operation": "appendAfter",
  "blockId": "={{ $json.blockId }}",
  "properties": {
    "values": [
      { "name": "type", "value": "paragraph" },
      { "name": "paragraph.rich_text[0].text.content", "value": "={{ $json.content }}" }
    ]
  }
}
```

**Expect** output[0] contains one item with `json.object === "block"` and appended content.

---

### Test: get users

**Given** input items:
```json
[{}]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getMany",
  "limit": 20
}
```

**Expect** output[0] contains array of user objects with `json.object === "user"`, each having `id`, `name`, `type`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation matrix | documented | From public n8n docs Operations section |
| Parameter names (resource, operation, databaseId, pageId, etc.) | documented | Public docs + corpus confirmation of parameter names |
| Exact property structure for `properties` parameter | inferred | Notion API uses dynamic property schemas; spec uses abstract fixedCollection |
| Filter/sort JSON schema | documented | Notion API filter/sort objects documented at developers.notion.com |
| Pagination (cursor, limit) | documented | Standard Notion API pagination |
| AI tool mode ($fromAI) | documented | Public docs state "This node can be used as an AI tool" |
| Credential types (notionApi, notionOAuth2Api) | documented | Public credentials docs |
| Error handling specifics (continueOnFail) | inferred | Standard n8n node behavior |
| Binary data support | documented | Notion node does not handle binary; all JSON |

## OpenFlow mapping

- **Definition group:** `flow`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.notionTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
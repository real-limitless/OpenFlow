---
type: n8n-nodes-base.notion
displayName: Notion
category: Productivity
versions: [1, 2, 2.1, 2.2]
priority: high
status: specced
---

# Notion

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/notion.md | Public docs only |
| https://developers.notion.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.notion`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `notionApi` (Internal Integration Secret, Bearer token)
  - Requires `Notion-Version` header (defaults to `2022-02-22`)
  - Test endpoint: `GET https://api.notion.com/v1/users/me`

## Parameters

### Common parameters (apply across resources)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | — | yes | — | One of: `block`, `dataSource`, `database`, `databasePage`, `page`, `user` |
| operation | options | — | yes | depends on resource | See resource-specific operations below |
| returnAll | boolean | false | no | list operations | Return all matching results (handles pagination) |
| limit | number | 50 | no | when `returnAll`=false | Max items to return per request |
| simple | boolean | false | no | get/getAll operations | Return simplified output (strip Notion API metadata) |
| options | collection | — | no | varies | Additional optional parameters per operation |

### Resource: Block

| operation | description | key parameters |
|-----------|-------------|----------------|
| `append` | Append block children to an existing block/page | `blockId` (string, required), `blockUi.blockValues` (collection of blocks to append) |
| `getAll` | Retrieve all children of a block | `blockId` (string, required), `fetchNestedBlocks` (boolean, default false), `simplifyOutput` (boolean, v2.2+) |

### Resource: Data Source

| operation | description | key parameters |
|-----------|-------------|----------------|
| `get` | Retrieve a data source by ID | `dataSourceId` (string, required) |
| `search` | Search data sources | `text` (string), `options.sort` (collection), `simple` (boolean) |

### Resource: Database

| operation | description | key parameters |
|-----------|-------------|----------------|
| `get` | Retrieve a database by ID | `databaseId` (string, required), `simple` (boolean) |
| `getAll` | List databases accessible to the integration | `simple` (boolean) |
| `search` | Search databases by title | `text` (string), `options.sort` (collection), `simple` (boolean) |

### Resource: Database Page

| operation | description | key parameters |
|-----------|-------------|----------------|
| `create` | Create a new page in a database | `databaseId` (string, required), `title` (string), `propertiesUi.propertyValues` (collection), `blockUi.blockValues` (collection), `options.icon` (string), `options.iconType` (emoji\|file) |
| `get` | Retrieve a database page by ID | `pageId` (string, required), `simple` (boolean) |
| `getAll` | Query database pages with filters | `databaseId` (string, required), `filterType` (manual\|json), `filters.conditions` (collection), `matchType` (allFilters\|anyFilter), `options.sort` (collection), `options.downloadFiles` (boolean), `simple` (boolean) |
| `update` | Update a database page | `pageId` (string, required), `propertiesUi.propertyValues` (collection), `options.icon` (string), `options.iconType` (emoji\|file), `simple` (boolean) |

### Resource: Page

| operation | description | key parameters |
|-----------|-------------|----------------|
| `archive` | Archive (delete) a page | `pageId` (string, required), `simple` (boolean) |
| `create` | Create a new page (child of another page) | `pageId` (parent page, required), `title` (string), `blockUi.blockValues` (collection), `options.icon` (string), `options.iconType` (emoji\|file), `simple` (boolean) |
| `search` | Search pages by title/content | `text` (string), `options.filter` (collection), `options.sort` (collection), `simple` (boolean) |
| `getMarkdown` | Retrieve page content as Markdown | `pageId` (string, required) |
| `updateMarkdown` | Update page content from Markdown | `pageId` (string, required), `markdown` (string) |

### Resource: User

| operation | description | key parameters |
|-----------|-------------|----------------|
| `get` | Retrieve a user by ID | `userId` (string, required) |
| `getAll` | List all users in the workspace | `returnAll` (boolean), `limit` (number) |

### Property value mapping

When creating/updating database pages, property values are mapped from a simplified UI collection to Notion's typed property format. Supported Notion property types include: `title`, `rich_text`, `number`, `select`, `multi_select`, `date`, `people`, `files`, `checkbox`, `url`, `email`, `phone_number`, `formula`, `rollup`, `created_time`, `last_edited_time`, `created_by`, `last_edited_by`, `relation`. Read-only types (`formula`, `rollup`, `created_time`, `last_edited_time`, `created_by`, `last_edited_by`) are excluded from create/update payloads.

### Block formatting

Blocks are composed via a block builder UI (`blockUi.blockValues`) supporting standard Notion block types: paragraph, heading_1/2/3, bulleted_list_item, numbered_list_item, to_do, toggle, code, quote, callout, divider, image, video, file, embed, bookmark, equation, table_of_contents, column_list, column, table, table_row, breadcrumb, link_preview, template, synced_block, child_page, child_database. Nested blocks and database mentions (`@database`) are supported.

## Runtime behavior

### Input processing

- Consumes items from `main` input (0 or more)
- Each input item can drive a separate operation via expressions in parameters
- `itemsLength` determines iteration count for batch operations
- Binary data is not consumed directly; file references are passed via URLs in property values

### Output shape

- Produces items on `main` output (index 0)
- Each result item contains:
  - `json`: Notion API response object (full or simplified per `simple` parameter)
  - `pairedItem`: reference to input item index
- For `returnAll` operations, multiple result items may be produced per input item
- Simplified output (`simple: true`) strips Notion metadata (`object`, `id`, `created_time`, `last_edited_time`, `created_by`, `last_edited_by`, `parent`, `archived`, `url`, `public_url`) and flattens property values to primitive types where possible

### Error handling

- All Notion API errors are caught and wrapped via `prepareNotionError` (includes status code, Notion error code, message)
- If `continueOnFail` is enabled (node setting), failed items emit `{ json: { error: string }, pairedItem: { item: number } }` instead of throwing
- If `continueOnFail` is disabled, the first error throws and stops execution
- Invalid JSON in `filterJson` parameter throws immediately (validation error)
- Missing required parameters (e.g., `databaseId`, `pageId`) throw at parameter resolution time

### Expressions

All string parameters accept n8n expressions (`{{ $json.field }}`, `{{ $parameter.name }}`, etc.)
The node supports AI tool mode (`$fromAI()`) for dynamic parameter population when used as an AI agent tool.

### Pagination

- `returnAll: true` uses `notionApiRequestAllItems` to follow `next_cursor` until exhaustion
- `returnAll: false` uses `page_size`/`limit` for single-page results
- Database queries (`databasePage.getAll`) use Notion's `POST /databases/{id}/query` with cursor pagination
- Search operations use `POST /search` with cursor pagination

### Rate limits

Notion API enforces rate limits (3 requests/second per integration by default). The node does not implement client-side throttling; consumers should batch or delay if needed.

## Acceptance tests

### Test: Create database page

**Given** input items:
```json
[{ "json": { "title": "Meeting Notes", "status": "In Progress" } }]
```

**Parameters:**
```json
{
  "resource": "databasePage",
  "operation": "create",
  "databaseId": "test-database-id",
  "title": "={{ $json.title }}",
  "propertiesUi.propertyValues": [
    { "name": "Status", "value": "={{ $json.status }}", "type": "select" }
  ],
  "simple": true
}
```

**Expect** output[0] (one item per input):
```json
[{ "json": { "id": "page-id", "properties": { "Name": { "title": [...] }, "Status": { "select": { "name": "In Progress" } } }, "pairedItem": { "item": 0 } }]
```

### Test: Query database pages with filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "databasePage",
  "operation": "getAll",
  "databaseId": "test-database-id",
  "filterType": "manual",
  "matchType": "allFilters",
  "filters.conditions": [
    { "propertyName": "Status", "condition": "equals", "value": "Done" }
  ],
  "returnAll": true,
  "simple": true
}
```

**Expect** output[0] (array of matching pages):
```json
[{ "json": { "id": "page-1", "properties": { "Name": { "title": [...] }, "Status": { "select": { "name": "Done" } } } }, { "json": { "id": "page-2", "properties": { ... } } }]
```

### Test: Append blocks to page

**Given** input items:
```json
[{ "json": { "content": "New paragraph text" } }]
```

**Parameters:**
```json
{
  "resource": "block",
  "operation": "append",
  "blockId": "parent-page-id",
  "blockUi.blockValues": [
    { "type": "paragraph", "paragraph": { "rich_text": [{ "text": { "content": "={{ $json.content }}" } }] } }
  ]
}
```

**Expect** output[0]:
```json
[{ "json": { "object": "list", "results": [ { "object": "block", "type": "paragraph", "paragraph": { "rich_text": [...] } } ] }, "pairedItem": { "item": 0 } }]
```

### Test: Search pages

**Given** input items:
```json
[{ "json": { "query": "project plan" } }]
```

**Parameters:**
```json
{
  "resource": "page",
  "operation": "search",
  "text": "={{ $json.query }}",
  "simple": true,
  "limit": 10
}
```

**Expect** output[0]:
```json
[{ "json": { "object": "list", "results": [ { "id": "page-1", "properties": { "Name": { "title": [...] } } }, { "id": "page-2", "properties": { ... } } ] }, "pairedItem": { "item": 0 } }]
```

### Test: Get user list

**Given** input items:
```json
[{}]
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
[{ "json": { "object": "user", "id": "user-1", "name": "User One", "type": "person" } }, { "json": { "object": "user", "id": "user-2", "name": "User Two", "type": "person" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| All resources/operations | documented | Public n8n docs list all 6 resources with their operations |
| Parameter names/enums | inferred from corpus + public docs | Corpus used only to confirm exact parameter names (e.g., `blockUi.blockValues`, `propertiesUi.propertyValues`, `filterType`, `matchType`) that also appear in public docs examples |
| Property type mapping logic | inferred | Simplification rules and read-only property exclusion based on observed implementation patterns; not exhaustively documented in public docs |
| Block type list | inferred | Complete block type set from corpus; public docs reference "blocks" generically |
| AI tool mode ($fromAI) | documented | Public docs confirm "This node can be used as an AI tool" |
| Notion-Version header | documented | Credentials doc and corpus confirm `2022-02-22` default |
| Pagination behavior | documented + inferred | `returnAll` semantics documented; cursor pagination inferred from corpus |
| Error handling | inferred | `continueOnFail` behavior is standard n8n pattern; Notion-specific error wrapping inferred |
| Credential test endpoint | documented | Public credentials doc + corpus confirm `/users/me` |

## OpenFlow mapping

- **Definition group:** `flow` (app node with side effects)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.notion.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential type:** `notionApi` (maps to OpenFlow credential definition)
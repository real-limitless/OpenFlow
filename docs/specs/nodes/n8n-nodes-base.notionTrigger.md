---
type: n8n-nodes-base.notionTrigger
displayName: Notion Trigger
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Notion Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.notiontrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/notion/ | Public docs only |
| https://developers.notion.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.notionTrigger`
- **Aliases:** (none)
- **Inputs:** (none — trigger node)
- **Outputs:** `main` × 1
- **Credentials:** `notionApi` (Internal Integration Secret, Bearer token) or `notionOAuth2Api` (OAuth2)
  - Requires `Notion-Version` header (defaults to `2022-02-22`)
  - Test endpoint: `GET https://api.notion.com/v1/users/me`

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| events | multiOptions | `["pageAddedToDatabase"]` | yes | One or both of `pageAddedToDatabase`, `pageUpdatedInDatabase` |
| databaseId | string (resourceLocator) | — | yes | The Notion database to watch. Uses list-search to browse available databases the integration has access to. |
| pollingInterval | options | `everyHour` | no | How often to poll: `everyMinute`, `everyHour`, `everyDay`, `everyWeek`, `everyMonth`, or `custom` (cron expression). |
| expression | string | — | no | Cron expression when `pollingInterval` is `custom`. |
| options.simplifyOutput | boolean | false | no | When true, strip Notion API metadata from emitted page objects (analogous to `simple` on the action node). |
| options.downloadAttachments | boolean | false | no | When true, download file attachments from page properties as binary data. |
| options.filterJson | string | — | no | Optional JSON-formatted Notion API `filter` object passed directly in the database query (overrides basic event filtering). |
| options.sortJson | string | — | no | Optional JSON-formatted Notion API `sorts` array passed directly in the database query. |

## Runtime behavior

### Trigger mechanism

The node operates as a **polling trigger**. On each activation it records a timestamp cursor. On each poll cycle it queries the configured Notion database using `POST /v1/databases/{databaseId}/query` with a filter on `last_edited_time`.

- **Page added to database:** Filters for pages where `created_time` is after the last recorded cursor (the previous poll timestamp).
- **Page updated in database:** Filters for pages where `last_edited_time` is after the last recorded cursor.
- When both events are selected, a single query uses `last_edited_time` with an OR condition that also catches newly created pages.

### Output shape

Each poll cycle emits **one item per matching page** on `main` output. Multiple pages found in a single interval arrive as multiple items in a single firing.

```json
{
  "json": {
    "object": "page",
    "id": "page-uuid",
    "created_time": "2024-01-01T00:00:00.000Z",
    "last_edited_time": "2024-01-02T00:00:00.000Z",
    "created_by": { "object": "user", "id": "user-uuid" },
    "last_edited_by": { "object": "user", "id": "user-uuid" },
    "parent": { "type": "database_id", "database_id": "db-uuid" },
    "archived": false,
    "properties": {
      "Name": { "id": "title", "type": "title", "title": [...] },
      "Status": { "id": "abcd", "type": "select", "select": { "id": "opt-uuid", "name": "Done", "color": "green" } }
    },
    "url": "https://www.notion.so/page-slug-page-uuid",
    "public_url": null,
    "_event": "pageAddedToDatabase"
  }
}
```

When `simplifyOutput` is true, strip Notion metadata (`object`, `id`, `created_time`, `last_edited_time`, `created_by`, `last_edited_by`, `parent`, `archived`, `url`, `public_url`) and flatten property values to primitives.

A synthetic `_event` field indicates which event triggered the emission (`pageAddedToDatabase` or `pageUpdatedInDatabase`).

When `downloadAttachments` is true, each file-type property value is fetched and attached to the output item as binary data under a key derived from the property name.

### Manual execution

When the workflow is executed manually (test mode), the node polls once immediately and emits any matching pages. If no pages match since the default cursor (24 hours before manual execution), an empty output is returned.

### Error handling

- Notion API errors (rate limits, permission errors, invalid database ID) are thrown and halt execution.
- If the database ID is invalid or the integration lacks access, the node throws on first poll.
- The credential test endpoint `/v1/users/me` validates connectivity at credential configuration time.

### Expressions

- The `databaseId` parameter accepts expressions and `$fromAI()` for dynamic resolution in AI agent tool mode.
- `options.filterJson` and `options.sortJson` accept expression strings for dynamic filter construction.
- All other string parameters accept n8n expressions.

## Acceptance tests

### Test: Poll for newly added pages

**Given** a workflow activated with credentials pointing to a Notion workspace containing a database with pages.

**Parameters:**
```json
{
  "events": ["pageAddedToDatabase"],
  "databaseId": "test-database-id",
  "pollingInterval": "everyMinute"
}
```

**Expect** that on each poll cycle, any pages whose `created_time` is after the previous poll timestamp are emitted as individual items on `main` output with `_event: "pageAddedToDatabase"`.

### Test: Poll for updated pages

**Given** the same setup.

**Parameters:**
```json
{
  "events": ["pageUpdatedInDatabase"],
  "databaseId": "test-database-id",
  "pollingInterval": "everyMinute"
}
```

**Expect** that on each poll cycle, any pages whose `last_edited_time` is after the previous poll timestamp (and were not caught as newly created in this interval) are emitted with `_event: "pageUpdatedInDatabase"`.

### Test: Both events selected

**Parameters:**
```json
{
  "events": ["pageAddedToDatabase", "pageUpdatedInDatabase"],
  "databaseId": "test-database-id"
}
```

**Expect** that newly created pages and updated pages are both emitted, each with their respective `_event` label. A page that is both created and updated within one poll interval emits only once (as `pageAddedToDatabase`).

### Test: Simplified output

**Parameters:**
```json
{
  "events": ["pageAddedToDatabase"],
  "databaseId": "test-database-id",
  "options.simplifyOutput": true
}
```

**Expect** emitted items have flattened property values and no API metadata fields (`object`, `id`, `created_time`, `url`, etc.).

### Test: Custom filter JSON

**Parameters:**
```json
{
  "events": ["pageAddedToDatabase"],
  "databaseId": "test-database-id",
  "options.filterJson": "{\"property\":\"Status\",\"select\":{\"equals\":\"Done\"}}"
}
```

**Expect** that only pages matching the custom filter are emitted, overriding the default timestamp-based event filtering.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Two events (page added, page updated to database) | documented | Public n8n docs list both events |
| Polling trigger with configurable interval | documented | Standard n8n trigger node pattern; interval parameter inferred from similar polling triggers |
| Database resource locator with list-search | inferred from corpus | Type signature confirms `listSearch` method; public docs reference database selection |
| `_event` synthetic field naming | inferred | Not publicly documented; reasonable abstraction for downstream routing |
| `simplifyOutput` and `downloadAttachments` | inferred from corpus | Based on similar options in the Notion action node pattern |
| `filterJson` and `sortJson` overrides | inferred | Matches the database query pattern from the action node |
| Manual execution behavior | inferred | Standard n8n trigger manual-execution pattern |
| Paginated poll response with one-item-per-page | inferred | Based on standard n8n trigger node behavior |
| Credential auth types | documented | Public docs confirm API token and OAuth2 support |
| Notion API version header | documented | Public docs confirm `2022-02-22` default |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.notionTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential type:** `notionApi` or `notionOAuth2Api` (maps to OpenFlow credential definition)

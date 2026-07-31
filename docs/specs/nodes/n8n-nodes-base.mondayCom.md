---
type: n8n-nodes-base.mondayCom
displayName: monday.com
category: Productivity
versions: [1]
priority: medium
status: specced
---

# monday.com

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mondaycom.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mondaycom.md | Public docs only |
| https://developer.monday.com/api-reference/docs/basics | Public API docs |
| https://developer.monday.com/api-reference/docs/boards | Public API docs |
| https://developer.monday.com/api-reference/docs/columns | Public API docs |
| https://developer.monday.com/api-reference/docs/groups | Public API docs |
| https://developer.monday.com/api-reference/docs/items | Public API docs |

## Wire format

- **Type string:** `n8n-nodes-base.mondayCom`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `mondayComApi` (API token V2) or `mondayComOAuth2Api` (OAuth2)

## Parameters

The node is structured as a resource/operation discriminator. Default resource is `board`, default operation for board is `create`.

### Resource: Board

| Operation | name | type | required | notes |
|-----------|------|------|----------|-------|
| archive | boardId | string | yes | ID of the board to archive |
| create | name | string | yes | New board name |
| create | kind | enum: share, public, private | no | Board visibility |
| create | templateId | number | no | Optional board template ID (in additionalFields) |
| get | boardId | string | yes | ID of the board to retrieve |
| getAll | returnAll | boolean | no | Return all boards (default false) |
| getAll | limit | number | no | Max boards to return when returnAll=false |

### Resource: Board Column

| Operation | name | type | required | notes |
|-----------|------|------|----------|-------|
| create | boardId | string | yes | Board to add the column to |
| create | title | string | yes | Column display title |
| create | columnType | enum | yes | See columnType enum below |
| create | defaults | object | no | Default column values (in additionalFields) |
| getAll | boardId | string | yes | Board to list columns from |

**columnType enum:** checkbox, country, date, dropdown, email, hour, Link, longText, numbers, people, person, phone, rating, status, tags, team, text, timeline, timezone, week, worldClock

### Resource: Board Group

| Operation | name | type | required | notes |
|-----------|------|------|----------|-------|
| create | boardId | string | yes | Board to add the group to |
| create | name | string | yes | New group name |
| delete | boardId | string | yes | Board containing the group |
| delete | groupId | string | yes | Group ID to delete |
| getAll | boardId | string | yes | Board to list groups from |

### Resource: Board Item

| Operation | name | type | required | notes |
|-----------|------|------|----------|-------|
| addUpdate | itemId | string | yes | Item to add the update to |
| addUpdate | value | string | yes | Update text body |
| changeColumnValue | boardId | string | yes | Board containing the item |
| changeColumnValue | itemId | string | yes | Item to update |
| changeColumnValue | columnId | string | yes | Column to change |
| changeColumnValue | value | any | yes | New column value (object or JSON string) |
| changeMultipleColumnValues | boardId | string | yes | Board containing the item |
| changeMultipleColumnValues | itemId | string | yes | Item to update |
| changeMultipleColumnValues | columnValues | any | yes | Column values map (object or JSON string) |
| create | boardId | string | yes | Board to create the item in |
| create | groupId | string | no | Target group ID |
| create | name | string | yes | Item name |
| create | columnValues | any | no | Initial column values (in additionalFields, object or JSON string) |
| delete | itemId | string | yes | Item ID to delete |
| get | itemId | string | yes | Item ID to retrieve |
| getAll | boardId | string | yes | Board to list items from |
| getAll | groupId | string | no | Filter by group ID |
| getAll | returnAll | boolean | no | Return all items (default false) |
| getAll | limit | number | no | Max items to return when returnAll=false |
| getByColumnValue | boardId | string | yes | Board to search |
| getByColumnValue | columnId | string | yes | Column to search by |
| getByColumnValue | columnValue | string | yes | Value to match |
| getByColumnValue | returnAll | boolean | no | Return all matches (default false) |
| getByColumnValue | limit | number | no | Max items when returnAll=false |
| move | boardId | string | yes | Board containing the item |
| move | itemId | string | yes | Item to move |
| move | groupId | string | yes | Target group ID |

## Runtime behavior

### Input

Each input item is processed independently. The node sends one GraphQL request per item, using the configured resource and operation.

### Output

Returns a single output item per input item containing the GraphQL response data under `json`. The shape varies by operation:

- **Create/Get operations:** Returns the created or fetched object (board, column, group, item).
- **GetAll operations:** Returns an array of objects under the resource key.
- **Archive/Delete operations:** Returns the deleted/archived object ID.
- **Change value operations:** Returns the updated item.
- **AddUpdate:** Returns the update object.

### Errors

- API errors (GraphQL error responses) throw a `NodeApiError` with the error message from monday.com.
- Missing required parameters (e.g., boardId, itemId) throw before the API call.
- Authentication failures (invalid token, expired OAuth) throw a credential error.
- `continueOnFail` produces an empty output `[{ json: { error: message } }]` on the main branch.

### Expressions

All string, number, and boolean parameters accept expression strings.

## Acceptance tests

### Test: create board

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "board",
  "operation": "create",
  "name": "Test Board",
  "kind": "public"
}
```

**Expect** output[0] to contain `json` with the created board's `id` and `name` fields.

### Test: get all items with limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "boardItem",
  "operation": "getAll",
  "boardId": "1234567890",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] `json` to contain an array of up to 10 items under the items key.

### Test: create item with column values

**Given** input items:

```json
[{ "json": { "boardId": "123", "groupId": "topics", "itemName": "New Task" } }]
```

**Parameters:**

```json
{
  "resource": "boardItem",
  "operation": "create",
  "boardId": "={{ $json.boardId }}",
  "groupId": "={{ $json.groupId }}",
  "name": "={{ $json.itemName }}",
  "additionalFields": {
    "columnValues": "{\"status\": {\"label\": \"Working on it\"}}"
  }
}
```

**Expect** output[0] `json` to contain the created item with `id` and `name` matching the input.

### Test: change column value

**Given** input items:

```json
[{ "json": { "itemId": "9876543210" } }]
```

**Parameters:**

```json
{
  "resource": "boardItem",
  "operation": "changeColumnValue",
  "boardId": "1234567890",
  "itemId": "={{ $json.itemId }}",
  "columnId": "status",
  "value": "{\"label\": \"Done\"}"
}
```

**Expect** output[0] `json` to contain the updated item with the new status value.

### Test: continueOnFail with invalid board

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "board",
  "operation": "get",
  "boardId": "nonexistent",
  "continueOnFail": true
}
```

**Expect** output[0] `json` to contain an `error` key with the API error message.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation structure | Public docs + descriptor metadata | Confirmed from public docs and descriptor |
| Parameter names per operation | descriptor metadata | Extracted from operation schema files |
| columnType enum values | descriptor metadata | Exact list of 21 column types |
| default operation for board | descriptor metadata | Board defaults to `create` |
| authentication mode enum | descriptor metadata | accessToken, oAuth2, expression |
| Exact GraphQL query shapes | Inferred | Not documented in n8n docs; executor must construct GraphQL queries per operation |
| Pagination behavior | Inferred | getAll uses returnAll/limit pattern; underlying monday.com API pagination is handled by the executor |
| Error response shapes | Inferred | Standard NodeApiError + continueOnFail pattern |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/monday-com.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
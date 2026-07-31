---
type: n8n-nodes-base.trello
displayName: Trello
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Trello

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.trello.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/trello.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.trello`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `trelloApi` (API key + API token)

## Parameters

The node selects a Trello entity type via `resource` and an operation via `operation`. Each resource+operation combination exposes its own required and optional parameters.

### Resource: `attachment`

| Operation | Required params | Additional fields (collection) |
|-----------|----------------|-------------------------------|
| `create` | `cardId` (resourceLocator), `url` (string) | `mimeType`, `name` |
| `delete` | `cardId` (resourceLocator), `id` (string) | — |
| `get` | `cardId` (resourceLocator), `id` (string) | `fields` |
| `getAll` | `cardId` (resourceLocator) | `fields` |

### Resource: `board`

| Operation | Required params | Additional fields (collection) | Update fields (collection) |
|-----------|----------------|-------------------------------|----------------------------|
| `create` | `name` (string), `description` (string) | `prefs_cardAging`, `prefs_background`, `prefs_comments`, `prefs_cardCovers`, `prefs_invitations`, `keepFromSource`, `defaultLabels`, `defaultLists`, `idOrganization`, `prefs_permissionLevel`, `powerUps`, `prefs_selfJoin`, `idBoardSource`, `prefs_voting` | — |
| `delete` | `id` (resourceLocator) | — | — |
| `get` | `id` (resourceLocator) | `fields`, `pluginData` | — |
| `update` | `id` (resourceLocator) | — | `closed`, `desc`, `name`, `idOrganization`, `subscribed` |

### Resource: `boardMember`

| Operation | Required params | Additional fields (collection) |
|-----------|----------------|-------------------------------|
| `add` | `id` (string), `idMember` (string), `type` (options: normal/admin/observer) | `allowBillableGuest` |
| `getAll` | `id` (string), `returnAll` (boolean), `limit` (number) | — |
| `invite` | `id` (string), `email` (string) | `type`, `fullName` |
| `remove` | `id` (string), `idMember` (string) | — |

### Resource: `card`

| Operation | Required params | Additional fields (collection) | Update fields (collection) |
|-----------|----------------|-------------------------------|----------------------------|
| `create` | `listId` (string), `name` (string), `description` (string) | `due`, `dueComplete`, `pos`, `idMembers`, `idLabels`, `urlSource`, `idCardSource`, `keepFromSource` | — |
| `delete` | `id` (resourceLocator) | — | — |
| `get` | `id` (resourceLocator) | `fields`, `board`, `board_fields`, `customFieldItems`, `members`, `member_fields`, `pluginData`, `stickers`, `sticker_fields` | — |
| `update` | `id` (resourceLocator) | — | `idAttachmentCover`, `idBoard`, `closed`, `desc`, `due`, `dueComplete`, `idLabels`, `idList`, `idMembers`, `name`, `pos`, `subscribed` |

### Resource: `cardComment`

| Operation | Required params |
|-----------|----------------|
| `create` | `cardId` (resourceLocator), `text` (string) |
| `delete` | `cardId` (resourceLocator), `commentId` (string) |
| `update` | `cardId` (resourceLocator), `commentId` (string), `text` (string) |

### Resource: `checklist`

| Operation | Required params | Additional fields (collection) |
|-----------|----------------|-------------------------------|
| `create` | `cardId` (resourceLocator), `name` (string) | `idChecklistSource`, `pos` |
| `createCheckItem` | `cardId` (resourceLocator), `checklistId` (string), `name` (string) | `checked`, `pos` |
| `delete` | `cardId` (resourceLocator), `id` (string) | — |
| `deleteCheckItem` | `cardId` (resourceLocator), `checkItemId` (string) | — |
| `get` | `id` (string) | `fields` |
| `getAll` | `cardId` (resourceLocator) | `fields` |
| `getCheckItem` | `cardId` (resourceLocator), `checkItemId` (string) | `fields` |
| `completedCheckItems` | `cardId` (resourceLocator) | `fields` |
| `updateCheckItem` | `cardId` (resourceLocator), `checkItemId` (string) | `name`, `state` (complete/incomplete), `checklistId`, `pos` |

### Resource: `label`

| Operation | Required params | Additional/Update fields |
|-----------|----------------|--------------------------|
| `addLabel` | `cardId` (resourceLocator), `id` (string) | — |
| `create` | `boardId` (resourceLocator), `name` (string), `color` (options) | — |
| `delete` | `id` (string) | — |
| `get` | `id` (string) | `fields` |
| `getAll` | `boardId` (resourceLocator) | `fields` |
| `removeLabel` | `cardId` (resourceLocator), `id` (string) | — |
| `update` | `id` (string) | `name`, `color` |

### Resource: `list`

| Operation | Required params | Additional/Update fields |
|-----------|----------------|--------------------------|
| `archive` | `id` (string), `archive` (boolean) | — |
| `create` | `idBoard` (string), `name` (string) | `idListSource`, `pos` |
| `get` | `id` (string) | `fields` |
| `getAll` | `id` (string), `returnAll` (boolean), `limit` (number) | `fields` |
| `getCards` | `id` (string), `returnAll` (boolean), `limit` (number) | `fields` |
| `update` | `id` (string) | `idBoard`, `closed`, `name`, `pos`, `subscribed` |

### Resource locator patterns

Card and board IDs accept three modes:
- **From List** — interactive search using `searchBoards`/`searchCards` methods (Trello search API, requires query)
- **By URL** — extracts entity ID from `https://trello.com/b/...` or `https://trello.com/c/...` URL via regex
- **ID** — direct Trello entity ID string (e.g. `wiIaGwqE`)

## Runtime behavior

### Input

Each input item is processed independently. The node reads the resource, operation, and all related parameters from the current item context.

### API calls

All requests go to `https://api.trello.com/1/{endpoint}` with authentication via the `trelloApi` credential (API key + token appended as query parameters by the credential system). The HTTP method depends on the operation:

- **GET** — read operations (get, getAll, getCards, getCheckItem, completedCheckItems). Parameters are sent as query string.
- **POST** — create operations. Parameters are sent as JSON body.
- **PUT** — update operations. Parameters are sent as query string.
- **DELETE** — delete operations. No body.

### Output

Each item produces one output item containing the JSON response from the Trello API. For create operations, the response is the newly created entity. For read operations, the response is the entity data or an array of entities. For update operations, the response is the updated entity. For delete operations, the response is typically an empty object or the deleted entity.

### Pagination

Read operations with `returnAll=true` use cursor-based pagination (sorting by `-id`, limiting to 30 per page, using `before` cursor). The `list:getAll` resource+operation combination does not support pagination.

### Errors

On API error, the node throws a `NodeOperationError`. If `continueOnFail` is set, the item is replaced with `{ error: string }` and execution continues to the next item.

### Expressions

All string, number, and boolean parameters accept expression strings. The `resourceLocator` fields accept expressions for the `value` sub-field.

## Acceptance tests

### Test: card create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "card",
  "operation": "create",
  "listId": "abc123list",
  "name": "Test Card",
  "description": "A test card",
  "additionalFields": {
    "due": "2026-08-15T12:00:00.000Z",
    "pos": "top"
  }
}
```

**Expect** HTTP POST to `https://api.trello.com/1/cards` with body containing `idList=abc123list`, `name=Test Card`, `desc=A test card`, `due=2026-08-15T12:00:00.000Z`, `pos=top`. Output is the created card JSON.

### Test: board get with fields

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "board",
  "operation": "get",
  "id": { "mode": "id", "value": "board123" },
  "additionalFields": {
    "fields": "name,desc,url"
  }
}
```

**Expect** HTTP GET to `https://api.trello.com/1/boards/board123?fields=name,desc,url`. Output is the board JSON.

### Test: card update move to list

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "card",
  "operation": "update",
  "id": { "mode": "id", "value": "card456" },
  "updateFields": {
    "idList": "newlist789",
    "pos": "bottom"
  }
}
```

**Expect** HTTP PUT to `https://api.trello.com/1/cards/card456?idList=newlist789&pos=bottom`. Output is the updated card JSON.

### Test: list getAll with pagination

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "list",
  "operation": "getAll",
  "id": "board123",
  "returnAll": false,
  "limit": 10
}
```

**Expect** HTTP GET to `https://api.trello.com/1/boards/board123/lists?limit=10`. Output is an array of list JSON objects.

### Test: label create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "label",
  "operation": "create",
  "boardId": { "mode": "id", "value": "board123" },
  "name": "Urgent",
  "color": "red"
}
```

**Expect** HTTP POST to `https://api.trello.com/1/labels` with body `{ "idBoard": "board123", "name": "Urgent", "color": "red" }`. Output is the created label JSON.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Public docs | Explicitly listed at docs.n8n.io |
| Credential type | Public docs | `trelloApi` with API key + token |
| Parameter names and defaults | Public descriptor metadata | Extracted from npm package `.node.json` descriptors under /tmp isolation |
| API endpoints and HTTP methods | Public descriptor metadata | Inferred from compiled executor JS |
| Pagination algorithm | Public descriptor metadata | Inferred from compiled executor JS |
| Error handling | Public descriptor metadata | Standard pattern consistent with other app nodes |
| Trello REST API base URL | Public descriptor metadata | `https://api.trello.com/1/` |
| Usable as AI tool | Public docs | Explicitly documented |
| Trello Trigger node | Public docs | Separate node type (`n8n-nodes-base.trelloTrigger`) not covered here |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/trello.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
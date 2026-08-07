---
type: n8n-nodes-base.wekanTool
displayName: Wekan Tool
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Wekan Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.wekan/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/wekan/ | Public docs only |
| https://github.com/wekan/wekan/wiki/REST-API | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wekanTool`
- **Primary type:** `n8n-nodes-base.wekan`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `wekanApi` (basic auth: Username + Password + URL)

## Parameters

This node wraps the Wekan kanban board REST API under 6 resources. The primary parameter is the **Resource** (board, card, cardComment, checklist, checklistItem, list), which switches the available **Operation** and subsequent field parameters.

### Resource: Board

| Operation | Required fields | Notes |
|-----------|-----------------|-------|
| create | title | Optional: board visibility (default: false/private) |
| delete | boardId (from dynamic list) | |
| get | boardId (from dynamic list) | |
| getAll | (none) | Returns all boards accessible to the authenticated user |

### Resource: Card

| Operation | Required fields | Notes |
|-----------|-----------------|-------|
| create | boardId, listId, title | Optional: swimlaneId, authorId, assigneeId, description, dueAt, isOverdue, labelIds, members, parentId, receivedAt, sort, startAt, subtaskSort, endAt, customFields |
| delete | boardId, cardId | Both from dynamic lists |
| get | boardId, cardId | |
| getAll | boardId | Optional: swimlaneId, listId; returns all cards matching filters |
| update | boardId, cardId | Title and/or optional fields as above |

### Resource: Card Comment

| Operation | Required fields | Notes |
|-----------|-----------------|-------|
| create | boardId, cardId, authorId, comment | |
| delete | boardId, cardId, commentId | |
| get | boardId, cardId, commentId | |
| getAll | boardId, cardId | |

### Resource: Checklist

| Operation | Required fields | Notes |
|-----------|-----------------|-------|
| create | boardId, cardId, title | Optional: itemIds, sort, members |
| delete | boardId, cardId, checklistId | |
| get | boardId, cardId, checklistId | |
| getAll | boardId, cardId | Returns all checklists for the card |

### Resource: Checklist Item

| Operation | Required fields | Notes |
|-----------|-----------------|-------|
| delete | boardId, cardId, checklistId, itemId | |
| get | boardId, cardId, checklistId, itemId | |
| update | boardId, cardId, checklistId, itemId | Title and/or isFinished, assignedAt, assignedBy, dueAt, finishAt fields |

### Resource: List

| Operation | Required fields | Notes |
|-----------|-----------------|-------|
| create | boardId, title | |
| delete | boardId, listId | |
| get | boardId, listId | |
| getAll | boardId | Returns all board lists |

### Dynamic option loading

The node loads options for `boardId`, `listId`, `cardId`, `checklistId`, `checklistItemId`, `commentId`, `authorId`, `userId`, `swimlaneId` from the Wekan API. Admin permissions on the Wekan user account are required to load certain parameter options (e.g., author/user lists).

## Runtime behavior

### Input

The node processes each input item independently. For create/update operations, field values may come from the input item data (via expressions) or be set statically.

### Output

Each operation outputs the API response data as a JSON object under the item's `json` property. For `getAll` operations, multiple items are produced (one per returned entity). For single-entity operations (`get`, `create`, `update`, `delete`), one output item is produced per input item.

### Errors

- API errors (auth failure, resource not found, validation) are surfaced as thrown errors.
- `continueOnFail` is supported: when enabled, the node outputs the error object instead of halting.
- Delete operations typically return the deleted object on success.

### Expressions

All scalar parameters (title, description, comment text, IDs, etc.) accept expression strings. Dynamic-list parameters (`boardId`, `listId`, `cardId`, etc.) use the node's load-options mechanism for static selection but also accept expressions for runtime-driven values.

### AI agent tool usage

When used as an AI agent tool (via `$fromAI()`), the LLM populates parameters dynamically based on the conversation context. The node exposes the same resource/operation structure to the AI agent.

## Acceptance tests

### Test: create a board

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "board",
  "operation": "create",
  "title": "Test Board"
}
```

**Expect** output[0]:
```json
[{ "json": { "_id": "<new-board-id>", "title": "Test Board", "archived": false } }]
```

### Test: get all cards in a board

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "card",
  "operation": "getAll",
  "boardId": "=existingBoardId"
}
```

**Expect** output[0]:
```json
[{ "json": { "_id": "...", "title": "...", "listId": "...", "boardId": "..." } }, { "json": { "_id": "...", "title": "...", "listId": "...", "boardId": "..." } }]
```

### Test: create a card with optional fields

**Given** input items:
```json
[{ "json": { "myTitle": "Urgent Task" } }]
```

**Parameters:**
```json
{
  "resource": "card",
  "operation": "create",
  "boardId": "=existingBoardId",
  "listId": "=existingListId",
  "title": "={{ $json.myTitle }}",
  "description": "Created via n8n"
}
```

**Expect** output[0]:
```json
[{ "json": { "_id": "...", "title": "Urgent Task", "description": "Created via n8n", "boardId": "...", "listId": "..." } }]
```

### Test: delete a checklist item

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "checklistItem",
  "operation": "delete",
  "boardId": "=b1",
  "cardId": "=c1",
  "checklistId": "=cl1",
  "checklistItemId": "=cli1"
}
```

**Expect** output[0]:
```json
[{ "json": { "_id": "cli1", "isFinished": false } }]
```

### Test: load-options returns userIds for a board

**Given** a Wekan credential configured with admin permissions.

**When** `getUsers()` is called as a resource locator.

**Then** the returned options array contains objects `{ name: string, value: string, description?: string }` where `value` is the Wekan user `_id`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources & operations | Public docs (wekan base node) | All 6 resources and their operations are documented on the n8n Wekan page |
| Credential shape | Public docs (wekan credentials) | Basic auth with Username, Password, URL confirmed |
| Type string | Inferred from corpus | `n8n-nodes-base.wekanTool` is the tool variant alias of `n8n-nodes-base.wekan` |
| Detailed field schemas (optional fields per operation) | Inferred from corpus type declarations | Optional fields like `swimlaneId`, `authorId`, `labelIds`, `members`, `customFields`, `sort` were identified from the descripton files |
| Dynamic-loading methods | Corpus type declarations | 8 loaders confirmed: getUsers, getBoards, getLists, getSwimlanes, getCards, getChecklists, getChecklistItems, getComments |
| Wekan REST API endpoints | Public wiki (wekan repo) | API base path confirmed as `/api/` under the Wekan instance URL |
| AI agent tool behavior | Inferred | Follows standard n8n Tool pattern; no separate dedicated docs page for the Tool variant |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/wekanTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.trelloTool
displayName: Trello
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Trello (AI Tool)

An AI agent tool variant of the Trello node, wrapping 7 Trello API resources (Attachment, Board, Board Member, Card, Card Comment, Checklist, Label, List) plus an additional Card Comment and Checklist resource for comment/checklist-item operations. When connected to an AI Agent, the model can dynamically populate parameters via `$fromAI()`. Authenticates against the [Trello REST API](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.trello/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/trello/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/ | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.trelloTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `trelloApi` (API key + API token)

## Parameters

The primary discriminator is a **Resource** selector followed by an **Operation** selector. Each combination exposes the relevant fields for that API call. Many fields are string/expression inputs settable by the AI agent.

### Resource: Attachment

| Operation | Value | Key parameters | Notes |
|-----------|-------|---------------|-------|
| Create | create | boardId, cardId, name, url (or file) | Attaches a URL or file to a card |
| Delete | delete | boardId, cardId, attachmentId | Removes an attachment |
| Get | get | boardId, cardId, attachmentId | Returns attachment metadata |
| GetAll | getAll | boardId, cardId, fields | Lists all attachments on a card |

### Resource: Board

| Operation | Value | Key parameters | Notes |
|-----------|-------|---------------|-------|
| Create | create | name, defaultLabels, defaultLists, desc, idOrganization, idBoardSource, keepFromSource, powerUps, prefs_permissionLevel, prefs_voting, prefs_comments, prefs_invitations, prefs_selfJoin, prefs_cardCovers, prefs_background, prefs_canBePublic, prefs_canBeOrg, prefs_canBePrivate, prefs_canInvite | Board creation with full preference control |
| Delete | delete | boardId | Removes a board |
| Get | get | boardId, fields | Returns board metadata |
| Update | update | boardId, name, desc, closed, subscribed, idOrganization, prefs_* | Mutates board properties |

### Resource: Board Member

| Operation | Value | Key parameters | Notes |
|-----------|-------|---------------|-------|
| Add | add | boardId, email (or memberId), type (normal/observer/ghost/admin) | Adds a member (by email) or assigns a Trello user (by memberId) |
| GetAll | getAll | boardId | Lists board members |
| Invite | invite | boardId, email | Sends an invitation |
| Remove | remove | boardId, memberId | Removes a member from the board |

### Resource: Card

| Operation | Value | Key parameters | Notes |
|-----------|-------|---------------|-------|
| Create | create | boardId, listId, name, desc, labels, dueDate, idMembers, idAttachmentCover, pos, sourceCardId, keepFromSource | Creates a card on a list |
| Delete | delete | boardId, cardId | Archives/deletes a card |
| Get | get | boardId, cardId, fields | Returns card data |
| Update | update | boardId, cardId, name, desc, closed, idMembers, idAttachmentCover, idList, idLabels, idBoard, pos, dueDate, dueComplete, subscribed, address, locationName, coordinates, cover | Updates card fields including address/coordinates |

### Resource: Card Comment

| Operation | Value | Key parameters | Notes |
|-----------|-------|---------------|-------|
| Create | create | boardId, cardId, text | Adds a comment |
| Delete | delete | boardId, cardId, commentId | Removes a comment |
| Update | update | boardId, cardId, commentId, text | Edits an existing comment |

### Resource: Checklist

| Operation | Value | Key parameters | Notes |
|-----------|-------|---------------|-------|
| Create (checklist) | create | boardId, cardId, name, idChecklistSource, pos | Creates a new checklist on a card |
| Create (item) | createCheckItem | boardId, cardId, checklistId, name, pos, checked | Adds an item to a checklist |
| Delete (checklist) | delete | boardId, cardId, checklistId | Removes a checklist |
| Delete (item) | deleteCheckItem | boardId, cardId, checklistId, checkItemId | Removes a checklist item |
| Get | get | boardId, cardId, checklistId | Returns checklist data |
| GetAll | getAll | boardId, cardId | Lists all checklists on a card |
| GetCheckItem | getCheckItem | boardId, cardId, checklistId, checkItemId | Returns a specific checklist item |
| GetCompletedCheckItems | getCompletedCheckItems | boardId, cardId | Returns completed items across all checklists |
| Update (item) | updateCheckItem | boardId, cardId, checklistId, checkItemId, name, pos, state (complete/incomplete) | Toggles/edits a checklist item |

### Resource: Label

| Operation | Value | Key parameters | Notes |
|-----------|-------|---------------|-------|
| Add | addLabel | boardId, cardId, labelId (or color, name) | Attaches an existing or ad-hoc label to a card |
| Create | create | boardId, name, color | Creates a board-level label |
| Delete | delete | boardId, labelId | Removes a label |
| Get | get | boardId, labelId | Returns label data |
| GetAll | getAll | boardId | Lists all labels on a board |
| Remove | removeLabel | boardId, cardId, labelId | Detaches a label from a card |
| Update | update | boardId, labelId, name, color | Edits a label |

### Resource: List

| Operation | Value | Key parameters | Notes |
|-----------|-------|---------------|-------|
| Archive | archive | boardId, listId, closed (true/false) | Archives or unarchives a list |
| Create | create | boardId, name, pos | Creates a new list |
| Get | get | boardId, listId | Returns list metadata |
| GetAll | getAll | boardId | Lists all lists on a board |
| Get All Cards | getCards | boardId, listId | Lists all cards in a list |
| Update | update | boardId, listId, name, closed, pos, subscribed | Updates list properties |

### AI tool mode

When used as an AI agent tool, the node supports `$fromAI()` on every free-text/expression parameter. The AI model selects Resource and Operation, then populates the required fields dynamically. Parameter names, defaults, and option enums match the base Trello node.

## Runtime behavior

### Input

Each input item triggers one API call per item. The operation is applied once per item, using parameter values from the node configuration (or AI-supplied values in tool mode).

### Output

Each output item contains a `json` property with the Trello API response body for the executed operation — a single object for create/get/update/delete operations, an array for getAll/list operations. Input items that predate execution are not carried through; only the API response is emitted.

### Errors

The node throws on non-2xx API responses. If `continueOnFail` is enabled, errored items are returned as `{ json: { error: ... } }` instead.

### Expressions

All string parameters support n8n expressions.

## Acceptance tests

### Test: create a card

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "card",
  "operation": "create",
  "boardId": "{{ $fromAI() }}",
  "listId": "{{ $fromAI() }}",
  "name": "{{ $fromAI() }}"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "card-id", "name": "...", "idList": "...", "idBoard": "...", "date": "..." } }]
```

### Test: get cards on a list

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "list",
  "operation": "getCards",
  "boardId": "board-id-123",
  "listId": "list-id-456"
}
```

**Expect** the executor issues a GET to `/lists/{listId}/cards` (the Trello API endpoint for listing cards in a list). Output[0] is an array of card objects:
```json
[{ "json": [{ "id": "card-1", "name": "Card A" }, { "id": "card-2", "name": "Card B" }] }]
```

### Test: add a comment to a card

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "cardComment",
  "operation": "create",
  "boardId": "board-id",
  "cardId": "card-id",
  "text": "Reviewed and approved"
}
```

**Expect** output[0]:
```json
[{ "json": { "id": "comment-id", "data": { "text": "Reviewed and approved" } } }]
```

### Test: AI tool mode — board listing

**Given** input item:
```json
[{ "json": { "message": "list my boards" } }]
```

**Parameters:**
```json
{
  "resource": "board",
  "operation": "getAll",
  "$fromAI": true
}
```

**Expect** output[0] is an array of board objects. Exact shape depends on Trello API response.

### Test: update a checklist item (updateCheckItem)

**Given** input item:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "checklist",
  "operation": "updateCheckItem",
  "boardId": "board-id",
  "cardId": "card-id",
  "checklistId": "cl-id",
  "checkItemId": "item-id",
  "state": "complete"
}
```

**Expect** output[0] contains the updated item object with `state: "complete"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list per resource | Public docs | All 7 resources with operations confirmed from docs.n8n.io |
| Operation values (checklist, list) | Inferred from base Trello executor | checklist.update → updateCheckItem; list getCards for card listing |
| Credential schema | Public docs | API key + API token, documented under Trello Power-Up registration |
| AI tool mode ($fromAI) | Public docs | Documented feature: all tools nodes inherit this |
| Exact parameter names per operation | Inferred from public docs + descriptor | Parameter name patterns are consistent with Trello API field names |
| Trello API response shapes | Inferred from Trello REST API | Standard JSON shapes per endpoint |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.trelloTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

---
type: n8n-nodes-base.mondayComTool
displayName: monday.com Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# monday.com Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mondaycom.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mondaycom.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developer.monday.com/api-reference/docs/boards | Public docs only |
| https://developer.monday.com/api-reference/docs/items | Public docs only |
| https://developer.monday.com/api-reference/docs/columns | Public docs only |
| https://developer.monday.com/api-reference/docs/groups | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mondayComTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mondayComApi` (API Token V2 or OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | Board | yes | — | Board / Board Column / Board Group / Board Item |
| operation | string | (varies) | yes | — | See operations per resource below |
| boardId | string | — | conditional | depends on resource+operation | Numeric board ID; dynamic list sourced from monday.com API |
| boardName | string | — | conditional | depends on operation (Create a new board) | |
| boardKind | string | public | conditional | depends on operation (Create a new board) | private / public / share |
| columnId | string | — | conditional | depends on resource+operation | Dynamic list from monday.com API |
| columnTitle | string | — | conditional | depends on operation (Create a new column) | |
| columnType | string | — | conditional | depends on operation (Create a new column) | One of the monday.com column types (text, status, date, numbers, people, etc.) |
| columnValue | string | — | conditional | depends on operation (Change a column value) | JSON string per monday.com column type reference |
| columnValues | string | — | conditional | depends on operation (Change multiple column values) | JSON string containing multiple column key-value pairs |
| groupId | string | — | conditional | depends on resource+operation | Dynamic list from monday.com API |
| groupName | string | — | conditional | depends on operation (Create a group in a board) | |
| itemId | string | — | conditional | depends on resource+operation | Numeric item ID; dynamic list from monday.com API |
| itemName | string | — | conditional | depends on operation (Create an item) | |
| updateBody | string | — | conditional | depends on operation (Add an update to an item) | Text content of the update |
| columnValueSearch | string | — | conditional | depends on operation (Get items by column value) | Value to search for in the specified column |
| additionalFields | object | {} | no | — | Resource/operation-specific advanced options |
| options | object | {} | no | — | Pagination (limit, page), sort order, and other global options |

### Resource operations

**Board:**
- Archive a board — requires `boardId`
- Create a new board — requires `boardName`, `boardKind`; optional templateId, workspaceId, owner IDs, subscriber IDs, description
- Get a board — requires `boardId`
- Get all boards — optional filter by workspace, state (active/archived/deleted), kind (private/public/share), pagination

**Board Column:**
- Create a new column — requires `boardId`, `columnTitle`, `columnType`; optional description, defaults
- Get all columns — requires `boardId`

**Board Group:**
- Delete a group in a board — requires `boardId`, `groupId`
- Create a group in a board — requires `boardId`, `groupName`
- Get list of groups in a board — requires `boardId`

**Board Item:**
- Add an update to an item — requires `boardId`, `itemId`, `updateBody`
- Change a column value for a board item — requires `boardId`, `itemId`, `columnId`, `columnValue`
- Change multiple column values for a board item — requires `boardId`, `itemId`, `columnValues`
- Create an item in a board's group — requires `boardId`, `itemName`; optional `groupId`, `columnValues`
- Delete an item — requires `boardId`, `itemId`
- Get an item — requires `boardId`, `itemId`
- Get all items — requires `boardId`; optional groupId, pagination
- Get items by column value — requires `boardId`, `columnId`, `columnValueSearch`
- Move item to group — requires `boardId`, `itemId`, `groupId`

## Runtime behavior

### Input

Passthrough items. The node operates on parameters directly rather than transforming input item data (except when `$fromAI()` dynamically populates parameters based on AI agent context).

### Output

Each output item contains the monday.com API response for the executed operation. Output shapes vary by resource and operation, generally reflecting the monday.com GraphQL response envelope:
- Retrieval operations (get/getAll) return the queried entity data.
- Mutation operations return the mutated entity ID and relevant fields.
- List operations include the results array with any pagination metadata.

When attached to an AI Agent, the node registers as a callable tool. The AI agent may use `$fromAI()` to populate parameters automatically (resource, operation, and field values).

### Errors

- monday.com GraphQL API errors propagate as n8n NodeApiError with the API's error message.
- Missing required parameters (e.g. boardId when required) throw validation errors.
- `continueOnFail` follows standard n8n behavior: erroring items route to error output if configured.

### Expressions

All parameters accept expression strings. Dynamic option loading for boardId, groupId, columnId, and itemId resolves from the monday.com API at workflow execution time.

## Acceptance tests

### Test: get all boards

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Board",
  "operation": "Get all boards",
  "options": { "limit": 5, "state": "active" }
}
```

**Expect** output[0] to contain an array of board objects, each with `id`, `name`, `state`, and optionally `board_kind`:
```json
[{
  "json": {
    "data": {
      "boards": [
        { "id": "1234567890", "name": "My Board", "state": "active", "board_kind": "public" }
      ]
    }
  }
}]
```

### Test: create an item

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Board Item",
  "operation": "Create an item in a board's group",
  "boardId": "1234567890",
  "groupId": "topics",
  "itemName": "New Task",
  "columnValues": "{\"status\":{\"index\":0}}"
}
```

**Expect** output[0] to contain the created item with an `id`:
```json
[{
  "json": {
    "data": {
      "create_item": { "id": "9876543210" }
    }
  }
}]
```

### Test: change column value

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Board Item",
  "operation": "Change a column value for a board item",
  "boardId": "1234567890",
  "itemId": "9876543210",
  "columnId": "status",
  "columnValue": "{\"label\":\"Working on it\"}"
}
```

**Expect** output[0] to acknowledge the column value change.

### Test: get items by column value

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "Board Item",
  "operation": "Get items by column value",
  "boardId": "1234567890",
  "columnId": "status",
  "columnValueSearch": "Working on it"
}
```

**Expect** output[0] to contain an array of matching items.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | Documented (public n8n docs mondaycom.md) | Confirmed by published node schema |
| Credential types | Documented (public mondaycom.md credentials) | API Token V2 and OAuth2 both supported |
| $fromAI() dynamic parameter support | Inferred from Tool node pattern | No dedicated mondayComTool docs page exists; consistent behavior with all other *Tool nodes |
| Exact column value JSON schemas | External API (developer.monday.com) | monday.com column types reference defines per-column JSON formats |
| Pagination details for list operations | Inferred from monday.com API | Boards (limit/page), Items (limit/page) documented in monday.com API docs |
| Dynamic option loading source | Inferred from published schema | Board list, column list, group list, item list loaded from monday.com API |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/mondayComTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

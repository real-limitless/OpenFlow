---
type: '@n8n/n8n-nodes-langchain.memoryManager'
displayName: Chat Memory Manager
category: AI
versions: [1, 1.1]
priority: medium
status: specced
---

# Chat Memory Manager

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorymanager.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.memoryManager`
- **Aliases:** (none)
- **Inputs:** `main` × 1, `ai_memory` × 1 (required, max 1)
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `load` | yes | — | Operation mode: `load` (Get Many Messages), `insert` (Insert Messages), `delete` (Delete Messages) |
| insertMode | options | `insert` | yes | mode == `insert` | `insert` adds alongside existing; `override` replaces all |
| deleteMode | options | `lastN` | yes | mode == `delete` | `lastN` or `all` (clear all messages) |
| messages | fixedCollection | `{}` | see notes | mode == `insert` | Collection of message objects; each has type (`ai`/`system`/`user`), message (string, required), hideFromUI (boolean, default false) |
| lastMessagesCount | number | 2 | no | mode == `delete` and deleteMode == `lastN` | Number of latest messages to delete |
| simplifyOutput | boolean | true | no | mode == `load` | When true, output includes only sender and text; when false, includes full message structure |
| options.groupMessages | boolean | true | no | mode == `load` | When true, groups all messages into a single output item; when false, each message is a separate item |

## Runtime behavior

### Input

Consumes `main` input items (typically from a Chat Trigger or preceding node). The connected `ai_memory` input provides the backing store (e.g. Simple Memory, Redis Chat Memory, Postgres Chat Memory).

### Output

**Get Many Messages** (`load`): Returns an array of chat history messages from the connected memory. With `simplifyOutput`, each message contains only `sender` (AI/system/user) and `text`. Without simplification, full message objects are returned. The `groupMessages` option controls whether all messages arrive as one item or individually.

**Insert Messages** (`insert`): Inserts the configured chat messages into the connected memory. Passes input items through unchanged on the `main` output.

**Delete Messages** (`delete`): Removes either the last N messages or all messages from the connected memory. Passes input items through unchanged on the `main` output.

### Sub-node expression semantics

As a sub-node, expressions in parameters always resolve against the **first item** of the incoming data, not per-item. This differs from root-node behavior.

### Errors

- Missing or disconnected `ai_memory` connection should produce an error.
- Invalid `lastMessagesCount` (negative or zero) should produce an error.
- When `continueOnFail` is enabled, errors are suppressed and the failing item is returned with an error property.

### Expressions

All string-type parameters accept expressions (`mode`, `insertMode`, `deleteMode`, `message` text, `lastMessagesCount`).

## Acceptance tests

### Test: load messages (simplified)

**Given** a workflow with a Chat Memory Manager in `load` mode connected to a Simple Memory that contains three messages (user, AI, user).

**Parameters:**
```json
{
  "mode": "load",
  "simplifyOutput": true,
  "options": { "groupMessages": true }
}
```

**Expect** output[0] to contain a single item with a messages array, each entry having `sender` and `text` properties.

### Test: insert messages

**Given** a workflow with a Chat Memory Manager in `insert` mode, `insertMode` = `insert`.

**Parameters:**
```json
{
  "mode": "insert",
  "insertMode": "insert",
  "messages": {
    "messageValues": [
      { "type": "user", "message": "Hello", "hideFromUI": false },
      { "type": "ai", "message": "Hi there!", "hideFromUI": false }
    ]
  }
}
```

**Expect** the two messages to be appended to the connected memory. Input items pass through on output[0].

### Test: override all messages

**Parameters:**
```json
{
  "mode": "insert",
  "insertMode": "override",
  "messages": {
    "messageValues": [
      { "type": "system", "message": "You are a helpful assistant.", "hideFromUI": true }
    ]
  }
}
```

**Expect** all prior messages in memory to be replaced by the single system message.

### Test: delete last N messages

**Parameters:**
```json
{
  "mode": "delete",
  "deleteMode": "lastN",
  "lastMessagesCount": 2
}
```

**Expect** the two most recent messages to be removed from the connected memory. Input items pass through.

### Test: delete all messages

**Parameters:**
```json
{
  "mode": "delete",
  "deleteMode": "all"
}
```

**Expect** all messages cleared from the connected memory. Input items pass through.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation modes | documented | Fully described in public docs |
| Insert/delete sub-modes | documented | Described in public docs |
| Message type enum | documented | AI/System/User from public docs |
| SimplifyOutput / groupMessages | documented | Public docs describe both options |
| Sub-node expression semantics | documented | Confirmed in public docs (first-item-only) |
| Exact output JSON shape | inferred | Not documented; shape depends on connected memory implementation |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/@n8n/n8n-nodes-langchain.memoryManager.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
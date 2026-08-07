---
type: n8n-nodes-base.twistTool
displayName: Twist Tool
category: Communication
versions: [1]
priority: medium
status: specced
---

# Twist Tool

AI agent tool that wraps the Twist collaboration API (channels, threads, comments, and conversation messages) for use by AI Agent nodes. Internally this is the base Twist node with `usableAsTool: true`; the `twistTool` type string is an alias registered in the node registry.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twist.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/twist.md | Public docs only |
| https://developer.twist.com/v3/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.twistTool`
- **Aliases:** (none — the base type `n8n-nodes-base.twist` is the non-tool variant)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `twistOAuth2Api` (OAuth2 — Client ID + Client Secret)

## Parameters

The node exposes a resource/operation hierarchy. The AI agent selects a resource and operation, then supplies the required field values (typically populated via `$fromAI()`).

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| Resource | options: `channel`, `comment`, `messageConversation`, `thread` | yes | Which Twist entity to act on |
| Operation | options (varies by resource, see below) | yes | The action to perform |
| Resource-specific parameters | various | depends on operation | See per-resource tables below |

### Channel

| Operation | Required parameters | Optional parameters |
|-----------|-------------------|---------------------|
| create | workspaceId, name | color, description, public, temp_id, user_ids |
| archive | channelId | — |
| unarchive | channelId | — |
| delete | channelId | — |
| get | channelId | — |
| getAll | workspaceId, returnAll/limit | archived filter |
| update | channelId | color, description, name, public |

### Comment

| Operation | Required parameters | Optional parameters |
|-----------|-------------------|---------------------|
| create | threadId, content | actions, binaryProperties, direct_mentions, mark_thread_position, recipients, temp_id, send_as_integration |
| delete | commentId | — |
| get | commentId | — |
| getAll | threadId, returnAll/limit | as_ids, to_obj_index, newer_than_ts, older_than_ts, order_by, from_obj_index |
| update | commentId | actions, binaryProperties, content, direct_mentions |

### Message Conversation

| Operation | Required parameters | Optional parameters |
|-----------|-------------------|---------------------|
| create | workspaceId, conversationId, content | actions, binaryProperties, direct_mentions |
| delete | id (message ID) | — |
| get | id (message ID) | — |
| getAll | workspaceId, conversationId | to_obj_index, limit, order_by, from_obj_index |
| update | id (message ID) | actions, binaryProperties, content, direct_mentions |

### Thread

| Operation | Required parameters | Optional parameters |
|-----------|-------------------|---------------------|
| create | channelId, title, content | actions, binaryProperties, direct_mentions, recipients, send_as_integration, temp_id |
| delete | threadId | — |
| get | threadId | — |
| getAll | channelId, returnAll/limit | as_ids, filter_by, newer_than_ts, older_than_ts |
| update | threadId | actions, binaryProperties, content, direct_mentions, title |

### Shared optional sub-structures

- **Actions (actionsUi):** A fixed collection of action-button definitions. Each action has: action type (`open_url`, `prefill_message`, `send_reply`), button_text, optional message, optional URL, and type (always `action`).
- **Binary attachments (binaryProperties):** A comma-separated string naming binary data properties on the input item to upload as attachments.
- **User mention lists (direct_mentions, recipients, user_ids):** Dynamic multi-option lists populated via a load-options method (`getUsers`), often dependent on `workspaceId`.

## Runtime behavior

### Input

The node accepts one or more items on `main` input. For create/update operations, field values are drawn from node parameters. The AI agent can supply these via `$fromAI()`.

### Output

- **Create operations:** Returns the created Twist object (channel, comment, message, or thread) in the output item's JSON.
- **Get operations:** Returns the requested Twist object.
- **GetAll operations:** Returns an array of Twist objects. Supports pagination via `returnAll`/`limit`.
- **Delete operations:** Returns the result of the delete API call (typically success confirmation).
- **Update operations:** Returns the updated Twist object.
- **Archive/Unarchive:** Returns the result of the archive/unarchive API call.

### Errors

- API errors from Twist (invalid tokens, missing permissions, not-found resources) propagate as node execution errors.
- Standard `continueOnFail` behavior applies.
- Network errors, 4xx/5xx responses, and invalid parameter values result in a thrown error unless `continueOnFail` is set.

### Expressions

All string, number, boolean, and options parameters support expression strings. The `noDataExpression: true` flag on the `resource` and `operation` selectors means they must be set statically in the UI (not via expression), but `$fromAI()` overrides this at AI agent runtime.

## Acceptance tests

### Test: create a thread and verify output

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "thread",
  "operation": "create",
  "channelId": "12345",
  "title": "Test thread from AI",
  "content": "This is an automated thread created by the AI agent."
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 98765,
    "title": "Test thread from AI",
    "content": "This is an automated thread created by the AI agent.",
    "channel_id": 12345,
    "posted": "2026-01-15 10:00:00"
  }
}]
```

### Test: get all channels with archived filter

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "getAll",
  "workspaceId": 42,
  "returnAll": false,
  "limit": 25,
  "filters": { "archived": true }
}
```

**Expect** output[0] to contain an array of channel objects (each with `id`, `name`, `archived`), and the array length should not exceed 25.

### Test: create a comment with direct mentions

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "comment",
  "operation": "create",
  "threadId": "98765",
  "content": "Hello @Alice, please review this.",
  "additionalFields": {
    "direct_mentions": [101, 102],
    "mark_thread_position": true
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 54321,
    "content": "Hello @Alice, please review this.",
    "thread_id": 98765
  }
}]
```

### Test: send a message conversation message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "messageConversation",
  "operation": "create",
  "workspaceId": 42,
  "conversationId": 555,
  "content": "Quick update from the AI agent."
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": 11111,
    "content": "Quick update from the AI agent.",
    "conversation_id": 555
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation list per resource | Public docs | n8n docs page enumerates all resources and operations |
| Parameter details and defaults | Corpus (parameter descriptors) | Verified against published node descriptor; original n8n docs page does not list every sub-field |
| Credential type | Public docs | twistOAuth2Api OAuth2 credentials documented at docs.n8n.io |
| API base URL | Public docs | Twist API v3 at https://api.twist.com/api/v3/ documented at developer.twist.com |
| $fromAI() support | Inferred from tool pattern | Standard for all `*Tool` variants in n8n |
| Pagination max (100) | Corpus | Only relevant for getAll operations with returnAll=false |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/twistTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

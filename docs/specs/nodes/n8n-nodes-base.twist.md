---
type: n8n-nodes-base.twist
displayName: Twist
category: Communication
versions: [1]
priority: medium
status: specced
---

# Twist

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twist/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/twist/ | Public docs only |
| https://developer.twist.com/v3/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.twist`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `twistOAuth2Api` (OAuth2 — Client ID + Client Secret)

## Parameters

### Resource selector

The user picks one of four resources, then an operation within that resource.

### Channel resource

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `channel` | yes | |
| operation | options | — | yes | `create`, `archive`, `unarchive`, `delete`, `get`, `getAll`, `update` |
| workspaceId | options | — | depends | Required for `create`, `getAll`. Dynamic list loaded via loadOptions. |
| channelId | options / string | — | depends | Required for `archive`, `unarchive`, `delete`, `get`, `update`. Dynamic list for `get`/`update`; string for archive/unarchive/delete. |
| name | string | — | depends | Required for `create`. |
| additionalFields | collection | — | no | `description` (string), `color` (options), `icon` (options), `topic` (string), `users` (multi-options), `guests` (multi-options), `tempId` (number). `users` loaded via loadOptions. |

### Comment resource

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `comment` | yes | |
| operation | options | — | yes | `create`, `delete`, `get`, `getAll`, `update` |
| workspaceId | options | — | no | Loaded via loadOptions. Used for `getAll`. |
| channelId | options | — | depends | Required for `getAll`. Loaded via loadOptions. |
| threadId | options / string | — | depends | Required for `create`, `getAll`. Dynamic list for `create`; string for `getAll`. Loaded via loadOptions. |
| commentId | string | — | depends | Required for `delete`, `get`, `update`. |
| content | string | — | depends | Required for `create`, `update`. Markdown body of the comment. |
| additionalFields | collection | — | no | `actions` (fixed-collection for action buttons: `action` button label string, `action` button payload JSON, `actionType` maybe open_url/postback), `attachments` (multi-options from loadOptions), `tempId` (number), `content` is raw HTML / markdown |

### Message Conversation resource

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `messageConversation` | yes | |
| operation | options | — | yes | `create`, `delete`, `get`, `getAll`, `update` |
| workspaceId | options | — | no | Loaded via loadOptions. |
| conversationId | options / string | — | depends | Required for `create`, `getAll`, `delete`, `get`, `update`. Dynamic list for `create`; string for others. |
| content | string | — | depends | Required for `create`, `update`. Markdown body of the message. |
| additionalFields | collection | — | no | `actions` (same as Comment), `attachments`, `tempId` |

### Thread resource

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | `thread` | yes | |
| operation | options | — | yes | `create`, `delete`, `get`, `getAll`, `update` |
| workspaceId | options | — | depends | Required for `getAll`. Loaded via loadOptions. |
| channelId | options | — | depends | Required for `create`, `getAll`. Dynamic list. Loaded via loadOptions. |
| threadId | string | — | depends | Required for `delete`, `get`, `update`. |
| title | string | — | depends | Required for `create`, `update`. |
| content | string | — | no | Markdown body for `create`, `update`. |
| additionalFields | collection | — | no | `actions`, `attachments`, `tempId`, `recipients` (multi-options from loadOptions) |

### Dynamic options (loadOptions)

- `getWorkspaces` — lists workspaces the authenticated user belongs to
- `getConversations` — lists conversations (filtered by workspace if provided)
- `getUsers` — lists workspace users
- `getGroups` — lists workspace groups

## Runtime behavior

### Input

Each input item is processed independently. Parameters may reference input item properties via expressions.

### Output

One output item per input item. The response payload from the Twist API is placed under `json` on each output item. For list operations (`getAll`), the node may emit one item per list entry or a single item with an array, depending on the `simplify` option (if present, defaults to emitting individual items). The exact Twist API response shape is preserved under `json`.

### HTTP API

All operations call the Twist REST API v3 at `https://api.twist.com/api/v3/`. Authentication is via OAuth2 Bearer token. The node maps each (resource, operation) pair to a specific API endpoint:

| Resource | Operation | HTTP method | Endpoint |
|----------|-----------|-------------|----------|
| Channel | create | POST | `/api/v3/channels/add` |
| Channel | archive | POST | `/api/v3/channels/archive` |
| Channel | unarchive | POST | `/api/v3/channels/unarchive` |
| Channel | delete | POST | `/api/v3/channels/remove` |
| Channel | get | POST | `/api/v3/channels/getone` |
| Channel | getAll | POST | `/api/v3/channels/get` |
| Channel | update | POST | `/api/v3/channels/update` |
| Comment | create | POST | `/api/v3/comments/add` |
| Comment | delete | POST | `/api/v3/comments/remove` |
| Comment | get | POST | `/api/v3/comments/getone` |
| Comment | getAll | POST | `/api/v3/comments/get` |
| Comment | update | POST | `/api/v3/comments/update` |
| Message Conversation | create | POST | `/api/v3/conversations/messages/add` |
| Message Conversation | delete | POST | `/api/v3/conversations/messages/remove` |
| Message Conversation | get | POST | `/api/v3/conversations/messages/getone` |
| Message Conversation | getAll | POST | `/api/v3/conversations/messages/get` |
| Message Conversation | update | POST | `/api/v3/conversations/messages/update` |
| Thread | create | POST | `/api/v3/threads/add` |
| Thread | delete | POST | `/api/v3/threads/remove` |
| Thread | get | POST | `/api/v3/threads/getone` |
| Thread | getAll | POST | `/api/v3/threads/get` |
| Thread | update | POST | `/api/v3/threads/update` |

### Errors

The Twist API returns error codes in a JSON body with `error_code`, `error_string`, and `error_uuid`. The node should throw a `NodeApiError` when the API returns a non-2xx status, including the `error_string` in the message. `continueOnFail` should be respected — when enabled, the node should output the error payload under `json` on the affected item rather than throwing.

### Expressions

All string parameters (`content`, `title`, `name`, `description`, `topic`) accept expressions. Dynamic option loaders also accept expressions where IDs or workspace references come from upstream items.

## Acceptance tests

### Test: Create a thread in a channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "thread",
  "operation": "create",
  "channelId": 12345,
  "title": "Hello from n8n",
  "content": "This is a test thread"
}
```

**Expect** the executor to POST `{"channel_id": 12345, "title": "Hello from n8n", "content": "This is a test thread"}` to `https://api.twist.com/api/v3/threads/add`, and output the response under `json` on the first output item.

### Test: List all channels in a workspace

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "getAll",
  "workspaceId": 42
}
```

**Expect** the executor to POST `{"workspace_id": 42}` to `https://api.twist.com/api/v3/channels/get`, and output the response array — one output item per channel.

### Test: Create a comment on a thread

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "comment",
  "operation": "create",
  "threadId": 9999,
  "content": "A new comment"
}
```

**Expect** the executor to POST `{"thread_id": 9999, "content": "A new comment"}` to `https://api.twist.com/api/v3/comments/add`, and output the created comment object.

### Test: Send a message in a conversation

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "messageConversation",
  "operation": "create",
  "conversationId": 777,
  "content": "Direct message"
}
```

**Expect** the executor to POST `{"conversation_id": 777, "content": "Direct message"}` to `https://api.twist.com/api/v3/conversations/messages/add`, and output the created message object.

### Test: API error is handled

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "get",
  "channelId": 0
}
```

**Expect** the Twist API to return an error (channel not found). The executor must throw a `NodeApiError` unless `continueOnFail` is set, in which case the item is output with the error body under `json`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation list | documented | Complete list from public n8n docs |
| Parameter names and nesting | inferred | Derived from Twist API v3 endpoint parameter names. n8n may use slightly different internal parameter keys; the spec describes the outcome-level contract, not the exact internal schema. |
| Dynamic option loaders | inferred | The `.d.ts` shows `getWorkspaces`, `getConversations`, `getUsers`, `getGroups` load options methods. These map to Twist API calls: `GET /api/v3/workspaces/get`, `GET /api/v3/conversations/get`, `GET /api/v3/workspace_users/get`, `GET /api/v3/groups/get`. |
| Error handling | documented | Twist API error format is documented; n8n standard error wrapping is assumed. |
| simplify / pagination | inferred | Typical n8n list behavior (one item per result) is assumed. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/twist.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

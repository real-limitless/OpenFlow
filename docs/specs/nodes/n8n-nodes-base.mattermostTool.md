---
type: n8n-nodes-base.mattermostTool
displayName: Mattermost Tool
category: Communication
versions: [1]
priority: medium
status: specced
---

# Mattermost Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mattermost/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mattermost/ | Public docs only |
| https://api.mattermost.com/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mattermostTool`
- **Aliases:** (none — tool variant of base `n8n-nodes-base.mattermost`)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `mattermostApi`

### Credential: mattermostApi

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Base URL | string | yes | Mattermost server URL (e.g. https://your-org.mattermost.com) |
| Access Token | string | yes | Personal access token generated from Mattermost Profile > Security > Personal Access Tokens |
| Ignore SSL Issues | boolean | no | Skip SSL certificate validation when true |

## Parameters

The Mattermost Tool exposes the same four resources as the base Mattermost app node, but as an AI agent tool it additionally supports `$fromAI()` dynamic parameter population. Parameters mirror those of the base node at a high level.

### Resource: Channel

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| addUser | teamId, channelId, userId | — | Adds existing user to a channel |
| create | teamId, name, displayName | type (Open/Private), purpose, header | Creates a new channel |
| delete | channelId | — | Soft-deletes a channel |
| members | channelId | page, perPage | Paginated channel member list |
| restore | channelId | — | Restores a soft-deleted channel |
| search | channelId (omit) | searchTerm | Searches channels; omit channelId to search all visible |
| statistics | channelId | — | Returns channel message count and other stats |

### Resource: Message

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| delete | messageId | — | Soft-deletes a post |
| post | channelId, message | fileIds, rootId, props | Posts message into a channel; props supports from_bot key for bot attribution |
| postEphemeral | channelId, message, userId | — | Posts ephemeral message visible only to the target user |

### Resource: Reaction

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | postId, emojiName | — | Adds emoji reaction to a post |
| delete | postId, emojiName | — | Removes emoji reaction from a post |
| getAll | postIds | — | Retrieves reactions for one or more posts (comma-separated) |

### Resource: User

| Operation | Required parameters | Optional parameters | Notes |
|-----------|-------------------|--------------------|-------|
| create | email, username | first_name, last_name, nickname, password, roles, locale, position | Creates a new user |
| deactivate | userId | — | Deactivates user and revokes all sessions |
| getAll | — | teamId, notInTeamId, inChannelId, notInChannelId, groupId, page, perPage, sort | Retrieves filtered user list |
| getByEmail | — | — | Uses the email parameter from incoming items |
| getId | — | — | Uses the ID parameter from incoming items |
| invite | teamId, email (or emails as comma-separated) | — | Invites user(s) to a team |

All parameters accept `$fromAI()` dynamic expressions when the node is connected to an AI Agent.

## Runtime behavior

### Input

Each input item is processed independently. The resource and operation are selected per execution; all items use the same resource/operation configuration.

### Output

For read operations (get, getAll, search), one output item is produced per API result wrapped under the resource name (e.g. `{ "channel": { ... } }`, `{ "user": { ... } }`). For write operations (create, post, delete, addUser, invite), the API response or confirmation payload is returned.

The postMessage operation output includes the Mattermost post object with `id`, `channel_id`, `message`, `create_at`, and related fields per the Mattermost API v4 Post object schema.

### Errors

When the Mattermost API returns an error (invalid token, insufficient permissions, missing channel, duplicate user), the node should throw and respect `continueOnFail`. Common permission errors (e.g. `post:channel` for Channel ID field) surface as Mattermost API error responses.

### Expressions

All parameter fields accept expression strings. In AI Agent context, `$fromAI()` is supported for dynamic AI-driven parameter filling.

## Acceptance tests

### Test: post a message to a channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "post",
  "channelId": "qwerty123",
  "message": "Hello from OpenFlow"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "post_abc123",
    "channel_id": "qwerty123",
    "message": "Hello from OpenFlow",
    "create_at": 1700000000000
  }
}]
```

### Test: list channels via search

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "search",
  "searchTerm": "general"
}
```

**Expect** output[0] to contain an array of channel objects with at least `id`, `name`, `display_name`.

### Test: add reaction to a post

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "reaction",
  "operation": "create",
  "postId": "post_abc123",
  "emojiName": "+1"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "user_id": "user_1",
    "post_id": "post_abc123",
    "emoji_name": "+1",
    "create_at": 1700000000000
  }
}]
```

### Test: invite user to team

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "invite",
  "teamId": "team_xyz",
  "email": "newuser@example.com"
}
```

**Expect** output[0] with `"json": { "success": true }`.

### Test: AI agent populates channelId via $fromAI()

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "post",
  "channelId": "={{ $fromAI('channelId') }}",
  "message": "={{ $fromAI('message') }}"
}
```

**Expect** the executor resolves `$fromAI()` calls at runtime via the connected AI Agent context. Output shape matches Test 1 above.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource and operation names | documented | Extracted from public n8n Mattermost node docs page |
| Credential schema | documented | Public n8n Mattermost credentials page |
| Per-operation parameter schemas | inferred | Derived from public n8n docs operation list and Mattermost REST API v4 public docs |
| Output shapes | inferred | Based on Mattermost API public response schemas (e.g. Post object schema) |
| $fromAI() behavior | documented | Public n8n AI parameter docs |
| Internal parameter nesting | not needed | Abstraction-first approach; exact UI grouping not specified |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/mattermostTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only

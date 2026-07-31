---
type: n8n-nodes-base.mattermost
displayName: Mattermost
category: Communication
versions: [1]
priority: medium
status: specced
---

# Mattermost

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mattermost/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mattermost/ | Public docs only |
| https://raw.githubusercontent.com/mattermost/mattermost/master/api/v4/source/reactions.yaml | Third-party API docs (OpenAPI spec) |
| https://developers.mattermost.com/integrate/reference/personal-access-token/ | Third-party API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.mattermost`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mattermostApi` (access token + base URL + optional ignore SSL issues)

## Parameters

The node exposes a **resource** selector and an **operation** selector per resource.
Resources and operations map to Mattermost REST API v4 endpoints.

### Resource: channel

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| addUser | `POST /api/v4/channels/{channelId}/members` | Body: `{ user_id }` |
| create | `POST /api/v4/channels` | Body: `{ team_id, name, display_name, type, purpose?, header? }` |
| delete | `DELETE /api/v4/channels/{channelId}` | Soft delete |
| members | `GET /api/v4/channels/{channelId}/members` | Paginated list |
| restore | `POST /api/v4/channels/{channelId}/restore` | Restore soft-deleted channel |
| search | `POST /api/v4/channels/search` | Body: `{ term, team_id }` |
| statistics | `GET /api/v4/channels/{channelId}/stats` | Channel statistics |

**Parameters:**

| name | type | required | displayOptions | notes |
|------|------|----------|----------------|-------|
| channelId | string | conditionally | resource=channel, operation!=create, search | Resolvable via loadOptions |
| teamId | string | conditionally | resource=channel operation=create, search | |
| name | string | conditionally | resource=channel operation=create | URL-friendly channel name |
| displayName | string | conditionally | resource=channel operation=create | Human-readable name |
| type | string | conditionally | resource=channel operation=create | `O` (public) or `P` (private) |
| purpose | string | no | resource=channel operation=create | |
| header | string | no | resource=channel operation=create | |
| userId | string | conditionally | resource=channel operation=addUser | User to add as member |
| term | string | conditionally | resource=channel operation=search | Search term |
| returnAll | boolean | no | resource=channel operation=members | Pagination: return all vs page |
| limit | number | no | resource=channel operation=members | Max results per page |

### Resource: message

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| delete | `DELETE /api/v4/posts/{postId}` | Soft delete (marks post as deleted) |
| post | `POST /api/v4/posts` | Body: `{ channel_id, message, root_id?, file_ids?, props? }` |
| postEphemeral | `POST /api/v4/posts/ephemeral` | Body: `{ user_id, channel_id, message, props? }` |

**Parameters:**

| name | type | required | displayOptions | notes |
|------|------|----------|----------------|-------|
| channelId | string | conditionally | resource=message operation!=delete | Resolvable via loadOptions |
| message | string | conditionally | resource=message operation=post, postEphemeral | Markdown text |
| postId | string | conditionally | resource=message operation=delete | Post to delete |
| rootId | string | no | resource=message operation=post | Thread parent post ID |
| fileIds | array | no | resource=message operation=post | IDs of previously uploaded files |
| userId | string | conditionally | resource=message operation=postEphemeral | Target user for ephemeral message |
| props | json | no | resource=message operation=post, postEphemeral | Additional properties (e.g. `{from_webhook, override_username}`) |

### Resource: reaction

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| add | `POST /api/v4/reactions` | Body: `{ user_id, post_id, emoji_name }` |
| remove | `DELETE /api/v4/users/{userId}/posts/{postId}/reactions/{emojiName}` | Path params only |
| getAll | `GET /api/v4/posts/{postId}/reactions` | All reactions for a post |

**Parameters:**

| name | type | required | displayOptions | notes |
|------|------|----------|----------------|-------|
| postId | string | conditionally | resource=reaction | Post to react to |
| emojiName | string | conditionally | resource=reaction operation=add, remove | Emoji name (e.g. `+1`, `smile`) |
| userId | string | conditionally | resource=reaction operation=add, remove | Required for both — body field in add, path param in remove |

### Resource: user

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| create | `POST /api/v4/users` | Body: `{ username, email, password, first_name?, last_name?, nickname? }` |
| deactivate | `DELETE /api/v4/users/{userId}` | Revokes sessions and archives user |
| getAll | `GET /api/v4/users` | Paginated; filters: `in_channel`, `in_team` |
| getByEmail | `GET /api/v4/users/email/{email}` | Single user lookup by email |
| getById | `GET /api/v4/users/{userId}` | Single user lookup by ID |
| invite | `POST /api/v4/users/{userId}/teams/{teamId}/invite` | Invite user to team |

**Parameters:**

| name | type | required | displayOptions | notes |
|------|------|----------|----------------|-------|
| userId | string | conditionally | resource=user operation=deactivate, getById, invite | |
| email | string | conditionally | resource=user operation=create, getByEmail | |
| username | string | conditionally | resource=user operation=create | |
| password | string | conditionally | resource=user operation=create | |
| firstName | string | no | resource=user operation=create | |
| lastName | string | no | resource=user operation=create | |
| nickname | string | no | resource=user operation=create | |
| teamId | string | conditionally | resource=user operation=invite | |
| returnAll | boolean | no | resource=user operation=getAll | Pagination control |
| limit | number | no | resource=user operation=getAll | Max results per page |

## Runtime behavior

### Input

The node passes input items through unchanged on the output when the operation succeeds. Each input item is processed independently; the node makes one Mattermost API call per input item using the resolved parameter values.

### Output

For each input item, the node emits one output item with:
- `json`: the API response body (the Mattermost resource object, or an array for list operations)
- `binary`: preserved from input, if any

For list operations (members, getAll, search, getAll reactions), the output wraps the API response array in `json` directly. When `returnAll` is used with pagination, the node accumulates results across pages.

### Errors

- Non-2xx responses from the Mattermost API produce a thrown error with the API error message.
- `continueOnFail`: when enabled, the node returns `[{ json: { error: string } }]` on failure, preserving the input item index.
- Missing required parameters throw before any API call.

### Expressions

All string parameters accept expression strings (`{{ ... }}`). The `props` field accepts JSON expressions; `fileIds` accepts array expressions.

## Acceptance tests

### Test: post a message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "post",
  "channelId": "abc123",
  "message": "Hello from OpenFlow"
}
```

**Expect** output[0] `json` contains a Mattermost Post object with `channel_id`, `message`, `id`, `create_at`.

### Test: add and remove a reaction

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters (add):**
```json
{
  "resource": "reaction",
  "operation": "add",
  "postId": "post456",
  "emojiName": "+1",
  "userId": "user789"
}
```

**Expect** output[0] `json` contains a Reaction object with `user_id`, `post_id`, `emoji_name`.

**Parameters (remove):**
```json
{
  "resource": "reaction",
  "operation": "remove",
  "postId": "post456",
  "emojiName": "+1",
  "userId": "user789"
}
```

**Expect** output[0] `json` is `{ "success": true }` (HTTP 200 OK).

### Test: create a channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "create",
  "teamId": "team001",
  "name": "announcements",
  "displayName": "Announcements",
  "type": "O"
}
```

**Expect** output[0] `json` contains a Channel object with `id`, `name`, `display_name`, `type`, `team_id`.

### Test: get user by email

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getByEmail",
  "email": "user@example.com"
}
```

**Expect** output[0] `json` contains a User object with `id`, `username`, `email`.

### Test: delete a message with continueOnFail

**Given** input items:
```json
[{ "json": { "postId": "validId" } }, { "json": { "postId": "invalidId" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "delete",
  "postId": "{{ $json.postId }}",
  "continueOnFail": true
}
```

**Expect** output[0] `json` contains the API response when the post exists. If the API call fails, output is `[{ "json": { "error": "..." } }]`.

### Test: reaction remove missing userId throws

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "reaction",
  "operation": "remove",
  "postId": "post456",
  "emojiName": "+1"
}
```

**Expect** the executor throws an error indicating `userId` is required before making any API call.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | Documented | Public n8n docs list all 4 resources and their operations |
| API endpoint mapping | Documented | Mattermost REST API v4 OpenAPI spec confirms all endpoints |
| Parameter names and defaults | Inferred from descriptor metadata | npm descriptor JSON confirms parameter names, types, displayOptions |
| Credential shape | Documented | Public credential docs confirm accessToken + baseUrl + ignoreSSLIssues |
| Reaction remove endpoint path | Documented | OpenAPI spec shows `/api/v4/users/{user_id}/posts/{post_id}/reactions/{emoji_name}` |
| Pagination details | Inferred | Standard Mattermost API pagination; returnAll/limit follow n8n conventions |
| Output item shapes | Inferred | Follow Mattermost API response schemas per api.mattermost.com |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mattermost.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
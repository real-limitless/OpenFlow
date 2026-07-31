---
type: n8n-nodes-base.mattermost
displayName: Mattermost
category: Communication
versions: [1]
priority: P1
status: specced
---

# Mattermost

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mattermost.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mattermost.md | Public docs only |
| https://api.mattermost.com/ | Third-party service API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public docs + public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.mattermost`
- **Versioned node type:** `VersionedNodeType` wrapping a single v1 version
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mattermostApi` (accessToken + baseUrl + allowUnauthorizedCerts)

## Parameters

### Resource selector

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | 'channel' | true | Options: `channel`, `message`, `reaction`, `user` |

### Resource: Channel

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | 'create' | true | resource=channel | Options: `addUser`, `create`, `delete`, `members`, `restore`, `search`, `statistics` |
| channelId | string | '' | true | operation=addUser, delete, members, restore, statistics | Channel ID; for addUser also used as the target channel |
| channelName | string | '' | true | operation=create, search | Channel name or search term |
| displayName | string | '' | true | operation=create | Display name for the new channel |
| type | options | 'O' | true | operation=create | Options: `O` (Public), `P` (Private) |
| userId | string | '' | true | operation=addUser | ID of the user to add to the channel |
| teamId | string | '' | false | operation=create | Team ID to create the channel in |
| options.purpose | string | '' | false | operation=create | Channel purpose |
| options.header | string | '' | false | operation=create | Channel header |
| returnAll | boolean | false | false | operation=members | Return all members or limit |
| limit | number | 50 | false | operation=members, show returnAll=false | Max members to return |

### Resource: Message

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | 'post' | true | resource=message | Options: `delete`, `post`, `postEphemeral` |
| channelId | string | '' | true | resource=message | Target channel ID |
| message | string | '' | true | operation=post, postEphemeral | Message text content |
| rootId | string | '' | false | operation=post | Parent post ID for threaded replies |
| userId | string | '' | true | operation=postEphemeral | User ID to receive the ephemeral message |
| postId | string | '' | true | operation=delete | Post ID to soft-delete |
| options.props | json | '' | false | operation=post | Custom post properties as JSON |
| options.fileIds | string | '' | false | operation=post | Comma-separated file IDs to attach |

### Resource: Reaction

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | 'add' | true | resource=reaction | Options: `add`, `remove`, `getAll` |
| postId | string | '' | true | resource=reaction | Post ID for the reaction |
| emojiName | string | '' | true | operation=add, remove | Emoji name (e.g. `+1`, `smile`) |

### Resource: User

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | 'getAll' | true | resource=user | Options: `create`, `deactivate`, `getAll`, `getByEmail`, `getId`, `invite` |
| email | string | '' | true | operation=getByEmail, create | User email address |
| username | string | '' | true | operation=create | Username for new user |
| firstName | string | '' | false | operation=create | First name |
| lastName | string | '' | false | operation=create | Last name |
| password | string | '' | true | operation=create | Password for new user |
| userId | string | '' | true | operation=deactivate, getId, invite | User ID |
| teamId | string | '' | true | operation=invite | Team ID to invite the user to |
| returnAll | boolean | false | false | operation=getAll | Return all users or limit |
| limit | number | 50 | false | operation=getAll, show returnAll=false | Max users to return |

## Runtime behavior

### Input

Consumes `main` input items. Each item can override parameters via expressions. Resource locator operations (channel search, user search) accept channel name or ID as string input.

### Output

- **Channel Create:** Returns the created channel object from the Mattermost API (id, name, display_name, type, team_id, etc.)
- **Channel Delete:** Returns `{ success: true }` on successful soft-delete
- **Channel Add User:** Returns `{ success: true }` on successful membership addition
- **Channel Members:** Returns array of member objects (paginated, 200 per page by default)
- **Channel Restore:** Returns the restored channel object
- **Channel Search:** Returns array of matching channel objects
- **Channel Statistics:** Returns channel statistics object (channel_id, member_count, message_count, etc.)
- **Message Post:** Returns the created post object (id, message, channel_id, user_id, create_at, etc.)
- **Message Post Ephemeral:** Returns the ephemeral post object
- **Message Delete:** Returns `{ success: true }` on successful soft-delete
- **Reaction Add:** Returns the reaction object (user_id, post_id, emoji_name, create_at)
- **Reaction Remove:** Returns `{ success: true }` on successful removal
- **Reaction Get All:** Returns array of reaction objects for the post
- **User Create:** Returns the created user object
- **User Deactivate:** Returns `{ success: true }` on successful deactivation
- **User Get All:** Returns array of user objects (paginated)
- **User Get By Email:** Returns the user object matching the email
- **User Get By ID:** Returns the user object matching the ID
- **User Invite:** Returns `{ success: true }` on successful invitation

### API endpoint mapping

All requests are sent to `{baseUrl}/api/v4/` with `Authorization: Bearer {accessToken}`. SSL verification is controlled by `allowUnauthorizedCerts`.

| Resource | Operation | HTTP method | Endpoint |
|----------|-----------|-------------|----------|
| Channel | create | POST | /channels |
| Channel | delete | DELETE | /channels/{channelId} |
| Channel | addUser | POST | /channels/{channelId}/members |
| Channel | members | GET | /channels/{channelId}/members |
| Channel | restore | POST | /channels/{channelId}/restore |
| Channel | search | POST | /channels/search |
| Channel | statistics | GET | /channels/{channelId}/stats |
| Message | post | POST | /posts |
| Message | postEphemeral | POST | /posts/ephemeral |
| Message | delete | DELETE | /posts/{postId} |
| Reaction | add | POST | /reactions |
| Reaction | remove | DELETE | /reactions/{userId}/{postId}/{emojiName} |
| Reaction | getAll | GET | /posts/{postId}/reactions |
| User | create | POST | /users |
| User | deactivate | DELETE | /users/{userId} |
| User | getAll | GET | /users |
| User | getByEmail | GET | /users/email/{email} |
| User | getId | GET | /users/{userId} |
| User | invite | POST | /teams/{teamId}/invite |

### Errors

- **Mattermost API errors:** Propagated as `NodeApiError` with the HTTP status code and error message from Mattermost
- **Missing required params:** Throws `NodeOperationError` for missing required parameters (e.g., channelId, message, emojiName)
- **Permission errors:** If the user lacks permission (e.g., `post:channel`), the node displays the error from the Mattermost API
- **SSL errors:** When `allowUnauthorizedCerts` is false (default), SSL certificate validation failures cause connection errors
- **`continueOnFail`:** Returns `[{ json: { error: "..." } }]` per failed item

### Expressions

All string, number, and boolean parameters accept expressions.

## Acceptance tests

### Test: Post message to channel

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
  "message": "Hello from n8n!",
  "options": {}
}
```

**Expect** output[0] contains:
```json
[{ "json": { "id": "...", "channel_id": "abc123", "message": "Hello from n8n!" } }]
```

---

### Test: Create public channel

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "channel",
  "operation": "create",
  "channelName": "my-new-channel",
  "displayName": "My New Channel",
  "type": "O",
  "options": {}
}
```

**Expect** output[0] contains:
```json
[{ "json": { "id": "...", "name": "my-new-channel", "display_name": "My New Channel", "type": "O" } }]
```

---

### Test: Get all users (paginated)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] is an array of user objects (each with `id`, `username`, `email`, etc.).

---

### Test: Add reaction to post

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "reaction",
  "operation": "add",
  "postId": "post123",
  "emojiName": "+1"
}
```

**Expect** output[0] contains:
```json
[{ "json": { "user_id": "...", "post_id": "post123", "emoji_name": "+1" } }]
```

---

### Test: Invite user to team

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "invite",
  "teamId": "team123",
  "userId": "user456"
}
```

**Expect** output[0]:
```json
[{ "json": { "success": true } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Versioned node type | inferred from descriptor | `Mattermost extends VersionedNodeType`; single v1 version |
| Exact API endpoint paths | inferred from Mattermost API docs | Mapped from public Mattermost REST API v4 reference |
| Operation to endpoint mapping | inferred | Derived from operation names, resource names, and Mattermost API docs |
| `postEphemeral` endpoint | inferred | POST /posts/ephemeral from Mattermost API docs |
| Reaction delete endpoint format | inferred | DELETE /reactions/{userId}/{postId}/{emojiName} follows Mattermost API pattern |
| Pagination defaults | inferred | Standard Mattermost API page size of 200; n8n default limit of 50 |
| `fileIds` parameter | inferred | Attaches files to posts by file ID; comma-separated string |
| `props` parameter | inferred | Custom post properties as JSON object |
| Channel search endpoint | inferred | POST /channels/search from Mattermost API docs |
| Channel statistics endpoint | inferred | GET /channels/{channelId}/stats from Mattermost API docs |
| Error handling patterns | inferred | Standard n8n app-node error handling pattern |
| Channel type values | documented | `O` = Public, `P` = Private (from public Mattermost docs) |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mattermost.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only